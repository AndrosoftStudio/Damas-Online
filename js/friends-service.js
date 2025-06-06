// js/friends-service.js
import { db, auth, firestoreAppId } from './firebase-config.js';
import {
    doc,
    getDoc,
    updateDoc,
    setDoc,
    collection,
    query,
    where,
    getDocs,
    arrayUnion,
    arrayRemove,
    serverTimestamp,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { showTemporaryMessage } from './ui.js'; // Para feedback ao utilizador

// Função para pesquisar utilizadores por nome de exibição (case-insensitive parciais)
export async function searchUsersByDisplayName(searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 3) {
        showTemporaryMessage("Digite pelo menos 3 caracteres para pesquisar.", "info");
        return [];
    }
    const searchTermLower = searchTerm.toLowerCase();
    const usersRef = collection(db, "users");
    // O Firestore não suporta pesquisa de substring case-insensitive diretamente de forma eficiente.
    // Esta query busca por igualdade no displayName (case-sensitive).
    // Para uma pesquisa mais robusta, seria necessário um serviço de terceiros (ex: Algolia) ou uma estrutura de dados diferente.
    // Uma alternativa simples, mas menos eficiente para grandes datasets, é buscar todos e filtrar no cliente,
    // ou criar um campo 'displayName_lowercase' no Firestore.
    // Por simplicidade, vamos fazer uma query por igualdade no nome de exibição (case-sensitive).
    // Para pesquisa parcial, podemos tentar com 'array-contains' se o nome for um array de palavras, ou >= e <=.
    
    // Query mais simples: igualdade (case-sensitive)
    // const q = query(usersRef, where("displayName", "==", searchTerm.trim()));
    
    // Tentativa de pesquisa "começa com" (case-sensitive)
    const q = query(usersRef, 
                    where("displayName", ">=", searchTerm.trim()),
                    where("displayName", "<=", searchTerm.trim() + '\uf8ff') 
                   );

    try {
        const querySnapshot = await getDocs(q);
        const users = [];
        const currentUserId = auth.currentUser ? auth.currentUser.uid : null;
        querySnapshot.forEach((docSnap) => {
            if (docSnap.id !== currentUserId) { // Não se pode adicionar a si mesmo
                users.push({ id: docSnap.id, ...docSnap.data() });
            }
        });
        // Filtro adicional no cliente para case-insensitive (se a query não for suficiente)
        // return users.filter(user => user.displayName.toLowerCase().includes(searchTermLower));
        return users;
    } catch (error) {
        console.error("Erro ao pesquisar utilizadores:", error);
        showTemporaryMessage("Erro ao pesquisar utilizadores.", "error");
        return [];
    }
}

// Função para enviar um pedido de amizade
export async function sendFriendRequest(targetUserId) {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) {
        showTemporaryMessage("Você precisa estar logado para enviar pedidos de amizade.", "error");
        return false;
    }
    if (currentUser.uid === targetUserId) {
        showTemporaryMessage("Você não pode adicionar a si mesmo como amigo.", "info");
        return false;
    }

    const currentUserRef = doc(db, "users", currentUser.uid);
    const targetUserRef = doc(db, "users", targetUserId);

    try {
        const targetUserSnap = await getDoc(targetUserRef);
        if (!targetUserSnap.exists()) {
            showTemporaryMessage("Utilizador não encontrado.", "error");
            return false;
        }
        const targetUserData = targetUserSnap.data();

        // Verifica se já são amigos ou se já existe um pedido
        if (targetUserData.friends && targetUserData.friends.includes(currentUser.uid)) {
            showTemporaryMessage("Vocês já são amigos!", "info");
            return false;
        }
        if (targetUserData.friendRequestsReceived && targetUserData.friendRequestsReceived.some(req => req.fromUid === currentUser.uid && req.status === 'pending')) {
            showTemporaryMessage("Pedido de amizade já enviado.", "info");
            return false;
        }
         if (targetUserData.friendRequestsSent && targetUserData.friendRequestsSent.includes(currentUser.uid)) {
            showTemporaryMessage("Este utilizador já lhe enviou um pedido. Verifique as suas notificações.", "info");
            return false;
        }


        const batch = writeBatch(db);

        // Adiciona ao array friendRequestsSent do utilizador atual
        batch.update(currentUserRef, {
            friendRequestsSent: arrayUnion(targetUserId)
        });

        // Adiciona ao array friendRequestsReceived do utilizador alvo
        batch.update(targetUserRef, {
            friendRequestsReceived: arrayUnion({
                fromUid: currentUser.uid,
                fromName: currentUser.displayName || "Usuário Anônimo", // Idealmente, buscar o nome do perfil do remetente
                status: "pending",
                timestamp: serverTimestamp()
            })
        });

        await batch.commit();
        showTemporaryMessage("Pedido de amizade enviado!", "success");
        return true;
    } catch (error) {
        console.error("Erro ao enviar pedido de amizade:", error);
        showTemporaryMessage("Erro ao enviar pedido.", "error");
        return false;
    }
}

