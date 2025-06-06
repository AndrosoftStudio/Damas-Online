// js/firebase-service.js
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    serverTimestamp, 
    onSnapshot, 
    collection, 
    addDoc,
    runTransaction 
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js"; 
import { db, firestoreAppId } from './firebase-config.js';
import { showTemporaryMessage, updateGameInfoUI, renderBoard } from './ui.js';
import * as mainApp from './main.js'; 
import { createInitialBoard, findAllObligatoryCaptures, PLAYER1, PLAYER2, EMPTY } from './game-logic.js'; 

export async function createOrJoinGame(roomIdFromInput, isAttemptingToCreate, currentUserId) {
    if (!currentUserId) {
        showTemporaryMessage("Você precisa estar conectado para criar ou entrar.", "error");
        return;
    }

    let gameRef;
    let actualRoomId = roomIdFromInput;
    let justCreatedRoom = false;

    if (isAttemptingToCreate) {
        if (roomIdFromInput) {
             const tempGameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${roomIdFromInput}`);
             const tempGameSnap = await getDoc(tempGameRef);
             if (tempGameSnap.exists()) {
                console.log(`Sala ${roomIdFromInput} já existe, tentando entrar...`);
                isAttemptingToCreate = false; 
                actualRoomId = roomIdFromInput;
                gameRef = tempGameRef;
                // Não mostre mensagem aqui ainda, a transação decidirá o resultado
             } else {
                actualRoomId = roomIdFromInput;
                showTemporaryMessage(`Criando nova sala com ID '${actualRoomId}'...`, "info");
             }
        }
        
        if (!gameRef || (isAttemptingToCreate && !roomIdFromInput) ) { 
            try {
                const gamesCollectionRef = collection(db, `artifacts/${firestoreAppId}/public/data/checkersGames`);
                const initialBoard = createInitialBoard();
                const newGameData = { 
                    boardString: JSON.stringify(initialBoard),
                    currentPlayer: PLAYER1,
                    player1Id: currentUserId,
                    player2Id: null,
                    gameAdminId: currentUserId,
                    createdAt: serverTimestamp(),
                    status: 'waiting_for_player2', // Status inicial correto
                    winner: null,
                    forfeitedBy: null
                };

                if (actualRoomId && !gameRef) { 
                    gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${actualRoomId}`);
                    await setDoc(gameRef, newGameData); // Criação da sala
                } else if (!gameRef) { 
                    const newGameDoc = await addDoc(gamesCollectionRef, newGameData);
                    actualRoomId = newGameDoc.id;
                    gameRef = newGameDoc; 
                }
                
                justCreatedRoom = true;
                mainApp.setLocalPlayerTeam(PLAYER1);
                mainApp.setGameAdminId(currentUserId);
                mainApp.setCurrentRoomId(actualRoomId); // Define o ID da sala no estado global
                showTemporaryMessage(`Sala '${actualRoomId}' criada! Compartilhe o ID!`, "success", 7000);
                document.getElementById('gameIdInput').value = actualRoomId;
                
            } catch (error) {
                console.error("Erro ao criar nova sala:", error);
                showTemporaryMessage("Erro ao criar nova sala. Tente novamente.", "error");
                return; 
            }
        }
    }
    
    if (!gameRef) { 
        if (!actualRoomId) { 
            showTemporaryMessage("Por favor, insira um ID para entrar na sala.", "error"); return;
        }
        gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${actualRoomId}`);
    }
    
    // Se a sala acabou de ser criada, o listener já será configurado abaixo.
    // Se está tentando entrar, usa a transação.
    if (!justCreatedRoom) {
        try {
            await runTransaction(db, async (transaction) => {
                const gameSnap = await transaction.get(gameRef);

                if (!gameSnap.exists()) {
                    throw new Error("Sala não encontrada. Verifique o ID.");
                }

                const gameData = gameSnap.data();
                mainApp.setGameAdminId(gameData.gameAdminId); // Define o admin ID primeiro

                if (gameData.player1Id === currentUserId) {
                    mainApp.setLocalPlayerTeam(PLAYER1);
                    showTemporaryMessage(`Você retornou à sala '${actualRoomId}' como Jogador 1.`, "info");
                } else if (gameData.player2Id === currentUserId) {
                    mainApp.setLocalPlayerTeam(PLAYER2);
                    showTemporaryMessage(`Você retornou à sala '${actualRoomId}' como Jogador 2.`, "info");
                } else if (!gameData.player2Id) { // Vaga de Jogador 2 está livre
                    transaction.update(gameRef, { 
                        player2Id: currentUserId, 
                        status: 'active' // Ao P2 entrar, jogo fica ativo
                    });
                    mainApp.setLocalPlayerTeam(PLAYER2);
                    showTemporaryMessage(`Você entrou na sala '${actualRoomId}' como Jogador 2 (Pretas).`, "success");
                } else { // Sala cheia
                    mainApp.setLocalPlayerTeam(null); // Entra como observador
                    showTemporaryMessage(`Sala '${actualRoomId}' cheia. Você entrou como observador.`, "info");
                }
            });
            mainApp.setCurrentRoomId(actualRoomId); // Define o ID da sala no estado global APÓS a transação
        } catch (error) {
            console.error("Erro ao entrar na sala (transação):", error);
            showTemporaryMessage(error.message || "Erro ao entrar na sala.", "error");
            mainApp.setCurrentRoomId(null); // Limpa ID da sala se a entrada falhar
            return; // Impede a configuração do listener se a entrada falhar
        }
    }
    
    setupGameListener(actualRoomId); 

    document.getElementById('createGameBtn').disabled = true;
    document.getElementById('joinGameBtn').disabled = true;
    document.getElementById('gameIdInput').disabled = true;
}

function setupGameListener(roomId) {
    if (!roomId) {
        console.warn("setupGameListener chamado sem roomId");
        return;
    }
    const gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${roomId}`);
    
    mainApp.manageGameDocUnsubscribe(); 
    
    const newUnsubscribe = onSnapshot(gameRef, (docSnap) => {
        const leaveRoomBtn = document.getElementById('leaveRoomMenuBtn');
        const resetGameBtnEl = document.getElementById('resetGameBtn');
        const forfeitGameBtnEl = document.getElementById('forfeitGameBtn');
        const copyRoomIdBtnEl = document.getElementById('copyRoomIdBtn');

        if (docSnap.exists()) {
            const gameData = docSnap.data();
            const newBoard = gameData.boardString ? JSON.parse(gameData.boardString) : createInitialBoard();
            
            const previousPlayerForThisClient = mainApp.getCurrentPlayer(); 
            const previousLocalPlayerTeam = mainApp.getLocalPlayerTeam();

            mainApp.setGameState({ // Atualiza o estado local principal
                board: newBoard,
                currentPlayer: gameData.currentPlayer,
            });
            
            const currentUserId = mainApp.getUserId();
            if (currentUserId === gameData.player1Id) mainApp.setLocalPlayerTeam(PLAYER1);
            else if (currentUserId === gameData.player2Id) mainApp.setLocalPlayerTeam(PLAYER2);
            else mainApp.setLocalPlayerTeam(null); 

            mainApp.setGameAdminId(gameData.gameAdminId);

            if (gameData.currentPlayer === mainApp.getLocalPlayerTeam()) { 
                if (gameData.currentPlayer !== previousPlayerForThisClient || previousLocalPlayerTeam === null || !mainApp.getMustContinueJump()) {
                    mainApp.setObligatoryCaptures(findAllObligatoryCaptures(gameData.currentPlayer, newBoard));
                    mainApp.setSelectedPiece(null); 
                    mainApp.setMustContinueJump(false); 
                    mainApp.setForcedPieceToMove(null);
                }
            } else { 
                mainApp.setObligatoryCaptures([]);
                if (gameData.currentPlayer !== previousPlayerForThisClient) {
                    mainApp.setSelectedPiece(null);
                    mainApp.setMustContinueJump(false);
                    mainApp.setForcedPieceToMove(null);
                }
            }

            updateGameInfoUI(gameData, mainApp.getLocalPlayerTeam(), currentUserId, mainApp.getMustContinueJump());
            renderBoard(mainApp.getCurrentBoard(), mainApp.getSelectedPiece(), mainApp.getObligatoryCaptures(), mainApp.getMustContinueJump(), mainApp.getForcedPieceToMove(), gameData.currentPlayer);

            if (resetGameBtnEl) {
                const isAdmin = currentUserId === mainApp.getGameAdminId();
                const canAdminReset = isAdmin && 
                                    gameData.player1Id && 
                                    (gameData.status === 'active' || gameData.status === 'waiting_for_player2') && 
                                    gameData.status !== 'finished' && 
                                    gameData.status !== 'forfeited';
                resetGameBtnEl.disabled = !canAdminReset;
            }

            if (forfeitGameBtnEl) {
                const canForfeit = mainApp.getLocalPlayerTeam() && 
                                 gameData.status === 'active' && 
                                 !gameData.winner && 
                                 gameData.status !== 'forfeited';
                forfeitGameBtnEl.disabled = !canForfeit;
            }
            
            if (leaveRoomBtn) {
                leaveRoomBtn.disabled = !mainApp.getCurrentRoomId(); // Habilita se estiver em uma sala
            }
            if (copyRoomIdBtnEl) {
                 if (mainApp.getCurrentRoomId() && gameData.status !== 'finished' && gameData.status !== 'forfeited') {
                    copyRoomIdBtnEl.classList.remove('hidden');
                } else {
                    copyRoomIdBtnEl.classList.add('hidden');
                }
            }


        } else { // Sala não existe mais
            showTemporaryMessage("A sala do jogo foi removida ou não existe mais.", "error");
            mainApp.manageGameDocUnsubscribe(null); 
            mainApp.resetLocalGameStateApp(); 
            mainApp.setCurrentRoomId(null); 
            if (leaveRoomBtn) leaveRoomBtn.disabled = true;
             if (copyRoomIdBtnEl) copyRoomIdBtnEl.classList.add('hidden');

            const createBtn = document.getElementById('createGameBtn');
            const joinBtn = document.getElementById('joinGameBtn');
            const gameIdInpt = document.getElementById('gameIdInput');
            if(createBtn) createBtn.disabled = false;
            if(joinBtn) joinBtn.disabled = false;
            if(gameIdInpt) {
                gameIdInpt.disabled = false;
                gameIdInpt.value = '';
            }
        }
    });
    mainApp.manageGameDocUnsubscribe(newUnsubscribe); 
}


