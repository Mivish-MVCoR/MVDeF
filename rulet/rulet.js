import { CLOUDFLARE_API_URL, SITE_SESSION_KEY } from "../js/cloudflare-config.js";

const elements = {
    notice: document.getElementById("notice"),
    invitePanel: document.getElementById("invitePanel"),
    duelPanel: document.getElementById("duelPanel"),
    playerName: document.getElementById("playerName"),
    gamesCount: document.getElementById("gamesCount"),
    deathsCount: document.getElementById("deathsCount"),
    coinsCount: document.getElementById("coinsCount"),
    duelTitle: document.getElementById("duelTitle"),
    stakeText: document.getElementById("stakeText"),
    inviteStatus: document.getElementById("inviteStatus"),
    inviteActions: document.getElementById("inviteActions"),
    acceptInvite: document.getElementById("acceptInvite"),
    declineInvite: document.getElementById("declineInvite"),
    opponentName: document.getElementById("opponentName"),
    shotCount: document.getElementById("shotCount"),
    duelStake: document.getElementById("duelStake"),
    turnStatus: document.getElementById("turnStatus"),
    countdown: document.getElementById("countdown"),
    shotMessage: document.getElementById("shotMessage"),
    fireButton: document.getElementById("fireButton"),
    rematchButton: document.getElementById("rematchButton"),
    revolverStage: document.getElementById("revolverStage"),
    cylinder: document.getElementById("cylinder"),
    shopDialog: document.getElementById("shopDialog"),
    shopCoins: document.getElementById("shopCoins"),
    skinList: document.getElementById("skinList")
};

const duelId = new URLSearchParams(window.location.search).get("duel");
const token = sessionStorage.getItem(SITE_SESSION_KEY);
let currentUid = sessionStorage.getItem("uuid");
let currentDuel = null;
let currentProfile = null;
let busy = false;
let polling = false;

