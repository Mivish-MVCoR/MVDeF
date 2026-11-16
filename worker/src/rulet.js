const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUEL_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const INVITATION_SECONDS = 120;
const TURN_SECONDS = 30;
const RECONNECT_SECONDS = 10;

export const RULET_SKINS = [
    { id: "classic", name: "Класичний", price: 0, color: "#b8c2d1" },
    { id: "emerald", name: "Смарагд", price: 40, color: "#4ade80" },
    { id: "crimson", name: "Багряний", price: 80, color: "#f87171" },
    { id: "gold", name: "Золотий", price: 140, color: "#fbbf24" }
];

function fail(code, status, message) {
    throw Object.assign(new Error(message), { code, status });
}

function validUuid(value) {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseDuelId(value) {
    if (typeof value !== "string" || !DUEL_ID_PATTERN.test(value)) {
        fail("invalid-argument", 400, "Неправильний ID дуелі.");
    }
    return value;
}

function isDuelConflict(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("player already in an active duel") ||
        message.includes("UNIQUE constraint failed: rulet_duels");
}

function pluginSecretMatches(candidate, expected) {
    if (typeof candidate !== "string" || typeof expected !== "string") return false;
    const left = new TextEncoder().encode(candidate);
    const right = new TextEncoder().encode(expected);
    let difference = left.length ^ right.length;
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        difference |= (left[index] || 0) ^ (right[index] || 0);
    }
    return difference === 0;
}

export function requireRuletPlugin(request, env) {
    const secret = env.LOGIN_ISSUER_SECRET;
    const supplied = (request.headers.get("authorization") || "").match(/^Bearer (.+)$/i)?.[1];
    if (!secret || secret.length < 32 || !pluginSecretMatches(supplied, secret)) {
        fail("unauthenticated", 401, "Плагін не автентифіковано.");
    }
}

function getChamber() {
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / 6) * 6;
    const values = new Uint32Array(1);
    do {
        crypto.getRandomValues(values);
    } while (values[0] >= limit);
    return (values[0] % 6) + 1;
}

async function settleFinishedDuel(db, duelId, now) {
    const duel = await db.prepare(
        "SELECT * FROM rulet_duels WHERE duel_id = ? AND status = 'finished' AND settled_at IS NULL"
    ).bind(duelId).first();
    if (!duel) return false;

    const reward = Math.max(10, Math.min(50, 10 + (duel.shots - 1) * 8));
    const winnerName = duel.winner_uid === duel.challenger_uid ? duel.challenger_name : duel.target_name;
    const loserName = duel.loser_uid === duel.challenger_uid ? duel.challenger_name : duel.target_name;
    await db.batch([
        db.prepare(
            `INSERT INTO rulet_players (uid, player_name, games, deaths, coins)
             SELECT ?, ?, 1, 0, ?
             WHERE EXISTS (SELECT 1 FROM rulet_duels WHERE duel_id = ? AND status = 'finished' AND settled_at IS NULL)
             ON CONFLICT(uid) DO UPDATE SET games = games + 1, coins = coins + excluded.coins, player_name = excluded.player_name`
        ).bind(duel.winner_uid, winnerName, reward, duelId),
        db.prepare(
            `INSERT INTO rulet_players (uid, player_name, games, deaths, coins)
             SELECT ?, ?, 1, 1, 0
             WHERE EXISTS (SELECT 1 FROM rulet_duels WHERE duel_id = ? AND status = 'finished' AND settled_at IS NULL)
             ON CONFLICT(uid) DO UPDATE SET games = games + 1, deaths = deaths + 1, player_name = excluded.player_name`
        ).bind(duel.loser_uid, loserName, duelId),
        db.prepare(
            `INSERT OR IGNORE INTO rulet_events (duel_id, type, payload_json, created_at)
             SELECT ?, 'finished', ?, ?
             WHERE EXISTS (SELECT 1 FROM rulet_duels WHERE duel_id = ? AND status = 'finished' AND settled_at IS NULL)`
        ).bind(duelId, JSON.stringify({
            duelId,
            winner: duel.winner_uid,
            loser: duel.loser_uid,
            shots: duel.shots,
            reason: duel.reason
        }), now, duelId),
        db.prepare(
            "UPDATE rulet_duels SET settled_at = ? WHERE duel_id = ? AND status = 'finished' AND settled_at IS NULL"
        ).bind(now, duelId)
    ]);
    return true;
}

