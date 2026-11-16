import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const logoutButton = document.getElementById("logoutBtn");

logoutButton?.addEventListener("click", async event => {
    event.preventDefault();
    try {
        await signOut(auth).catch(() => undefined);
        localStorage.removeItem("mvdefGuestSession");
        sessionStorage.clear();
        window.location.replace("login.html");
    } catch (error) {
        console.error("Не вдалося завершити сеанс Firebase:", error);
        localStorage.removeItem("mvdefGuestSession");
        sessionStorage.clear();
        window.location.replace("login.html");
    }
});
