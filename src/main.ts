import { fileURLToPath } from "node:url";
import { openCatalog } from "./infrastructure/sqlite/openCatalog.ts";
import { sqliteCatalogRepository } from "./infrastructure/sqlite/sqliteCatalogRepository.ts";
import { createHttpServer } from "./interfaces/http/server.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dbPath = process.env.CATALOG_DB ?? `${root}data/catalog.db`;
const port = Number(process.env.PORT ?? 3000);

const repo = sqliteCatalogRepository(openCatalog(dbPath));
createHttpServer(repo, `${root}web/dist`).listen(port, () => {
  console.log(`Netflix Explorer on http://localhost:${port}`);
});
