#!/usr/bin/env node
/**
 * ============================================================
 * CONTAS DE DEMONSTRAÇÃO (E2E) — idempotente
 *
 *   npm run demo:seed
 *
 * Cria/ajusta as duas contas usadas pelos testes automatizados
 * (scripts/smoke-prod.mjs e check-agenda.mjs):
 *
 *   demo-admin@example.com   (administrador)  senha Demo@12345
 *   demo-player@example.com  (jogador)        senha Demo@12345
 *
 * Elas têm 0 jogos: ficam FORA da classificação (a leitura só mostra
 * quem tem partida na janela de 12 meses). Não criam partidas nem tocam
 * nos dados reais — a importação (reset-and-import.mjs) já as cria.
 * ============================================================
 */
import { DEMO_PASSWORD, buildAdminClient, loadEnv } from "./_demo-shared.mjs";

loadEnv();
const admin = buildAdminClient();

const levelRes = await admin
  .from("levels")
  .select("id, code")
  .eq("active", true)
  .order("sort_order", { ascending: true })
  .limit(1);
if (levelRes.error) throw new Error(levelRes.error.message);
const level = (levelRes.data ?? [])[0] ?? null;
if (!level) {
  console.error("Nenhum nível ativo — rode antes a importação (reset-and-import).");
  process.exit(1);
}

const DEMOS = [
  { name: "Admin Demo", email: "demo-admin@example.com", role: "admin", initials: "AD" },
  { name: "Jogador Demo", email: "demo-player@example.com", role: "player", initials: "JD" },
];

async function findUserByEmail(email) {
  for (let page = 1; ; page++) {
    const res = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (res.error) throw new Error(res.error.message);
    const hit = res.data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (res.data.users.length < 200) return null;
  }
}

for (const demo of DEMOS) {
  const existing = await findUserByEmail(demo.email);
  let userId;
  if (existing) {
    userId = existing.id;
    const upd = await admin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (upd.error) throw new Error(`senha ${demo.email}: ${upd.error.message}`);
    console.log(`  ~ ${demo.email} já existia — senha redefinida.`);
  } else {
    const created = await admin.auth.admin.createUser({
      email: demo.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: demo.name },
    });
    if (created.error) {
      throw new Error(`criar ${demo.email}: ${created.error.message}`);
    }
    userId = created.data.user.id;
    console.log(`  + ${demo.email} criada.`);
  }

  const res = await admin
    .from("profiles")
    .update({
      name: demo.name,
      initials: demo.initials,
      role: demo.role,
      level_id: level.id,
      active: true,
      pending_approval: false,
      must_change_password: false,
    })
    .eq("id", userId);
  if (res.error) throw new Error(`perfil ${demo.email}: ${res.error.message}`);
}

console.log(`
============================================================
  Contas E2E prontas (senha única: ${DEMO_PASSWORD})
    demo-admin@example.com   administrador (acessa /admin)
    demo-player@example.com  jogador (agenda, resultados)
  Nível: ${level.code} — 0 jogos, fora da classificação.
============================================================
`);