async function api(path, { method = "GET", body } = {}) {
    if (!token) {
        const error = new Error("Сеанс сайту не знайдено. Відкрий персональне посилання з Minecraft.");
        error.code = "unauthenticated";
        throw error;
    }
    const response = await fetch(`${CLOUDFLARE_API_URL}${path}`, {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            ...(body ? { "content-type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.error?.message || "Не вдалося виконати запит.");
        error.code = data.error?.code || "unknown";
        throw error;
    }
    return data;
}

function showNotice(message, error = false) {
    elements.notice.textContent = message;
    elements.notice.classList.toggle("error", error);
    elements.notice.hidden = false;
}

function hideNotice() {
    elements.notice.hidden = true;
}

function updateProfile(profile) {
    currentProfile = profile.player;
    currentUid = profile.player.uid;
    elements.playerName.textContent = profile.player.player_name;
    elements.gamesCount.textContent = profile.player.games;
    elements.deathsCount.textContent = profile.player.deaths;
    elements.coinsCount.textContent = profile.player.coins;
    elements.revolverStage.dataset.skin = profile.player.active_skin || "classic";
    if (profile.shop) renderShop(profile.shop);
}

function otherPlayer(duel) {
    const selfIsChallenger = duel.challenger.uuid === currentUid;
    return selfIsChallenger ? duel.target : duel.challenger;
}

function setChambers(duel) {
    const opened = new Map(duel.shotHistory.map(shot => [shot.shot, shot.result]));
    for (const chamber of elements.cylinder.querySelectorAll(".chamber")) {
        chamber.classList.remove("open", "bang");
        const result = opened.get(Number(chamber.dataset.chamber));
        if (result === "bang") chamber.classList.add("bang");
        else if (result === "click") chamber.classList.add("open");
    }
}

function renderDuel(duel) {
    currentDuel = duel;
    hideNotice();
    elements.invitePanel.hidden = true;
    elements.duelPanel.hidden = false;
    const opponent = otherPlayer(duel);
    elements.opponentName.textContent = opponent.name;
    elements.duelStake.textContent = `${duel.stake} монет Minecraft`;
    elements.shotCount.textContent = `${duel.shots} / 6`;
    elements.rematchButton.hidden = duel.status !== "finished";
    elements.rematchButton.disabled = busy || Boolean(duel.rematchDuelId) || duel.rematchRequested;
    elements.rematchButton.textContent = duel.rematchDuelId
        ? "Реванш створено"
        : duel.rematchRequested ? "Чекаємо суперника…" : "Реванш";

    if (duel.status === "pending") {
        elements.duelPanel.hidden = true;
        elements.invitePanel.hidden = false;
        elements.duelTitle.textContent = `${duel.challenger.name} викликає ${duel.target.name}`;
        elements.stakeText.textContent = `Ставка: ${duel.stake} монет Minecraft`;
        const accepted = duel.accepted.challenger && duel.challenger.uuid === currentUid ||
            duel.accepted.target && duel.target.uuid === currentUid;
        elements.inviteStatus.textContent = accepted
            ? "Ти прийняв дуель. Чекаємо на відповідь суперника."
            : `${duel.target.name} і ${duel.challenger.name}: обидва мають підтвердити дуель.`;
        elements.inviteActions.hidden = accepted;
        return;
    }

    if (duel.status === "awaiting_stakes") {
        elements.duelPanel.hidden = true;
        elements.invitePanel.hidden = false;
        elements.duelTitle.textContent = "Перевірка ставок";
        elements.stakeText.textContent = `Плагін перевіряє ставку ${duel.stake} монет Minecraft в обох гравців.`;
        elements.inviteStatus.textContent = "Дуель почнеться після підтвердження сервера.";
        elements.inviteActions.hidden = true;
        return;
    }

    if (duel.status === "cancelled" || duel.status === "expired") {
        elements.duelPanel.hidden = true;
        elements.invitePanel.hidden = false;
        elements.duelTitle.textContent = duel.status === "expired" ? "Запрошення прострочене" : "Дуель скасовано";
        elements.stakeText.textContent = "";
        elements.inviteStatus.textContent = duel.status === "expired"
            ? "Запрошення діяло 120 секунд. Попроси створити нове."
            : "Ця дуель більше недоступна.";
        elements.inviteActions.hidden = true;
        return;
    }

    setChambers(duel);
    if (duel.status === "active" && !sessionStorage.getItem(`mvdef-rulet-spun-${duelId}`)) {
        elements.cylinder.classList.add("spinning");
        sessionStorage.setItem(`mvdef-rulet-spun-${duelId}`, "true");
        window.setTimeout(() => elements.cylinder.classList.remove("spinning"), 720);
    }
    const myTurn = duel.turn === currentUid;
    elements.fireButton.hidden = duel.status !== "active";
    elements.fireButton.disabled = busy || duel.status !== "active" || !myTurn;
    elements.rematchButton.hidden = duel.status !== "finished";
    if (duel.status === "active") {
        elements.turnStatus.textContent = myTurn ? "Твоя черга — натисни на спуск." : `Черга гравця ${opponent.name}.`;
        const seconds = Math.max(0, Math.ceil((duel.turnExpiresAt - Date.now()) / 1000));
        elements.countdown.textContent = `До автоматичного пострілу: ${seconds} с`;
        elements.shotMessage.textContent = duel.lastResult
            ? `${duel.lastResult.shooter === currentUid ? "Ти" : opponent.name}: ${duel.lastResult.result === "bang" ? "постріл!" : "клацання"}${duel.lastResult.automatic ? " (автоматично)" : ""}`
            : "Барабан уже заряджено. Патрон клієнту невідомий.";
        elements.shotMessage.classList.toggle("danger", duel.lastResult?.result === "bang");
    } else {
        const won = duel.winner === currentUid;
        const other = otherPlayer(duel).name;
        elements.turnStatus.textContent = won ? "Ти переміг!" : "Ти програв.";
        elements.countdown.textContent = "";
        elements.shotMessage.textContent = duel.reason === "left"
            ? `${other} втратив з'єднання.`
            : duel.reason === "timeout"
                ? "Час ходу вичерпався — постріл зроблено автоматично."
                : "Бойовий патрон знайдено.";
        elements.shotMessage.classList.toggle("danger", !won);
        elements.fireButton.hidden = true;
        elements.rematchButton.hidden = false;
    }
}

function renderShop(shop) {
    elements.shopCoins.textContent = shop.coins;
    elements.skinList.replaceChildren();
    for (const skin of shop.skins) {
        const row = document.createElement("div");
        row.className = "skin-item";
        row.innerHTML = `
            <span class="skin-swatch" style="--swatch:${skin.color}" aria-hidden="true"></span>
            <span class="skin-copy"><strong></strong><span></span></span>
            <button class="button button-secondary" type="button"></button>
        `;
        row.querySelector(".skin-copy strong").textContent = skin.name;
        row.querySelector(".skin-copy span").textContent = skin.price === 0 ? "Безкоштовно" : `${skin.price} монет`;
        const button = row.querySelector("button");
        if (skin.id === currentProfile?.active_skin) {
            button.textContent = "Обрано";
            button.disabled = true;
        } else if (skin.owned) {
            button.textContent = "Обрати";
            button.addEventListener("click", () => updateSkin("equip", skin.id));
        } else {
            button.textContent = "Купити";
            button.disabled = shop.coins < skin.price;
            button.addEventListener("click", () => updateSkin("buy", skin.id));
        }
        elements.skinList.append(row);
    }
}

async function updateSkin(action, skinId) {
    setBusy(true);
    try {
        const result = await api(`/api/rulet/shop/${action}`, { method: "POST", body: { skinId } });
        if (action === "buy") {
            currentProfile.coins = result.coins;
            elements.coinsCount.textContent = result.coins;
        } else {
            currentProfile.active_skin = result.activeSkin;
            elements.revolverStage.dataset.skin = result.activeSkin;
        }
        renderShop(result);
    } catch (error) {
        showNotice(error.message, true);
    } finally {
        setBusy(false);
    }
}

function setBusy(value) {
    busy = value;
    if (currentDuel) renderDuel(currentDuel);
}

async function refreshProfile() {
    const result = await api("/api/rulet/state");
    updateProfile(result);
}

async function refreshDuel() {
    if (!duelId) return;
    const duel = await api(`/api/rulet/duel/${encodeURIComponent(duelId)}`);
    if (duel.rematchDuelId) {
        const next = new URL(window.location.href);
        next.searchParams.set("duel", duel.rematchDuelId);
        window.location.replace(next);
        return;
    }
    renderDuel(duel);
}

async function poll() {
    if (polling || !token) return;
    polling = true;
    try {
        if (!currentProfile) await refreshProfile();
        await refreshDuel();
    } catch (error) {
        showNotice(error.code === "unauthenticated"
            ? "Сеанс завершився. Отримай нове посилання командою //empire."
            : error.message, true);
    } finally {
        polling = false;
    }
}

async function respond(accept) {
    if (!duelId) return;
    setBusy(true);
    try {
        await api(`/api/rulet/duel/${encodeURIComponent(duelId)}/accept`, {
            method: "POST",
            body: { accept }
        });
        await refreshDuel();
    } catch (error) {
        showNotice(error.message, true);
    } finally {
        setBusy(false);
    }
}

async function fire() {
    if (!duelId || busy) return;
    setBusy(true);
    try {
        const duel = await api(`/api/rulet/duel/${encodeURIComponent(duelId)}/fire`, { method: "POST" });
        renderDuel(duel);
        const profile = await api("/api/rulet/state");
        updateProfile(profile);
    } catch (error) {
        showNotice(error.message, true);
        await refreshDuel().catch(refreshError => showNotice(refreshError.message, true));
    } finally {
        setBusy(false);
    }
}

async function sendHeartbeat() {
    if (!duelId || currentDuel?.status !== "active" || !token) return;
    try {
        await api(`/api/rulet/duel/${encodeURIComponent(duelId)}/heartbeat`, { method: "POST" });
    } catch (error) {
        showNotice(error.message, true);
    }
}

async function requestRematch() {
    setBusy(true);
    try {
        const result = await api(`/api/rulet/duel/${encodeURIComponent(duelId)}/rematch`, { method: "POST" });
        if (result.duelId) {
            const next = new URL(window.location.href);
            next.searchParams.set("duel", result.duelId);
            window.location.replace(next);
            return;
        }
        elements.rematchButton.textContent = "Чекаємо суперника…";
        elements.rematchButton.disabled = true;
        showNotice(result.message);
    } catch (error) {
        showNotice(error.message, true);
        setBusy(false);
    }
}

elements.acceptInvite.addEventListener("click", () => respond(true));
elements.declineInvite.addEventListener("click", () => respond(false));
elements.fireButton.addEventListener("click", fire);
elements.rematchButton.addEventListener("click", requestRematch);
document.getElementById("openShop").addEventListener("click", async () => {
    try {
        const shop = await api("/api/rulet/shop");
        renderShop(shop);
        elements.shopDialog.showModal();
    } catch (error) {
        showNotice(error.message, true);
    }
});
document.getElementById("closeShop").addEventListener("click", () => elements.shopDialog.close());
elements.shopDialog.addEventListener("click", event => {
    if (event.target === elements.shopDialog) elements.shopDialog.close();
});

if (!token) {
    elements.playerName.textContent = "Не авторизовано";
    elements.gamesCount.textContent = "—";
    elements.deathsCount.textContent = "—";
    elements.coinsCount.textContent = "—";
    document.getElementById("openShop").disabled = true;
    showNotice("Для гри відкрий персональне посилання на дуель із чату Minecraft.", true);
} else if (!duelId) {
    showNotice("Щоб увійти в дуель, відкрий посилання-запрошення з чату Minecraft.");
    poll();
    window.setInterval(poll, 1800);
    window.setInterval(() => {
        refreshProfile().catch(error => showNotice(error.message, true));
    }, 15000);
} else {
    poll();
    window.setInterval(poll, 1800);
    window.setInterval(sendHeartbeat, 3000);
    window.setInterval(() => {
        if (currentDuel?.status === "active") renderDuel(currentDuel);
    }, 1000);
    window.setInterval(() => {
        refreshProfile().catch(error => showNotice(error.message, true));
    }, 15000);
}
