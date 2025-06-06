// js/auth-pages.js
import { auth, db } from './firebase-config.js'; 
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    updateProfile 
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js"; 

const messageBoxContainer = document.getElementById('messageBoxContainer');
let messageTimeoutId = null;

function showAuthPageMessage(message, type = "info", duration = 4000, targetElementId = null) {
    const targetElement = targetElementId ? document.getElementById(targetElementId) : null;
    
    if (targetElement) {
        targetElement.textContent = message;
        targetElement.classList.remove('hidden', 'error-message-auth', 'success-message-auth', 'info-message-auth'); 
        if (type === 'error') {
            targetElement.classList.add('error-message-auth');
        } else if (type === 'success') {
            targetElement.classList.add('success-message-auth');
        } else {
             targetElement.classList.add('info-message-auth'); 
        }
        
        if (messageTimeoutId) clearTimeout(messageTimeoutId);
        messageTimeoutId = setTimeout(() => {
            targetElement.classList.add('hidden');
            targetElement.textContent = '';
            targetElement.className = 'error-message-auth hidden'; 
        }, duration);

    } else if (messageBoxContainer) { 
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
        }, duration);
    } else {
        console.warn("Nenhum elemento de mensagem encontrado para:", message);
    }
}


const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const loginErrorElementId = 'login-error-message'; 
        const submitButton = document.getElementById('login-submit-button');
        if(submitButton) submitButton.disabled = true;


        try {
            await signInWithEmailAndPassword(auth, email, password);
            showAuthPageMessage("Login efetuado com sucesso! Redirecionando...", "success", 2000, loginErrorElementId);
            setTimeout(() => {
                window.location.href = 'index.html'; 
            }, 1500);
        } catch (error) {
            console.error("Erro no login:", error);
            let friendlyMessage = "Erro ao fazer login. Verifique suas credenciais.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                friendlyMessage = "Email ou senha inválidos.";
            } else if (error.code === 'auth/invalid-email') {
                friendlyMessage = "Formato de email inválido.";
            } else if (error.code === 'auth/operation-not-allowed') {
                friendlyMessage = "Login por email/senha não está habilitado. Contacte o administrador.";
            }
            showAuthPageMessage(friendlyMessage, "error", 5000, loginErrorElementId);
            if(submitButton) submitButton.disabled = false;
        }
    });
}

const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const registerErrorElementId = 'register-error-message'; 
        const submitButton = document.getElementById('register-submit-button');
        if(submitButton) submitButton.disabled = true;

        if (!name) {
            showAuthPageMessage("Por favor, insira seu nome de exibição.", "error", 5000, registerErrorElementId);
            if(submitButton) submitButton.disabled = false;
            return;
        }
        if (password !== confirmPassword) {
            showAuthPageMessage("As senhas não coincidem!", "error", 5000, registerErrorElementId);
            if(submitButton) submitButton.disabled = false;
            return;
        }
        if (password.length < 6) {
            showAuthPageMessage("A senha deve ter pelo menos 6 caracteres.", "error", 5000, registerErrorElementId);
             if(submitButton) submitButton.disabled = false;
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            const initial = name.charAt(0).toUpperCase();
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=8AB4F8&color=0A0A0B&size=128&font-size=0.5&bold=true&format=svg`;

            await updateProfile(user, { 
                displayName: name,
                photoURL: avatarUrl 
            });
            
            const userDocRef = doc(db, "users", user.uid); 
            await setDoc(userDocRef, {
                uid: user.uid,
                displayName: name,
                email: user.email,
                createdAt: serverTimestamp(),
                photoURL: avatarUrl, 
                friends: [], 
                friendRequestsSent: [],
                friendRequestsReceived: []
            });

            showAuthPageMessage("Conta criada com sucesso! Redirecionando para login...", "success", 3000, registerErrorElementId);
            setTimeout(() => {
                window.location.href = 'login.html'; 
            }, 2500);

        } catch (error) {
            console.error("Erro no cadastro:", error);
            let friendlyMessage = "Erro ao criar conta. Tente novamente.";
            if (error.code === 'auth/email-already-in-use') {
                friendlyMessage = "Este email já está em uso.";
            } else if (error.code === 'auth/invalid-email') {
                friendlyMessage = "Formato de email inválido.";
            } else if (error.code === 'auth/weak-password') {
                friendlyMessage = "A senha é muito fraca.";
            } else if (error.code === 'auth/operation-not-allowed') {
                friendlyMessage = "Cadastro por email/senha não está habilitado. Verifique as configurações do Firebase ou contacte o administrador.";
            }
            showAuthPageMessage(friendlyMessage, "error", 5000, registerErrorElementId);
            if(submitButton) submitButton.disabled = false;
        }
    });
}
