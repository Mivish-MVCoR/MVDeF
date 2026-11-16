ALTER TABLE guest_accounts RENAME TO guest_accounts_legacy;

CREATE TABLE guest_accounts (
    uuid TEXT PRIMARY KEY NOT NULL,
    email_lookup TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

DROP INDEX login_tokens_expiry_idx;
ALTER TABLE login_tokens RENAME TO login_tokens_legacy;

CREATE TABLE login_tokens (
    token TEXT PRIMARY KEY NOT NULL,
    identity_encrypted TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER
);

CREATE INDEX login_tokens_expiry_idx ON login_tokens (expires_at);
DROP TABLE login_tokens_legacy;
