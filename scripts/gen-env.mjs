// Gera .env.local (front) e worker/.dev.vars a partir do Supabase local.
// Nada disso vai para o git; em produção as chaves entram por secrets.
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const out = execSync("supabase status -o env", { encoding: "utf8" });
const get = (k) => out.match(new RegExp(`${k}="([^"]+)"`))?.[1];

const url = get("API_URL");
const anon = get("ANON_KEY");
const service = get("SERVICE_ROLE_KEY");
if (!url || !anon || !service) throw new Error("Supabase local não está rodando (supabase start).");

// preserva segredos extras já configurados no .dev.vars (Google OAuth, VAPID, MetaApi…)
const keep = existsSync("worker/.dev.vars")
  ? readFileSync("worker/.dev.vars", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith("SUPABASE_URL=") && !l.startsWith("SERVICE_ROLE_KEY="))
  : [];

writeFileSync(".env.local", `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anon}\n`);
writeFileSync("worker/.dev.vars", `SUPABASE_URL=${url}\nSERVICE_ROLE_KEY=${service}\n${keep.join("\n")}${keep.length ? "\n" : ""}`);
console.log("Gerados .env.local e worker/.dev.vars a partir do Supabase local.");
