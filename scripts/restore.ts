import fs from "node:fs/promises";
import path from "node:path";
import { restoreBackup } from "../src/shared/backup/backup";

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run restore -- path/to/backup.json");
await restoreBackup(JSON.parse(await fs.readFile(path.resolve(file), "utf8")) as unknown);
console.log("Restored successfully.");
