/**
 * Publica os segredos do Worker de produção a partir de worker/.prod.vars
 * (arquivo local, fora do git — mesmo formato do .dev.vars).
 *
 *   npm run deploy:segredos
 *
 * Roda uma vez e a cada troca de chave. O `wrangler deploy` NÃO leva segredos.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const ARQUIVO = "worker/.prod.vars";
if (!existsSync(ARQUIVO)) {
  console.error(
    `Falta ${ARQUIVO}. Crie com as chaves de produção (mesmo formato do worker/.dev.vars):\n` +
      "SUPABASE_URL=…\nSERVICE_ROLE_KEY=…\nBRAPI_TOKEN=…\nVAPID_PUBLIC_KEY=…\nVAPID_PRIVATE_KEY=…\nVAPID_SUBJECT=…\n" +
      "GOOGLE_CLIENT_ID=…\nGOOGLE_CLIENT_SECRET=…\nGOOGLE_REDIRECT_URL=…"
  );
  process.exit(1);
}

const linhas = readFileSync(ARQUIVO, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

for (const linha of linhas) {
  const i = linha.indexOf("=");
  if (i < 1) continue;
  const nome = linha.slice(0, i);
  const valor = linha.slice(i + 1);
  execFileSync("npx", ["wrangler", "secret", "put", nome], { input: valor, stdio: ["pipe", "inherit", "inherit"], shell: true });
  console.log(`· ${nome} publicado`);
}
console.log(`${linhas.length} segredo(s) no Worker de produção.`);
