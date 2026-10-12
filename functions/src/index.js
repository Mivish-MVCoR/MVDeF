import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { randomInt, randomUUID } from "node:crypto";
import { consumeLoginToken, isValidLoginToken, LoginTokenError } from "./auth/login-token.js";
import {
    EQUIPMENT,
    FishingError,
    WEATHER_LABELS,
    buyStarterKit,
    createPlayer,
    ensureCurrentWeather,
    publicPlayer,
    publicWorld,
    refreshAttempt,
    runFishingAction
} from "./fishing/game.js";
import { FISH, FISH_CATEGORIES, FISHING_RULES, VENUES } from "./fishing/catalog.js";

initializeApp({
    databaseURL: "https://mvdef-856-default-rtdb.europe-west1.firebasedatabase.app"
});

export const exchangeLoginToken = onCall(
    { region: "europe-west1" },
    async request => {
        const { token } = request.data || {};
        if (!isValidLoginToken(token)) {
            throw new HttpsError("invalid-argument", "Токен входу має неправильний формат.");
        }
        const tokenRef = getDatabase().ref(`mvdef/tokens/${token}`);

        try {
            const identity = await consumeLoginToken({
                token,
                tokenRef,
                nowSeconds: Math.floor(Date.now() / 1000)
            });
            const customToken = await getAuth().createCustomToken(identity.uuid, {
                playerName: identity.playerName
            });
            await tokenRef.remove();

            return { customToken, playerName: identity.playerName };
        } catch (error) {
            if (error instanceof LoginTokenError) {
                throw new HttpsError(error.code, error.message);
            }
            console.error("Не вдалося обміняти Minecraft-токен на Firebase Auth:", error);
            throw new HttpsError("internal", "Не вдалося завершити вхід. Спробуй ще раз.");
        }
    }
);

function randomFloat() {
    return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}

function requirePlayerUid(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Увійди через посилання з Minecraft, щоб користуватися риболовлею.");
    if (uid === "demo-user") throw new HttpsError("permission-denied", "Риболовля недоступна в демо-режимі.");
    return uid;
}

function convertFishingError(error) {
    if (error instanceof FishingError) return new HttpsError(error.code, error.message);
    console.error("Помилка сервісу риболовлі:", error);
    return new HttpsError("internal", "Не вдалося виконати дію риболовлі. Спробуй ще раз.");
}

async function getCurrentWeather(now) {
    const weatherRef = getDatabase().ref("mvdef/fishingWorld/weather");
    const random = randomFloat();
    const result = await weatherRef.transaction(current =>
        ensureCurrentWeather(current, now, () => random),
    undefined, false);
    const weather = result.snapshot.val();
    if (!weather || !WEATHER_LABELS[weather.weather]) {
        throw new HttpsError("internal", "Не вдалося отримати спільний стан погоди.");
    }
    return weather;
}

async function readOrCreatePlayer(uid, now) {
    const playerRef = getDatabase().ref(`mvdef/fishingPlayers/${uid}`);
    const refreshRandom = randomFloat();
    let refreshError;
    const result = await playerRef.transaction(current => {
        refreshError = undefined;
        const player = current || createPlayer(now);
        try {
            refreshAttempt(player, now, () => refreshRandom);
            player.updatedAt = now;
            return player;
        } catch (error) {
            refreshError = error;
            return;
        }
    }, undefined, false);
    if (refreshError) throw convertFishingError(refreshError);
    if (!result.committed) throw new HttpsError("aborted", "Не вдалося завантажити стан рибальського профілю.");
    return result.snapshot.val();
}

function publicCatalog() {
    return {
        venues: Object.values(VENUES).map(({ id, name, unlockLevel }) => ({ id, name, unlockLevel })),
        fish: Object.values(FISH),
        categories: FISH_CATEGORIES,
        equipment: EQUIPMENT,
        rules: {
            inventoryCapacity: FISHING_RULES.inventoryCapacity,
            collectionCapacity: FISHING_RULES.collectionCapacity,
            starterKitCost: FISHING_RULES.startingEquipmentCost.total
        }
    };
}

export const getFishingState = onCall(
    { region: "europe-west1" },
    async request => {
        const uid = requirePlayerUid(request);
        const now = Date.now();
        try {
            const [weather, player] = await Promise.all([
                getCurrentWeather(now),
                readOrCreatePlayer(uid, now)
            ]);
            return {
                player: publicPlayer(player),
                world: publicWorld(weather, now),
                catalog: publicCatalog()
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw convertFishingError(error);
        }
    }
);

export const fishingAction = onCall(
    { region: "europe-west1" },
    async request => {
        const uid = requirePlayerUid(request);
        const action = request.data?.action;
        const payload = request.data?.payload || {};
        const now = Date.now();
        const playerRef = getDatabase().ref(`mvdef/fishingPlayers/${uid}`);
        const randomValues = Array.from({ length: 16 }, randomFloat);
        let randomIndex = 0;
        const random = () => randomValues[Math.min(randomIndex++, randomValues.length - 1)];
        const id = randomUUID();
        const specimenId = randomUUID();

        try {
            const weather = await getCurrentWeather(now);
            let actionResult;
            let actionError;
            const result = await playerRef.transaction(current => {
                randomIndex = 0;
                actionResult = undefined;
                actionError = undefined;
                const player = current || createPlayer(now);
                try {
                    const outcome = runFishingAction(player, action, payload, {
                        now,
                        id,
                        specimenId,
                        weather: weather.weather,
                        time: publicWorld(weather, now).gameTime.period,
                        random
                    });
                    actionResult = outcome.result;
                    return outcome.player;
                } catch (error) {
                    actionError = error;
                    return;
                }
            }, undefined, false);

            if (actionError) throw convertFishingError(actionError);
            if (!result.committed) throw new HttpsError("aborted", "Дію не збережено. Спробуй ще раз.");
            return {
                player: publicPlayer(result.snapshot.val()),
                result: actionResult,
                world: publicWorld(weather, now)
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            throw convertFishingError(error);
        }
    }
);
