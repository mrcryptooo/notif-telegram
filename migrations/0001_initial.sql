CREATE TABLE IF NOT EXISTS group_usernames (
  chat_id TEXT NOT NULL,
  username TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (chat_id, username)
);

CREATE INDEX IF NOT EXISTS idx_group_usernames_chat_position
  ON group_usernames (chat_id, position);

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_batch INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0
);
