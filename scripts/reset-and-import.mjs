#!/usr/bin/env node
/**
 * ============================================================
 * RESET + IMPORTAÇÃO DO F CHALLENGER
 *
 *   python3.10 scripts/export_fchallenger.py   # xlsx -> JSON (1x)
 *   node scripts/reset-and-import.mjs --yes    # apaga e reimporta
 *
 * ATENÇÃO: apaga TODOS os dados do banco (partidas, perfis, convites,
 * snapshots, níveis e todos os usuários do Auth, EXCETO a conta do
 * administrador flaviocgarcia@gmail.com) e recria o mundo F CHALLENGER:
 *
 *   1. um único nível ativo — F CHALLENGER (slug `challenger`);
 *   2. os 51 atletas da planilha: CONTA PLACEHOLDER vinculada ao convite
 *      (e-mail provisório @fch.example.com, senha desconhecida). É
 *      necessário porque os 84 jogos históricos exigem perfil em cada
 *      lado; ninguém consegue entrar nessa conta — o atleta escolhe
 *      e-mail+senha em /ativar com o código;
 *   3. perfil do Flavio Garcia recriado como administrador (conta Auth
 *      preservada); convite dele já ativado;
 *   4. as 84 partidas da planilha, todas confirmadas (3 erros de
 *      digitação e 2 datas já corrigidos pelo exportador);
 *   5. as contas de demonstração E2E (demo-admin / demo-player);
 *   6. snapshot publicado — MESMO motor de domínio do app;
 *   7. conferência do recálculo contra o RANKING oficial da planilha
 *      (esperado: 37/38 idênticos; RODRIGO MEINCKE difere porque o
 *      ranking oficial da planilha está defasado — decisão: recalcular).
 *
 * Os códigos de ativação saem em /tmp/opencode/fchallenger_codigos.txt
 * (dado pessoal — fora do repositório, mesmo destino do JSON).
 * ============================================================
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  DEMO_PASSWORD,
  buildAdminClient,
  loadChallengerDomain,
  loadEnv,
} from "./_demo-shared.mjs";

const JSON_PATH = process.env.FCH_JSON || "/tmp/opencode/fchallenger.json";
const CODES_OUT = process.env.FCH_CODES_OUT || "/tmp/opencode/fchallenger_codigos.txt";
const KEEP_EMAIL = "flaviocgarcia@gmail.com";
const LEVEL = { code: "FCH", slug: "challenger", name: "F CHALLENGER" };
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem O/0/I/1/L
const CODE_LENGTH = 8;

if (!process.argv.includes("--yes")) {
  console.error(
    "Isto APAGA todos os dados (partidas, perfis, usuários e níveis)\n" +
      "e reimporta a planilha F CHALLENGER. Confira o JSON de origem:\n" +
      `  ${JSON_PATH}\n` +
      "Rode de novo com --yes para executar.",
  );
  process.exit(1);
}
if (!existsSync(JSON_PATH)) {
  console.error(
    `JSON não encontrado: ${JSON_PATH}\n` +
      "Gere antes: python3.10 scripts/export_fchallenger.py",
  );
  process.exit(1);
}

loadEnv();
const admin = buildAdminClient();
const domain = loadChallengerDomain();
const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Lança em erro e devolve a RESPOSTA inteira (para ler .data e .count). */
const req = (res, label) => {
  if (res.error) throw new Error(`${label}: ${res.error.message}`);
  return res;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Código aleatório de 8 caracteres (mesmo alfabeto do /ativar). */
function randomCode() {
  const b = randomBytes(CODE_LENGTH);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

function randomPassword() {
  // 24 chars em base64url — nunca é divulgada; some na ativação.
  return randomBytes(18).toString("base64url");
}

function placeholderEmail(key) {
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}@fch.example.com`;
}

/** createUser com repetição em 429/erro transitório (GoTrue). */
async function createUserRetry(payload, label) {
  let last = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await admin.auth.admin.createUser(payload);
    if (!res.error) return res.data.user;
    last = res.error;
    const transient =
      res.error.status === 429 || res.error.status >= 500;
    if (!transient) break;
    await sleep(1500 * attempt);
  }
  throw new Error(`criar ${label}: ${last?.message ?? "falha desconhecida"}`);
}

async function listAllUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (res.error) throw new Error(res.error.message);
    out.push(...res.data.users);
    if (res.data.users.length < 200) break;
  }
  return out;
}

// ------------------------------------------------------------
// 1) WIPE
// ------------------------------------------------------------
console.log("1) Apagando dados antigos...");
{
  const m = req(
    await admin.from("matches").delete({ count: "exact" }).not("id", "is", null),
    "wipe matches",
  );
  const s = req(
    await admin
      .from("ranking_snapshots")
      .delete({ count: "exact" })
      .not("level_id", "is", null),
    "wipe snapshots",
  );
  const a = req(
    await admin.from("availability").delete({ count: "exact" }).not("id", "is", null),
    "wipe availability",
  );
  const i = req(
    await admin.from("invites").delete({ count: "exact" }).not("id", "is", null),
    "wipe invites",
  );
  console.log(
    `   partidas=${m.count} snapshots=${s.count} agenda=${a.count} convites=${i.count}`,
  );

  const users = await listAllUsers();
  let apagados = 0;
  for (const u of users) {
    if ((u.email ?? "").toLowerCase() === KEEP_EMAIL) continue;
    const res = await admin.auth.admin.deleteUser(u.id);
    if (res.error) throw new Error(`apagar ${u.email}: ${res.error.message}`);
    apagados++;
    if (apagados % 10 === 0) await sleep(200);
  }
  console.log(`   usuários do Auth removidos=${apagados} (mantida ${KEEP_EMAIL})`);

  const lv = req(
    await admin.from("levels").delete({ count: "exact" }).not("id", "is", null),
    "wipe levels",
  );
  console.log(`   níveis=${lv.count}`);
  if (m.count + s.count + a.count + i.count + apagados + lv.count === 0) {
    console.log("   (base já estava vazia)");
  }
}

// ------------------------------------------------------------
// 2) Nível F CHALLENGER
// ------------------------------------------------------------
console.log("2) Criando o nível F CHALLENGER...");
const levelId = req(
  await admin
    .from("levels")
    .insert({
      code: LEVEL.code,
      slug: LEVEL.slug,
      name: LEVEL.name,
      sort_order: 0,
      active: true,
      // Config de validação padrão (Normal). O motor do ranking ignora
      // esta coluna — os formatos vivem em src/lib/domain/challenger.ts.
      config: {
        setsToWin: 2,
        superTiebreak: { enabled: true, points: 10 },
        scoring: { winStraight: 300, winExtended: 200, loss: 50, deciderLoserPoint: true },
        tiebreakers: [],
      },
    })
    .select("id"),
  "criar nível",
).data[0].id;

// ------------------------------------------------------------
// 3) Atletas: contas placeholder + perfil do Flavio como admin
// ------------------------------------------------------------
console.log("3) Criando os 51 atletas (conta placeholder + convite)...");
const usersBefore = await listAllUsers();
const flavioAuth = usersBefore.find((u) => (u.email ?? "").toLowerCase() === KEEP_EMAIL);
if (!flavioAuth) throw new Error(`conta ${KEEP_EMAIL} não encontrada após o wipe`);

const profileIdByKey = new Map();
let placeholders = 0;

for (const athlete of data.athletes) {
  let userId;
  if (athlete.key === "FLAVIO GARCIA") {
    userId = flavioAuth.id;
    // Perfil: recriado/ajustado como administrador geral do torneio.
    const res = await admin
      .from("profiles")
      .update({
        email: KEEP_EMAIL,
        name: athlete.name,
        initials: "FG",
        role: "admin",
        level_id: levelId,
        active: true,
        pending_approval: false,
        must_change_password: false,
      })
      .eq("id", userId)
      .select("id");
    if (res.error || !res.data || res.data.length === 0) {
      // Sem perfil (edge): insere com o id do Auth.
      if (res.error) console.log(`   (sem perfil prévio do Flavio: ${res.error.message} — recriando)`);
      const ins = await admin.from("profiles").insert({
        id: userId,
        email: KEEP_EMAIL,
        name: athlete.name,
        initials: "FG",
        role: "admin",
        level_id: levelId,
        active: true,
        pending_approval: false,
      });
      if (ins.error) throw new Error(`perfil Flavio: ${ins.error.message}`);
    }
  } else {
    const user = await createUserRetry(
      {
        email: placeholderEmail(athlete.key),
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { name: athlete.name, fch_placeholder: true },
      },
      athlete.name,
    );
    userId = user.id;
    placeholders++;
    const res = await admin
      .from("profiles")
      .update({ pending_approval: false, level_id: levelId })
      .eq("id", userId);
    if (res.error) throw new Error(`aprovar placeholder ${athlete.name}: ${res.error.message}`);
    if (placeholders % 10 === 0) await sleep(150);
  }
  profileIdByKey.set(athlete.key, userId);
}
console.log(`   placeholders criados=${placeholders} + Flavio (admin)`);

// ------------------------------------------------------------
// 4) Convites (códigos de ativação)
// ------------------------------------------------------------
console.log("4) Gerando convites com códigos...");
const usedCodes = new Set();
const nowIso = new Date().toISOString();
const invites = data.athletes.map((athlete) => {
  let code = randomCode();
  while (usedCodes.has(code)) code = randomCode();
  usedCodes.add(code);
  const isFlavio = athlete.key === "FLAVIO GARCIA";
  return {
    name: athlete.name,
    phone: athlete.phone,
    ref_level: athlete.ref_level,
    activation_code: code,
    auth_user_id: profileIdByKey.get(athlete.key),
    consumed_at: isFlavio ? nowIso : null,
    activated_at: isFlavio ? nowIso : null,
  };
});
req(await admin.from("invites").insert(invites), "inserir convites");
console.log(`   convites=${invites.length}`);

// ------------------------------------------------------------
// 5) As 84 partidas da planilha (todas confirmadas)
// ------------------------------------------------------------
console.log("5) Importando partidas...");
{
  const rows = data.matches.map((m, i) => {
    const p1 = profileIdByKey.get(m.a_key);
    const p2 = profileIdByKey.get(m.b_key);
    if (!p1 || !p2) throw new Error(`partida ${i + 1}: atleta sem perfil (${m.a_key} / ${m.b_key})`);
    return {
      level_id: levelId,
      player1_id: p1,
      player2_id: p2,
      sets: m.sets,
      format: m.format,
      walkover_winner: null,
      status: "confirmed",
      played_on: m.date,
      source: "admin",
      external_ref: `fch-import-${String(i + 1).padStart(3, "0")}`,
      confirmed_by: profileIdByKey.get("FLAVIO GARCIA"),
      confirmed_at: nowIso,
    };
  });
  for (let i = 0; i < rows.length; i += 40) {
    req(await admin.from("matches").insert(rows.slice(i, i + 40)), `inserir partidas ${i}`);
  }
  const gs = rows.filter((r) => r.format === "grand_slam").length;
  console.log(`   partidas=${rows.length} (Grand Slam=${gs}, todas confirmadas)`);
}

// ------------------------------------------------------------
// 6) Contas de demonstração E2E (0 jogos — não aparecem na classificação)
// ------------------------------------------------------------
console.log("6) Contas de demonstração...");
for (const demo of [
  { name: "Admin Demo", email: "demo-admin@example.com", role: "admin" },
  { name: "Jogador Demo", email: "demo-player@example.com", role: "player" },
]) {
  const user = await createUserRetry(
    {
      email: demo.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: demo.name },
    },
    demo.email,
  );
  const res = await admin
    .from("profiles")
    .update({
      name: demo.name,
      initials: demo.role === "admin" ? "AD" : "JD",
      role: demo.role,
      level_id: levelId,
      active: true,
      pending_approval: false,
      must_change_password: false,
    })
    .eq("id", user.id);
  if (res.error) throw new Error(`perfil demo: ${res.error.message}`);
}
console.log(`   demo-admin / demo-player (senha ${DEMO_PASSWORD})`);

// ------------------------------------------------------------
// 7) Snapshot publicado (mesmo motor do app)
// ------------------------------------------------------------
console.log("7) Calculando e publicando a classificação...");
const players = req(
  await admin
    .from("profiles")
    .select("id, name, initials")
    .eq("level_id", levelId)
    .eq("active", true)
    .eq("pending_approval", false)
    .order("name", { ascending: true }),
  "jogadores",
).data;
const matchRows = req(
  await admin
    .from("matches")
    .select("id, player1_id, player2_id, sets, format, walkover_winner, played_on")
    .eq("level_id", levelId)
    .eq("status", "confirmed"),
  "partidas",
).data;
const { data: snap, invalid } = domain.computeChallengerSnapshot(players, matchRows);
if (invalid.length > 0) {
  throw new Error(`${invalid.length} partida(s) inválida(s) no domínio: ${invalid.join(", ")}`);
}
req(
  await admin
    .from("ranking_snapshots")
    .upsert({ level_id: levelId, data: snap, computed_at: snap.at }),
  "snapshot",
);

// ------------------------------------------------------------
// 8) Conferência contra o RANKING oficial da planilha
// ------------------------------------------------------------
const names = new Map(players.map((p) => [p.id, p]));
const rows = domain.toViewRows(domain.applyWindow(snap, domain.windowStart(today())), names);
const rowByKey = new Map(data.athletes.map((a) => [a.key, profileIdByKey.get(a.key)]));

let identicos = 0;
const diffs = [];
for (const off of data.official) {
  const row = rows.find((r) => r.id === rowByKey.get(off.key));
  if (row && row.pts === off.total && row.games === off.jgs) identicos++;
  else {
    diffs.push(
      `${off.name}: oficial=${off.total}/${off.jgs}g ` +
        `app=${row ? `${row.pts}/${row.games}g` : "ausente"}`,
    );
  }
}

// Violação histórica de limite por semestre (só informativo: a validação
// existe na server action de novos resultados, não retroage ao import).
const semi = (d) => `${d.slice(0, 4)}-S${Number(d.slice(5, 7)) <= 6 ? 1 : 2}`;
const pairCount = new Map();
for (const m of data.matches) {
  const k = [m.a_key, m.b_key].sort().join(" × ") + " @ " + semi(m.date);
  pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
}
const violacoes = [...pairCount.entries()].filter(([, n]) => n > 2);

// ------------------------------------------------------------
// 9) Códigos de ativação (arquivo pessoal, fora do repositório)
// ------------------------------------------------------------
const codeLines = invites.map((iv, idx) => {
  const a = data.athletes[idx];
  return `${a.name}\t${iv.activation_code}\t${a.phone ?? "-"}\t${a.ref_level ?? "-"}`;
});
writeFileSync(
  CODES_OUT,
  `F CHALLENGER — códigos de ativação (gerado ${nowIso})\n` +
    `ATLETA\tCÓDIGO\tTELEFONE\tNÍVEL PLANILHA\n` +
    codeLines.join("\n") +
    "\n",
);

console.log(`
============================================================
  IMPORTAÇÃO CONCLUÍDA
============================================================
  Nível:        ${LEVEL.name} (${LEVEL.slug})  id=${levelId}
  Atletas:      ${data.athletes.length} (placeholders=${placeholders} + Flavio admin)
  Convites:     ${invites.length} (códigos em ${CODES_OUT})
  Partidas:     ${data.matches.length} confirmadas (motor do app)
  Snapshot:     ${rows.length} jogador(es) na janela de 12 meses

  Conferência vs RANKING oficial da planilha:
    idênticos: ${identicos}/${data.official.length}
${diffs.length > 0 ? diffs.map((d) => `    divergência: ${d}`).join("\n") : "    (sem divergências)"}
${
  violacoes.length > 0
    ? `  Aviso: ${violacoes.length} par(es) acima de 2 partidas por semestre ` +
      "(histórico da planilha — mantido como está):\n" +
      violacoes.map(([k, n]) => `    ${k}: ${n}`).join("\n") + "\n"
    : ""
 }
  Próximos passos:
    - distribuir os códigos (WhatsApp) — veja ${CODES_OUT};
    - npm run build / deploy para atualizar as páginas públicas;
    - e-mail do Vitor: quando chegar, trocar o e-mail placeholder dele
      (ou ele ativa sozinho pelo código).
============================================================
`);
