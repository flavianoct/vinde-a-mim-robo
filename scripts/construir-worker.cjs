// Monta cloudflare/worker.js = nucleo.mjs + worker-final.mjs (um arquivo só, para colar/enviar ao Cloudflare).
const fs = require("fs");
const n = fs.readFileSync("nucleo.mjs", "utf8").replace(/\r\n/g, "\n");
const w = fs.readFileSync("cloudflare/worker-final.mjs", "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync("cloudflare/worker.js", n + w);
console.log("cloudflare/worker.js", (n + w).length, "bytes");
