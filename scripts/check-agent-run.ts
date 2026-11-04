// Proves scripts/agent-run.sh masks app.db and strips BATCH_* for ANY process it launches.
// Exit 0 = verified, 1 = broken, 2 = cannot run here (nested namespaces refused): UNVERIFIED.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (spawnSync("bwrap", ["--bind", "/", "/", "true"]).status !== 0) {
  console.error("agent-run: UNVERIFIED (bwrap cannot create a namespace here)");
  process.exit(2);
}
const tmp = () => mkdtempSync(join(tmpdir(), "agentrun-"));
const data = tmp();
execFileSync("node", ["--input-type=module", "-e",
  `import {DatabaseSync} from "node:sqlite"; new DatabaseSync(process.argv[1]).exec("create table movie(id); insert into movie values(1); create table BATCH_JOB_INSTANCE(id); insert into BATCH_JOB_INSTANCE values(7);")`,
  join(data, "catalog.db")]);
writeFileSync(join(data, "app.db"), "SECRET-PERSONAL-DATA");
const probe = `import {DatabaseSync} from "node:sqlite";import {readFileSync} from "node:fs";
  const d=new DatabaseSync(process.argv[1],{readOnly:true});
  console.log(JSON.stringify({batch:d.prepare("select name from sqlite_master where name like 'BATCH%'").all().length,
    app:readFileSync(process.argv[2],"utf8"), movie:d.prepare("select count(*) c from movie").get().c}));`;
const out = execFileSync(join(process.cwd(), "scripts/agent-run.sh"),
  ["node", "--input-type=module", "-e", probe, join(data, "catalog.db"), join(data, "app.db")],
  { env: { ...process.env, AGENT_DATA_DIR: data, XDG_CACHE_HOME: tmp() }, encoding: "utf8" });
const got = JSON.parse(out);
const unmasked = readFileSync(join(data, "app.db"), "utf8") === "SECRET-PERSONAL-DATA"; // control: outside it is readable
if (got.batch === 0 && got.app === "" && got.movie === 1 && unmasked) console.log("agent-run: verified");
else { console.error("agent-run: BROKEN", got, { unmasked }); process.exit(1); }