export async function updateGameInFirestore(roomId, dataToUpdate) {
    if (!roomId) {
        console.warn("updateGameInFirestore chamado sem roomId");
        return;
    }
    const gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${roomId}`);
    try {
        if (dataToUpdate.board && typeof dataToUpdate.board === 'object') { 
            dataToUpdate.boardString = JSON.stringify(dataToUpdate.board);
            delete dataToUpdate.board; 
        }
        await updateDoc(gameRef, {
            ...dataToUpdate,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao atualizar o jogo no Firestore:", error);
        showTemporaryMessage("Erro ao salvar sua jogada. Verifique sua conexão.", "error");
    }
}

export async function handleForfeitGame(roomId, forfeitingPlayerUserId) { 
    if (!roomId || !forfeitingPlayerUserId) {
        showTemporaryMessage("Não é possível desistir: ID da sala ou jogador ausente.", "error");
        return;
    }
    const gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${roomId}`);
    try {
        const gameSnap = await getDoc(gameRef);
        if (gameSnap.exists()) {
            const gameData = gameSnap.data();
            
            if (gameData.winner || gameData.status === 'forfeited') {
                showTemporaryMessage("O jogo já terminou, não é possível desistir.", "info");
                return;
            }
             if (forfeitingPlayerUserId !== gameData.player1Id && forfeitingPlayerUserId !== gameData.player2Id) {
                showTemporaryMessage("Você não é um jogador ativo nesta partida para desistir.", "info");
                return;
            }
            
            const playerWhoForfeited = forfeitingPlayerUserId === gameData.player1Id ? PLAYER1 : PLAYER2;
            const winnerByForfeit = playerWhoForfeited === PLAYER1 ? PLAYER2 : PLAYER1;

            await updateDoc(gameRef, {
                status: 'forfeited',
                winner: winnerByForfeit, 
                forfeitedBy: playerWhoForfeited, 
                updatedAt: serverTimestamp()
            });
            showTemporaryMessage(`Jogador ${playerWhoForfeited === PLAYER1 ? 'Vermelhas' : 'Pretas'} desistiu. Fim de jogo!`, "info");
        } else {
            showTemporaryMessage("Sala não encontrada para processar a desistência.", "error");
        }
    } catch (error) {
        console.error("Erro ao desistir do jogo:", error);
        showTemporaryMessage("Erro ao processar desistência.", "error");
    }
}

