/** Versioned migrations of data/app.db (R18). Index + 1 = PRAGMA user_version. Never edit an applied one: append. */
export const APP_MIGRATIONS: readonly string[] = [
  // 1: users and reviews (spec 02). Dates are epoch milliseconds. R19 seeds fictitious users.
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'moderator')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title_kind TEXT NOT NULL CHECK (title_kind IN ('movie', 'show')),
    title_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body TEXT NOT NULL CHECK (length(body) <= 2000),
    status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX reviews_one_per_title ON reviews (user_id, title_kind, title_id);
  CREATE INDEX reviews_by_title ON reviews (title_kind, title_id);
  INSERT INTO users (id, email, display_name, role, created_at) VALUES
    (1, 'ana@example.test', 'Ana', 'user', 1767225600000),
    (2, 'ben@example.test', 'Ben', 'user', 1767225600000),
    (3, 'carla@example.test', 'Carla', 'user', 1767225600000),
    (4, 'maria@example.test', 'María', 'moderator', 1767225600000);
  `,
];
