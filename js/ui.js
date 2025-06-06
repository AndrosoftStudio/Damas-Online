// js/ui.js
import { BOARD_SIZE, EMPTY, PLAYER1, PLAYER2, getValidMovesForPiece } from './game-logic.js'; 
import { handleSquareClick, getCurrentRoomId } from './main.js'; 
import { auth } from './firebase-config.js'; 

const boardElement = document.getElementById('checkers-board');
const sidebarUserIdMenuDisplayElement = document.getElementById('sidebarUserIdMenuDisplay');
const playerTeamDisplay = document.getElementById('playerTeamInfoDisplay'); 
const currentPlayerTurnDisplay = document.getElementById('currentPlayerTurn'); 
const gameStatusDisplay = document.getElementById('gameStatusInfoDisplay'); 
const roomTitleDisplay = document.getElementById('roomTitle'); 
const currentRoomInfoDisplay = document.getElementById('currentRoomInfoDisplay'); 
const messageBoxContainer = document.getElementById('messageBoxContainer');
const confirmationModalContainer = document.getElementById('confirmationModalContainer');
const accountBtnIconElement = document.getElementById('accountIconHeader'); 
const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
const roomIdToCopySpan = document.getElementById('roomIdToCopy');
const accountDropdownMenu = document.getElementById('accountDropdownMenu');
const notificationBadge = document.getElementById('notificationBadge');


// Atualiza o nome do utilizador na sidebar do menu principal
export function updateUserIdDisplayInSidebar(displayName = "Carregando...") { // NOME CORRETO DA FUNÇÃO EXPORTADA
    if (sidebarUserIdMenuDisplayElement) {
        sidebarUserIdMenuDisplayElement.textContent = displayName;
    }
}

// Atualiza o botão de conta no header principal
export function updateUserAccountButton(isLoggedIn, displayName, photoURL = null) {
    if (accountBtnIconElement) { 
        if (isLoggedIn) {
            const user = auth.currentUser;
            let finalDisplayName = "Conta"; 
            let initial = "P"; 

            if (user) {
                finalDisplayName = user.isAnonymous ? "Anônimo" : (displayName || user.email || "Minha Conta");
                if (!user.isAnonymous && finalDisplayName) {
                    initial = finalDisplayName.charAt(0).toUpperCase();
                } else if (user.isAnonymous) {
                    initial = "A";
                }
            }
            
            // Tenta usar photoURL, senão usa iniciais
            if (photoURL && user && !user.isAnonymous) {
                accountBtnIconElement.innerHTML = `<img src="${photoURL}" alt="Foto de ${finalDisplayName}" class="user-avatar-icon">`;
            } else {
                accountBtnIconElement.innerHTML = `<span class="user-initial-icon">${initial}</span>`;
            }
        } else { 
            accountBtnIconElement.innerHTML = 'login'; // Ícone de login quando deslogado
            if (accountDropdownMenu) accountDropdownMenu.classList.add('hidden'); // Esconde dropdown se deslogado
        }
    }
}

// Mostra/esconde o dropdown da conta
export function toggleAccountDropdown(forceShow = null) {
    if (accountDropdownMenu) {
        const isCurrentlyHidden = accountDropdownMenu.classList.contains('hidden');
        if (forceShow === true) {
            accountDropdownMenu.classList.remove('hidden');
        } else if (forceShow === false) {
            accountDropdownMenu.classList.add('hidden');
        } else {
            accountDropdownMenu.classList.toggle('hidden');
        }
        const isExpanded = !accountDropdownMenu.classList.contains('hidden');
        const accountBtn = document.getElementById('accountBtnHeader');
        if(accountBtn) accountBtn.setAttribute('aria-expanded', isExpanded.toString());
    }
}