// Função para aceitar um pedido de amizade
export async function acceptFriendRequest(requestingUserId) {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    const currentUserRef = doc(db, "users", currentUser.uid);
    const requestingUserRef = doc(db, "users", requestingUserId);
    const batch = writeBatch(db);

    try {
        // Adiciona aos amigos de ambos os utilizadores
        batch.update(currentUserRef, {
            friends: arrayUnion(requestingUserId),
            friendRequestsReceived: arrayRemove( // Remove o pedido da lista de recebidos
                (await getDoc(currentUserRef)).data().friendRequestsReceived.find(req => req.fromUid === requestingUserId && req.status === 'pending')
            ) 
        });
        batch.update(requestingUserRef, {
            friends: arrayUnion(currentUser.uid),
            friendRequestsSent: arrayRemove(currentUser.uid) // Remove da lista de enviados do outro utilizador
        });

        await batch.commit();
        showTemporaryMessage("Pedido de amizade aceite!", "success");
        return true;
    } catch (error) {
        console.error("Erro ao aceitar pedido de amizade:", error);
        showTemporaryMessage("Erro ao aceitar pedido.", "error");
        return false;
    }
}

// Função para rejeitar/cancelar um pedido de amizade
export async function rejectOrCancelFriendRequest(targetUserId, isCancelingOwnRequest = false) {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    const currentUserRef = doc(db, "users", currentUser.uid);
    const targetUserRef = doc(db, "users", targetUserId);
    const batch = writeBatch(db);

    try {
        if (isCancelingOwnRequest) { // Utilizador atual está a cancelar um pedido que enviou
            batch.update(currentUserRef, {
                friendRequestsSent: arrayRemove(targetUserId)
            });
            // Remove o pedido da lista de recebidos do utilizador alvo
            const targetUserSnap = await getDoc(targetUserRef);
            if (targetUserSnap.exists()) {
                const targetUserData = targetUserSnap.data();
                const requestToRemove = targetUserData.friendRequestsReceived.find(req => req.fromUid === currentUser.uid && req.status === 'pending');
                if (requestToRemove) {
                    batch.update(targetUserRef, {
                        friendRequestsReceived: arrayRemove(requestToRemove)
                    });
                }
            }
            showTemporaryMessage("Pedido de amizade cancelado.", "info");
        } else { // Utilizador atual está a rejeitar um pedido recebido
            const currentUserSnap = await getDoc(currentUserRef);
             if (currentUserSnap.exists()) {
                const currentUserData = currentUserSnap.data();
                const requestToRemove = currentUserData.friendRequestsReceived.find(req => req.fromUid === targetUserId && req.status === 'pending');
                if (requestToRemove) {
                    batch.update(currentUserRef, {
                        friendRequestsReceived: arrayRemove(requestToRemove)
                    });
                }
            }
            // Também remove da lista de enviados do outro utilizador
            batch.update(targetUserRef, {
                friendRequestsSent: arrayRemove(currentUser.uid)
            });
            showTemporaryMessage("Pedido de amizade rejeitado.", "info");
        }
        await batch.commit();
        return true;
    } catch (error) {
        console.error("Erro ao rejeitar/cancelar pedido:", error);
        showTemporaryMessage("Erro ao processar pedido.", "error");
        return false;
    }
}


// Função para obter a lista de amigos de um utilizador
export async function getFriendsList(userId) {
    if (!userId) return [];
    try {
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const friendUids = userData.friends || [];
            if (friendUids.length === 0) return [];

            const friendPromises = friendUids.map(uid => getDoc(doc(db, "users", uid)));
            const friendDocs = await Promise.all(friendPromises);
            return friendDocs.map(fDoc => ({ id: fDoc.id, ...fDoc.data() })).filter(f => f.displayName); // Filtra caso algum amigo não tenha displayName
        }
        return [];
    } catch (error) {
        console.error("Erro ao buscar lista de amigos:", error);
        return [];
    }
}

// Função para obter os pedidos de amizade recebidos
export async function getFriendRequestsReceived(userId) {
     if (!userId) return [];
    try {
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            return userData.friendRequestsReceived ? userData.friendRequestsReceived.filter(req => req.status === 'pending') : [];
        }
        return [];
    } catch (error) {
        console.error("Erro ao buscar pedidos de amizade recebidos:", error);
        return [];
    }
}

// Função para remover um amigo
export async function removeFriend(friendId) {
    const currentUser = auth.currentUser;
    if (!currentUser || !friendId) return false;

    const currentUserRef = doc(db, "users", currentUser.uid);
    const friendUserRef = doc(db, "users", friendId);
    const batch = writeBatch(db);

    try {
        batch.update(currentUserRef, { friends: arrayRemove(friendId) });
        batch.update(friendUserRef, { friends: arrayRemove(currentUser.uid) });
        await batch.commit();
        showTemporaryMessage("Amigo removido.", "success");
        return true;
    } catch (error) {
        console.error("Erro ao remover amigo:", error);
        showTemporaryMessage("Erro ao remover amigo.", "error");
        return false;
    }
}
