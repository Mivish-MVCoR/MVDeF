CREATE TABLE IF NOT EXISTS login_tokens (
    token TEXT PRIMARY KEY NOT NULL,
    uuid TEXT NOT NULL,
    player_name TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS login_tokens_expiry_idx ON login_tokens (expires_at);
