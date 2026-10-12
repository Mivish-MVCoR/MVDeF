import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const logoutButton = document.getElementById("logoutBtn");

logoutButton?.addEventListener("click", async event => {
    event.preventDefault();
    try {
        await signOut(auth);
        sessionStorage.clear();
        window.location.replace("login.html");
    } catch (error) {
        console.error("Не вдалося завершити сеанс Firebase:", error);
        window.alert("Не вдалося безпечно завершити сеанс. Перевір підключення та спробуй ще раз.");
    }
});
