// js/account-page.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const accountDetailsContent = document.getElementById('account-details-content');
const accountActions = document.getElementById('account-actions');
const updateDisplayNameInput = document.getElementById('update-displayName');
const saveAccountChangesBtn = document.getElementById('saveAccountChangesBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const messageBoxContainerAccount = document.getElementById('messageBoxContainer'); 

let currentLocalUserId = null;
let messageTimeoutIdAccount = null;

function showAccountPageMessage(message, type = "info", duration = 4000) {
    if (!messageBoxContainerAccount) {
        alert(message); 
        return;
    }
    const existingMessage = messageBoxContainerAccount.querySelector('.message-box-instance');
    if (existingMessage) existingMessage.remove();
    
    if (messageTimeoutIdAccount) clearTimeout(messageTimeoutIdAccount);

    const messageDiv = document.createElement('div');
    messageDiv.className = `message-box-instance ${type}`; 
    messageDiv.textContent = message;
    messageBoxContainerAccount.appendChild(messageDiv);

    messageTimeoutIdAccount = setTimeout(() => {
        messageDiv.style.animation = 'fadeOutSlideUp 0.3s ease-in forwards';
        messageDiv.addEventListener('animationend', () => messageDiv.remove());
    }, duration);
}


async function loadAccountDetails(user) {
    if (!user || user.isAnonymous) { // Não mostra detalhes para anônimos
        if (accountDetailsContent) accountDetailsContent.innerHTML = '<p class="text-center text-theme-text-secondary">Faça login para ver os detalhes da sua conta.</p>';
        if (accountActions) accountActions.classList.add('hidden');
        // Opcional: redirecionar para login se for anônimo
        // window.location.href = 'login.html';
        return;
    }

    currentLocalUserId = user.uid;
    let displayName = user.displayName || user.email || "Usuário";
    let email = user.email;
    let photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.split(' ').map(n=>n[0]).join(''))}&background=8AB4F8&color=0A0A0B&size=128&font-size=0.5&bold=true`;

    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            displayName = userData.displayName || displayName;
            photoURL = userData.photoURL || photoURL; 
            email = userData.email || email; 
        }
    } catch (error) {
        console.error("Erro ao buscar dados do usuário no Firestore:", error);
    }

    if(accountDetailsContent) {
        accountDetailsContent.innerHTML = `
            <div class="text-center mb-6">
                <img id="userProfilePicLarge" src="${photoURL}" alt="Foto de ${displayName}" class="profile-picture-large-account rounded-full mx-auto object-cover">
            </div>
            <dl class="space-y-3">
                <div class="detail-item-account">
                    <dt>Nome de Exibição:</dt>
                    <dd id="userNameDisplayAccount">${displayName}</dd>
                </div>
                <div class="detail-item-account">
                    <dt>Email:</dt>
                    <dd id="userEmailDisplayAccount">${email}</dd>
                </div>
                <div class="detail-item-account">
                    <dt>ID de Usuário (UID):</dt>
                    <dd class="user-id-tag-account">${user.uid}</dd>
                </div>
            </dl>
        `;
    }
    if (updateDisplayNameInput) updateDisplayNameInput.value = displayName;
    
    if (accountActions) accountActions.classList.remove('hidden');
}

if (saveAccountChangesBtn && updateDisplayNameInput) {
    saveAccountChangesBtn.addEventListener('click', async () => {
        if (!currentLocalUserId) {
            showAccountPageMessage("Usuário não identificado.", "error");
            return;
        }
        const newDisplayName = updateDisplayNameInput.value.trim();

        if (!newDisplayName) {
            showAccountPageMessage("O nome de exibição não pode estar vazio.", "error");
            return;
        }

        try {
            const user = auth.currentUser;
            if (user) {
                await updateProfile(user, { displayName: newDisplayName });
                const userDocRef = doc(db, "users", currentLocalUserId);
                await updateDoc(userDocRef, { displayName: newDisplayName });

                showAccountPageMessage("Nome de exibição atualizado com sucesso!", "success");
                loadAccountDetails(user); 
            }
        } catch (error) {
            console.error("Erro ao salvar alterações da conta:", error);
            showAccountPageMessage("Erro ao salvar alterações. Tente novamente.", "error");
        }
    });
}

if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (user && user.email) {
            try {
                await sendPasswordResetEmail(auth, user.email);
                showAccountPageMessage(`Email de redefinição de senha enviado para ${user.email}. Verifique sua caixa de entrada.`, "success", 6000);
            } catch (error) {
                console.error("Erro ao enviar email de redefinição de senha:", error);
                showAccountPageMessage("Erro ao enviar email de redefinição. Tente novamente mais tarde.", "error");
            }
        } else {
            showAccountPageMessage("Não foi possível enviar o email de redefinição. Usuário ou email não encontrado.", "error");
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) {
        loadAccountDetails(user);
    } else {
        if (accountDetailsContent) accountDetailsContent.innerHTML = '<p class="text-center text-theme-text-secondary">Você precisa estar logado para ver os detalhes da sua conta. <a href="login.html" class="text-theme-accent hover:underline">Faça login</a>.</p>';
        if (accountActions) accountActions.classList.add('hidden');
        if (!user) { // Se realmente não há usuário, redireciona para login
            // setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        }
    }
});
