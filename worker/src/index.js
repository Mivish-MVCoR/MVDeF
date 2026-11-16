import { createPlayer, createWorldWeather, EQUIPMENT, publicPlayer, publicWorld, refreshAttempt, runFishingAction } from "../../functions/src/fishing/game.js";
import { FISH, FISH_CATEGORIES, FISHING_RULES, VENUES } from "../../functions/src/fishing/catalog.js";
import {
    applyRuletStakes,
    buyRuletSkin,
    cancelRuletDuel,
    createRuletDuel,
    equipRuletSkin,
    fireRuletDuel,
    getRuletDuel,
    getRuletProfile,
    getRuletShop,
    heartbeatRuletDuel,
    listRuletEvents,
    requireRuletPlugin,
    requestRuletRematch,
    respondRuletDuel
} from "./rulet.js";

const LOGIN_TOKEN_PATTERN = /^[A-Za-z0-9]{32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FISHING_TABLE = "fishing_players";
const encoder = new TextEncoder();
const SESSION_ISSUER = "mvdef-cloudflare";
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const GUEST_PASSWORD_ITERATIONS = 100_000;
const DUMMY_GUEST_PASSWORD_SALT = new Uint8Array(16);

function apiError(status, code, message) {
    return Response.json({ error: { code, message } }, { status });
}

function base64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeJson(value) {
    return base64Url(encoder.encode(JSON.stringify(value)));
}

async function signSession(claims, secret) {
    const header = encodeJson({ alg: "HS256", typ: "JWT" });
    const payload = encodeJson(claims);
    const signingInput = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
    return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function equalSecret(candidate, expected) {
    if (typeof candidate !== "string" || typeof expected !== "string") return false;
    const candidateBytes = encoder.encode(candidate);
    const expectedBytes = encoder.encode(expected);
    let difference = candidateBytes.length ^ expectedBytes.length;
    const length = Math.max(candidateBytes.length, expectedBytes.length);
    for (let index = 0; index < length; index++) {
        difference |= (candidateBytes[index] || 0) ^ (expectedBytes[index] || 0);
    }
    return difference === 0;
}

function authDataKey(env) {
    if (typeof env.AUTH_DATA_KEY !== "string") {
        throw new Error("Missing AUTH_DATA_KEY Worker secret.");
    }
    const key = decodeBase64Url(env.AUTH_DATA_KEY);
    if (key.length !== 32) throw new Error("AUTH_DATA_KEY must encode exactly 32 random bytes.");
    return key;
}

async function deriveAuthKey(env, purpose, algorithm, usages) {
    const rootKey = await crypto.subtle.importKey("raw", authDataKey(env), "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({
        name: "HKDF",
        hash: "SHA-256",
        salt: encoder.encode("mvdef-auth-v1"),
        info: encoder.encode(purpose)
    }, rootKey, algorithm, false, usages);
}

async function keyedDigest(value, env, purpose) {
    const key = await deriveAuthKey(env, purpose, { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
    return base64Url(new Uint8Array(digest));
}

async function encryptAuthData(value, env) {
    const key = await deriveAuthKey(env, "minecraft-login-identity", { name: "AES-GCM", length: 256 }, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(JSON.stringify(value))
    );
    return `${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

async function decryptAuthData(value, env) {
    const [encodedIv, encodedCiphertext, ...extra] = value.split(".");
    if (!encodedIv || !encodedCiphertext || extra.length) throw new Error("Invalid encrypted login identity.");
    const key = await deriveAuthKey(env, "minecraft-login-identity", { name: "AES-GCM", length: 256 }, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: decodeBase64Url(encodedIv) },
        key,
        decodeBase64Url(encodedCiphertext)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
}

async function issueMinecraftToken(body, request, env, nowSeconds) {
    const authorization = request.headers.get("authorization") || "";
    const suppliedSecret = authorization.match(/^Bearer (.+)$/i)?.[1];
    if (!env.LOGIN_ISSUER_SECRET || env.LOGIN_ISSUER_SECRET.length < 32 ||
        !equalSecret(suppliedSecret, env.LOGIN_ISSUER_SECRET)) {
        throw Object.assign(new Error("Не вдалося зареєструвати посилання для входу."), { code: "unauthenticated", status: 401 });
    }
    const { token, uuid, playerName, expiresAt } = body || {};
    if (typeof token !== "string" || !LOGIN_TOKEN_PATTERN.test(token) ||
        typeof uuid !== "string" || !UUID_PATTERN.test(uuid) ||
        typeof playerName !== "string" || playerName.trim().length === 0 || playerName.length > 32 ||
        !Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + 3600) {
        throw Object.assign(new Error("Дані посилання для входу мають неправильний формат."), { code: "invalid-argument", status: 400 });
    }
    const tokenDigest = await keyedDigest(token, env, "minecraft-login-token");
    const encryptedIdentity = await encryptAuthData({ uuid, playerName }, env);
    const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO login_tokens (token, identity_encrypted, expires_at) VALUES (?, ?, ?)"
    ).bind(tokenDigest, encryptedIdentity, expiresAt).run();
    if (result.meta?.changes !== 1) {
        throw Object.assign(new Error("Не вдалося створити унікальне посилання. Спробуй ще раз."), { code: "already-exists", status: 409 });
    }
    return { accepted: true };
}

async function exchangeMinecraftToken(token, db, env, nowSeconds) {
    if (typeof token !== "string" || !LOGIN_TOKEN_PATTERN.test(token)) {
        throw Object.assign(new Error("Токен входу має неправильний формат."), { code: "invalid-argument", status: 400 });
    }
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("Missing or weak SESSION_SECRET Worker secret.");
    const tokenDigest = await keyedDigest(token, env, "minecraft-login-token");
    const record = await db.prepare(
        "UPDATE login_tokens SET consumed_at = ? WHERE token = ? AND consumed_at IS NULL AND expires_at >= ? RETURNING identity_encrypted"
    ).bind(nowSeconds, tokenDigest, nowSeconds).first();
    if (!record) {
        throw Object.assign(new Error("Посилання для входу недійсне або прострочене. Створи нове посилання командою //empire."), {
            code: "unauthenticated",
            status: 401
        });
    }
    const identity = await decryptAuthData(record.identity_encrypted, env);
    const sessionToken = await signSession({
        iss: SESSION_ISSUER,
        sub: identity.uuid,
        playerName: identity.playerName,
        jti: crypto.randomUUID(),
        iat: nowSeconds,
        exp: nowSeconds + SESSION_LIFETIME_SECONDS
    }, env.SESSION_SECRET);
    return {
        sessionToken,
        uuid: identity.uuid,
        playerName: identity.playerName,
        expiresAt: (nowSeconds + SESSION_LIFETIME_SECONDS) * 1000
    };
}

function validateGuestCredentials(body) {
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        password.length < 6 || encoder.encode(password).length > 256) {
        throw Object.assign(new Error("Перевір пошту та пароль."), { code: "invalid-argument", status: 400 });
    }
    return { email, password };
}

async function hashGuestPassword(password, salt) {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const hash = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: GUEST_PASSWORD_ITERATIONS
    }, key, 256);
    return new Uint8Array(hash);
}

function equalBytes(left, right) {
    let difference = left.length ^ right.length;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) {
        difference |= (left[index] || 0) ^ (right[index] || 0);
    }
    return difference === 0;
}

async function createGuestSession(record, secret, nowSeconds) {
    if (!secret || secret.length < 32) throw new Error("Missing or weak SESSION_SECRET Worker secret.");
    const expiresAt = nowSeconds + SESSION_LIFETIME_SECONDS;
    const sessionToken = await signSession({
        iss: SESSION_ISSUER,
        sub: record.uuid,
        playerName: "Гість",
        guest: true,
        jti: crypto.randomUUID(),
        iat: nowSeconds,
        exp: expiresAt
    }, secret);
    return {
        sessionToken,
        uuid: record.uuid,
        playerName: "Гість",
        expiresAt: expiresAt * 1000
    };
}

async function registerGuest(body, env, nowSeconds) {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("Missing or weak SESSION_SECRET Worker secret.");
    const { email, password } = validateGuestCredentials(body);
    const emailLookup = await keyedDigest(email, env, "guest-email");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = await hashGuestPassword(password, salt);
    const record = {
        uuid: crypto.randomUUID(),
        email_lookup: emailLookup,
        password_salt: base64Url(salt),
        password_hash: base64Url(passwordHash)
    };
    const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO guest_accounts (uuid, email_lookup, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(record.uuid, record.email_lookup, record.password_salt, record.password_hash, nowSeconds).run();
    if (result.meta?.changes !== 1) {
        throw Object.assign(new Error("Акаунт з такою поштою вже існує."), { code: "already-exists", status: 409 });
    }
    return createGuestSession(record, env.SESSION_SECRET, nowSeconds);
}

async function loginGuest(body, db, env, nowSeconds) {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("Missing or weak SESSION_SECRET Worker secret.");
    const { email, password } = validateGuestCredentials(body);
    const emailLookup = await keyedDigest(email, env, "guest-email");
    const record = await db.prepare(
        "SELECT uuid, password_salt, password_hash FROM guest_accounts WHERE email_lookup = ?"
    ).bind(emailLookup).first();
    const legacyRecord = record ? null : await db.prepare(
        "SELECT uuid, player_name, password_salt, password_hash, created_at FROM guest_accounts_legacy WHERE email = ?"
    ).bind(email).first();
    const account = record || legacyRecord;
    if (!account) {
        await hashGuestPassword(password, DUMMY_GUEST_PASSWORD_SALT);
        throw Object.assign(new Error("Невірна електронна пошта або пароль."), { code: "unauthenticated", status: 401 });
    }
    const expectedHash = decodeBase64Url(account.password_hash);
    const suppliedHash = await hashGuestPassword(password, decodeBase64Url(account.password_salt));
    if (!equalBytes(suppliedHash, expectedHash)) {
        throw Object.assign(new Error("Невірна електронна пошта або пароль."), { code: "unauthenticated", status: 401 });
    }
    if (legacyRecord) {
        const migrated = await db.prepare(
            "INSERT OR IGNORE INTO guest_accounts (uuid, email_lookup, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(
            legacyRecord.uuid,
            emailLookup,
            legacyRecord.password_salt,
            legacyRecord.password_hash,
            legacyRecord.created_at
        ).run();
        if (migrated.meta?.changes === 1) {
            await db.prepare("DELETE FROM guest_accounts_legacy WHERE uuid = ?").bind(legacyRecord.uuid).run();
        }
    }
    return createGuestSession({ uuid: account.uuid }, env.SESSION_SECRET, nowSeconds);
}

async function createDemoSession(secret, nowSeconds) {
    if (!secret || secret.length < 32) throw new Error("Missing or weak SESSION_SECRET Worker secret.");
    const expiresAt = nowSeconds + SESSION_LIFETIME_SECONDS;
    const sessionToken = await signSession({
        iss: SESSION_ISSUER,
        sub: "demo-user",
        playerName: "Demo",
        demo: true,
        jti: crypto.randomUUID(),
        iat: nowSeconds,
        exp: expiresAt
    }, secret);
    return { sessionToken, uuid: "demo-user", playerName: "Demo", expiresAt: expiresAt * 1000 };
}

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifySessionClaims(idToken, env) {
    const parts = typeof idToken === "string" ? idToken.split(".") : [];
    if (parts.length !== 3) return null;
    let header;
    let claims;
    try {
        header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
        claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    } catch {
        return null;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (header.alg !== "HS256" ||
        claims.iss !== SESSION_ISSUER ||
        !Number.isInteger(claims.exp) || claims.exp <= nowSeconds ||
        claims.exp > nowSeconds + SESSION_LIFETIME_SECONDS ||
        !Number.isInteger(claims.iat) || claims.iat > nowSeconds + 60 ||
        claims.exp <= claims.iat ||
        typeof claims.playerName !== "string" || claims.playerName.trim().length === 0) {
        return null;
    }
    const isDemoSession = claims.sub === "demo-user" && claims.playerName === "Demo" && claims.demo === true;
    const isGuestSession = UUID_PATTERN.test(claims.sub) && claims.guest === true && claims.demo !== true;
    const isPlayerSession = UUID_PATTERN.test(claims.sub) && claims.guest !== true && claims.demo !== true;
    if (!isDemoSession && !isGuestSession && !isPlayerSession) return null;
    if (!env.SESSION_SECRET) throw new Error("Missing SESSION_SECRET Worker secret.");
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.SESSION_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );
    const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        decodeBase64Url(parts[2]),
        encoder.encode(`${parts[0]}.${parts[1]}`)
    );
    return valid ? claims : null;
}

async function verifySessionToken(idToken, env) {
    const claims = await verifySessionClaims(idToken, env);
    return claims?.sub || null;
}

function randomFloat() {
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    return bytes[0] / 0x1_0000_0000;
}

function getWorld(now) {
    return createWorldWeather(now);
}

async function readOrCreatePlayer(db, uid, now) {
    const current = await db.prepare(`SELECT player_json, revision FROM ${FISHING_TABLE} WHERE uid = ?`).bind(uid).first();
    if (current) return current;
    const player = createPlayer(now);
    await db.prepare(`INSERT OR IGNORE INTO ${FISHING_TABLE} (uid, player_json, revision) VALUES (?, ?, 0)`)
        .bind(uid, JSON.stringify(player)).run();
    const created = await db.prepare(`SELECT player_json, revision FROM ${FISHING_TABLE} WHERE uid = ?`).bind(uid).first();
    if (!created) throw new Error("Could not initialize fishing player state.");
    return created;
}

function randomStream() {
    const values = Array.from({ length: 128 }, randomFloat);
    let index = 0;
    return {
        reset() { index = 0; },
        next() { return values[Math.min(index++, values.length - 1)]; }
    };
}

async function commitAction(db, uid, action, payload, now, world) {
    const stream = randomStream();
    const attemptId = crypto.randomUUID();
    const specimenId = crypto.randomUUID();
    for (let retries = 0; retries < 6; retries++) {
        const row = await readOrCreatePlayer(db, uid, now);
        const player = JSON.parse(row.player_json);
        stream.reset();
        let result;
        try {
            result = runFishingAction(player, action, payload, {
                now,
                id: attemptId,
                specimenId,
                weather: world.weather,
                time: publicWorld(now).gameTime.period,
                random: stream.next
            });
        } catch (error) {
            throw error;
        }
        const update = await db.prepare(
            `UPDATE ${FISHING_TABLE} SET player_json = ?, revision = revision + 1 WHERE uid = ? AND revision = ?`
        ).bind(JSON.stringify(result.player), uid, row.revision).run();
        if (update.meta?.changes === 1) return result;
    }
    throw Object.assign(new Error("Зараз багато запитів. Спробуй ще раз."), { code: "aborted", status: 409 });
}

async function refreshPlayerState(db, uid, now) {
    const stream = randomStream();
    for (let retries = 0; retries < 6; retries++) {
        const row = await readOrCreatePlayer(db, uid, now);
        const player = JSON.parse(row.player_json);
        stream.reset();
        refreshAttempt(player, now, stream.next);
        player.updatedAt = now;
        const update = await db.prepare(
            `UPDATE ${FISHING_TABLE} SET player_json = ?, revision = revision + 1 WHERE uid = ? AND revision = ?`
        ).bind(JSON.stringify(player), uid, row.revision).run();
        if (update.meta?.changes === 1) return player;
    }
    throw Object.assign(new Error("Зараз багато запитів. Онови сторінку."), { code: "aborted", status: 409 });
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

async function authenticate(request, env) {
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) return null;
    return verifySessionToken(match[1], env);
}

async function authenticateClaims(request, env) {
    const parts = (request.headers.get("authorization") || "").trim().split(/\s+/);
    if (parts[0]?.toLowerCase() !== "bearer" || !parts[1]) return null;
    return verifySessionClaims(parts[1], env);
}

function corsHeaders(request, env, allowNoOrigin = false) {
    const origin = request.headers.get("origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
    if (!origin) return allowNoOrigin ? {} : null;
    if (!allowed.includes(origin)) return null;
    return {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "86400",
        "vary": "Origin"
    };
}

async function handleRequest(request, env) {
    const url = new URL(request.url);
    const isTokenIssue = url.pathname === "/api/login/issue";
    const isRuletPluginRoute = url.pathname === "/api/rulet/duel" ||
        url.pathname === "/api/rulet/events" ||
        /^\/api\/rulet\/duel\/[^/]+\/(?:stakes|cancel)$/.test(url.pathname);
    const originHeaders = corsHeaders(request, env, isTokenIssue || isRuletPluginRoute);
    if (!originHeaders) return apiError(403, "permission-denied", "Цей сайт не має доступу до API.");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: originHeaders });

    try {
        let responseData;
        if (isTokenIssue && request.method === "POST") {
            responseData = await issueMinecraftToken(
                await request.json(),
                request,
                env,
                Math.floor(Date.now() / 1000)
            );
        } else if (url.pathname === "/api/login/demo" && request.method === "POST") {
            if (env.DEMO_FISHING_ENABLED !== "true") {
                throw Object.assign(new Error("Демо-доступ до риболовлі вимкнено."), {
                    code: "permission-denied",
                    status: 403
                });
            }
            responseData = await createDemoSession(env.SESSION_SECRET, Math.floor(Date.now() / 1000));
        } else if (url.pathname === "/api/login/guest/register" && request.method === "POST") {
            responseData = await registerGuest(await request.json(), env, Math.floor(Date.now() / 1000));
        } else if (url.pathname === "/api/login/guest/exchange" && request.method === "POST") {
            responseData = await loginGuest(await request.json(), env.DB, env, Math.floor(Date.now() / 1000));
        } else if (url.pathname === "/api/login/exchange" && request.method === "POST") {
            const body = await request.json();
            responseData = await exchangeMinecraftToken(body?.token, env.DB, env, Math.floor(Date.now() / 1000));
        } else if (isRuletPluginRoute) {
            requireRuletPlugin(request, env);
            const now = Math.floor(Date.now() / 1000);
            if (url.pathname === "/api/rulet/duel" && request.method === "POST") {
                responseData = await createRuletDuel(env.DB, await request.json(), now);
            } else if (url.pathname === "/api/rulet/events" && request.method === "GET") {
                responseData = await listRuletEvents(env.DB, url.searchParams.get("after"), now);
            } else {
                const match = url.pathname.match(/^\/api\/rulet\/duel\/([^/]+)\/(stakes|cancel)$/);
                if (!match) return apiError(404, "not-found", "Маршрут API не знайдено.");
                if (match[2] === "stakes" && request.method === "POST") {
                    responseData = await applyRuletStakes(env.DB, match[1], await request.json(), now);
                } else if (match[2] === "cancel" && request.method === "POST") {
                    responseData = await cancelRuletDuel(env.DB, match[1]);
                } else {
                    return apiError(404, "not-found", "Маршрут API не знайдено.");
                }
            }
        } else if (url.pathname.startsWith("/api/rulet/")) {
            const claims = await authenticateClaims(request, env);
            if (!claims) {
                return Response.json({ error: { code: "unauthenticated", message: "Увійди через посилання з Minecraft." } }, {
                    status: 401,
                    headers: originHeaders
                });
            }
            const uid = claims.sub;
            if (!UUID_PATTERN.test(uid) || claims.guest === true) {
                throw Object.assign(new Error("Гостьовий і демо-сеанс не можуть грати в рулетку."), {
                    code: "permission-denied",
                    status: 403
                });
            }
            const now = Math.floor(Date.now() / 1000);
            const duelRoute = url.pathname.match(/^\/api\/rulet\/duel\/([^/]+)(?:\/(accept|fire|heartbeat|rematch))?$/);
            if (url.pathname === "/api/rulet/state" && request.method === "GET") {
                const profile = await getRuletProfile(env.DB, uid, claims.playerName);
                responseData = { ...profile, shop: await getRuletShop(env.DB, uid) };
            } else if (url.pathname === "/api/rulet/shop" && request.method === "GET") {
                responseData = await getRuletShop(env.DB, uid);
            } else if (url.pathname === "/api/rulet/shop/buy" && request.method === "POST") {
                const body = await request.json();
                responseData = await buyRuletSkin(env.DB, uid, claims.playerName, body?.skinId, now);
            } else if (url.pathname === "/api/rulet/shop/equip" && request.method === "POST") {
                const body = await request.json();
                responseData = await equipRuletSkin(env.DB, uid, body?.skinId);
            } else if (duelRoute && request.method === "GET" && !duelRoute[2]) {
                responseData = await getRuletDuel(env.DB, duelRoute[1], uid, now);
            } else if (duelRoute && request.method === "POST" && duelRoute[2] === "accept") {
                const body = await request.json();
                responseData = await respondRuletDuel(env.DB, duelRoute[1], uid, claims.playerName, body?.accept, now);
            } else if (duelRoute && request.method === "POST" && duelRoute[2] === "fire") {
                responseData = await fireRuletDuel(env.DB, duelRoute[1], uid, now);
            } else if (duelRoute && request.method === "POST" && duelRoute[2] === "heartbeat") {
                responseData = await heartbeatRuletDuel(env.DB, duelRoute[1], uid, now);
            } else if (duelRoute && request.method === "POST" && duelRoute[2] === "rematch") {
                responseData = await requestRuletRematch(env.DB, duelRoute[1], uid, now);
            } else {
                return apiError(404, "not-found", "Маршрут API не знайдено.");
            }
        } else {
            const uid = await authenticate(request, env);
            if (!uid) {
                return Response.json({ error: { code: "unauthenticated", message: "Увійди через посилання з Minecraft." } }, {
                    status: 401,
                    headers: originHeaders
                });
            }
            if (url.pathname === "/api/fishing/state" && request.method === "GET") {
                const now = Date.now();
                const world = getWorld(now);
                const player = await refreshPlayerState(env.DB, uid, now);
                responseData = {
                    player: publicPlayer(player),
                    world: publicWorld(now),
                    catalog: publicCatalog()
                };
            } else if (url.pathname === "/api/fishing/action" && request.method === "POST") {
                const now = Date.now();
                const world = getWorld(now);
                const body = await request.json();
                const result = await commitAction(env.DB, uid, body?.action, body?.payload || {}, now, world);
                const row = await env.DB.prepare(`SELECT player_json FROM ${FISHING_TABLE} WHERE uid = ?`).bind(uid).first();
                if (!row) throw new Error("Fishing state disappeared after saving an action.");
                responseData = {
                    player: publicPlayer(JSON.parse(row.player_json)),
                    result: result.result,
                    world: publicWorld(now)
                };
            } else if (url.pathname === "/api/fishing/reset" && request.method === "POST") {
                await env.DB.prepare(`DELETE FROM ${FISHING_TABLE} WHERE uid = ?`).bind(uid).run();
                responseData = { deleted: true };
            } else {
                return apiError(404, "not-found", "Маршрут API не знайдено.");
            }
        }
        return Response.json(responseData, { headers: originHeaders });
    } catch (error) {
        if (error?.code && Number.isInteger(error.status)) {
            return Response.json({ error: { code: error.code, message: error.message } }, {
                status: error.status,
                headers: originHeaders
            });
        }
        console.error("Cloudflare fishing API error:", error);
        return apiError(500, "internal", "Не вдалося виконати запит. Спробуй ще раз.");
    }
}

export default {
    async fetch(request, env) {
        return handleRequest(request, env);
    }
};

export { exchangeMinecraftToken, issueMinecraftToken, verifySessionToken };
