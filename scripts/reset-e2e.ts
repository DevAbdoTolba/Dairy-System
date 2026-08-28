import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), ".tmp");
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
