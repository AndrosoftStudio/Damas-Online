// js/friends-page.js
import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { showTemporaryMessage, showConfirmationModal } from './ui.js';
import { 
    searchUsersByDisplayName, 
    sendFriendRequest, 
    acceptFriendRequest, 
    rejectOrCancelFriendRequest,
    getFriendsList,
    getFriendRequestsReceived,
    getFriendRequestsSent,
    removeFriend 
} from './friends-service.js';

const searchInput = document.getElementById('searchInput');
const searchUserBtn = document.getElementById('searchUserBtn');
const searchResultsContainer = document.getElementById('searchResults');
const friendRequestsReceivedContainer = document.getElementById('friendRequestsReceived');
const friendsListContainer = document.getElementById('friendsList');
const noReceivedRequestsPlaceholder = document.getElementById('noReceivedRequestsPlaceholder');
const noFriendsPlaceholder = document.getElementById('noFriendsPlaceholder');
const receivedRequestsCountSpan = document.getElementById('receivedRequestsCount');
const friendsCountSpan = document.getElementById('friendsCount');
const friendRequestsSentContainer = document.getElementById('friendRequestsSent');
const noSentRequestsPlaceholder = document.getElementById('noSentRequestsPlaceholder');

let currentUserId = null;
let currentUserDisplayName = "Anônimo";
let localFriendsCache = [];
let localSentRequestsCache = [];
let localReceivedRequestsCache = [];


function createUserCard(user, type) {
    const card = document.createElement('div');
    card.className = 'user-card'; // Pode ser .request-card ou .friend-card dependendo do CSS
    
    let actionsHtml = '';
    if (type === 'searchResult') {
        // Verifica se já é amigo ou se já enviou/recebeu pedido
        const isFriend = localFriendsCache.some(f => f.id === user.id);
        const sentRequest = localSentRequestsCache.some(uid => uid === user.id);
        const receivedRequest = localReceivedRequestsCache.some(req => req.fromUid === user.id);

        if (isFriend) {
            actionsHtml = `<p class="text-sm text-green-400">Já são amigos</p>`;
        } else if (sentRequest) {
            actionsHtml = `<button class="btn btn-secondary btn-small cancel-request-btn" data-uid="${user.id}">Cancelar Pedido</button>`;
        } else if (receivedRequest) {
            actionsHtml = `
                <button class="btn btn-success btn-small accept-request-btn" data-uid="${user.id}" data-name="${user.displayName || 'Usuário'}">Aceitar</button>
                <button class="btn btn-danger btn-small reject-request-btn" data-uid="${user.id}">Rejeitar</button>
            `;
        } else {
            actionsHtml = `<button class="btn btn-primary btn-small add-friend-btn" data-uid="${user.id}">+ Amigo</button>`;
        }
    } else if (type === 'receivedRequest') {
        actionsHtml = `
            <button class="btn btn-success btn-small accept-request-btn" data-uid="${user.fromUid}" data-name="${user.fromName}">Aceitar</button>
            <button class="btn btn-danger btn-small reject-request-btn" data-uid="${user.fromUid}">Rejeitar</button>
        `;
    } else if (type === 'sentRequest') {
        actionsHtml = `<button class="btn btn-secondary btn-small cancel-request-btn" data-uid="${user.id}">Cancelar Pedido</button>`;
    } else if (type === 'friend') {
        actionsHtml = `
            <button class="btn btn-secondary btn-small message-friend-btn" data-uid="${user.id}" title="Conversar (Em breve)">
                <span class="material-symbols-outlined">chat</span>
            </button>
            <button class="btn btn-danger btn-small remove-friend-btn" data-uid="${user.id}" data-name="${user.displayName || 'este amigo'}">
                <span class="material-symbols-outlined">person_remove</span>
            </button>
        `;
    }

    card.innerHTML = `
        <div class="user-card-info">
            <p class="display-name">${user.displayName || 'Nome não disponível'}</p>
            <p class="user-id">ID: ${(user.id || user.fromUid || 'N/A').substring(0,10)}...</p>
        </div>
        <div class="actions">
            ${actionsHtml}
        </div>
    `;
    return card;
}

