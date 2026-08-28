import path from "node:path";
import { restoreBackup } from "../src/shared/backup/backup";

const file = process.argv[2];
if (!file) throw new Error("Usage: npm run restore -- path/to/backup.sqlite");
const safetyCopy = await restoreBackup(path.resolve(file));
console.log(`Restored successfully. Safety copy: ${safetyCopy}`);
