CREATE TABLE IF NOT EXISTS rulet_players (
    uid TEXT PRIMARY KEY NOT NULL,
    player_name TEXT NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
    active_skin TEXT NOT NULL DEFAULT 'classic',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS rulet_owned_skins (
    uid TEXT NOT NULL,
    skin_id TEXT NOT NULL,
    purchased_at INTEGER NOT NULL,
    purchase_key TEXT NOT NULL UNIQUE,
    PRIMARY KEY (uid, skin_id)
);

CREATE TABLE IF NOT EXISTS rulet_duels (
    duel_id TEXT PRIMARY KEY NOT NULL,
    challenger_uid TEXT NOT NULL,
    target_uid TEXT NOT NULL,
    challenger_name TEXT NOT NULL,
    target_name TEXT NOT NULL,
    stake INTEGER NOT NULL CHECK (stake >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_stakes', 'active', 'finished', 'cancelled', 'expired')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    challenger_accepted_at INTEGER,
    target_accepted_at INTEGER,
    live_chamber INTEGER,
    shots INTEGER NOT NULL DEFAULT 0,
    shot_history TEXT NOT NULL DEFAULT '[]',
    turn_uid TEXT,
    turn_expires_at INTEGER,
    challenger_seen_at INTEGER,
    target_seen_at INTEGER,
    last_result TEXT,
    winner_uid TEXT,
    loser_uid TEXT,
    reason TEXT,
    settled_at INTEGER,
    penalty_key TEXT,
    failed_uid TEXT,
    rematch_challenger_at INTEGER,
    rematch_target_at INTEGER,
    rematch_duel_id TEXT
);

CREATE INDEX IF NOT EXISTS rulet_duel_expiry_idx
    ON rulet_duels (status, expires_at);
CREATE INDEX IF NOT EXISTS rulet_duel_turn_idx
    ON rulet_duels (status, turn_expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS rulet_one_active_challenger_idx
    ON rulet_duels (challenger_uid)
    WHERE status IN ('pending', 'awaiting_stakes', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS rulet_one_active_target_idx
    ON rulet_duels (target_uid)
    WHERE status IN ('pending', 'awaiting_stakes', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS rulet_one_active_pair_idx
    ON rulet_duels (challenger_uid, target_uid)
    WHERE status IN ('pending', 'awaiting_stakes', 'active');
CREATE TRIGGER IF NOT EXISTS rulet_no_overlapping_duels
    BEFORE INSERT ON rulet_duels
    WHEN NEW.status IN ('pending', 'awaiting_stakes', 'active')
      AND EXISTS (
          SELECT 1 FROM rulet_duels
          WHERE status IN ('pending', 'awaiting_stakes', 'active')
            AND (
                challenger_uid IN (NEW.challenger_uid, NEW.target_uid)
                OR target_uid IN (NEW.challenger_uid, NEW.target_uid)
            )
      )
    BEGIN
        SELECT RAISE(ABORT, 'player already in an active duel');
    END;

CREATE TABLE IF NOT EXISTS rulet_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    duel_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS rulet_event_once_idx
    ON rulet_events (duel_id, type);
