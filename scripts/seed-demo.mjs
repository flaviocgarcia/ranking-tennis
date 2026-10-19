#!/usr/bin/env node
/**
 * ============================================================
 * MASSA DE TESTE (DEMO) — cria um superadmin genérico + jogadores
 * fictícios + resultados confirmados e publica os rankings.
 *
 *   npm run demo:seed      # cria (ou recria) a massa de teste
 *   npm run demo:reset     # remove tudo que foi criado
 *
 * Nada aqui é permanente: o reset apaga SOMENTE e-mails `demo-*` e
 * partidas com `external_ref` `demo-*`. Seus dados reais não são tocados.
 *
 * Detalhes: docs/demo-data.md
 * ============================================================
 */
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_EMAIL_PREFIX,
  DEMO_MATCH_REF_PREFIX,
  DEMO_PASSWORD,
  buildAdminClient,
  cleanupDemo,
  initialsOf,
  loadComputeRanking,
  loadEnv,
  mapWithConcurrency,
  slugifyName,
} from "./_demo-shared.mjs";

loadEnv();
const admin = buildAdminClient();
const computeRanking = loadComputeRanking();

const SUPERADMIN = { name: "Super Admin (demo)", email: `${DEMO_EMAIL_PREFIX}admin@${DEMO_EMAIL_DOMAIN}` };

/** Jogadores por nível (na ordem dos níveis ativos: A, B, C, D...). */
const PLAYERS_BY_LEVEL = [
  ["Rafael Almeida", "Bruno Carvalho", "Diego Nunes", "Eduardo Pires", "Felipe Moraes", "Gustavo Rocha"],
  ["Henrique Dias", "Igor Bastos", "João Pedro Lima", "Kaique Ferreira"],
  ["Marcelo Vieira", "Nelson Aguiar", "Otávio Ramos", "Paulo Sérgio"],
  ["Sérgio Tavares", "Thiago Mendes", "Vitor Hugo", "Wesley Costa"],
];

// ------------------------------------------------------------
// Placar válidos segundo a config padrão (2 sets + tiebreakão de 10).
// O vencedor é sempre o primeiro; a ordem é invertida quando o sorteio
// define o jogador 2 como vencedor.
// ------------------------------------------------------------
const SCORES = {
  straight: [
    [[6, 0], [6, 2]],
    [[6, 2], [6, 4]],
    [[6, 4], [6, 3]],
    [[7, 5], [6, 4]],
    [[6, 1], [6, 3]],
  ],
  extended: [
    [[6, 4], [4, 6], [10, 7]],
    [[4, 6], [6, 3], [10, 8]],
    [[6, 7], [6, 4], [10, 6]],
    [[6, 3], [3, 6], [12, 10]],
  ],
};

