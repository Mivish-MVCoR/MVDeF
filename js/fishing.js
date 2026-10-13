import { xpToNextLevel } from "../functions/src/fishing/catalog.js";
import { CLOUDFLARE_API_URL, SITE_SESSION_KEY } from "./cloudflare-config.js";

const elements = Object.fromEntries([
    "fishingAuthRequired", "fishingAuthMessage", "fishingLoading", "fishingLoadError",
    "fishingLoadErrorText", "retryFishingBtn", "fishingLayout", "fishingNotice",
    "fishingError", "fishingProfileChip", "fishingLevel", "fishingWallet", "venueSelect",
    "fishingWeather", "fishingTime", "fishingScene", "fishingSceneCaption", "fishingTacklePath",
    "fishDirectionCue", "fishDirectionText", "counterPullText", "fatigueHint", "fishingHint",
    "joystickKnob", "joystickHelp",
    "starterKitBtn", "castBtn", "fishingActionRow", "fishingWaitingPanel", "fishingStageTitle",
    "fishingStageDescription", "fishingHookPanel", "hookBtn", "hookCountdown", "hookTimer",
    "fishingFightPanel", "fightDistance", "fatigueOutput",
    "fatigueProgress", "reelBtn", "stopFightBtn", "fishingResultPanel", "fishingResultTitle",
    "fishingResultText", "equipmentList", "baitCount", "equipmentShop", "equipmentSelect",
    "buyEquipmentBtn", "baitSelect", "baitQuantity", "buyBaitBtn", "fishingXp",
    "fishingXpNext", "fishingCatchCount", "fishingBestCatch", "catchCount", "sellAllBtn",
    "fishInventory", "collectionCount", "fishCollection"
].map(id => [id, document.getElementById(id)]));

let player = null;
let world = null;
let catalog = null;
let waitTimeout = null;
let fightTicker = null;
let hookTicker = null;
let lastResultTimestamp = null;
let pullDirection = null;
let joystickPointerId = null;
let busy = false;

const numberFormat = new Intl.NumberFormat("uk-UA");
const gameResultText = {
    "no-bite": ["Риба не клюнула", "Цього разу клювання не було. Перевір наживку й спробуй ще раз."],
    "missed-hook": ["Запізно!", "Ти не встиг підсікти рибу у відведений час."],
    "failed-hook": ["Риба зірвалася", "Гачок не втримав рибу. Спробуй ще раз."],
    "rod-broken": ["Вудка зламалася", "Риба виявилася важчою за допустиме навантаження вудки."],
    "broken-equipment": ["Спорядження не витримало", "Риба втекла, а пошкоджене спорядження потребує заміни."],
    "released": ["Рибу відпущено", "Спробу завершено. Наживку витрачено."],
    "caught": ["Улов!", "Рибу додано до інвентарю."]
};