async function finishByDisconnect(db, duel, disconnectedUid, now) {
    const winnerUid = disconnectedUid === duel.challenger_uid ? duel.target_uid : duel.challenger_uid;
    const updated = await db.prepare(
        `UPDATE rulet_duels
         SET status = 'finished', winner_uid = ?, loser_uid = ?, reason = 'left',
             turn_uid = NULL, turn_expires_at = NULL, settled_at = NULL
         WHERE duel_id = ? AND status = 'active' AND shots = ?
             AND challenger_seen_at IS ? AND target_seen_at IS ?`
    ).bind(
        winnerUid,
        disconnectedUid,
        duel.duel_id,
        duel.shots,
        duel.challenger_seen_at,
        duel.target_seen_at
    ).run();
    if (updated.meta?.changes === 1) {
        await settleFinishedDuel(db, duel.duel_id, now);
        return true;
    }
    return false;
}

async function shoot(db, duel, now, automatic = false) {
    const shotNumber = duel.shots + 1;
    const shooter = duel.turn_uid;
    const hit = shotNumber === duel.live_chamber;
    const isFinished = hit || shotNumber === 6;
    const nextUid = shooter === duel.challenger_uid ? duel.target_uid : duel.challenger_uid;
    const result = hit ? "bang" : "click";
    const shotRecord = { shot: shotNumber, shooter, result, automatic };
    const lastResult = JSON.stringify(shotRecord);
    const shotHistory = JSON.stringify([...(JSON.parse(duel.shot_history || "[]")), shotRecord]);
    const statement = isFinished
        ? db.prepare(
            `UPDATE rulet_duels
             SET status = 'finished', shots = ?, shot_history = ?, last_result = ?, winner_uid = ?, loser_uid = ?,
                 reason = ?, turn_uid = NULL, turn_expires_at = NULL, settled_at = NULL
             WHERE duel_id = ? AND status = 'active' AND turn_uid = ? AND shots = ?
                 AND turn_expires_at = ?`
        ).bind(
            shotNumber,
            shotHistory,
            lastResult,
            nextUid,
            shooter,
            automatic ? "timeout" : "shot",
            duel.duel_id,
            shooter,
            duel.shots,
            duel.turn_expires_at
        )
        : db.prepare(
            `UPDATE rulet_duels
             SET shots = ?, shot_history = ?, last_result = ?, turn_uid = ?, turn_expires_at = ?
             WHERE duel_id = ? AND status = 'active' AND turn_uid = ? AND shots = ?
                 AND turn_expires_at = ?`
        ).bind(
            shotNumber,
            shotHistory,
            lastResult,
            nextUid,
            now + TURN_SECONDS,
            duel.duel_id,
            shooter,
            duel.shots,
            duel.turn_expires_at
        );
    const updated = await statement.run();
    if (updated.meta?.changes !== 1) return false;
    if (isFinished) await settleFinishedDuel(db, duel.duel_id, now);
    return true;
}

async function expireInvitation(db, duel, now) {
    await db.prepare(
        "UPDATE rulet_duels SET status = 'expired' WHERE duel_id = ? AND status = 'pending' AND expires_at <= ?"
    ).bind(duel.duel_id, now).run();
    await db.prepare(
        `INSERT OR IGNORE INTO rulet_events (duel_id, type, payload_json, created_at)
         SELECT ?, 'expired', ?, ?
         WHERE EXISTS (SELECT 1 FROM rulet_duels WHERE duel_id = ? AND status = 'expired')`
    ).bind(duel.duel_id, JSON.stringify({ duelId: duel.duel_id }), now, duel.duel_id).run();
}

