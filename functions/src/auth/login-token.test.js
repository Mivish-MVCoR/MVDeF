import test from "node:test";
import assert from "node:assert/strict";
import { consumeLoginToken, isValidLoginToken, LoginTokenError } from "./login-token.js";

const uuid = "01234567-89ab-cdef-0123-456789abcdef";
const validData = {
    uuid,
    playerName: "Player",
    expiresAt: 1_800_000_300
};

function createTokenRef(initialData) {
    let data = initialData;
    return {
        async transaction(update) {
            const updated = update(data);
            if (updated === undefined) return { committed: false, snapshot: { val: () => data } };
            data = updated;
            return { committed: true, snapshot: { val: () => data } };
        },
        value: () => data
    };
}

test("consumes a valid token once and returns only the player identity", async () => {
    const tokenRef = createTokenRef(validData);
    const identity = await consumeLoginToken({
        token: "A".repeat(32),
        tokenRef,
        nowSeconds: 1_800_000_000
    });

    assert.deepEqual(identity, { uuid, playerName: "Player" });
    assert.equal(tokenRef.value().consumedAt, 1_800_000_000);
    await assert.rejects(
        consumeLoginToken({ token: "A".repeat(32), tokenRef, nowSeconds: 1_800_000_000 }),
        error => error instanceof LoginTokenError && error.code === "unauthenticated"
    );
});

test("rejects malformed token values before accessing token storage", async () => {
    await assert.rejects(
        consumeLoginToken({ token: "../invalid", tokenRef: createTokenRef(validData), nowSeconds: 1 }),
        error => error instanceof LoginTokenError && error.code === "invalid-argument"
    );
});

test("validates login token shape before it can be used as a database key", () => {
    assert.equal(isValidLoginToken("A".repeat(32)), true);
    assert.equal(isValidLoginToken("aZ09".repeat(8)), true);
    assert.equal(isValidLoginToken("../" + "A".repeat(29)), false);
    assert.equal(isValidLoginToken(null), false);
});

test("does not consume expired, malformed or incomplete token records", async t => {
    const invalidRecords = [
        { ...validData, expiresAt: 1_799_999_999 },
        { ...validData, uuid: "not-a-uuid" },
        { ...validData, playerName: "" },
        { ...validData, consumedAt: 1_799_999_999 }
    ];

    for (const record of invalidRecords) {
        await t.test(JSON.stringify(record), async () => {
            const tokenRef = createTokenRef(record);
            await assert.rejects(
                consumeLoginToken({
                    token: "A".repeat(32),
                    tokenRef,
                    nowSeconds: 1_800_000_000
                }),
                error => error instanceof LoginTokenError && error.code === "unauthenticated"
            );
            assert.deepEqual(tokenRef.value(), record);
        });
    }
});
