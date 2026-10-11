import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCpd3annNgF24BMIDgVshIL8im1KQc9z4Y",
    authDomain: "mvdef-856.firebaseapp.com",
    databaseURL: "https://mvdef-856-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "mvdef-856",
    storageBucket: "mvdef-856.firebasestorage.app",
    messagingSenderId: "781909502344",
    appId: "1:781909502344:web:02a74eee4e0d48ff6f723d"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);