import test from "node:test";
import assert from "node:assert/strict";
import worker, { verifySessionToken } from "./index.js";

const authDataKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

test("worker rejects requests from origins not explicitly allowed", async () => {
    const response = await worker.fetch(
        new Request("https://api.example/api/fishing/state", { headers: { origin: "https://attacker.example" } }),
        { ALLOWED_ORIGINS: "https://site.example" }
    );
    assert.equal(response.status, 403);
});

test("fishing endpoints require a signed site session", async () => {
    const response = await worker.fetch(
        new Request("https://api.example/api/fishing/state", { headers: { origin: "https://site.example" } }),
        { ALLOWED_ORIGINS: "https://site.example", SESSION_SECRET: "test-session-secret-with-sufficient-entropy" }
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthenticated");
});

test("login exchange rejects malformed token strings before reading secrets", async () => {
    const response = await worker.fetch(
        new Request("https://api.example/api/login/exchange", {
            method: "POST",
            headers: { origin: "https://site.example", "content-type": "application/json" },
            body: JSON.stringify({ token: "bad" })
        }),
        { ALLOWED_ORIGINS: "https://site.example" }
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid-argument");
});

test("worker-issued session tokens are signed and bound to a Minecraft UUID", async () => {
    const secret = "test-session-secret-with-sufficient-entropy";
    const claims = {
        iss: "mvdef-cloudflare",
        sub: "01234567-89ab-cdef-0123-456789abcdef",
        playerName: "Player",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
    };
    const encoder = new TextEncoder();
    const encode = value => btoa(String.fromCharCode(...encoder.encode(JSON.stringify(value))))
        .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const header = encode({ alg: "HS256", typ: "JWT" });
    const payload = encode(claims);
    const input = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(input));
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const token = `${input}.${encodedSignature}`;

    assert.equal(await verifySessionToken(token, { SESSION_SECRET: secret }), claims.sub);
    assert.equal(await verifySessionToken(token, { SESSION_SECRET: "wrong-secret" }), null);
    const malformedUid = `${header}.${encode({ ...claims, sub: "demo-user" })}.${encodedSignature}`;
    assert.equal(await verifySessionToken(malformedUid, { SESSION_SECRET: secret }), null);
});

test("demo fishing access is gated and reset deletes only the authenticated fishing profile", async () => {
    const secret = "test-session-secret-with-sufficient-entropy";
    const statements = [];
    const env = {
        SESSION_SECRET: secret,
        AUTH_DATA_KEY: authDataKey,
        DEMO_FISHING_ENABLED: "true",
        ALLOWED_ORIGINS: "https://site.example",
        DB: {
            prepare(sql) {
                return {
                    bind(...values) {
                        statements.push({ sql, values });
                        return this;
                    },
                    async run() {
                        return { meta: { changes: 1 } };
                    }
                };
            }
        }
    };
    const demoResponse = await worker.fetch(new Request("https://api.example/api/login/demo", {
        method: "POST",
        headers: { origin: "https://site.example" }
    }), env);
    assert.equal(demoResponse.status, 200);
    const demoSession = await demoResponse.json();
    assert.equal(await verifySessionToken(demoSession.sessionToken, { SESSION_SECRET: secret }), "demo-user");

    const resetResponse = await worker.fetch(new Request("https://api.example/api/fishing/reset", {
        method: "POST",
        headers: {
            origin: "https://site.example",
            authorization: `Bearer ${demoSession.sessionToken}`
        }
    }), env);
    assert.equal(resetResponse.status, 200);
    assert.deepEqual(await resetResponse.json(), { deleted: true });
    assert.deepEqual(statements, [{
        sql: "DELETE FROM fishing_players WHERE uid = ?",
        values: ["demo-user"]
    }]);

    const disabledResponse = await worker.fetch(new Request("https://api.example/api/login/demo", {
        method: "POST",
        headers: { origin: "https://site.example" }
    }), { ...env, DEMO_FISHING_ENABLED: "false" });
    assert.equal(disabledResponse.status, 403);
});

test("guest accounts receive separate fishing identities and a fresh signed session on every login", async () => {
    const accounts = new Map();
    const legacyAccounts = new Map();
    const fishingProfiles = new Map();
    const secret = "test-session-secret-with-sufficient-entropy";
    const db = {
        prepare(sql) {
            let values = [];
            return {
                bind(...args) {
                    values = args;
                    return this;
                },
                async run() {
                    if (sql.startsWith("INSERT OR IGNORE INTO guest_accounts (uuid, email_lookup")) {
                        const [uuid, emailLookup, passwordSalt, passwordHash] = values;
                        if (accounts.has(emailLookup)) return { meta: { changes: 0 } };
                        accounts.set(emailLookup, { uuid, password_salt: passwordSalt, password_hash: passwordHash });
                        return { meta: { changes: 1 } };
                    }
                    if (sql.startsWith("DELETE FROM guest_accounts_legacy")) {
                        const [uuid] = values;
                        for (const [email, account] of legacyAccounts) {
                            if (account.uuid === uuid) legacyAccounts.delete(email);
                        }
                        return { meta: { changes: 1 } };
                    }
                    if (sql.startsWith("INSERT OR IGNORE INTO fishing_players")) {
                        const [uid, playerJson, revision] = values;
                        if (!fishingProfiles.has(uid)) fishingProfiles.set(uid, { player_json: playerJson, revision });
                        return { meta: { changes: 1 } };
                    }
                    if (sql.startsWith("UPDATE fishing_players")) {
                        const [playerJson, uid, revision] = values;
                        const profile = fishingProfiles.get(uid);
                        if (!profile || profile.revision !== revision) return { meta: { changes: 0 } };
                        fishingProfiles.set(uid, { player_json: playerJson, revision: revision + 1 });
                        return { meta: { changes: 1 } };
                    }
                    throw new Error(`Unexpected database statement: ${sql}`);
                },
                async first() {
                    if (sql.startsWith("SELECT uuid, password_salt, password_hash FROM guest_accounts WHERE email_lookup")) {
                        return accounts.get(values[0]) || null;
                    }
                    if (sql.startsWith("SELECT uuid, player_name, password_salt, password_hash, created_at FROM guest_accounts_legacy")) {
                        return legacyAccounts.get(values[0]) || null;
                    }
                    if (sql.startsWith("SELECT player_json, revision FROM fishing_players")) {
                        return fishingProfiles.get(values[0]) || null;
                    }
                    throw new Error(`Unexpected database query: ${sql}`);
                }
            };
        }
    };
    const env = {
        DB: db,
        SESSION_SECRET: secret,
        AUTH_DATA_KEY: authDataKey,
        ALLOWED_ORIGINS: "https://site.example"
    };
    const guestRequest = (path, body) => worker.fetch(new Request(`https://api.example${path}`, {
        method: "POST",
        headers: { origin: "https://site.example", "content-type": "application/json" },
        body: JSON.stringify(body)
    }), env);
    const decodeClaims = token => {
        const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
    };

    const firstRegistration = await guestRequest("/api/login/guest/register", {
        email: "First@Example.com",
        password: "first-password"
    });
    assert.equal(firstRegistration.status, 200);
    const firstSession = await firstRegistration.json();
    assert.equal(await verifySessionToken(firstSession.sessionToken, { SESSION_SECRET: secret }), firstSession.uuid);
    assert.equal(decodeClaims(firstSession.sessionToken).guest, true);
    assert.equal(firstSession.playerName, "Гість");

    const duplicateRegistration = await guestRequest("/api/login/guest/register", {
        email: "first@example.com",
        password: "first-password"
    });
    assert.equal(duplicateRegistration.status, 409);

    const loginResponse = await guestRequest("/api/login/guest/exchange", {
        email: "FIRST@example.com",
        password: "first-password"
    });
    assert.equal(loginResponse.status, 200);
    const loginSession = await loginResponse.json();
    assert.equal(loginSession.uuid, firstSession.uuid);
    assert.notEqual(loginSession.sessionToken, firstSession.sessionToken);
    assert.notEqual(decodeClaims(loginSession.sessionToken).jti, decodeClaims(firstSession.sessionToken).jti);

    const secondRegistration = await guestRequest("/api/login/guest/register", {
        email: "second@example.com",
        password: "second-password"
    });
    assert.equal(secondRegistration.status, 200);
    const secondSession = await secondRegistration.json();
    assert.notEqual(secondSession.uuid, firstSession.uuid);

    const fishingStateRequest = session => worker.fetch(new Request("https://api.example/api/fishing/state", {
        headers: {
            origin: "https://site.example",
            authorization: "Bearer " + session.sessionToken
        }
    }), env);
    assert.equal((await fishingStateRequest(firstSession)).status, 200);
    assert.equal((await fishingStateRequest(secondSession)).status, 200);
    assert.deepEqual([...fishingProfiles.keys()].sort(), [firstSession.uuid, secondSession.uuid].sort());

    const badLogin = await guestRequest("/api/login/guest/exchange", {
        email: "first@example.com",
        password: "wrong-password"
    });
    assert.equal(badLogin.status, 401);

    const legacyEmail = "legacy@example.com";
    const legacyPassword = "legacy-password";
    const legacySalt = new Uint8Array(16).fill(3);
    const passwordKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(legacyPassword), "PBKDF2", false, ["deriveBits"]);
    const legacyHash = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt: legacySalt,
        iterations: 100_000
    }, passwordKey, 256);
    const encodeBytes = bytes => btoa(String.fromCharCode(...bytes))
        .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const legacyUuid = crypto.randomUUID();
    legacyAccounts.set(legacyEmail, {
        uuid: legacyUuid,
        player_name: "Old Guest",
        password_salt: encodeBytes(legacySalt),
        password_hash: encodeBytes(new Uint8Array(legacyHash)),
        created_at: Math.floor(Date.now() / 1000)
    });
    const legacyLogin = await guestRequest("/api/login/guest/exchange", {
        email: legacyEmail,
        password: legacyPassword
    });
    assert.equal(legacyLogin.status, 200);
    const migratedSession = await legacyLogin.json();
    assert.equal(migratedSession.uuid, legacyUuid);
    assert.equal(migratedSession.playerName, "Гість");
    assert.equal(legacyAccounts.has(legacyEmail), false);
    assert.equal([...accounts.values()].some(account => account.uuid === legacyUuid), true);

    const rouletteResponse = await worker.fetch(new Request("https://api.example/api/rulet/state", {
        headers: {
            origin: "https://site.example",
            authorization: "Bearer " + loginSession.sessionToken
        }
    }), {
        ...env,
        DB: {
            prepare() {
                throw new Error("Guest sessions must not access roulette data.");
            }
        }
    });
    assert.equal(rouletteResponse.status, 403);
});

