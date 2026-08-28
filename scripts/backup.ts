import { createBackup, removeOldBackups } from "../src/shared/backup/backup";

const backup = await createBackup();
removeOldBackups();
console.log(backup);
