// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZrTu0Q0D-2kJ2I1DwbCm3EWMi467x-m8", // Substitua pela sua API Key real
  authDomain: "jogo-de-damas-multijogador.firebaseapp.com",
  projectId: "jogo-de-damas-multijogador",
  storageBucket: "jogo-de-damas-multijogador.appspot.com", 
  messagingSenderId: "841869125213",
  appId: "1:841869125213:web:cd88c7db62327ea235cfb4",
  measurementId: "G-709KQXVH9H"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const storage = getStorage(fbApp); 
const firestoreAppId = firebaseConfig.projectId; 

export { auth, db, storage, firestoreAppId, fbApp };