async function handleSearchUsers() {
    const searchTerm = searchInput.value.trim();
    if (!currentUserId) {
        showTemporaryMessage("Faça login para pesquisar.", "error");
        return;
    }
    if (searchTerm.length < 3) {
        showTemporaryMessage("Digite pelo menos 3 caracteres.", "info");
        if(searchResultsContainer) searchResultsContainer.innerHTML = '';
        return;
    }
    const users = await searchUsersByDisplayName(searchTerm);
    displaySearchResults(users);
}


function displaySearchResults(users) {
    if (!searchResultsContainer) return;
    searchResultsContainer.innerHTML = ''; 
    if (users.length === 0) {
        searchResultsContainer.innerHTML = '<p class="empty-list-placeholder">Nenhum jogador encontrado com esse nome.</p>';
        return;
    }
    users.forEach(user => {
        if (user.id === currentUserId) return; 
        const card = createUserCard(user, 'searchResult');
        searchResultsContainer.appendChild(card);
    });
    addEventListenersToDynamicButtons(searchResultsContainer);
}

async function loadFriendRequests() {
    if (!currentUserId || !friendRequestsReceivedContainer) return;
    const requests = await getFriendRequestsReceived(currentUserId);
    localReceivedRequestsCache = requests; // Atualiza cache local
    
    if(receivedRequestsCountSpan) receivedRequestsCountSpan.textContent = requests.length;

    if (requests.length === 0) {
        if(noReceivedRequestsPlaceholder) noReceivedRequestsPlaceholder.style.display = 'block';
        friendRequestsReceivedContainer.innerHTML = ''; 
        if(noReceivedRequestsPlaceholder) friendRequestsReceivedContainer.appendChild(noReceivedRequestsPlaceholder);
        return;
    }
    if(noReceivedRequestsPlaceholder) noReceivedRequestsPlaceholder.style.display = 'none';
    friendRequestsReceivedContainer.innerHTML = ''; 

    requests.forEach(req => {
        const card = createUserCard(req, 'receivedRequest');
        friendRequestsReceivedContainer.appendChild(card);
    });
    addEventListenersToDynamicButtons(friendRequestsReceivedContainer);
}

async function loadSentFriendRequests() {
    if (!currentUserId || !friendRequestsSentContainer) return;
    const sentUids = await getFriendRequestsSent(currentUserId);
    localSentRequestsCache = sentUids; // Atualiza cache local

    if (sentUids.length === 0) {
        if (noSentRequestsPlaceholder) noSentRequestsPlaceholder.style.display = 'block';
        friendRequestsSentContainer.innerHTML = '';
        if (noSentRequestsPlaceholder) friendRequestsSentContainer.appendChild(noSentRequestsPlaceholder);
        return;
    }
    if (noSentRequestsPlaceholder) noSentRequestsPlaceholder.style.display = 'none';
    friendRequestsSentContainer.innerHTML = '';

    // Para cada UID, buscar o displayName (opcional, mas melhor para UI)
    for (const uid of sentUids) {
        // Aqui você pode optar por buscar o displayName do utilizador ou apenas mostrar o UID
        // Por simplicidade, vamos assumir que temos o objeto user ou um placeholder.
        // Numa aplicação real, você faria um getDoc para buscar o displayName.
        const card = createUserCard({ id: uid, displayName: `Utilizador ${uid.substring(0,6)}...` }, 'sentRequest');
        friendRequestsSentContainer.appendChild(card);
    }
    addEventListenersToDynamicButtons(friendRequestsSentContainer);
}


async function loadFriends() {
    if (!currentUserId || !friendsListContainer) return;
    const friends = await getFriendsList(currentUserId);
    localFriendsCache = friends; // Atualiza cache local

    if(friendsCountSpan) friendsCountSpan.textContent = friends.length;

    if (friends.length === 0) {
        if(noFriendsPlaceholder) noFriendsPlaceholder.style.display = 'block';
        friendsListContainer.innerHTML = '';
        if(noFriendsPlaceholder) friendsListContainer.appendChild(noFriendsPlaceholder);
        return;
    }
    if(noFriendsPlaceholder) noFriendsPlaceholder.style.display = 'none';
    friendsListContainer.innerHTML = '';

    friends.forEach(friend => {
        const card = createUserCard(friend, 'friend');
        friendsListContainer.appendChild(card);
    });
    addEventListenersToDynamicButtons(friendsListContainer);
}

