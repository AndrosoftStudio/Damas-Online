// js/main.js
import { setupAuthListeners, handleLogout as authHandleLogout } from './auth.js'; 
import { createInitialBoard, findAllObligatoryCaptures, getValidMovesForPiece, checkWinCondition, isValidSquare, PLAYER1, PLAYER2, EMPTY, BOARD_SIZE } from './game-logic.js';
import { renderBoard, updateGameInfoUI, showTemporaryMessage, showConfirmationModal, updateUserAccountButton, toggleAccountDropdown, updateUserIdDisplayInSidebar } from './ui.js';
import { createOrJoinGame, updateGameInFirestore, handleForfeitGame, firebaseHandleLeaveRoom } from './firebase-service.js'; 
import { db, firestoreAppId, auth } from './firebase-config.js'; 
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

// --- Estado Global do Jogo ---
let currentBoard = [];
let currentPlayer = PLAYER1;
let selectedPiece = null; 
let localPlayerTeam = null;
let currentRoomId = null;
let gameDocUnsubscribe = null; 
let userId = null; 
let gameAdminId = null;
let mustContinueJump = false;
let forcedPieceToMove = null; 
let obligatoryCaptures = []; 

// --- Getters e Setters ---
// Estas funções permitem que outros módulos leiam o estado atual sem modificá-lo diretamente.
export const getGameState = () => ({ currentBoard, currentPlayer, selectedPiece, localPlayerTeam, currentRoomId, gameAdminId, mustContinueJump, forcedPieceToMove, obligatoryCaptures });
export const getCurrentBoard = () => currentBoard;
export const getCurrentPlayer = () => currentPlayer;
export const getSelectedPiece = () => selectedPiece;
export const getLocalPlayerTeam = () => localPlayerTeam;
export const getCurrentRoomId = () => currentRoomId;
export const getGameAdminId = () => gameAdminId;
export const getUserId = () => userId; 
export const getMustContinueJump = () => mustContinueJump;
export const getForcedPieceToMove = () => forcedPieceToMove;
export const getObligatoryCaptures = () => obligatoryCaptures;

// Funções para modificar o estado de forma controlada
export function setUserId(newUserId, displayName) {
    userId = newUserId; 
    console.log("User ID set in main.js:", userId, "Display Name:", displayName);
    updateUserIdDisplayInSidebar(displayName); 
    // Atualiza também o nick no painel de controle principal
    const mainUserIdDisplay = document.getElementById('mainUserIdDisplay');
    if (mainUserIdDisplay) {
        mainUserIdDisplay.textContent = displayName;
    }
}
export function setCurrentRoomId(newRoomId) { currentRoomId = newRoomId; }
export function setLocalPlayerTeam(team) { localPlayerTeam = team; }
export function setGameAdminId(adminId) { gameAdminId = adminId; }
export function setMustContinueJump(value) { mustContinueJump = value; }
export function setForcedPieceToMove(pos) { forcedPieceToMove = pos; }
export function setObligatoryCaptures(captures) { obligatoryCaptures = captures; }
export function setSelectedPiece(piece) { selectedPiece = piece; }

export function setGameState(newState) {
    if (newState.board !== undefined) currentBoard = newState.board;
    if (newState.currentPlayer !== undefined) currentPlayer = newState.currentPlayer;
}

export function manageGameDocUnsubscribe(newUnsubscribeFn = null) {
    if (gameDocUnsubscribe) {
        try { gameDocUnsubscribe(); } catch (e) { console.error("Error unsubscribing from game doc:", e); }
    }
    gameDocUnsubscribe = newUnsubscribeFn;
}

export async function appLeaveRoomHandler() { 
    const roomToLeave = getCurrentRoomId(); 
    if (!roomToLeave) { 
        resetLocalGameStateApp();
        setCurrentRoomId(null); 
        return;
    }
    await firebaseHandleLeaveRoom(); 
}