async function apiCall(path, { method = "GET", body } = {}) {
    const token = sessionStorage.getItem(SITE_SESSION_KEY);
    if (!token) {
        const error = new Error("Увійди через Minecraft.");
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

function showError(message) {
    elements.fishingError.textContent = message;
    elements.fishingError.hidden = false;
    elements.fishingNotice.hidden = true;
}

function showNotice(message) {
    elements.fishingNotice.textContent = message;
    elements.fishingNotice.hidden = false;
    elements.fishingError.hidden = true;
}

function clearMessages() {
    elements.fishingNotice.hidden = true;
    elements.fishingError.hidden = true;
}

function readableError(error) {
    if (error?.code === "unauthenticated") {
        return "Сеанс входу завершився. Увійди на сайт через нове посилання з Minecraft.";
    }
    if (error?.code === "permission-denied") {
        return "Риболовля доступна лише після входу через Minecraft, не в демо-режимі.";
    }
    return error?.message?.replace(/^FirebaseError:\s*/, "") || "Не вдалося підключитися до рибальського сервера.";
}

function showLoginRequired(expired = false, isDemo = false) {
    elements.fishingLoading.hidden = true;
    elements.fishingLoadError.hidden = true;
    elements.fishingLayout.hidden = true;
    elements.fishingProfileChip.hidden = true;
    elements.fishingAuthRequired.hidden = false;
    elements.fishingAuthMessage.textContent = expired
        ? "Термін входу завершився. Введи //empire на сервері, відкрий нове посилання, а потім повернись сюди через кабінет."
        : isDemo
            ? "Демо-режим не має доступу до рибальських даних. Увійди через посилання, отримане командою //empire на сервері."
            : "Введи //empire на сервері та відкрий отримане посилання в цьому браузері. Після входу повернись до риболовлі через кабінет.";
    if (expired) {
        sessionStorage.removeItem(SITE_SESSION_KEY);
        sessionStorage.removeItem("uuid");
        sessionStorage.removeItem("playerName");
        sessionStorage.removeItem("mvdefSessionExpiresAt");
    }
}

function formatMass(grams) {
    if (grams >= 1000) return `${(grams / 1000).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} кг`;
    return `${numberFormat.format(grams)} г`;
}

function formatDurability(item) {
    if (!item) return "Не встановлено";
    if (item.durability <= 0) return "Зламалося";
    return `Міцність ${Math.ceil(item.durability)} / 120`;
}

function currentBaitTotal() {
    return Object.values(player.bait || {}).reduce((sum, amount) => sum + amount, 0);
}

function renderVenueSelect() {
    const selectedVenueId = player.selectedVenueId;
    elements.venueSelect.replaceChildren();
    for (const venue of catalog.venues) {
        const option = document.createElement("option");
        option.value = venue.id;
        option.textContent = player.level >= venue.unlockLevel
            ? venue.name
            : `${venue.name} · рівень ${venue.unlockLevel}`;
        option.disabled = player.level < venue.unlockLevel;
        option.selected = venue.id === selectedVenueId;
        elements.venueSelect.append(option);
    }
    elements.venueSelect.disabled = Boolean(player.activeAttempt) || busy;
}

function renderEquipment() {
    const labels = [
        ["rod", "🎣", "Вудка"],
        ["line", "〰", "Волосінь"],
        ["reel", "⚙", "Котушка"],
        ["hook", "♧", "Гачок"]
    ];
    elements.equipmentList.replaceChildren();

    for (const [slot, icon, label] of labels) {
        const item = player.equipment?.[slot];
        const info = item && catalog.equipment[slot][item.id];
        const row = document.createElement("div");
        row.className = "equipment-row";
        const iconElement = document.createElement("span");
        iconElement.className = "equipment-icon";
        iconElement.textContent = icon;
        iconElement.setAttribute("aria-hidden", "true");
        const description = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = label;
        const detail = document.createElement("small");
        detail.textContent = item ? `${info?.name || item.id} · ${formatDurability(item)}` : "Ще не вибрано";
        description.append(title, detail);
        const condition = document.createElement("span");
        condition.className = `equipment-condition${item?.durability <= 24 ? " equipment-condition-low" : ""}`;
        condition.textContent = item?.durability > 0 ? `${Math.ceil(item.durability)} / 120` : "—";
        row.append(iconElement, description, condition);
        elements.equipmentList.append(row);
    }

    elements.baitCount.textContent = `Наживка ${numberFormat.format(currentBaitTotal())}`;
}

function populateShop() {
    elements.equipmentSelect.replaceChildren();
    for (const slot of ["rod", "line", "reel", "hook"]) {
        for (const [id, item] of Object.entries(catalog.equipment[slot])) {
            const option = document.createElement("option");
            option.value = `${slot}:${id}`;
            option.textContent = `${item.name} · ${numberFormat.format(item.price)} монет`;
            elements.equipmentSelect.append(option);
        }
    }

    elements.baitSelect.replaceChildren();
    for (const [id, item] of Object.entries(catalog.equipment.bait)) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = `${item.name} · ${numberFormat.format(item.price)} монет/шт.`;
        elements.baitSelect.append(option);
    }
}

function renderSpecimen(specimen, collection = false) {
    const card = document.createElement("article");
    card.className = "fish-specimen";
    const info = document.createElement("div");
    info.className = "fish-specimen-info";
    const name = document.createElement("strong");
    name.textContent = specimen.name;
    const details = document.createElement("small");
    details.textContent = `${formatMass(specimen.massGrams)} · ${catalog.categories[specimen.category].label} · ${numberFormat.format(specimen.price)} монет`;
    info.append(name, details);

    const actions = document.createElement("div");
    actions.className = "fish-specimen-actions";
    if (collection) {
        actions.append(makeActionButton("Повернути", "restoreFishFromCollection", specimen.id));
    } else {
        actions.append(
            makeActionButton("У колекцію", "moveFishToCollection", specimen.id),
            makeActionButton("Продати", "sellFish", specimen.id)
        );
    }
    card.append(info, actions);
    return card;
}

function makeActionButton(label, action, specimenId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary fishing-item-button";
    button.textContent = label;
    button.disabled = busy || Boolean(player.activeAttempt);
    button.addEventListener("click", () => performAction(action, { specimenId }));
    return button;
}

function renderInventory() {
    elements.catchCount.textContent = `${player.inventory.length} / ${catalog.rules.inventoryCapacity}`;
    elements.collectionCount.textContent = `${player.collection.length} / ${catalog.rules.collectionCapacity}`;
    elements.sellAllBtn.disabled = busy || player.inventory.length === 0 || Boolean(player.activeAttempt);
    elements.fishInventory.replaceChildren();
    elements.fishCollection.replaceChildren();

    if (player.inventory.length === 0) {
        const empty = document.createElement("p");
        empty.className = "fishing-list-empty";
        empty.textContent = "Тут з'являтиметься твій улов.";
        elements.fishInventory.append(empty);
    } else {
        for (const specimen of player.inventory) {
            elements.fishInventory.append(renderSpecimen(specimen));
        }
    }

    if (player.collection.length === 0) {
        const empty = document.createElement("p");
        empty.className = "fishing-list-empty";
        empty.textContent = "Колекція поки порожня.";
        elements.fishCollection.append(empty);
    } else {
        for (const specimen of player.collection) {
            elements.fishCollection.append(renderSpecimen(specimen, true));
        }
    }
}

function renderStats() {
    elements.fishingLevel.textContent = `Рівень ${player.level}`;
    elements.fishingWallet.textContent = `${numberFormat.format(player.wallet)} монет`;
    elements.fishingXp.textContent = `${numberFormat.format(player.xp)} XP`;
    elements.fishingXpNext.textContent = player.level >= 250
        ? "Максимальний рівень"
        : `${numberFormat.format(xpToNextLevel(player.level) - player.xp)} XP`;
    elements.fishingCatchCount.textContent = numberFormat.format(player.catches);
    elements.fishingBestCatch.textContent = player.bestCatch
        ? `${player.bestCatch.name} · ${formatMass(player.bestCatch.massGrams)}`
        : "—";
}

function renderWorld() {
    elements.fishingWeather.textContent = `${world.weatherLabel} · оновлення за ${formatCountdown(world.weatherCycleEndsAt - Date.now())}`;
    elements.fishingTime.textContent = `${world.timeLabel}, ${String(world.gameTime.hour).padStart(2, "0")}:00`;
}

function formatCountdown(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function setPanel(panel) {
    for (const id of ["fishingWaitingPanel", "fishingHookPanel", "fishingFightPanel"]) {
        elements[id].hidden = id !== panel;
    }
}

function isPullingAgainstFish(direction = player?.activeAttempt?.fishDirection) {
    const counterDirection = direction === "toward" ? "away" : "shore";
    return pullDirection === counterDirection;
}

function updateJoystick() {
    const hasFight = player?.activeAttempt?.stage === "fight";
    const resisting = hasFight && isPullingAgainstFish();
    elements.reelBtn.dataset.reeling = String(resisting);
    elements.reelBtn.dataset.direction = pullDirection || "neutral";
    elements.reelBtn.setAttribute("aria-pressed", String(resisting));
    elements.fishingScene.dataset.reeling = String(resisting);
    elements.joystickKnob.style.transform = pullDirection === "shore"
        ? "translate(calc(-50% - 28px), -50%)"
        : pullDirection === "away"
            ? "translate(calc(-50% + 28px), -50%)"
            : "translate(-50%, -50%)";
    elements.reelBtn.setAttribute(
        "aria-label",
        `Джойстик: ${resisting ? "протидієш рибі" : "утримуй у протилежний бік від риби"}`
    );
    if (hasFight) {
        elements.joystickHelp.textContent = resisting
            ? `Тягнеш ${pullDirection === "shore" ? "до" : "від"} берега — протидієш рибі`
            : pullDirection
                ? "Це напрямок риби — змісти джойстик у протилежний бік"
                : "Веди в протилежний бік і утримуй";
    }
}

function renderResult() {
    const result = player.lastResult;
    if (!result) {
        elements.fishingResultPanel.hidden = true;
        return;
    }
    const displayKey = result.completedAt;
    elements.fishingResultPanel.hidden = false;
    const [title, defaultText] = gameResultText[result.outcome] || ["Спробу завершено", "Рибальську спробу завершено."];
    elements.fishingResultTitle.textContent = title;
    let text = defaultText;
    if (result.reward) {
        const { specimen } = result.reward;
        text = `${specimen.name} · ${formatMass(specimen.massGrams)} · ${numberFormat.format(specimen.price)} монет · +${numberFormat.format(result.reward.xp)} XP` +
            (result.reward.firstCatch ? " · перший улов цього виду (+50 XP)" : "");
    }
    if (result.outcome === "no-bite" && result.baitConsumed === false) {
        text += " Наживка залишилася.";
    }
    elements.fishingResultText.textContent = text;
    if (displayKey !== lastResultTimestamp) {
        showNotice(title);
        lastResultTimestamp = displayKey;
    }
}

function renderGameStage() {
    const attempt = player.activeAttempt;
    const canCast = !busy && !attempt && Object.values(player.equipment || {}).length === 4 &&
        Object.values(player.equipment).every(item => item.durability > 0) &&
        currentBaitTotal() > 0 && player.inventory.length < catalog.rules.inventoryCapacity;
    elements.starterKitBtn.hidden = Object.keys(player.equipment || {}).length > 0;
    elements.castBtn.hidden = false;
    elements.hookBtn.hidden = false;
    elements.starterKitBtn.disabled = busy || player.wallet < catalog.rules.starterKitCost;
    elements.castBtn.disabled = !canCast;
    elements.hookBtn.disabled = busy || attempt?.stage !== "hook";
    elements.hookBtn.textContent = attempt?.stage === "hook" ? "ПІДСІКАТИ ЗАРАЗ!" : "Підсікти";
    elements.venueSelect.disabled = busy || Boolean(attempt);
    elements.equipmentShop.hidden = Boolean(attempt);
    elements.baitSelect.disabled = busy || Boolean(attempt);
    elements.baitQuantity.disabled = busy || Boolean(attempt);
    elements.buyBaitBtn.disabled = busy || Boolean(attempt);
    elements.buyEquipmentBtn.disabled = busy || Boolean(attempt);
    elements.reelBtn.disabled = busy || attempt?.stage !== "fight";
    elements.stopFightBtn.disabled = busy || attempt?.stage !== "fight";
    elements.fishingScene.dataset.stage = attempt?.stage || "idle";

    if (!Object.keys(player.equipment || {}).length) {
        elements.fishingHint.textContent = "Купи початковий комплект, щоб зробити перший закид.";
        elements.fishingSceneCaption.textContent = "Спершу підготуй спорядження";
    } else if (player.inventory.length >= catalog.rules.inventoryCapacity) {
        elements.fishingHint.textContent = "Інвентар заповнений. Продай улов або перемісти рибу до колекції.";
        elements.fishingSceneCaption.textContent = "Звільни місце для нового улову";
    } else if (!currentBaitTotal()) {
        elements.fishingHint.textContent = "Наживка закінчилася. Поповни запас на ринку.";
        elements.fishingSceneCaption.textContent = "Потрібна наживка";
    } else if (Object.values(player.equipment || {}).some(item => item.durability <= 0)) {
        elements.fishingHint.textContent = "Зламана деталь спорядження. Купи заміну перед наступною спробою.";
        elements.fishingSceneCaption.textContent = "Спорядження потребує заміни";
    } else {
        elements.fishingHint.textContent = "Усе готово — закидай вудку та будь уважним.";
        elements.fishingSceneCaption.textContent = "Тиха вода чекає на твій закид";
    }
    if (attempt?.stage === "hook") {
        elements.fishingHint.textContent = "Клювання! Натисни підсвічену кнопку «Підсікти» зараз.";
    }

    if (!attempt) {
        clearWaitingTimers();
        if (hookTicker) clearInterval(hookTicker);
        if (fightTicker) clearInterval(fightTicker);
        hookTicker = null;
        fightTicker = null;
        elements.reelBtn.dataset.reeling = "false";
        elements.reelBtn.setAttribute("aria-pressed", "false");
        pullDirection = null;
        elements.reelBtn.dataset.direction = "neutral";
        elements.joystickKnob.style.transform = "translate(-50%, -50%)";
        elements.joystickHelp.textContent = "Веди в протилежний бік і утримуй";
        elements.fishingScene.dataset.reeling = "false";
        elements.fishingScene.dataset.fishDirection = "";
        setPanel(null);
        return;
    }
    elements.fishingResultPanel.hidden = true;

    if (attempt.stage === "waiting") {
        if (hookTicker) clearInterval(hookTicker);
        if (fightTicker) clearInterval(fightTicker);
        hookTicker = null;
        fightTicker = null;
        setPanel("fishingWaitingPanel");
        elements.fishingStageTitle.textContent = "Стеж за поплавком";
        elements.fishingStageDescription.textContent = "Щойно поплавок піде під воду — одразу підсікай.";
        elements.fishingSceneCaption.textContent = "Поплавок погойдується на воді";
        elements.fishingScene.setAttribute("aria-label", "Поплавок на воді. Стеж за ним і підсікай, щойно він піде під воду.");
        scheduleWaitingRefresh(attempt);
    } else if (attempt.stage === "hook") {
        clearWaitingTimers();
        if (fightTicker) clearInterval(fightTicker);
        fightTicker = null;
        setPanel("fishingHookPanel");
        elements.fishingSceneCaption.textContent = "Клювання! Час підсікти";
        elements.fishingScene.setAttribute("aria-label", "Клювання! Поплавок пішов під воду. Час підсікти.");
        renderHookTimer(attempt);
    } else if (attempt.stage === "fight") {
        clearWaitingTimers();
        if (hookTicker) clearInterval(hookTicker);
        hookTicker = null;
        setPanel("fishingFightPanel");
        elements.fishingSceneCaption.textContent = "Риба чинить опір — контролюй волосінь";
        const direction = attempt.fishDirection === "toward" ? "toward" : "away";
        const pullingTowardShore = direction === "away";
        elements.fishingScene.dataset.fishDirection = direction;
        elements.fishingScene.dataset.reeling = elements.reelBtn.dataset.reeling === "true" ? "true" : "false";
        elements.fishingScene.setAttribute(
            "aria-label",
            `Риба тягне ${pullingTowardShore ? "від берега" : "до берега"}. Протидій її руху.`
        );
        elements.fishDirectionCue.dataset.direction = direction;
        elements.fishDirectionText.textContent = `Риба тягне ${pullingTowardShore ? "від берега" : "до берега"}`;
        elements.counterPullText.textContent = `Твоя дія: тягни ${pullingTowardShore ? "до" : "від"} берега`;
        elements.joystickHelp.textContent = elements.reelBtn.dataset.reeling === "true"
            ? `Тягнеш ${pullingTowardShore ? "до" : "від"} берега — протидієш рибі`
            : "Веди джойстик у протилежний бік і утримуй";
        elements.fightDistance.textContent = `${Math.max(0, attempt.distanceM).toFixed(1).replace(".", ",")} м`;
        const fatigue = Math.max(0, Math.min(100, attempt.fatigue));
        elements.fatigueOutput.textContent = `${Math.round(fatigue)}%`;
        elements.fatigueProgress.value = fatigue;
        elements.fatigueProgress.dataset.level = fatigue >= 70 ? "tired" : fatigue >= 35 ? "weakening" : "fresh";
        elements.fatigueHint.textContent = fatigue >= 70
            ? "Риба втомилася — час підтягувати до берега"
            : fatigue >= 35
                ? "Риба слабшає — продовжуй тримати натяг"
                : "Риба ще має багато сил";
        elements.fishingTacklePath.setAttribute(
            "d",
            direction === "away"
                ? "M 12 -80 Q 160 -20 325 7 Q 385 72 465 148"
                : "M 12 -80 Q 160 -20 325 7 Q 365 65 432 132"
        );
        updateJoystick();
        scheduleFightTick();
    }
}

function clearWaitingTimers() {
    if (waitTimeout) clearTimeout(waitTimeout);
    waitTimeout = null;
}

function scheduleWaitingRefresh(attempt) {
    clearWaitingTimers();
    const refresh = async () => {
        const response = await performAction("refresh", {}, { quiet: true });
        if (!response && player?.activeAttempt?.stage === "waiting") {
            waitTimeout = setTimeout(refresh, 2000);
        }
    };
    waitTimeout = setTimeout(refresh, Math.max(0, attempt.biteAt - Date.now()));
}

function renderHookTimer(attempt) {
    if (hookTicker) clearInterval(hookTicker);
    const hookWindowMs = Math.max(1, attempt.hookDeadline - attempt.biteAt);
    const paint = () => {
        const remaining = Math.max(0, attempt.hookDeadline - Date.now());
        elements.hookTimer.style.transform = `scaleX(${Math.min(1, remaining / hookWindowMs)})`;
        elements.hookCountdown.value = `${(remaining / 1000).toFixed(1).replace(".", ",")} с`;
        elements.hookCountdown.textContent = elements.hookCountdown.value;
        if (remaining <= 0) {
            clearInterval(hookTicker);
            hookTicker = null;
            performAction("refresh", {}, { quiet: true }).catch(() => {});
        }
    };
    paint();
    hookTicker = setInterval(paint, 50);
}

function scheduleFightTick() {
    if (fightTicker) clearInterval(fightTicker);
    fightTicker = setInterval(() => {
        if (!player?.activeAttempt || player.activeAttempt.stage !== "fight" || busy) return;
        performAction("fight", {
            tension: 45,
            reeling: isPullingAgainstFish()
        }, { quiet: true }).catch(() => {});
    }, 1000);
}

function updatePage() {
    if (!player || !catalog || !world) return;
    clearMessages();
    renderStats();
    renderWorld();
    renderVenueSelect();
    renderEquipment();
    renderInventory();
    renderGameStage();
    renderResult();
}

async function loadState() {
    elements.fishingAuthRequired.hidden = true;
    elements.fishingLoadError.hidden = true;
    elements.fishingLayout.hidden = true;
    elements.fishingProfileChip.hidden = true;
    elements.fishingLoading.hidden = false;
    try {
        const result = await apiCall("/api/fishing/state");
        ({ player, world, catalog } = result);
        populateShop();
        updatePage();
        elements.fishingLoading.hidden = true;
        elements.fishingLayout.hidden = false;
        elements.fishingProfileChip.hidden = false;
    } catch (error) {
        console.error("Не вдалося завантажити рибальський табір:", error);
        if (error?.code === "unauthenticated") {
            showLoginRequired(true);
        } else {
            elements.fishingLoading.hidden = true;
            elements.fishingLoadErrorText.textContent = readableError(error);
            elements.fishingLoadError.hidden = false;
        }
    }
}

async function performAction(action, payload = {}, { quiet = false } = {}) {
    if (busy || !player) return;
    busy = true;
    renderGameStage();
    if (!quiet) clearMessages();
    try {
        const response = await apiCall("/api/fishing/action", {
            method: "POST",
            body: { action, payload }
        });
        player = response.player;
        world = response.world || world;
        updatePage();
        return response;
    } catch (error) {
        console.error(`Не вдалося виконати дію риболовлі «${action}»:`, error);
        if (error?.code === "unauthenticated") {
            showLoginRequired(true);
        } else {
            showError(readableError(error));
        }
        return null;
    } finally {
        busy = false;
        renderGameStage();
    }
}

elements.venueSelect.addEventListener("change", () => {
    performAction("selectVenue", { venueId: elements.venueSelect.value });
});

elements.starterKitBtn.addEventListener("click", () => performAction("buyStarterKit"));
elements.castBtn.addEventListener("click", async () => {
    lastResultTimestamp = null;
    const response = await performAction("cast");
    if (response) {
        elements.fishingResultPanel.hidden = true;
        showNotice("Вудку закинуто.");
    }
});
elements.hookBtn.addEventListener("click", () => performAction("hook"));
elements.stopFightBtn.addEventListener("click", () => performAction("stopFight"));
function setJoystickDirection(clientX) {
    const bounds = elements.reelBtn.getBoundingClientRect();
    const offset = clientX - (bounds.left + bounds.width / 2);
    pullDirection = offset < -8 ? "shore" : offset > 8 ? "away" : null;
    updateJoystick();
}

elements.reelBtn.addEventListener("pointerdown", event => {
    if (elements.reelBtn.disabled) return;
    event.preventDefault();
    joystickPointerId = event.pointerId;
    elements.reelBtn.setPointerCapture(event.pointerId);
    setJoystickDirection(event.clientX);
});
elements.reelBtn.addEventListener("pointermove", event => {
    if (event.pointerId === joystickPointerId) setJoystickDirection(event.clientX);
});
function releaseJoystick(event) {
    if (event.pointerId !== joystickPointerId) return;
    joystickPointerId = null;
    pullDirection = null;
    updateJoystick();
}
elements.reelBtn.addEventListener("pointerup", releaseJoystick);
elements.reelBtn.addEventListener("pointercancel", releaseJoystick);
elements.reelBtn.addEventListener("lostpointercapture", releaseJoystick);
elements.reelBtn.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        pullDirection = "shore";
        updateJoystick();
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        pullDirection = "away";
        updateJoystick();
    }
});
elements.reelBtn.addEventListener("keyup", event => {
    if (["ArrowLeft", "ArrowRight", "a", "d"].includes(event.key.toLowerCase())) {
        pullDirection = null;
        updateJoystick();
    }
});
elements.reelBtn.addEventListener("blur", () => {
    if (joystickPointerId === null) {
        pullDirection = null;
        updateJoystick();
    }
});
elements.buyEquipmentBtn.addEventListener("click", () => {
    const [slot, itemId] = elements.equipmentSelect.value.split(":");
    performAction("buyEquipment", { slot, itemId, quantity: 1 });
});
elements.buyBaitBtn.addEventListener("click", () => {
    performAction("buyEquipment", {
        slot: "bait",
        itemId: elements.baitSelect.value,
        quantity: Number(elements.baitQuantity.value)
    });
});
elements.sellAllBtn.addEventListener("click", () => {
    if (window.confirm("Продати весь улов з інвентаря?")) performAction("sellAllFish");
});
elements.retryFishingBtn.addEventListener("click", loadState);

setInterval(() => {
    if (world) renderWorld();
}, 1000);

const isDemo = sessionStorage.getItem("isDemo") === "true";
if (isDemo ||
    !sessionStorage.getItem(SITE_SESSION_KEY) ||
    !sessionStorage.getItem("uuid") ||
    sessionStorage.getItem("uuid") === "demo-user") {
    showLoginRequired(false, isDemo);
} else {
    loadState();
}