/** PRNG determinístico (mesma massa em toda execução). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function daysAgoISO(days) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function dateAgo(days) {
  return daysAgoISO(days).slice(0, 10);
}

// ------------------------------------------------------------
// 1) Níveis existentes (seed.sql cria A, B, C, D).
// ------------------------------------------------------------
const levelsRes = await admin
  .from("levels")
  .select("id, code, slug, name, config, sort_order")
  .eq("active", true)
  .order("sort_order", { ascending: true });
if (levelsRes.error) throw new Error(levelsRes.error.message);
const levels = levelsRes.data ?? [];
if (levels.length === 0) {
  console.error(
    "Nenhum nível ativo encontrado. Aplique supabase/seed.sql (ou crie os níveis no painel) e rode de novo.",
  );
  process.exit(1);
}

console.log("Limpando massa anterior (se houver)...");
await cleanupDemo(admin, { log: (m) => console.log("  " + m) });

// ------------------------------------------------------------
// 2) Superadmin + jogadores.
// ------------------------------------------------------------
async function createUser({ name, email, role = "player", levelId = null, adminLevelId = null, mustChange = false, pending = false }) {
  const created = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name, initials: initialsOf(name) },
  });
  if (created.error) throw new Error(`Falha ao criar ${email}: ${created.error.message}`);
  const id = created.data.user.id;

  const updated = await admin
    .from("profiles")
    .update({
      name,
      initials: initialsOf(name),
      role,
      level_id: levelId,
      admin_level_id: adminLevelId,
      active: true,
      must_change_password: mustChange,
      // Usuários criados pelo administrador já nascem aprovados; o "pendente"
      // abaixo simula um auto-cadastro aguardando aprovação.
      pending_approval: pending,
    })
    .eq("id", id);
  if (updated.error) throw new Error(`Falha ao ajustar perfil ${email}: ${updated.error.message}`);

  return { id, name, email, levelId };
}

const superadmin = await createUser({
  name: SUPERADMIN.name,
  email: SUPERADMIN.email,
  role: "admin",
  levelId: null,
});

const players = [];
for (let i = 0; i < levels.length; i++) {
  const names = PLAYERS_BY_LEVEL[i] ?? [];
  const level = levels[i];
  const created = await mapWithConcurrency(names, 4, (name) =>
    createUser({ name, email: `${DEMO_EMAIL_PREFIX}${slugifyName(name)}@${DEMO_EMAIL_DOMAIN}`, levelId: level.id }),
  );
  for (const p of created) players.push({ ...p, levelSlug: level.slug });
  console.log(`  Nível ${level.code}: ${names.length} jogador(es).`);
}

// Administrador SOMENTE do nível B — e que também joga nesse nível.
// Testa: vários administradores, escopo de nível e admin jogando.
const scopedLevel = levels[1] ?? levels[0];
const scopedAdmin = await createUser({
  name: "Administrador Nível B (demo)",
  email: `${DEMO_EMAIL_PREFIX}admin-b@${DEMO_EMAIL_DOMAIN}`,
  role: "admin",
  levelId: scopedLevel.id,
  adminLevelId: scopedLevel.id,
});
players.push({ ...scopedAdmin, levelSlug: scopedLevel.slug });
console.log(`  Administrador restrito ao nível ${scopedLevel.code} (também joga nele).`);

// Auto-cadastro pendente: entra no sistema, mas só participa após aprovação.
const pendingPlayer = await createUser({
  name: "Cadastro Pendente (demo)",
  email: `${DEMO_EMAIL_PREFIX}pendente@${DEMO_EMAIL_DOMAIN}`,
  levelId: scopedLevel.id,
  pending: true,
});
console.log("  Auto-cadastro PENDENTE de aprovação (nível " + scopedLevel.code + ").");

// ------------------------------------------------------------
// 3) Resultados confirmados (todos contra todos) + 1 pendente por nível.
// ------------------------------------------------------------
const matches = [];
let day = 0;
for (const level of levels) {
  const roster = players.filter((p) => p.levelId === level.id);
  if (roster.length < 2) continue;
  const rand = mulberry32(seedFrom(level.slug));

  let ref = 0;
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i];
      const b = roster[j];
      const aWins = rand() < 0.5;
      const winner = aWins ? a : b;
      const loser = aWins ? b : a;
      const template = pick(rand, rand() < 0.65 ? SCORES.straight : SCORES.extended);
      // O template é escrito com o vencedor em primeiro; inverte quando preciso.
      const sets = aWins ? template : template.map(([x, y]) => [y, x]);
      const playedDays = day++ * 2 + Math.floor(rand() * 3);

      matches.push({
        level_id: level.id,
        player1_id: a.id,
        player2_id: b.id,
        sets,
        status: "confirmed",
        reported_by: winner.id,
        confirmed_by: superadmin.id,
        confirmed_at: daysAgoISO(playedDays),
        played_on: dateAgo(playedDays),
        source: "admin",
        external_ref: `${DEMO_MATCH_REF_PREFIX}${level.slug}-${++ref}`,
      });
    }
  }

  // Uma partida pendente por nível, para testar a confirmação no painel.
  matches.push({
    level_id: level.id,
    player1_id: roster[0].id,
    player2_id: roster[roster.length - 1].id,
    sets: SCORES.straight[0],
    status: "pending",
    reported_by: roster[0].id,
    played_on: dateAgo(1),
    source: "web",
    external_ref: `${DEMO_MATCH_REF_PREFIX}${level.slug}-pending`,
  });
}

const inserted = await admin.from("matches").insert(matches).select("id, level_id, player1_id, player2_id, sets, status");
if (inserted.error) throw new Error(inserted.error.message);
const confirmed = (inserted.data ?? []).filter((m) => m.status === "confirmed");
console.log(`Inseridas ${inserted.data?.length ?? 0} partidas (${confirmed.length} confirmadas).`);

// ------------------------------------------------------------
// 4) Recalcula e publica o ranking de cada nível (mesma função do app).
// ------------------------------------------------------------
for (const level of levels) {
  const roster = players
    .filter((p) => p.levelId === level.id)
    .map((p) => ({ id: p.id, name: p.name, initials: initialsOf(p.name) }))
    .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));

  const levelMatches = confirmed
    .filter((m) => m.level_id === level.id)
    .map((m) => ({ id: m.id, player1_id: m.player1_id, player2_id: m.player2_id, sets: m.sets }));

  const { entries } = computeRanking(roster, levelMatches, level.config);

  const saved = await admin.from("ranking_snapshots").upsert({
    level_id: level.id,
    data: { entries, mc: levelMatches.length, at: new Date().toISOString() },
    computed_at: new Date().toISOString(),
  });
  if (saved.error) throw new Error(saved.error.message);

  const leader = entries[0];
  const leaderName = leader ? roster.find((p) => p.id === leader.id)?.name : "-";
  console.log(`  Ranking ${level.code}: ${entries.length} jogador(es), líder ${leaderName} (${leader?.pts ?? 0} pts).`);
}

console.log(`
============================================================
  MASSA DE TESTE CRIADA
============================================================
  SUPERADMIN
    E-mail: ${SUPERADMIN.email}
    Senha:  ${DEMO_PASSWORD}
    (acesse /login e depois /admin)

  JOGADORES (${players.length}) — todos com a mesma senha: ${DEMO_PASSWORD}
${players.map((p) => `    ${p.email.padEnd(46)} ${p.name} (nível ${p.levelSlug.toUpperCase()})`).join("\n")}

  ADMINISTRADOR DE NÍVEL
    ${scopedAdmin.email.padEnd(46)} ${scopedAdmin.name} (somente nível ${scopedLevel.code}, também joga)

  AUTO-CADASTRO PENDENTE (teste de aprovação em /admin/players?pending=1)
    ${pendingPlayer.email.padEnd(46)} ${pendingPlayer.name} (nível ${scopedLevel.code}, aguardando aprovação)

  Rankings publicados em /rankings/a, /rankings/b, /rankings/c, /rankings/d
  Para apagar tudo:  npm run demo:reset
============================================================
`);
