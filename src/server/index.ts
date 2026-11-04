import { createApp } from "./app.ts";
import { openCatalog } from "./catalog.ts";

const port = Number(process.env.PORT ?? 3000);
createApp(openCatalog()).listen(port, () => console.log(`http://localhost:${port}`));
