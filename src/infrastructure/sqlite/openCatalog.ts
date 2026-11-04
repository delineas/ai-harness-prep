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
