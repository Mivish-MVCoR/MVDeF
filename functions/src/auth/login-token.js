const LOGIN_TOKEN_PATTERN = /^[A-Za-z0-9]{32}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PLAYER_NAME_LENGTH = 32;

export function isValidLoginToken(token) {
    return typeof token === "string" && LOGIN_TOKEN_PATTERN.test(token);
}

export class LoginTokenError extends Error {
    constructor(code) {
        super("Посилання для входу недійсне або прострочене. Створи нове посилання командою //empire.");
        this.name = "LoginTokenError";
        this.code = code;
    }
}

export async function consumeLoginToken({ token, tokenRef, nowSeconds }) {
    if (!isValidLoginToken(token)) {
        throw new LoginTokenError("invalid-argument");
    }

    const result = await tokenRef.transaction(current => {
        if (!current || current.consumedAt || !Number.isSafeInteger(current.expiresAt) ||
            current.expiresAt < nowSeconds || typeof current.uuid !== "string" ||
            !UUID_PATTERN.test(current.uuid) || typeof current.playerName !== "string" ||
            current.playerName.trim().length === 0 ||
            current.playerName.length > MAX_PLAYER_NAME_LENGTH) {
            return;
        }

        return { ...current, consumedAt: nowSeconds };
    });

    const data = result.snapshot.val();
    if (!result.committed || !data?.consumedAt ||
        !UUID_PATTERN.test(data.uuid || "") ||
        typeof data.playerName !== "string" ||
        data.playerName.trim().length === 0 ||
        data.playerName.length > MAX_PLAYER_NAME_LENGTH) {
        throw new LoginTokenError("unauthenticated");
    }

    return {
        uuid: data.uuid,
        playerName: data.playerName
    };
}
