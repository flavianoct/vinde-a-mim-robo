// Uma vez só: separa robo.mjs em nucleo.mjs (sem nada do Node, serve também para o Cloudflare) e robo.mjs (execução no GitHub).
const fs = require("fs");
const src = fs.readFileSync("robo.mjs", "utf8").replace(/\r\n/g, "\n");
const marca = "// Execução pelo terminal / GitHub Actions: node robo.mjs";
const i = src.indexOf(marca);
if (i < 0) throw new Error("marca não encontrada");
let nucleo = src.slice(0, i).replace(/^import \{[^}]*\} from 'node:fs';\n/m, "").trimEnd() + "\n";
const main = src.slice(i);
fs.writeFileSync("nucleo.mjs", nucleo);
fs.writeFileSync(
  "robo.mjs",
  "import { readFileSync, writeFileSync, existsSync } from 'node:fs';\nimport { Instagram, rodar, atualizarPainel } from './nucleo.mjs';\n\nexport * from './nucleo.mjs';\n\n" + main
);
console.log("ok", nucleo.length, main.length);
