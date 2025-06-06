// js/auth.js
import { 
    signInAnonymously, 
    onAuthStateChanged, 
    signOut
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { auth, db } from './firebase-config.js'; 
// Corrigido: Importa updateUserIdDisplayInSidebar
import { showTemporaryMessage, updateUserAccountButton, updateUserIdDisplayInSidebar } from './ui.js';
import { setUserId, resetLocalGameStateApp, appLeaveRoomHandler } from './main.js'; 
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

let unsubscribeAuth = null; 

export async function setupAuthListeners() {
    if (unsubscribeAuth) unsubscribeAuth(); 

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        const logoutMenuBtn = document.getElementById('logoutMenuBtn');
        const logoutDropdownBtn = document.getElementById('logoutDropdownBtn');
        
        if (user) {
            let displayName = user.displayName;
            let photoURL = user.photoURL; 

            if (user.isAnonymous) {
                displayName = "Anônimo";
                 if(logoutMenuBtn) logoutMenuBtn.classList.add('hidden'); 
                 if(logoutDropdownBtn) logoutDropdownBtn.classList.add('hidden');
            } else {
                if(logoutMenuBtn) logoutMenuBtn.classList.remove('hidden');
                if(logoutDropdownBtn) logoutDropdownBtn.classList.remove('hidden');
                try {
                    const userDocRef = doc(db, "users", user.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        displayName = userData.displayName || user.email || "Usuário"; 
                        photoURL = userData.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.charAt(0))}&background=8AB4F8&color=0A0A0B&size=30`; 
                    } else {
                         displayName = user.email || "Usuário"; 
                         photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.charAt(0))}&background=8AB4F8&color=0A0A0B&size=30`;
                    }
                } catch (firestoreError) {
                    console.error("Erro ao buscar dados do usuário no Firestore:", firestoreError);
                    displayName = user.email || "Usuário"; 
                    photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.charAt(0))}&background=8AB4F8&color=0A0A0B&size=30`;
                }
            }
            
            setUserId(user.uid, displayName); // Passa displayName para main.js para ser usado em updateUserIdDisplayInSidebar
            updateUserAccountButton(true, displayName, photoURL); 
            console.log("User Authenticated:", user.uid, "Name:", displayName, "Anonymous:", user.isAnonymous);

        } else {
            console.log("User Signed Out or no user found, attempting anonymous sign-in...");
            if(logoutMenuBtn) logoutMenuBtn.classList.add('hidden');
            if(logoutDropdownBtn) logoutDropdownBtn.classList.add('hidden');
            updateUserIdDisplayInSidebar("Desconectado"); 
            try {
                await signInAnonymously(auth);
            } catch (error) {
                console.error("Anonymous Sign-In Error:", error);
                showTemporaryMessage("Erro na conexão anônima. O jogo pode não funcionar online.", "error", 5000);
                setUserId(null, "Desconectado"); 
                updateUserAccountButton(false);
                resetLocalGameStateApp(); 
            }
        }
    });
}

export async function handleLogout() { 
    await appLeaveRoomHandler(); 

    try {
        await signOut(auth);
        console.log("Logout bem-sucedido.");
        showTemporaryMessage("Logout efetuado. Você está jogando como anônimo.", "success", 4000);
    } catch (error) {
        console.error("Logout Error:", error);
        showTemporaryMessage("Erro ao fazer logout.", "error");
    }
}

setupAuthListeners();
