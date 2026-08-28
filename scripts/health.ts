const baseUrl = process.env.DAIRY_URL ?? "http://127.0.0.1:3000";
const response = await fetch(`${baseUrl}/api/health`);
console.log(await response.text());
process.exitCode = response.ok ? 0 : 1;
export {};
