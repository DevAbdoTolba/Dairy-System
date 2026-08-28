import { getDb } from "../src/shared/db";

await getDb();
console.log("MongoDB indexes and default records are ready.");
