import { fileURLToPath } from "node:url";
import { createReviewsService } from "./application/reviews.ts";
import { APP_MIGRATIONS } from "./infrastructure/sqlite/appMigrations.ts";
import { openAppDb, openCatalog } from "./infrastructure/sqlite/openCatalog.ts";
import { sqliteReviewRepository } from "./infrastructure/sqlite/sqliteReviewRepository.ts";
import { sqliteCatalogRepository } from "./infrastructure/sqlite/sqliteCatalogRepository.ts";
import { createHttpServer } from "./interfaces/http/server.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dbPath = process.env.CATALOG_DB ?? `${root}data/catalog.db`;
const appDbPath = process.env.APP_DB ?? `${root}data/app.db`;
const port = Number(process.env.PORT ?? 3000);

const repo = sqliteCatalogRepository(openCatalog(dbPath));
const reviews = createReviewsService(repo, sqliteReviewRepository(openAppDb(appDbPath, APP_MIGRATIONS)));
createHttpServer(repo, `${root}web/dist`, reviews).listen(port, () => {
  console.log(`Netflix Explorer on http://localhost:${port}`);
});