export async function maintainRulet(db, now) {
    const expired = await db.prepare(
        `SELECT * FROM rulet_duels
         WHERE (status = 'pending' AND expires_at <= ?)
            OR (status = 'expired' AND NOT EXISTS (
                SELECT 1 FROM rulet_events WHERE duel_id = rulet_duels.duel_id AND type = 'expired'
            ))
         LIMIT 100`
    ).bind(now).all();
    for (const duel of expired.results || []) await expireInvitation(db, duel, now);

    const unsettled = await db.prepare(
        "SELECT duel_id FROM rulet_duels WHERE status = 'finished' AND settled_at IS NULL LIMIT 100"
    ).all();
    for (const duel of unsettled.results || []) await settleFinishedDuel(db, duel.duel_id, now);

    const active = await db.prepare(
        `SELECT * FROM rulet_duels
         WHERE status = 'active'
           AND (turn_expires_at <= ? OR challenger_seen_at <= ? OR target_seen_at <= ?)
         LIMIT 100`
    ).bind(now, now - RECONNECT_SECONDS, now - RECONNECT_SECONDS).all();
    for (const duel of active.results || []) {
        const challengerGone = duel.challenger_seen_at <= now - RECONNECT_SECONDS;
        const targetGone = duel.target_seen_at <= now - RECONNECT_SECONDS;
        if (challengerGone && targetGone) {
            await finishByDisconnect(db, duel, duel.turn_uid, now);
        } else if (challengerGone || targetGone) {
            await finishByDisconnect(db, duel, challengerGone ? duel.challenger_uid : duel.target_uid, now);
        } else if (duel.turn_expires_at <= now) {
            await shoot(db, duel, now, true);
        }
    }
}

function publicDuel(duel, uid) {
    if (!duel) return null;
    return {
        duelId: duel.duel_id,
        challenger: { uuid: duel.challenger_uid, name: duel.challenger_name },
        target: { uuid: duel.target_uid, name: duel.target_name },
        stake: duel.stake,
        status: duel.status,
        expiresAt: duel.expires_at * 1000,
        accepted: {
            challenger: Boolean(duel.challenger_accepted_at),
            target: Boolean(duel.target_accepted_at)
        },
        shots: duel.shots,
        shotHistory: JSON.parse(duel.shot_history || "[]"),
        turn: duel.turn_uid,
        turnExpiresAt: duel.turn_expires_at ? duel.turn_expires_at * 1000 : null,
        lastResult: duel.last_result ? JSON.parse(duel.last_result) : null,
        winner: duel.winner_uid,
        loser: duel.loser_uid,
        reason: duel.reason,
        rematchDuelId: duel.rematch_duel_id || null,
        rematchRequested: uid === duel.challenger_uid
            ? Boolean(duel.rematch_challenger_at)
            : Boolean(duel.rematch_target_at),
        isParticipant: uid === duel.challenger_uid || uid === duel.target_uid
    };
}

export async function getRuletProfile(db, uid, playerName) {
    await db.prepare(
        "INSERT INTO rulet_players (uid, player_name) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET player_name = excluded.player_name"
    ).bind(uid, playerName).run();
    const player = await db.prepare(
        "SELECT uid, player_name, games, deaths, coins, active_skin FROM rulet_players WHERE uid = ?"
    ).bind(uid).first();
    const owned = await db.prepare(
        "SELECT skin_id FROM rulet_owned_skins WHERE uid = ? ORDER BY purchased_at"
    ).bind(uid).all();
    return {
        player,
        ownedSkins: ["classic", ...(owned.results || []).map(row => row.skin_id)]
    };
}

export async function getRuletDuel(db, duelId, uid, now) {
    await maintainRulet(db, now);
    const duel = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (!duel) fail("not-found", 404, "Дуель не знайдено.");
    if (duel.challenger_uid !== uid && duel.target_uid !== uid) {
        fail("permission-denied", 403, "Ця дуель не належить твоєму гравцю.");
    }
    return publicDuel(duel, uid);
}

