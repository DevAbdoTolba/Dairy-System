import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const root = path.join(process.cwd(), ".tmp");
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/?directConnection=true";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000 });
try {
  await client.db("dairy_e2e").dropDatabase();
} finally {
  await client.close();
}
