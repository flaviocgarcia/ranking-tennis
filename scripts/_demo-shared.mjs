/**
 * Utilitários compartilhados pelos scripts de massa de teste (demo).
 *
 * Os scripts demo criam/removem dados de teste de forma IDEMPOTENTE:
 * - todo usuário demo tem e-mail começando por `demo-`;
 * - toda partida demo tem `external_ref` começando por `demo-`.
 * Assim o reset remove exatamente o que o seed criou, sem tocar em dados
 * reais (o usuário administrador "de verdade" criado por você fica intacto).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Marcadores usados para identificar dados demo (únicos e óbvios). */
export const DEMO_EMAIL_PREFIX = "demo-";
export const DEMO_EMAIL_DOMAIN = "example.com";
export const DEMO_MATCH_REF_PREFIX = "demo-";
/** Senha única de todos os acessos de teste. */
export const DEMO_PASSWORD = "Demo@12345";

/**
 * Carrega .env.local / .env sem depender de pacote extra (o Next já faz isso
 * em runtime; aqui rodamos fora do Next, então lemos na mão).
 */
export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

export function buildAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local.",
    );
    process.exit(1);
  }
  return createClient(url.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, ""), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Compila `src/lib/domain/challenger.ts` (TypeScript puro; o tsc segue os
 * imports `./config` e `./match`) para um diretório temporário e devolve
 * o MESMO módulo usado pelo app — `computeChallengerSnapshot`,
 * `applyWindow`, `toViewRows`, `windowStart`. Assim o snapshot gravado por
 * aqui é idêntico ao que o app grava e ao que `/admin/verify` recalcula —
 * nunca há divergência de regra.
 */
export function loadChallengerDomain() {
  const outDir = path.join(os.tmpdir(), "rankingtenis-challenger-domain");
  mkdirSync(outDir, { recursive: true });
  const tsc = path.join(ROOT, "node_modules", ".bin", "tsc");
  execFileSync(
    tsc,
    [
      "src/lib/domain/challenger.ts",
      "--outDir",
      outDir,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--moduleResolution",
      "node",
      // Mesmas flags do app (tsconfig strict) — a compilação precisa
      // aceitar exatamente o que o typecheck do app aceita.
      "--strict",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  const require = createRequire(import.meta.url);
  const mod = require(path.join(outDir, "challenger.js"));
  if (typeof mod.computeChallengerSnapshot !== "function") {
    throw new Error("domínio compilado sem computeChallengerSnapshot");
  }
  return mod;
}

/** Executa `worker` em paralelo, com concorrência limitada. */
export async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function slugifyName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

export function initialsOf(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")
  ).toUpperCase();
}

/**
 * Remove os dados demo (contas `demo-*` e eventuais partidas `demo-*`).
 * Ordem importa: partidas antes dos perfis (FK `on delete restrict`).
 * A classificação publicada NÃO é tocada: as contas demo têm 0 jogos e
 * por isso não aparecem no snapshot.
 */
export async function cleanupDemo(admin, { log = () => {} } = {}) {
  const matches = await admin
    .from("matches")
    .delete({ count: "exact" })
    .like("external_ref", `${DEMO_MATCH_REF_PREFIX}%`);
  if (matches.error) throw new Error(matches.error.message);

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(users.error.message);
  const targets = users.data.users.filter((u) =>
    (u.email ?? "").startsWith(DEMO_EMAIL_PREFIX),
  );

  let deletedUsers = 0;
  for (const user of targets) {
    const res = await admin.auth.admin.deleteUser(user.id);
    if (res.error) throw new Error(`Falha ao remover ${user.email}: ${res.error.message}`);
    deletedUsers += 1;
  }

  log(
    `Removidos: ${matches.count ?? 0} partida(s) demo, ${deletedUsers} usuário(s) demo.`,
  );
  return { matches: matches.count ?? 0, users: deletedUsers };
}