// Atualiza as informações gerais do jogo na UI
export function updateGameInfoUI(gameData, localPlayerTeam, currentUserId, mustContinueJumpState) {
    const currentRoom = getCurrentRoomId(); 

    if (currentRoomInfoDisplay) currentRoomInfoDisplay.textContent = currentRoom || "Nenhuma";
    if (roomTitleDisplay) roomTitleDisplay.textContent = `Sala: ${currentRoom || "Nenhuma"}`;
    
    if (copyRoomIdBtn && roomIdToCopySpan) { 
        if (currentRoom && gameData && gameData.status !== 'finished' && gameData.status !== 'forfeited') {
            copyRoomIdBtn.classList.remove('hidden');
            roomIdToCopySpan.textContent = currentRoom;
            copyRoomIdBtn.onclick = () => {
                if (currentRoom) { 
                    try {
                        navigator.clipboard.writeText(currentRoom)
                            .then(() => showTemporaryMessage("ID da sala copiado!", "success", 2000))
                            .catch(err => {
                                console.warn("Falha ao usar navigator.clipboard, tentando fallback:", err);
                                const textArea = document.createElement("textarea");
                                textArea.value = currentRoom;
                                document.body.appendChild(textArea);
                                textArea.select();
                                try {
                                    document.execCommand('copy');
                                    showTemporaryMessage("ID da sala copiado! (fallback)", "success", 2000);
                                } catch (execErr) {
                                    showTemporaryMessage("Falha ao copiar ID.", "error", 2000);
                                    console.error("Erro no fallback execCommand:", execErr);
                                }
                                document.body.removeChild(textArea);
                            });
                    } catch (e) {
                        showTemporaryMessage("Navegador não suporta cópia automática.", "info", 3000);
                        console.error("Erro geral ao copiar:", e);
                    }
                }
            };
        } else {
            copyRoomIdBtn.classList.add('hidden');
        }
    }

    const playerTurnHeaderEl = document.getElementById('currentPlayerTurn'); 

    if (!gameData) {
        if (playerTurnHeaderEl) playerTurnHeaderEl.textContent = "Ninguém";
        if (playerTeamDisplay) playerTeamDisplay.textContent = "Nenhum";
        if (gameStatusDisplay) gameStatusDisplay.textContent = "Aguardando início...";
        return;
    }

    if (playerTurnHeaderEl) playerTurnHeaderEl.textContent = gameData.currentPlayer === PLAYER1 ? 'Vermelhas' : 'Pretas';

    if (playerTeamDisplay) {
        if (localPlayerTeam) {
            playerTeamDisplay.textContent = `${localPlayerTeam === PLAYER1 ? 'Vermelhas' : 'Pretas'} (Você)`;
        } else if (gameData.player1Id || gameData.player2Id) { 
            playerTeamDisplay.textContent = 'Observador';
        } else {
            playerTeamDisplay.textContent = 'Nenhum';
        }
    }
    
    let statusMsg = '';
    if (gameData.winner) {
        statusMsg = `Fim de jogo! Vencedor: ${gameData.winner === PLAYER1 ? 'Vermelhas' : 'Pretas'}.`;
        if (gameData.winner === localPlayerTeam) statusMsg += " Parabéns!";
        else if (localPlayerTeam) statusMsg += " Que pena!";
    } else if (gameData.status === 'forfeited') {
         statusMsg = `Jogo encerrado. ${gameData.forfeitedBy === PLAYER1 ? 'Vermelhas' : 'Pretas'} desistiu.`;
         statusMsg += ` Vencedor: ${gameData.winner === PLAYER1 ? 'Vermelhas' : 'Pretas'}.`;
    } else if (gameData.status === 'waiting_for_player2') {
        statusMsg = 'Aguardando Jogador 2...';
    } else if (gameData.status === 'active') {
        statusMsg = 'Jogo em andamento.';
        if (gameData.currentPlayer === localPlayerTeam) {
            statusMsg += mustContinueJumpState ? ' Continue a captura!' : ' Sua vez!';
        } else {
            statusMsg += ' Aguardando oponente...';
        }
    } else if (gameData.status === 'waiting') { 
        statusMsg = 'Aguardando jogadores...'; 
    }
    else {
        statusMsg = gameData.status || 'Indefinido'; 
    }
    if (gameStatusDisplay) gameStatusDisplay.textContent = statusMsg; 
}