export async function createRuletDuel(db, body, now) {
    const duelId = parseDuelId(body?.duelId);
    const challenger = typeof body?.challenger === "string" ? body.challenger.toLowerCase() : body?.challenger;
    const target = typeof body?.target === "string" ? body.target.toLowerCase() : body?.target;
    const stake = body?.stake;
    if (!validUuid(challenger) || !validUuid(target) || challenger === target ||
        !Number.isSafeInteger(stake) || stake < 0) {
        fail("invalid-argument", 400, "Перевір UUID гравців і суму ставки.");
    }

    await maintainRulet(db, now);
    const sameId = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (sameId) {
        if (sameId.challenger_uid !== challenger || sameId.target_uid !== target || sameId.stake !== stake) {
            fail("already-exists", 409, "Цей ID дуелі вже використано з іншими даними.");
        }
        return { duelId, status: sameId.status, expiresAt: sameId.expires_at * 1000 };
    }
    const existing = await db.prepare(
        "SELECT duel_id FROM rulet_duels WHERE (challenger_uid = ? OR target_uid = ? OR challenger_uid = ? OR target_uid = ?) AND status IN ('pending', 'awaiting_stakes', 'active') LIMIT 1"
    ).bind(challenger, challenger, target, target).first();
    if (existing) fail("already-exists", 409, "Один із гравців уже бере участь в активній дуелі.");

    const challengerName = typeof body.challengerName === "string" && body.challengerName.trim()
        ? body.challengerName.trim().slice(0, 32)
        : challenger;
    const targetName = typeof body.targetName === "string" && body.targetName.trim()
        ? body.targetName.trim().slice(0, 32)
        : target;
    let result;
    try {
        result = await db.prepare(
            `INSERT INTO rulet_duels
                (duel_id, challenger_uid, target_uid, challenger_name, target_name, stake, status, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(duelId, challenger, target, challengerName, targetName, stake, now, now + INVITATION_SECONDS).run();
    } catch (error) {
        if (!isDuelConflict(error)) throw error;
        const raced = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
        if (raced && raced.challenger_uid === challenger && raced.target_uid === target && raced.stake === stake) {
            return { duelId, status: raced.status, expiresAt: raced.expires_at * 1000 };
        }
        fail("already-exists", 409, "Один із гравців уже бере участь в активній дуелі або ID вже використано.");
    }
    if (result.meta?.changes !== 1) fail("already-exists", 409, "Не вдалося створити унікальну дуель.");

    await db.batch([
        db.prepare("INSERT OR IGNORE INTO rulet_players (uid, player_name) VALUES (?, ?)").bind(challenger, challengerName),
        db.prepare("INSERT OR IGNORE INTO rulet_players (uid, player_name) VALUES (?, ?)").bind(target, targetName)
    ]);
    return { duelId, status: "pending", expiresAt: (now + INVITATION_SECONDS) * 1000 };
}

export async function respondRuletDuel(db, duelId, uid, playerName, accept, now) {
    if (typeof accept !== "boolean") fail("invalid-argument", 400, "Поле accept має бути true або false.");
    await maintainRulet(db, now);
    const duel = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (!duel) fail("not-found", 404, "Дуель не знайдено.");
    if (uid !== duel.challenger_uid && uid !== duel.target_uid) {
        fail("permission-denied", 403, "Ця дуель не належить твоєму гравцю.");
    }
    if (duel.status !== "pending") fail("failed-precondition", 409, "Це запрошення вже неактивне.");
    if (!accept) {
        await db.batch([
            db.prepare(
                "UPDATE rulet_duels SET status = 'cancelled' WHERE duel_id = ? AND status = 'pending'"
            ).bind(duelId),
            db.prepare(
                `INSERT OR IGNORE INTO rulet_events (duel_id, type, payload_json, created_at)
                 SELECT ?, 'cancelled', ?, ?
                 WHERE EXISTS (SELECT 1 FROM rulet_duels WHERE duel_id = ? AND status = 'cancelled')`
            ).bind(duelId, JSON.stringify({ duelId, reason: "declined" }), now, duelId)
        ]);
        return publicDuel(await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first(), uid);
    }

    const acceptedAt = now;
    const isChallenger = uid === duel.challenger_uid;
    await db.batch([
        db.prepare(
            isChallenger
                ? "UPDATE rulet_duels SET challenger_accepted_at = COALESCE(challenger_accepted_at, ?), challenger_name = ? WHERE duel_id = ? AND status = 'pending'"
                : "UPDATE rulet_duels SET target_accepted_at = COALESCE(target_accepted_at, ?), target_name = ? WHERE duel_id = ? AND status = 'pending'"
        ).bind(acceptedAt, playerName, duelId),
        db.prepare(
            `UPDATE rulet_duels SET status = 'awaiting_stakes'
             WHERE duel_id = ? AND status = 'pending'
                 AND challenger_accepted_at IS NOT NULL AND target_accepted_at IS NOT NULL`
        ).bind(duelId),
        db.prepare(
            `INSERT OR IGNORE INTO rulet_events (duel_id, type, payload_json, created_at)
             SELECT duel_id, 'both_accepted', ?, ?
             FROM rulet_duels WHERE duel_id = ? AND status = 'awaiting_stakes'`
        ).bind(JSON.stringify({
            duelId,
            challenger: duel.challenger_uid,
            target: duel.target_uid,
            stake: duel.stake
        }), now, duelId)
    ]);
    const updated = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    return publicDuel(updated, uid);
}

export async function fireRuletDuel(db, duelId, uid, now) {
    await maintainRulet(db, now);
    const duel = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (!duel) fail("not-found", 404, "Дуель не знайдено.");
    if (duel.status !== "active") fail("failed-precondition", 409, "Дуель ще не почалася або вже завершена.");
    if (duel.turn_uid !== uid) fail("permission-denied", 403, "Зараз черга іншого гравця.");
    if (duel.turn_expires_at <= now) {
        await shoot(db, duel, now, true);
    } else {
        const succeeded = await shoot(db, duel, now);
        if (!succeeded) fail("aborted", 409, "Стан дуелі змінився. Онови сторінку.");
    }
    return getRuletDuel(db, duelId, uid, now);
}

export async function heartbeatRuletDuel(db, duelId, uid, now) {
    const duel = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (!duel) fail("not-found", 404, "Дуель не знайдено.");
    if (duel.challenger_uid !== uid && duel.target_uid !== uid) {
        fail("permission-denied", 403, "Ця дуель не належить твоєму гравцю.");
    }
    await maintainRulet(db, now);
    await db.prepare(
        uid === duel.challenger_uid
            ? "UPDATE rulet_duels SET challenger_seen_at = ? WHERE duel_id = ? AND status = 'active'"
            : "UPDATE rulet_duels SET target_seen_at = ? WHERE duel_id = ? AND status = 'active'"
    ).bind(now, duelId).run();
    return { ok: true };
}

export async function applyRuletStakes(db, duelId, body, now) {
    if (typeof body?.ok !== "boolean") fail("invalid-argument", 400, "Поле ok має бути true або false.");
    const duel = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (!duel) fail("not-found", 404, "Дуель не знайдено.");
    if (!body.ok && (!validUuid(body.failedPlayer) ||
        (body.failedPlayer !== duel.challenger_uid && body.failedPlayer !== duel.target_uid))) {
        fail("invalid-argument", 400, "failedPlayer має бути UUID одного з учасників дуелі.");
    }
    if (body.ok && duel.status === "active") {
        return { duelId, status: "active", turn: duel.turn_uid, turnExpiresAt: duel.turn_expires_at * 1000 };
    }
    if (!body.ok && duel.status === "cancelled" && duel.penalty_key) {
        return { duelId, status: "cancelled", penalty: 100, failedPlayer: duel.failed_uid };
    }
    if (duel.status !== "awaiting_stakes") fail("failed-precondition", 409, "Дуель не очікує перевірки ставок.");

    if (body.ok) {
        const chamber = getChamber();
        const result = await db.prepare(
            `UPDATE rulet_duels
             SET status = 'active', live_chamber = ?, shots = 0, shot_history = '[]', turn_uid = ?,
                 turn_expires_at = ?, challenger_seen_at = ?, target_seen_at = ?
             WHERE duel_id = ? AND status = 'awaiting_stakes'`
        ).bind(chamber, duel.challenger_uid, now + TURN_SECONDS, now, now, duelId).run();
        if (result.meta?.changes !== 1) fail("failed-precondition", 409, "Стан дуелі вже змінився.");
        return { duelId, status: "active", turn: duel.challenger_uid, turnExpiresAt: (now + TURN_SECONDS) * 1000 };
    }

    const failedPlayer = body.failedPlayer;
    const failedName = failedPlayer === duel.challenger_uid ? duel.challenger_name : duel.target_name;
    const penaltyKey = crypto.randomUUID();
    await db.batch([
        db.prepare(
            "UPDATE rulet_duels SET status = 'cancelled', penalty_key = ?, failed_uid = ? WHERE duel_id = ? AND status = 'awaiting_stakes'"
        ).bind(penaltyKey, failedPlayer, duelId),
        db.prepare(
            "INSERT OR IGNORE INTO rulet_players (uid, player_name) VALUES (?, ?)"
        ).bind(failedPlayer, failedName),
        db.prepare(
            `UPDATE rulet_players SET coins = MAX(0, coins - 100)
             WHERE uid = ? AND EXISTS (
                 SELECT 1 FROM rulet_duels WHERE duel_id = ? AND status = 'cancelled' AND penalty_key = ?
             )`
        ).bind(failedPlayer, duelId, penaltyKey)
    ]);
    return { duelId, status: "cancelled", penalty: 100, failedPlayer };
}

export async function cancelRuletDuel(db, duelId) {
    const duel = await db.prepare("SELECT status FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (!duel) fail("not-found", 404, "Дуель не знайдено.");
    if (duel.status === "cancelled" || duel.status === "expired") {
        return { duelId, status: duel.status };
    }
    const result = await db.prepare(
        "UPDATE rulet_duels SET status = 'cancelled' WHERE duel_id = ? AND status IN ('pending', 'awaiting_stakes')"
    ).bind(duelId).run();
    if (result.meta?.changes !== 1) fail("failed-precondition", 409, "Дуель не можна скасувати в поточному стані.");
    return { duelId, status: "cancelled" };
}

export async function requestRuletRematch(db, duelId, uid, now) {
    const duel = await db.prepare("SELECT * FROM rulet_duels WHERE duel_id = ?").bind(duelId).first();
    if (!duel) fail("not-found", 404, "Дуель не знайдено.");
    if (duel.status !== "finished") fail("failed-precondition", 409, "Реванш доступний після завершення дуелі.");
    if (uid !== duel.challenger_uid && uid !== duel.target_uid) {
        fail("permission-denied", 403, "Ця дуель не належить твоєму гравцю.");
    }

    const newDuelId = crypto.randomUUID();
    const acceptanceColumn = uid === duel.challenger_uid ? "rematch_challenger_at" : "rematch_target_at";
    try {
        await db.batch([
            db.prepare(`UPDATE rulet_duels SET ${acceptanceColumn} = COALESCE(${acceptanceColumn}, ?) WHERE duel_id = ? AND status = 'finished'`)
            .bind(now, duelId),
            db.prepare(
                `INSERT INTO rulet_duels
                (duel_id, challenger_uid, target_uid, challenger_name, target_name, stake,
                 status, created_at, expires_at, challenger_accepted_at, target_accepted_at)
             SELECT ?, challenger_uid, target_uid, challenger_name, target_name, stake,
                    'awaiting_stakes', ?, ?, ?, ?
             FROM rulet_duels
             WHERE duel_id = ? AND status = 'finished' AND rematch_duel_id IS NULL
                 AND rematch_challenger_at IS NOT NULL AND rematch_target_at IS NOT NULL`
            ).bind(newDuelId, now, now + INVITATION_SECONDS, now, now, duelId),
            db.prepare(
                `UPDATE rulet_duels SET rematch_duel_id = ?
             WHERE duel_id = ? AND rematch_duel_id IS NULL
                 AND EXISTS (SELECT 1 FROM rulet_duels WHERE duel_id = ? AND status = 'awaiting_stakes')`
            ).bind(newDuelId, duelId, newDuelId),
            db.prepare(
                `INSERT OR IGNORE INTO rulet_events (duel_id, type, payload_json, created_at)
             SELECT duel_id, 'both_accepted', ?, ?
             FROM rulet_duels WHERE duel_id = ? AND status = 'awaiting_stakes'`
            ).bind(JSON.stringify({
                duelId: newDuelId,
                challenger: duel.challenger_uid,
                target: duel.target_uid,
                stake: duel.stake
            }), now, newDuelId)
        ]);
    } catch (error) {
        if (!isDuelConflict(error)) throw error;
        fail("failed-precondition", 409, "Гравець уже бере участь в іншій дуелі.");
    }

    const updated = await db.prepare(
        "SELECT rematch_duel_id FROM rulet_duels WHERE duel_id = ?"
    ).bind(duelId).first();
    if (!updated?.rematch_duel_id) {
        return { status: "waiting", message: "Чекаємо згоди суперника на реванш." };
    }
    return {
        status: "awaiting_stakes",
        duelId: updated.rematch_duel_id,
        message: "Обидва погодилися. Плагін перевіряє ставки."
    };
}

export async function listRuletEvents(db, after, now) {
    const afterId = Number(after || 0);
    if (!Number.isSafeInteger(afterId) || afterId < 0) {
        fail("invalid-argument", 400, "after має бути невід'ємним цілим числом.");
    }
    await maintainRulet(db, now);
    const result = await db.prepare(
        "SELECT id, type, payload_json, created_at FROM rulet_events WHERE id > ? ORDER BY id ASC LIMIT 100"
    ).bind(afterId).all();
    return {
        events: (result.results || []).map(event => ({
            id: event.id,
            type: event.type,
            ...JSON.parse(event.payload_json),
            createdAt: event.created_at * 1000
        }))
    };
}

export async function getRuletShop(db, uid) {
    const profile = await db.prepare(
        "SELECT coins, active_skin FROM rulet_players WHERE uid = ?"
    ).bind(uid).first();
    const owned = await db.prepare(
        "SELECT skin_id FROM rulet_owned_skins WHERE uid = ?"
    ).bind(uid).all();
    const ownedIds = new Set(["classic", ...(owned.results || []).map(row => row.skin_id)]);
    return {
        coins: profile?.coins ?? 0,
        activeSkin: profile?.active_skin || "classic",
        skins: RULET_SKINS.map(skin => ({ ...skin, owned: ownedIds.has(skin.id) }))
    };
}

export async function buyRuletSkin(db, uid, playerName, skinId, now) {
    const skin = RULET_SKINS.find(item => item.id === skinId);
    if (!skin || skin.id === "classic") fail("invalid-argument", 400, "Цей скін не можна купити.");
    const profile = await getRuletProfile(db, uid, playerName);
    if (profile.ownedSkins.includes(skin.id)) fail("already-exists", 409, "Цей скін уже придбано.");
    if (profile.player.coins < skin.price) fail("failed-precondition", 409, "Недостатньо монет.");

    const purchaseKey = crypto.randomUUID();
    const results = await db.batch([
        db.prepare(
            `INSERT OR IGNORE INTO rulet_owned_skins (uid, skin_id, purchased_at, purchase_key)
             SELECT ?, ?, ?, ?
             WHERE EXISTS (SELECT 1 FROM rulet_players WHERE uid = ? AND coins >= ?)`
        ).bind(uid, skin.id, now, purchaseKey, uid, skin.price),
        db.prepare(
            `UPDATE rulet_players SET coins = coins - ?
             WHERE uid = ? AND coins >= ?
                 AND EXISTS (
                     SELECT 1 FROM rulet_owned_skins
                     WHERE uid = ? AND skin_id = ? AND purchase_key = ?
                 )`
        ).bind(skin.price, uid, skin.price, uid, skin.id, purchaseKey)
    ]);
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
        fail("failed-precondition", 409, "Покупку не виконано. Перевір баланс або онови магазин.");
    }
    return getRuletShop(db, uid);
}

export async function equipRuletSkin(db, uid, skinId) {
    if (!RULET_SKINS.some(skin => skin.id === skinId)) fail("invalid-argument", 400, "Невідомий скін.");
    const result = await db.prepare(
        `UPDATE rulet_players SET active_skin = ?
         WHERE uid = ? AND (? = 'classic' OR EXISTS (
             SELECT 1 FROM rulet_owned_skins WHERE uid = ? AND skin_id = ?
         ))`
    ).bind(skinId, uid, skinId, uid, skinId).run();
    if (result.meta?.changes !== 1) fail("failed-precondition", 409, "Цей скін ще не придбано.");
    return getRuletShop(db, uid);
}
