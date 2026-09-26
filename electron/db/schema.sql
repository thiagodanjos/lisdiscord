-- Modelo da base de dados local da app (SQLite).
--
-- Este ficheiro é só o MODELO: vai no repositório, mas sem dados nenhuns. A base de dados
-- a sério (lisdiscord.sqlite) é criada pela própria app na primeira vez que abre, dentro da
-- pasta de dados do utilizador (Definições → Abrir pasta), e é lá que ficam as contas e o
-- token de cada pessoa — nunca no repositório (ver .gitignore).
--
-- Corre em cada arranque: só cria o que ainda não existir.

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Contas locais da app. A palavra-passe nunca é guardada — só o hash (scrypt) e o salt.
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

-- Token do bot de cada conta, encriptado com a encriptação do próprio sistema operativo
-- (DPAPI no Windows, Keychain no macOS, libsecret no Linux) — ilegível fora deste computador.
CREATE TABLE IF NOT EXISTS bot_credentials (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_encrypted  BLOB NOT NULL,
  bot_tag          TEXT,
  updated_at       TEXT NOT NULL
);

-- Sessões "manter sessão iniciada": enquanto houver uma válida, a app entra sozinha ao abrir.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

-- Histórico de entradas (com e sem sucesso), mostrado em Definições.
CREATE TABLE IF NOT EXISTS login_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  username    TEXT NOT NULL,
  success     INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '1');