test("Minecraft login token is issued and atomically exchanged for a signed site session", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const issuedTokens = new Map();
    const db = {
        prepare(sql) {
            let values = [];
            return {
                bind(...args) {
                    values = args;
                    return this;
                },
                async run() {
                    if (!sql.startsWith("INSERT OR IGNORE INTO login_tokens")) throw new Error("Unexpected D1 statement");
                    const [token, encryptedIdentity, expiresAt] = values;
                    if (issuedTokens.has(token)) return { meta: { changes: 0 } };
                    issuedTokens.set(token, { identity_encrypted: encryptedIdentity, expires_at: expiresAt, consumed_at: null });
                    return { meta: { changes: 1 } };
                },
                async first() {
                    if (!sql.startsWith("UPDATE login_tokens")) throw new Error("Unexpected D1 statement");
                    const [consumedAt, tokenDigest, now] = values;
                    const record = issuedTokens.get(tokenDigest);
                    if (!record || record.consumed_at || record.expires_at < now) return null;
                    record.consumed_at = consumedAt;
                    return { identity_encrypted: record.identity_encrypted };
                }
            };
        }
    };
    const issuerSecret = "test-plugin-issuer-secret-with-entropy";
    const sessionSecret = "test-site-session-secret-with-entropy";
    const loginToken = "Abcdef0123456789Abcdef0123456789";
    const uuid = "01234567-89ab-cdef-0123-456789abcdef";
    const env = {
        DB: db,
        LOGIN_ISSUER_SECRET: issuerSecret,
        SESSION_SECRET: sessionSecret,
        AUTH_DATA_KEY: authDataKey,
        ALLOWED_ORIGINS: "https://site.example"
    };
    const issueResponse = await worker.fetch(
        new Request("https://api.example/api/login/issue", {
            method: "POST",
            headers: { authorization: `Bearer ${issuerSecret}`, "content-type": "application/json" },
            body: JSON.stringify({ token: loginToken, uuid, playerName: "Player", expiresAt: nowSeconds + 300 })
        }),
        env
    );
    assert.equal(issueResponse.status, 200);

    const exchangeRequest = () => new Request("https://api.example/api/login/exchange", {
        method: "POST",
        headers: { origin: "https://site.example", "content-type": "application/json" },
        body: JSON.stringify({ token: loginToken })
    });
    const exchangeResponse = await worker.fetch(exchangeRequest(), env);
    assert.equal(exchangeResponse.status, 200);
    const session = await exchangeResponse.json();
    const storedToken = [...issuedTokens.entries()][0];
    assert.notEqual(storedToken[0], loginToken);
    assert.equal(storedToken[1].identity_encrypted.includes(uuid), false);
    assert.equal(storedToken[1].identity_encrypted.includes("Player"), false);
    assert.equal(session.uuid, uuid);
    assert.equal(session.playerName, "Player");
    assert.equal(await verifySessionToken(session.sessionToken, { SESSION_SECRET: sessionSecret }), uuid);

    const secondExchange = await worker.fetch(exchangeRequest(), env);
    assert.equal(secondExchange.status, 401);
});

test("Minecraft token registration rejects a missing plugin secret", async () => {
    const response = await worker.fetch(
        new Request("https://api.example/api/login/issue", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                token: "Abcdef0123456789Abcdef0123456789",
                uuid: "01234567-89ab-cdef-0123-456789abcdef",
                playerName: "Player",
                expiresAt: Math.floor(Date.now() / 1000) + 300
            })
        }),
        { LOGIN_ISSUER_SECRET: "test-plugin-issuer-secret-with-entropy" }
    );
    assert.equal(response.status, 401);
});

test("roulette plugin endpoints require the shared plugin secret", async () => {
    const response = await worker.fetch(new Request("https://api.example/api/rulet/events?after=0"), {
        ALLOWED_ORIGINS: "https://site.example",
        DB: {
            prepare() {
                throw new Error("Database must not be accessed before plugin authentication.");
            }
        }
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthenticated");
});

test("roulette browser endpoints require a signed player session", async () => {
    const response = await worker.fetch(new Request("https://api.example/api/rulet/state", {
        headers: { origin: "https://site.example" }
    }), {
        ALLOWED_ORIGINS: "https://site.example",
        SESSION_SECRET: "test-site-session-secret-with-sufficient-entropy"
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthenticated");
});