function addEventListenersToDynamicButtons(container) {
    container.querySelectorAll('.add-friend-btn').forEach(button => {
        button.onclick = async (e) => { // Usar onclick para sobrescrever se o elemento for recriado
            const targetUserId = e.currentTarget.dataset.uid;
            e.currentTarget.disabled = true;
            const success = await sendFriendRequest(targetUserId);
            if (success) {
                e.currentTarget.textContent = 'Enviado';
                e.currentTarget.classList.replace('btn-primary', 'btn-success-outline'); 
                loadSentFriendRequests(); // Atualiza a lista de pedidos enviados
            } else {
                 e.currentTarget.disabled = false; 
            }
        };
    });
    container.querySelectorAll('.accept-request-btn').forEach(button => {
        button.onclick = async (e) => {
            const requestingUserId = e.currentTarget.dataset.uid;
            await acceptFriendRequest(requestingUserId);
            loadFriendRequests(); 
            loadFriends(); 
        };
    });
    container.querySelectorAll('.reject-request-btn').forEach(button => {
        button.onclick = async (e) => {
            const requestingUserId = e.currentTarget.dataset.uid;
            await rejectOrCancelFriendRequest(requestingUserId, false);
            loadFriendRequests(); 
        };
    });
    container.querySelectorAll('.cancel-request-btn').forEach(button => {
        button.onclick = async (e) => {
            const targetUserId = e.currentTarget.dataset.uid;
            await rejectOrCancelFriendRequest(targetUserId, true); // true para cancelar próprio pedido
            loadSentFriendRequests();
            // Se a pesquisa ainda estiver mostrando este utilizador, pode ser necessário atualizar essa view
            if (searchInput.value.trim().length > 0) handleSearchUsers();
        };
    });
    container.querySelectorAll('.remove-friend-btn').forEach(button => {
        button.onclick = (e) => {
            const friendId = e.currentTarget.dataset.uid;
            const friendName = e.currentTarget.dataset.name;
            showConfirmationModal(`Tem certeza que quer remover ${friendName} da sua lista de amigos?`, async () => {
                await removeFriend(friendId);
                loadFriends(); 
            });
        };
    });
     container.querySelectorAll('.message-friend-btn').forEach(button => {
        button.onclick = () => {
            showTemporaryMessage("Funcionalidade de chat em desenvolvimento.", "info");
        };
    });
}


onAuthStateChanged(auth, async (user) => {
    if (user && !user.isAnonymous) {
        currentUserId = user.uid;
        currentUserDisplayName = user.displayName || "Usuário"; // Garante que temos um nome para o logado
        await loadFriendRequests();
        await loadSentFriendRequests();
        await loadFriends();
    } else {
        showTemporaryMessage("Você precisa estar logado para gerenciar amigos.", "error", 5000);
        if(searchResultsContainer) searchResultsContainer.innerHTML = '<p class="empty-list-placeholder">Faça login para procurar amigos.</p>';
        if(friendRequestsReceivedContainer && noReceivedRequestsPlaceholder) {
            friendRequestsReceivedContainer.innerHTML = '';
            friendRequestsReceivedContainer.appendChild(noReceivedRequestsPlaceholder);
            noReceivedRequestsPlaceholder.style.display = 'block';
        }
        if(friendRequestsSentContainer && noSentRequestsPlaceholder) {
            friendRequestsSentContainer.innerHTML = '';
            friendRequestsSentContainer.appendChild(noSentRequestsPlaceholder);
            noSentRequestsPlaceholder.style.display = 'block';
        }
        if(friendsListContainer && noFriendsPlaceholder) {
            friendsListContainer.innerHTML = '';
            friendsListContainer.appendChild(noFriendsPlaceholder);
            noFriendsPlaceholder.style.display = 'block';
        }
        if(receivedRequestsCountSpan) receivedRequestsCountSpan.textContent = '0';
        if(friendsCountSpan) friendsCountSpan.textContent = '0';

    }
});

if (searchUserBtn && searchInput) {
    searchUserBtn.addEventListener('click', handleSearchUsers);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearchUsers();
        }
    });
}
