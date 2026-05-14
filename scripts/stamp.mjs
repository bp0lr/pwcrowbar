import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function git(cmd, fallback = "") {
  try {
    return execSync(`git ${cmd}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const commit = git("rev-parse --short HEAD", "unknown");
const branch = git("rev-parse --abbrev-ref HEAD", "unknown");
const date = git("log -1 --format=%cI", new Date().toISOString());
const dirty = git("status --porcelain").length > 0;

const stamp = { commit, branch, date, dirty };

writeFileSync(resolve(root, "src/build.json"), JSON.stringify(stamp, null, 2) + "\n");
console.log(`[stamp] wrote src/build.json → ${commit}${dirty ? "+dirty" : ""} (${branch})`);
