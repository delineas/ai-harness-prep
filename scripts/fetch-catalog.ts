import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

const URL_ = "https://github.com/lerocha/netflixdb/releases/download/v1.0.70/netflixdb.sqlite";
const SHA256 = "2cc4edee66ba91ce9d76ae388a1cfdfb18e263fc7f8dc01eddc335cc7d9243b0";
const target = "data/catalog.db";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

if (existsSync(target) && sha(await readFile(target)) === SHA256) {
  console.log(`${target} already present and verified.`);
  process.exit(0);
}
console.log(`Downloading ${URL_}`);
const res = await fetch(URL_);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
if (sha(buf) !== SHA256) {
  console.error(`Checksum mismatch: got ${sha(buf)}, expected ${SHA256}. Nothing written.`);
  process.exit(1);
}
await mkdir("data", { recursive: true });
await writeFile(`${target}.tmp`, buf);
await rm(target, { force: true });
await rename(`${target}.tmp`, target);
console.log(`Saved ${target} (checksum OK).`);
