import { createPlayer, EQUIPMENT, publicPlayer, publicWorld, refreshAttempt, rollWeather, runFishingAction, WEATHER_LABELS } from "../../functions/src/fishing/game.js";
import { FISH, FISH_CATEGORIES, FISHING_RULES, VENUES } from "../../functions/src/fishing/catalog.js";

const LOGIN_TOKEN_PATTERN = /^[A-Za-z0-9]{32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEATHER_CYCLE_MS = 15 * 60 * 1000;
const WEATHER_CYCLE_EPOCH = Date.UTC(2026, 0, 1);
const FISHING_TABLE = "fishing_players";
const encoder = new TextEncoder();
const SESSION_ISSUER = "mvdef-cloudflare";
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

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
    const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO login_tokens (token, uuid, player_name, expires_at) VALUES (?, ?, ?, ?)"
    ).bind(token, uuid, playerName, expiresAt).run();
    if (result.meta?.changes !== 1) {
        throw Object.assign(new Error("Не вдалося створити унікальне посилання. Спробуй ще раз."), { code: "already-exists", status: 409 });
    }
    return { accepted: true };
}

async function exchangeMinecraftToken(token, db, secret, nowSeconds) {
    if (typeof token !== "string" || !LOGIN_TOKEN_PATTERN.test(token)) {
        throw Object.assign(new Error("Токен входу має неправильний формат."), { code: "invalid-argument", status: 400 });
    }
    if (!secret || secret.length < 32) throw new Error("Missing or weak SESSION_SECRET Worker secret.");
    const record = await db.prepare(
        "UPDATE login_tokens SET consumed_at = ? WHERE token = ? AND consumed_at IS NULL AND expires_at >= ? RETURNING uuid, player_name"
    ).bind(nowSeconds, token, nowSeconds).first();
    if (!record) {
        throw Object.assign(new Error("Посилання для входу недійсне або прострочене. Створи нове посилання командою //empire."), {
            code: "unauthenticated",
            status: 401
        });
    }
    const sessionToken = await signSession({
        iss: SESSION_ISSUER,
        sub: record.uuid,
        playerName: record.player_name,
        iat: nowSeconds,
        exp: nowSeconds + SESSION_LIFETIME_SECONDS
    }, secret);
    return {
        sessionToken,
        uuid: record.uuid,
        playerName: record.player_name,
        expiresAt: (nowSeconds + SESSION_LIFETIME_SECONDS) * 1000
    };
}

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function verifySessionToken(idToken, env) {
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
        typeof claims.sub !== "string" || !UUID_PATTERN.test(claims.sub) ||
        typeof claims.playerName !== "string" || claims.playerName.trim().length === 0) {
        return null;
    }
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
    return valid ? claims.sub : null;
}

function randomFloat() {
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    return bytes[0] / 0x1_0000_0000;
}

async function getWorld(db, now) {
    const cycle = Math.floor((now - WEATHER_CYCLE_EPOCH) / WEATHER_CYCLE_MS);
    const existing = await db.prepare("SELECT weather FROM fishing_weather WHERE cycle = ?").bind(cycle).first();
    let weather = existing?.weather;
    if (!weather) {
        const proposed = rollWeather(randomFloat);
        await db.prepare("INSERT OR IGNORE INTO fishing_weather (cycle, weather) VALUES (?, ?)").bind(cycle, proposed).run();
        const stored = await db.prepare("SELECT weather FROM fishing_weather WHERE cycle = ?").bind(cycle).first();
        weather = stored?.weather;
    }
    if (!weather || !WEATHER_LABELS[weather]) throw new Error("Could not read shared fishing weather.");
    return { cycle, weather, cycleStartedAt: WEATHER_CYCLE_EPOCH + cycle * WEATHER_CYCLE_MS };
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
                time: publicWorld(world, now).gameTime.period,
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
    const originHeaders = corsHeaders(request, env, isTokenIssue);
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
        } else if (url.pathname === "/api/login/exchange" && request.method === "POST") {
            const body = await request.json();
            responseData = await exchangeMinecraftToken(body?.token, env.DB, env.SESSION_SECRET, Math.floor(Date.now() / 1000));
        } else {
            const uid = await authenticate(request, env);
            if (!uid) {
                return Response.json({ error: { code: "unauthenticated", message: "Увійди через посилання з Minecraft." } }, {
                    status: 401,
                    headers: originHeaders
                });
            }
            const now = Date.now();
            const world = await getWorld(env.DB, now);
            if (url.pathname === "/api/fishing/state" && request.method === "GET") {
                const player = await refreshPlayerState(env.DB, uid, now);
                responseData = {
                    player: publicPlayer(player),
                    world: publicWorld(world, now),
                    catalog: publicCatalog()
                };
            } else if (url.pathname === "/api/fishing/action" && request.method === "POST") {
                const body = await request.json();
                const result = await commitAction(env.DB, uid, body?.action, body?.payload || {}, now, world);
                const row = await env.DB.prepare(`SELECT player_json FROM ${FISHING_TABLE} WHERE uid = ?`).bind(uid).first();
                if (!row) throw new Error("Fishing state disappeared after saving an action.");
                responseData = {
                    player: publicPlayer(JSON.parse(row.player_json)),
                    result: result.result,
                    world: publicWorld(world, now)
                };
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
