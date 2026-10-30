import test from "node:test";
import assert from "node:assert/strict";
import worker, { verifySessionToken } from "./index.js";

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
                    const [token, uuid, playerName, expiresAt] = values;
                    if (issuedTokens.has(token)) return { meta: { changes: 0 } };
                    issuedTokens.set(token, { uuid, player_name: playerName, expires_at: expiresAt, consumed_at: null });
                    return { meta: { changes: 1 } };
                },
                async first() {
                    if (!sql.startsWith("UPDATE login_tokens")) throw new Error("Unexpected D1 statement");
                    const [consumedAt, token, now] = values;
                    const record = issuedTokens.get(token);
                    if (!record || record.consumed_at || record.expires_at < now) return null;
                    record.consumed_at = consumedAt;
                    return { uuid: record.uuid, player_name: record.player_name };
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
