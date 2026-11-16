CREATE TABLE IF NOT EXISTS guest_accounts (
    uuid TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    player_name TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
