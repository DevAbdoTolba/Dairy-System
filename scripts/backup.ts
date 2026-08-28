import fs from "node:fs/promises";
import path from "node:path";
import { backupFileName, createBackup } from "../src/shared/backup/backup";

const outputDirectory = path.join(process.cwd(), "backups");
await fs.mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, backupFileName());
await fs.writeFile(outputPath, JSON.stringify(await createBackup(), null, 2), "utf8");
console.log(outputPath);