export async function firebaseHandleLeaveRoom() { 
    const roomId = mainApp.getCurrentRoomId(); 
    const leavingUserId = mainApp.getUserId(); 

    if (!roomId || !leavingUserId) {
        // Se não há sala ou usuário, apenas reseta o estado local.
        mainApp.resetLocalGameStateApp(); 
        mainApp.setCurrentRoomId(null);
        return;
    }

    const gameRef = doc(db, `artifacts/${firestoreAppId}/public/data/checkersGames/${roomId}`);
    try {
        mainApp.manageGameDocUnsubscribe(null); 

        // Não precisamos ler explicitamente o gameSnap aqui se a lógica de atualização for apenas para
        // indicar que o jogador saiu, e as regras do Firestore lidam com o resto.
        // No entanto, para uma lógica mais complexa de transferência de admin ou reset de sala,
        // uma transação seria mais segura aqui também.
        // Por ora, vamos assumir uma lógica mais simples: o jogador apenas "desaparece" da sala.
        // O onSnapshot dos outros jogadores e as regras do Firestore devem lidar com as consequências.

        // Exemplo simples: se o jogador que saiu era P1 ou P2, poderia-se limpar o campo no Firestore.
        // Mas isso pode ser complexo devido às regras de quem pode escrever o quê.
        // Uma abordagem mais simples é deixar a sala como está e os listeners dos outros jogadores
        // verão que o jogador não está mais ativo ou as regras de inatividade podem entrar em jogo.
        
        // APENAS exemplo (poderia ser complexo e conflitar com regras de segurança):
        // const gameSnap = await getDoc(gameRef);
        // if (gameSnap.exists()) {
        //     const gameData = gameSnap.data();
        //     let updateData = {};
        //     if (leavingUserId === gameData.player1Id) {
        //         // updateData.player1Id = null; // Complicado devido a gameAdminId
        //     } else if (leavingUserId === gameData.player2Id) {
        //         // updateData.player2Id = null;
        //     }
        //     if (Object.keys(updateData).length > 0) {
        //         await updateDoc(gameRef, updateData);
        //     }
        // }
        showTemporaryMessage("Você saiu da sala.", "info");

    } catch (error) {
        console.error("Erro ao processar saída da sala (pode ser ignorado se apenas resetando localmente):", error);
        // showTemporaryMessage("Erro ao sair da sala.", "error"); // Pode ser desnecessário se o principal é o reset local
    } finally {
        // Sempre reseta o estado local e habilita botões, independentemente do estado da sala no Firestore
        mainApp.resetLocalGameStateApp(); 
        mainApp.setCurrentRoomId(null);   
        
        document.getElementById('createGameBtn').disabled = false;
        document.getElementById('joinGameBtn').disabled = false;
        const gameIdInputEl = document.getElementById('gameIdInput');
        if (gameIdInputEl) {
            gameIdInputEl.disabled = false;
            gameIdInputEl.value = '';
        }
        document.getElementById('leaveRoomMenuBtn').disabled = true;
        document.getElementById('copyRoomIdBtn').classList.add('hidden');
    }
}
