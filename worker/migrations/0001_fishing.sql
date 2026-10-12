CREATE TABLE IF NOT EXISTS fishing_players (
    uid TEXT PRIMARY KEY NOT NULL,
    player_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fishing_weather (
    cycle INTEGER PRIMARY KEY NOT NULL,
    weather TEXT NOT NULL
);