// --- Lógica Principal de Interação e Jogo ---
export async function handleSquareClick(row, col) {
    const currentRoom = getCurrentRoomId();
    // Verifica o status do jogo no Firestore antes de qualquer ação
    if (currentRoom) {
        const gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${currentRoom}`);
        try {
            const gameSnap = await getDoc(gameRef);
            if (gameSnap.exists()) {
                const gameData = gameSnap.data();
                if (gameData.winner || gameData.status === 'forfeited') {
                    showTemporaryMessage("O jogo já terminou. Não é possível mover peças.", "info");
                    return;
                }
            }
        } catch (e) { console.error("Error checking game status in handleSquareClick:", e); }
    }
    
    // Validações locais: é a vez do jogador? o jogo está ativo?
    if (!localPlayerTeam || currentPlayer !== localPlayerTeam || !currentBoard || currentBoard.length === 0) {
        if (currentPlayer !== localPlayerTeam && localPlayerTeam && currentRoomId) { 
            showTemporaryMessage("Não é a sua vez de jogar.", "info");
        }
        return;
    }
    const clickedPieceData = currentBoard[row] ? currentBoard[row][col] : null;

    // Lógica para Captura Múltipla Obrigatória
    if (mustContinueJump) {
        if (!forcedPieceToMove || !selectedPiece || (selectedPiece.row !== forcedPieceToMove.row || selectedPiece.col !== forcedPieceToMove.col)) {
            showTemporaryMessage("Você deve continuar a captura com a mesma peça.", "error");
            return;
        }
        const pieceAtForced = currentBoard[forcedPieceToMove.row]?.[forcedPieceToMove.col];
        if (!pieceAtForced) { 
            setMustContinueJump(false); setForcedPieceToMove(null); setSelectedPiece(null);
            renderBoard(currentBoard, selectedPiece, obligatoryCaptures, mustContinueJump, forcedPieceToMove, currentPlayer); return;
        }

        const continuationJumps = getValidMovesForPiece(forcedPieceToMove.row, forcedPieceToMove.col, pieceAtForced.player, pieceAtForced.isKing, currentBoard)
                                  .filter(m => m.jumpedPieces.length > 0);
        const targetMove = continuationJumps.find(m => m.to.row === row && m.to.col === col);
        
        if (targetMove) {
            await executeMove(forcedPieceToMove, targetMove.to, targetMove.jumpedPieces);
        } else {
            showTemporaryMessage("Movimento inválido. Continue a captura com a mesma peça.", "error");
        }
    } else { // Lógica para um movimento normal ou o início de uma captura
        obligatoryCaptures = findAllObligatoryCaptures(currentPlayer, currentBoard);

        if (selectedPiece) { // Se uma peça já está selecionada
            const pieceAtSelected = currentBoard[selectedPiece.row]?.[selectedPiece.col];
            if (!pieceAtSelected) { 
                setSelectedPiece(null); 
                renderBoard(currentBoard, selectedPiece, obligatoryCaptures, mustContinueJump, forcedPieceToMove, currentPlayer);
                return;
            }

            let validMovesForCurrentSelection;
            if (obligatoryCaptures.length > 0) { 
                const canSelectedPieceCapture = obligatoryCaptures.find(oc => oc.piecePos.row === selectedPiece.row && oc.piecePos.col === selectedPiece.col);
                if (!canSelectedPieceCapture) { 
                    showTemporaryMessage("Captura obrigatória com outra peça.", "error");
                    setSelectedPiece(null); 
                    renderBoard(currentBoard, selectedPiece, obligatoryCaptures, mustContinueJump, forcedPieceToMove, currentPlayer);
                    return;
                }
                validMovesForCurrentSelection = canSelectedPieceCapture.captures;
            } else { 
                validMovesForCurrentSelection = getValidMovesForPiece(selectedPiece.row, selectedPiece.col, pieceAtSelected.player, pieceAtSelected.isKing, currentBoard)
                                                 .filter(m => m.jumpedPieces.length === 0);
            }

            const targetMove = validMovesForCurrentSelection.find(m => m.to.row === row && m.to.col === col);
            if (targetMove) {
                // Executa o movimento se o clique for em uma casa válida
                await executeMove(selectedPiece, targetMove.to, targetMove.jumpedPieces);
            } else { // Se o clique não foi em uma jogada válida
                if (clickedPieceData && clickedPieceData.player === currentPlayer) { 
                    // Se clicou em outra peça sua, seleciona a nova peça
                    if (obligatoryCaptures.length > 0 && !obligatoryCaptures.some(oc => oc.piecePos.row === row && oc.piecePos.col === col)) {
                        showTemporaryMessage("Captura obrigatória. Selecione uma peça que possa capturar.", "error");
                        setSelectedPiece(null);
                    } else {
                        setSelectedPiece({ row, col, player: clickedPieceData.player, isKing: clickedPieceData.isKing });
                    }
                } else { 
                    // Desseleciona a peça se clicar em uma casa vazia ou do oponente (que não seja uma jogada válida)
                    setSelectedPiece(null);
                }
                renderBoard(currentBoard, selectedPiece, obligatoryCaptures, mustContinueJump, forcedPieceToMove, currentPlayer);
            }
        } else { // Nenhuma peça selecionada, tenta selecionar uma
            if (clickedPieceData && clickedPieceData.player === currentPlayer) {
                if (obligatoryCaptures.length > 0 && !obligatoryCaptures.some(oc => oc.piecePos.row === row && oc.piecePos.col === col)) {
                    showTemporaryMessage("Captura obrigatória. Selecione uma peça que possa capturar.", "error");
                } else {
                    setSelectedPiece({ row, col, player: clickedPieceData.player, isKing: clickedPieceData.isKing });
                    renderBoard(currentBoard, selectedPiece, obligatoryCaptures, mustContinueJump, forcedPieceToMove, currentPlayer);
                }
            }
        }
    }
}

// ALTERAÇÃO PRINCIPAL: Lógica de execução de movimento refatorada para maior robustez
async function executeMove(fromPos, toPos, jumpedArray) {
    const roomId = getCurrentRoomId();
    if (!roomId) {
        showTemporaryMessage("Erro: não foi possível encontrar a sala do jogo.", "error");
        return;
    }

    // Cria uma cópia profunda do tabuleiro para evitar mutações inesperadas.
    let newBoard = JSON.parse(JSON.stringify(currentBoard)); 
    const pieceToMove = newBoard[fromPos.row][fromPos.col];

    if (!pieceToMove) {
        console.error("Tentativa de mover peça inexistente:", fromPos);
        setSelectedPiece(null);
        renderBoard(currentBoard, selectedPiece, obligatoryCaptures, mustContinueJump, forcedPieceToMove, currentPlayer);
        return;
    }

    // Atualiza o tabuleiro com o movimento
    newBoard[toPos.row][toPos.col] = pieceToMove;
    newBoard[fromPos.row][fromPos.col] = EMPTY;

    // Remove as peças capturadas
    jumpedArray.forEach(jp => {
        if (newBoard[jp.row]) newBoard[jp.row][jp.col] = EMPTY;
    });

    // Verifica e aplica a promoção para "Dama" (Rei)
    const isNowKing = !pieceToMove.isKing && ((pieceToMove.player === PLAYER1 && toPos.row === 0) || (pieceToMove.player === PLAYER2 && toPos.row === BOARD_SIZE - 1));
    if (isNowKing) { 
        newBoard[toPos.row][toPos.col].isKing = true;
    }
    
    const pieceAtNewPos = newBoard[toPos.row][toPos.col];

    // Lógica de Captura Múltipla
    // A captura só pode continuar se a peça não foi promovida nesta jogada.
    const canContinueJump = jumpedArray.length > 0 && !isNowKing;
    if (canContinueJump) {
        const continuationJumps = getValidMovesForPiece(toPos.row, toPos.col, pieceAtNewPos.player, pieceAtNewPos.isKing, newBoard)
                                   .filter(m => m.jumpedPieces.length > 0);
        
        if (continuationJumps.length > 0) {
            // A cadeia de captura continua.
            setMustContinueJump(true);
            setForcedPieceToMove({ row: toPos.row, col: toPos.col });
            setSelectedPiece({ ...toPos, player: pieceAtNewPos.player, isKing: pieceAtNewPos.isKing });
            
            // ATUALIZA o Firestore com o estado do tabuleiro, mas MANTÉM o jogador da vez.
            // Isso permite que o oponente veja o movimento intermediário.
            await updateGameInFirestore(roomId, {
                boardString: JSON.stringify(newBoard),
                currentPlayer: currentPlayer // O turno NÃO passa.
            });
            // O listener do onSnapshot vai receber esta atualização e re-renderizar o tabuleiro para todos.
            return; // Encerra a execução aqui para aguardar o próximo clique do jogador.
        }
    }
    
    // Se chegou aqui, a jogada terminou (movimento simples ou fim de uma cadeia de captura).
    // Prepara para passar o turno.
    setMustContinueJump(false);
    setForcedPieceToMove(null);
    setSelectedPiece(null); 
    
    const nextPlayer = currentPlayer === PLAYER1 ? PLAYER2 : PLAYER1;
    const winner = checkWinCondition(newBoard, nextPlayer); 
    
    let gameStatusForUpdate = winner ? 'finished' : 'active';
    
    // Prepara o objeto final para atualização no Firestore
    let gameUpdateData = {
        boardString: JSON.stringify(newBoard),
        currentPlayer: nextPlayer, // Passa o turno para o próximo jogador
        status: gameStatusForUpdate,
        winner: winner || null // Define o vencedor se houver, senão null
    };
    if (!winner) {
        gameUpdateData.forfeitedBy = null; // Limpa o status de desistência se o jogo continuar
    }

    await updateGameInFirestore(roomId, gameUpdateData);
}


// --- Funções de Reset e Inicialização ---
export function resetLocalGameStateApp() { 
    currentBoard = [];
    currentPlayer = PLAYER1;
    selectedPiece = null;
    localPlayerTeam = null;
    mustContinueJump = false;
    forcedPieceToMove = null;
    obligatoryCaptures = [];

    const authUser = auth.currentUser; 
    let displayName = "Anônimo";
    let isLoggedIn = false;

    if (authUser && !authUser.isAnonymous) {
        isLoggedIn = true;
        displayName = authUser.displayName || authUser.email || "Usuário";
    }

    setUserId(authUser ? authUser.uid : null, displayName);
    updateUserAccountButton(isLoggedIn, displayName, authUser ? authUser.photoURL : null);

    const gameDataForReset = { status: 'waiting', currentPlayer: PLAYER1, winner: null, forfeitedBy: null }; 
    updateGameInfoUI(gameDataForReset, null, userId, false);
    renderBoard([], null, [], false, null, PLAYER1); // Passa um tabuleiro vazio para mostrar o placeholder

    const createGameBtnEl = document.getElementById('createGameBtn');
    const joinGameBtnEl = document.getElementById('joinGameBtn');
    const gameIdInputEl = document.getElementById('gameIdInput');
    const resetGameBtnEl = document.getElementById('resetGameBtn');
    const forfeitGameBtnEl = document.getElementById('forfeitGameBtn');
    const leaveRoomMenuBtnEl = document.getElementById('leaveRoomMenuBtn'); 
    const copyRoomIdBtnEl = document.getElementById('copyRoomIdBtn');

    if(createGameBtnEl) createGameBtnEl.disabled = false;
    if(joinGameBtnEl) joinGameBtnEl.disabled = false;
    if (gameIdInputEl) {
        gameIdInputEl.disabled = false;
        gameIdInputEl.value = '';
    }
    if(resetGameBtnEl) resetGameBtnEl.disabled = true;
    if(forfeitGameBtnEl) forfeitGameBtnEl.disabled = true;
    if(leaveRoomMenuBtnEl) leaveRoomMenuBtnEl.disabled = true; 
    if(copyRoomIdBtnEl) copyRoomIdBtnEl.classList.add('hidden');
}


// --- Event Listeners ---
function setupEventListeners() {
    const createGameBtnEl = document.getElementById('createGameBtn');
    const joinGameBtnEl = document.getElementById('joinGameBtn');
    const resetGameBtnEl = document.getElementById('resetGameBtn');
    const forfeitGameBtnEl = document.getElementById('forfeitGameBtn');
    const accountBtnHeaderEl = document.getElementById('accountBtnHeader');
    const mainMenuToggleBtnEl = document.getElementById('mainMenuToggleBtn');
    const mainMenuSidebarEl = document.getElementById('mainMenuSidebar');
    const mainMenuOverlayEl = document.getElementById('mainMenuOverlay');
    const closeMainMenuSidebarBtnEl = document.getElementById('closeMainMenuSidebarBtn');
    const friendsMenuBtnEl = document.getElementById('friendsMenuBtn');
    const settingsMenuBtnEl = document.getElementById('settingsMenuBtn');
    const leaveRoomMenuBtnEl = document.getElementById('leaveRoomMenuBtn'); 
    const logoutMenuBtnEl = document.getElementById('logoutMenuBtn'); 
    const logoutDropdownBtnEl = document.getElementById('logoutDropdownBtn');

    if(createGameBtnEl) createGameBtnEl.addEventListener('click', () => {
        const roomId = document.getElementById('gameIdInput').value.trim();
        createOrJoinGame(roomId, true, userId); 
    });

    if(joinGameBtnEl) joinGameBtnEl.addEventListener('click', () => {
        const roomId = document.getElementById('gameIdInput').value.trim();
        if (!roomId) {
            showTemporaryMessage("Por favor, insira o ID da sala para entrar.", "error");
            return;
        }
        createOrJoinGame(roomId, false, userId); 
    });

    if(resetGameBtnEl) resetGameBtnEl.addEventListener('click', async () => {
        const currentRoom = getCurrentRoomId(); 
        const adminId = getGameAdminId(); 
        if (!currentRoom || userId !== adminId) {
            showTemporaryMessage("Apenas o administrador da sala pode reiniciar.", "error"); return;
        }
        showConfirmationModal("Tem certeza que deseja reiniciar o jogo?", async () => {
            const initialBoard = createInitialBoard();
            const gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${currentRoom}`);
            const gameSnap = await getDoc(gameRef);
            let newStatus = (gameSnap.exists() && gameSnap.data().player2Id) ? 'active' : 'waiting_for_player2';
            
            await updateGameInFirestore(currentRoom, { 
                boardString: JSON.stringify(initialBoard),
                currentPlayer: PLAYER1,
                status: newStatus,
                winner: null,
                forfeitedBy: null 
            });
            showTemporaryMessage("Jogo reiniciado!", "success");
        });
    });

    if(forfeitGameBtnEl) forfeitGameBtnEl.addEventListener('click', () => {
        const currentRoom = getCurrentRoomId(); 
        if (!currentRoom || !getLocalPlayerTeam()) {
            showTemporaryMessage("Você precisa estar em um jogo para desistir.", "info");
            return;
        }
        showConfirmationModal("Tem certeza que deseja desistir da partida?", async () => {
            await handleForfeitGame(currentRoom, userId); 
        });
    });

    if(accountBtnHeaderEl) accountBtnHeaderEl.addEventListener('click', (event) => {
        event.stopPropagation(); 
        toggleAccountDropdown();
    });

    if(logoutDropdownBtnEl) logoutDropdownBtnEl.addEventListener('click', () => {
        toggleAccountDropdown(false); 
        authHandleLogout(); 
    });

    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('accountDropdownMenu');
        const accountBtn = document.getElementById('accountBtnHeader');
        if (dropdown && !dropdown.classList.contains('hidden') && 
            accountBtn && !accountBtn.contains(event.target) && 
            !dropdown.contains(event.target)) {
            toggleAccountDropdown(false); 
        }
    });

    function toggleMainMenuSidebar() {
        if (mainMenuSidebarEl && mainMenuOverlayEl) {
            mainMenuSidebarEl.classList.toggle('open');
            mainMenuSidebarEl.classList.toggle('closed');
            mainMenuOverlayEl.classList.toggle('open');
            mainMenuOverlayEl.classList.toggle('closed');
        }
    }

    if (mainMenuToggleBtnEl) mainMenuToggleBtnEl.addEventListener('click', toggleMainMenuSidebar);
    if (closeMainMenuSidebarBtnEl) closeMainMenuSidebarBtnEl.addEventListener('click', toggleMainMenuSidebar);
    if (mainMenuOverlayEl) mainMenuOverlayEl.addEventListener('click', toggleMainMenuSidebar);

    if (friendsMenuBtnEl) friendsMenuBtnEl.addEventListener('click', (e) => {
        e.preventDefault(); // Impede a navegação padrão para garantir que o logout seja considerado
        if(auth.currentUser && !auth.currentUser.isAnonymous) {
            window.location.href = 'friends.html'; 
        } else {
            showTemporaryMessage("Faça login para acessar a lista de amigos.", "info");
        }
    });

    if (settingsMenuBtnEl) settingsMenuBtnEl.addEventListener('click', () => {
        showTemporaryMessage("Página de configurações em desenvolvimento!", "info");
        toggleMainMenuSidebar(); 
    });

    if (logoutMenuBtnEl) logoutMenuBtnEl.addEventListener('click', () => { 
        toggleMainMenuSidebar(); 
        authHandleLogout(); 
    });

    if (leaveRoomMenuBtnEl) leaveRoomMenuBtnEl.addEventListener('click', () => {
        const currentRoom = getCurrentRoomId();
        if (!currentRoom) {
            showTemporaryMessage("Você não está em nenhuma sala.", "info");
            toggleMainMenuSidebar();
            return;
        }
        toggleMainMenuSidebar(); 
        showConfirmationModal("Tem certeza que deseja sair da sala? Sair de uma partida em andamento resultará em derrota.", async () => {
            await appLeaveRoomHandler(); 
        });
    });
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    setupAuthListeners(); 
    resetLocalGameStateApp(); 
    setupEventListeners();   
    console.log("Damas Brasileiras - Interface Modular Inicializada.");
});