export function renderBoard(boardState, selectedPieceState, obligatoryCapturesState, mustContinueJumpState, forcedPieceToMoveState, currentPlayerState) {
    if (!boardElement) return;
    boardElement.innerHTML = '';
    if (!boardState || boardState.length === 0) {
        boardElement.innerHTML = '<p class="board-placeholder-text">Crie ou entre em uma sala para começar.</p>';
        return;
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = r;
            square.dataset.col = c;

            const pieceData = boardState[r] ? boardState[r][c] : EMPTY;
            if (pieceData) {
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                pieceElement.classList.add(pieceData.player === PLAYER1 ? 'player1' : 'player2');
                if (pieceData.isKing) pieceElement.classList.add('king');
                
                if (selectedPieceState && selectedPieceState.row === r && selectedPieceState.col === c) {
                    pieceElement.classList.add('selected-piece-highlight');
                }
                square.appendChild(pieceElement);
            }

            if (selectedPieceState) {
                let validMovesForSelected = [];
                const pieceAtSelected = boardState[selectedPieceState.row] ? boardState[selectedPieceState.row][selectedPieceState.col] : null;

                if (pieceAtSelected) { 
                    if (mustContinueJumpState && forcedPieceToMoveState && selectedPieceState.row === forcedPieceToMoveState.row && selectedPieceState.col === forcedPieceToMoveState.col) {
                        validMovesForSelected = getValidMovesForPiece(selectedPieceState.row, selectedPieceState.col, pieceAtSelected.player, pieceAtSelected.isKing, boardState)
                                                .filter(m => m.jumpedPieces.length > 0);
                    } else if (!mustContinueJumpState) {
                        if (obligatoryCapturesState.length > 0) {
                            const pieceCanCapture = obligatoryCapturesState.find(oc => oc.piecePos.row === selectedPieceState.row && oc.piecePos.col === selectedPieceState.col);
                            if (pieceCanCapture) {
                                validMovesForSelected = pieceCanCapture.captures;
                            }
                        } else {
                            validMovesForSelected = getValidMovesForPiece(selectedPieceState.row, selectedPieceState.col, pieceAtSelected.player, pieceAtSelected.isKing, boardState)
                                                    .filter(m => m.jumpedPieces.length === 0);
                        }
                    }
                }
                
                if (validMovesForSelected.some(move => move.to.row === r && move.to.col === c)) {
                    square.classList.add('valid-move-square');
                }
            }
            square.addEventListener('click', () => handleSquareClick(r, c)); 
            boardElement.appendChild(square);
        }
    }
}

let messageTimeoutId = null;
export function showTemporaryMessage(message, type = "info", duration = 3500) { 
    if (!messageBoxContainer) return;
    const existingMessage = messageBoxContainer.querySelector('.message-box-instance');
    if (existingMessage) existingMessage.remove();
    if (messageTimeoutId) clearTimeout(messageTimeoutId);

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-box-instance ${type}`;
    messageDiv.textContent = message;
    
    messageBoxContainer.appendChild(messageDiv);

    messageTimeoutId = setTimeout(() => {
        messageDiv.style.animation = 'fadeOutSlideUp 0.3s ease-in forwards';
        messageDiv.addEventListener('animationend', () => messageDiv.remove());
        messageTimeoutId = null;
    }, duration);
}

export function showConfirmationModal(message, onConfirm, onCancel) {
    if (!confirmationModalContainer) return;
    confirmationModalContainer.innerHTML = ''; 

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const messageP = document.createElement('p');
    messageP.className = 'modal-message';
    messageP.textContent = message;
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancelar';
    cancelButton.className = 'btn btn-secondary'; 
    cancelButton.style.backgroundColor = 'var(--surface-bg)'; 
    cancelButton.style.color = 'var(--text-secondary)';
    cancelButton.onclick = () => {
        confirmationModalContainer.innerHTML = ''; 
        if (onCancel) onCancel();
    };
    
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirmar';
    confirmButton.className = 'btn btn-danger'; 
    confirmButton.onclick = () => {
        confirmationModalContainer.innerHTML = ''; 
        onConfirm();
    };
    
    buttonsDiv.appendChild(cancelButton);
    buttonsDiv.appendChild(confirmButton);
    modalContent.appendChild(messageP);
    modalContent.appendChild(buttonsDiv);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
}

export function updateNotificationBadge(count) {
    if (notificationBadge) {
        if (count > 0) {
            notificationBadge.textContent = count > 9 ? '9+' : count.toString();
            notificationBadge.classList.remove('hidden');
        } else {
            notificationBadge.classList.add('hidden');
        }
    }
}
