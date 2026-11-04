import { constants, DatabaseSync } from "node:sqlite";

/**
 * The ONLY place that opens the catalog database.
 * - read-only at the file level;
 * - an authorizer denies any read of the Spring Batch bookkeeping tables (BATCH_*).
 */
export function openCatalog(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { readOnly: true });
  db.setAuthorizer((action, arg1) => {
    if (action === constants.SQLITE_READ && typeof arg1 === "string" && /^BATCH_/i.test(arg1)) {
      return constants.SQLITE_DENY;
    }
    return constants.SQLITE_OK;
  });
  return db;
}

/**
 * Opens the writable app database (`data/app.db`, spec 02) and applies pending migrations.
 * It lives in this file because tests/architecture.test.ts allows `new DatabaseSync` in no other
 * file; it never touches catalog.db. Pass ":memory:" or a temp path in tests.
 */
export function openAppDb(path: string, migrations: readonly string[]): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  const current = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  migrations.slice(current).forEach((sql, i) => {
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${current + i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  return db;
}
