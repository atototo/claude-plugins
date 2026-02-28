// atomic-write.mjs — atomic JSON file write (tmp + rename)

import { writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Atomically write a JSON object to `filePath`.
 * Writes to a temp file in the same directory, then renames.
 */
export function atomicWriteJSON(filePath, data) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmp = join(dir, `.tmp-${randomBytes(4).toString("hex")}.json`);
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  renameSync(tmp, filePath);
}
