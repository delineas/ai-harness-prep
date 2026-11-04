import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const URL_ =
  "https://github.com/lerocha/netflixdb/releases/download/v1.0.70/netflixdb.sqlite";
const SHA256 = "2cc4edee66ba91ce9d76ae388a1cfdfb18e263fc7f8dc01eddc335cc7d9243b0";
const DEST = "data/catalog.db";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

await mkdir("data", { recursive: true });
try {
  if (sha(await readFile(DEST)) === SHA256) {
    console.log("catalog.db already present and verified");
    process.exit(0);
  }
} catch {}

const res = await fetch(URL_);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
if (sha(buf) !== SHA256) throw new Error("Checksum mismatch, refusing to save");
await writeFile(`${DEST}.tmp`, buf);
await rename(`${DEST}.tmp`, DEST);
console.log("catalog.db downloaded and verified");
