#!/usr/bin/env node
/**
 * Demonstração em vídeo do Ranking de Tênis.
 *
 * Pipeline: narração (Piper, voz pt-BR) → gravação das cenas (Playwright)
 * → legenda queimada no rodapé + trilha de áudio (ffmpeg) → MP4 final.
 *
 * Uso:
 *   node scripts/demo-video/build.mjs                # grava e monta o vídeo final
 *   node scripts/demo-video/build.mjs --dry          # só valida seletores (sem TTS/vídeo)
 *   node scripts/demo-video/build.mjs --only=jogador # grava apenas uma cena
 *   node scripts/demo-video/build.mjs --cleanup      # remove os dados criados pela demo
 *
 * Pré-requisitos: app no ar (npm run dev ou build+start), Playwright
 * instalado, Piper + voz pt_BR e ffmpeg estático em ~/.local/video-demo
 * (ver scripts/demo-video/README.md).
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CENARIOS, ATOS, BASE, CONTAS, CONVITE, CTX } from "./narrativa.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(HERE, "out");
const CACHE = path.join(HERE, "cache", "tts");
const TOOLS = path.join(os.homedir(), ".local", "video-demo");
const PIPER = path.join(TOOLS, "piper", "piper");
const MODEL = path.join(TOOLS, "models", "pt_BR-faber-medium.onnx");
const FFMPEG = path.join(TOOLS, "ffmpeg", "bin", "ffmpeg");
const FFPROBE = path.join(TOOLS, "ffmpeg", "bin", "ffprobe");
const FONTDIR = "/usr/share/fonts/truetype/dejavu";
const FINAL_DIR = path.join(ROOT, "demo-video");
const FINAL_MP4 = path.join(FINAL_DIR, "fchallenger-demonstracao.mp4");
const FINAL_SRT = path.join(FINAL_DIR, "legendas.srt");
/** Vídeos por persona (gerados do mesmo conjunto de cenas). */
const ACT_MP4 = (ato) => path.join(FINAL_DIR, `fchallenger-${ato}.mp4`);
const ACT_SRT = (ato) => path.join(FINAL_DIR, `legendas-${ato}.srt`);
/** Backup do banco gravado antes de qualquer mutação da demo. */
const BACKUP_FILE = path.join(OUT, "backup.json");
/** Sessão (cookies) persistida entre cenas — cada cena usa um contexto novo. */
const STATE_FILE = path.join(OUT, "storage-state.json");
/** Cenas que abrem sessão própria (contexto sempre limpo antes do login). */
const CENAS_LOGIN = new Set(["jog-login", "adm-login"]);

const LENGTH_SCALE = "1.08"; // fala um pouco mais devagar, para apresentação
const TAIL = 1.6; // silêncio final de cada cena
const VIEW = { width: 1280, height: 800 };

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const CLEANUP_ONLY = args.includes("--cleanup");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

// ───────────────────────────────────────────────── utilidades

const log = (...a) => console.log(...a);

function run(bin, argv, opts = {}) {
  const r = spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 1 << 26, ...opts });
  if (r.status !== 0) {
    throw new Error(
      `comando falhou: ${path.basename(bin)} ${argv.join(" ")}\n${(r.stderr || r.stdout || "").slice(-1500)}`,
    );
  }
  return r;
}

function probeDuration(file) {
  const r = spawnSync(
    FFPROBE,
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  const v = parseFloat(String(r.stdout).trim());
  if (!Number.isFinite(v)) throw new Error(`ffprobe não leu duração de ${file}`);
  return v;
}

function sampleRateOf(file) {
  const r = spawnSync(
    FFPROBE,
    ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  const v = parseInt(String(r.stdout).trim(), 10);
  if (!Number.isFinite(v)) throw new Error(`ffprobe não leu sample rate de ${file}`);
  return v;
}

function loadEnvFile() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

function supabaseAdmin() {
  const env = loadEnvFile();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env.local");
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ───────────────────────────────────────────────── narração (TTS)

function tts(text) {
  const hash = crypto.createHash("sha1").update(`${LENGTH_SCALE}|${text}`).digest("hex").slice(0, 16);
  const file = path.join(CACHE, `${hash}.wav`);
  if (!fs.existsSync(file)) {
    run(PIPER, ["--model", MODEL, "--output_file", file, "--length_scale", LENGTH_SCALE], {
      input: text,
    });
    if (!fs.existsSync(file)) throw new Error(`TTS não gerou áudio para: ${text}`);
  }
  return { file, dur: probeDuration(file) };
}

function silenceWav(seconds, sr, file) {
  run(FFMPEG, [
    "-y", "-f", "lavfi", "-i", `anullsrc=r=${sr}:cl=mono`,
    "-t", seconds.toFixed(3), "-c:a", "pcm_s16le", file,
  ]);
}

function buildSceneAudio(sceneId, lineFiles, durations, start, destFile) {
  const sr = sampleRateOf(lineFiles[0]);
  const tmp = path.join(OUT, "tmp-audio");
  fs.mkdirSync(tmp, { recursive: true });
  const segments = [];
  // silêncio inicial até a primeira fala
  silenceWav(Math.max(0.3, start[0]), sr, path.join(tmp, `${sceneId}-s0.wav`));
  segments.push(path.join(tmp, `${sceneId}-s0.wav`));
  lineFiles.forEach((f, i) => {
    segments.push(f);
    const gap =
      i < lineFiles.length - 1
        ? start[i + 1] - (start[i] + durations[i])
        : TAIL;
    const g = path.join(tmp, `${sceneId}-s${i + 1}.wav`);
    silenceWav(Math.max(0.3, gap), sr, g);
    segments.push(g);
  });
  const list = path.join(tmp, `${sceneId}-list.txt`);
  fs.writeFileSync(list, segments.map((s) => `file '${s}'`).join("\n") + "\n");
  run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-ar", String(sr), "-ac", "1", "-c:a", "pcm_s16le", destFile]);
}

// ───────────────────────────────────────────────── legendas (.ass)

function assTime(sec) {
  const totalCs = Math.max(0, Math.round(sec * 100));
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${h}:${p2(m)}:${p2(s)}.${p2(cs)}`;
}

const cleanAss = (t) => t.replace(/[\\{}]/g, "").replace(/\s+/g, " ").trim();

/** Fala pode ser texto estático ou função (narração com valores do CTX). */
const falaTexto = (f) => (typeof f.texto === "function" ? f.texto() : f.texto);

function writeAss(scene, start, end, durations, file) {
  const out = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1280",
    "PlayResY: 800",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // borda = preenchimento da caixa (BorderStyle 3)
    "Style: Legenda,DejaVu Sans,31,&H00FFFFFF,&H00FFFFFF,&H00101010,&H8C000000,0,0,0,0,100,100,0,0,3,12,0,2,90,90,34,1",
    "Style: Titulo,DejaVu Sans,36,&H00FFFFFF,&H00FFFFFF,&H00101010,&HA04B7A15,1,0,0,0,100,100,0,0,3,16,0,8,90,90,30,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  // banner de título do cenário (topo) nos primeiros segundos
  const titleEnd = Math.min(Math.max(5.5, start[0] + durations[0]), end[0] + 2.5);
  out.push(`Dialogue: 0,${assTime(0)},${assTime(titleEnd)},Titulo,,0,0,0,,${cleanAss(scene.nome)}`);
  // legendas das falas (rodapé)
  scene.falas.forEach((f, i) => {
    out.push(
      `Dialogue: 0,${assTime(start[i])},${assTime(end[i] + 0.3)},Legenda,,0,0,0,,${cleanAss(falaTexto(f))}`,
    );
  });
  fs.writeFileSync(file, out.join("\n") + "\n");
}

function writeSrt(cues, file) {
  const p3 = (n) => String(n).padStart(3, "0");
  const p2 = (n) => String(n).padStart(2, "0");
  const fmt = (sec) => {
    const ms = Math.max(0, Math.round(sec * 1000));
    const msr = ms % 1000;
    const t = Math.floor(ms / 1000);
    return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)},${p3(msr)}`;
  };
  const body = cues
    .map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`)
    .join("\n");
  fs.writeFileSync(file, body);
}

// ───────────────────────────────────────────────── setup / cleanup

async function ensureServer() {
  try {
    const r = await fetch(BASE + "/", { redirect: "manual" });
    if (!r.ok) throw new Error("status " + r.status);
  } catch (e) {
    throw new Error(`app não respondeu em ${BASE} (suba com "npm run dev" ou build+start): ${e.message}`);
  }
}

/** "2026-10-18" → "18/10/2026" (formato exibido nas tabelas do painel). */
function dataBR(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

async function setup(scenes) {
  const db = supabaseAdmin();
  const cenas = new Set(scenes.map((s) => s.id));

  const { data: levels, error: levErr } = await db
    .from("levels")
    .select("id, slug")
    .eq("active", true);
  if (levErr) throw new Error(levErr.message);
  const level =
    (levels ?? []).find((l) => l.slug === "challenger") ?? (levels ?? [])[0];
  if (!level) throw new Error("nível do torneio não encontrado");
  CTX.levelId = level.id;

  // Perfis do clube (nomes reais) e as duas contas demo.
  const { data: profiles } = await db.from("profiles").select("*");
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const demoPlayer = (profiles ?? []).find((p) => p.email === CONTAS.jogador.email);
  const demoAdmin = (profiles ?? []).find((p) => p.email === CONTAS.admin.email);
  if (!demoPlayer || !demoAdmin) {
    throw new Error("contas demo não encontradas (rode npm run demo:seed)");
  }
  CTX.jogadorId = demoPlayer.id;

  // Ranking publicado (janela de 12 meses) — mesma leitura do app.
  const { data: snapRow } = await db
    .from("ranking_snapshots")
    .select("data")
    .eq("level_id", level.id)
    .maybeSingle();
  const linhas = rankingAtual(snapRow?.data, byId);
  if (linhas.length < 4) {
    throw new Error("ranking publicado pequeno demais para a demonstração");
  }
  const porId = new Map(linhas.map((r) => [r.id, r]));
  CTX.topNome = linhas[0].nome;
  CTX.jogosNoRanking = linhas.length;
  CTX.dataHoje = dataBR(hojeISO());
  log(`  ranking: ${linhas.length} atletas · líder ${linhas[0].nome} (${linhas[0].pts} pts)`);

  // Quem aparece nas 60 partidas mais recentes de /results (a página pública
  // traz apenas as mais novas — o adversário precisa estar lá).
  const { data: recentes } = await db
    .from("matches")
    .select("player1_id, player2_id")
    .eq("status", "confirmed")
    .order("played_on", { ascending: false })
    .limit(60);
  const noResults = new Set();
  for (const m of recentes ?? []) {
    noResults.add(m.player1_id);
    noResults.add(m.player2_id);
  }

  // Restrições do dia: quem já joga hoje e contagem por semestre (limite de 2
  // partidas contra o MESMO adversário) — usadas para escolher o par do
  // lançamento do admin e o adversário da demonstração.
  const jogouHoje = new Set();
  const { data: hojeRows } = await db
    .from("matches")
    .select("player1_id, player2_id")
    .eq("played_on", hojeISO());
  for (const m of hojeRows ?? []) {
    jogouHoje.add(m.player1_id);
    jogouHoje.add(m.player2_id);
  }
  const { data: semestre } = await db
    .from("matches")
    .select("player1_id, player2_id")
    .gte("played_on", semestreInicio())
    .neq("status", "rejected");
  const contagem = new Map();
  for (const m of semestre ?? []) {
    const k = parOrdenado(m.player1_id, m.player2_id);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }

  const reais = linhas.filter(
    (r) => r.id !== demoPlayer.id && r.id !== demoAdmin.id,
  );

  // Par do lançamento do admin: dois atletas reais livres hoje e sem
  // contagem no semestre (o vídeo salva a partida como pendente).
  let par = null;
  busca: for (let i = 0; i < reais.length; i++) {
    for (let j = i + 1; j < reais.length; j++) {
      const [a, b] = [reais[i], reais[j]];
      if (jogouHoje.has(a.id) || jogouHoje.has(b.id)) continue;
      if ((contagem.get(parOrdenado(a.id, b.id)) ?? 0) > 0) continue;
      par = [a, b];
      break busca;
    }
  }
  if (!par) throw new Error("sem par de atletas livres para o lançamento do admin");
  CTX.lancarP1Id = par[0].id;
  CTX.lancarP2Id = par[1].id;
  CTX.lancarP1 = par[0].nome;
  CTX.lancarP2 = par[1].nome;

  // Adversário da demonstração: quem sobe mais na tabela somando 300 pontos
  // (vitória por 2 a 0 sobre o Jogador Demo), entre os que aparecem no
  // /results público.
  let melhor = null;
  for (const c of reais) {
    if (c.id === par[0].id || c.id === par[1].id) continue;
    if (!noResults.has(c.id) || jogouHoje.has(c.id)) continue;
    const depois = aplicarPosicoes(
      linhas.map((r) => (r.id === c.id ? { ...r, pts: r.pts + 300 } : r)),
    );
    const meuDepois = depois.find((r) => r.id === c.id);
    const acima = depois[depois.indexOf(meuDepois) - 1];
    const passou = acima && porId.get(acima.id).pos < c.pos ? acima.nome : "";
    const ganho = c.pos - meuDepois.pos;
    const score = ganho * 10 + (passou ? 5 : 0);
    if (!melhor || score > melhor.score) {
      melhor = { candidato: c, meuDepois, passou, score };
    }
  }
  if (!melhor) throw new Error("sem adversário para a demonstração");
  CTX.adversarioId = melhor.candidato.id;
  CTX.adversario = melhor.candidato.nome;
  CTX.advPtsAntes = melhor.candidato.pts;
  CTX.advPosAntes = melhor.candidato.pos;
  CTX.advPtsDepois = melhor.meuDepois.pts;
  CTX.advPosDepois = melhor.meuDepois.pos;
  CTX.ultrapassado = melhor.passou ?? "";
  log(
    `  adversário: ${CTX.adversario} (${CTX.advPtsAntes} pts · pos ${CTX.advPosAntes}` +
      ` → ${CTX.advPtsDepois} pts · pos ${CTX.advPosDepois}` +
      `${CTX.ultrapassado ? ` · ultrapassa ${CTX.ultrapassado}` : ""})`,
  );

  // Backup completo do que a demo pode tocar: o restore devolve o banco ao
  // estado exato pré-gravação — inclusive se a execução cair no meio.
  const backup = {
    ts: new Date().toISOString(),
    ctx: {
      demoPlayerId: demoPlayer.id,
      lancarP1Id: CTX.lancarP1Id,
      lancarP2Id: CTX.lancarP2Id,
      hoje: hojeISO(),
      levelId: level.id,
      conviteNome: CONVITE.nome,
    },
    matches: (await db.from("matches").select("*")).data ?? [],
    invites: (await db.from("invites").select("*")).data ?? [],
    profiles: (await db.from("profiles").select("*")).data ?? [],
    snapshots: (await db.from("ranking_snapshots").select("*")).data ?? [],
  };
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup));
  log(
    `  backup gravado: ${backup.matches.length} partidas · ` +
      `${backup.invites.length} convites · ${backup.profiles.length} perfis`,
  );

  // Sobras de execuções anteriores: tudo que a demo cria é removível por
  // marcador (external_ref demo-video-*, convite pelo nome, pendências do
  // jogador demo — que nunca teve partidas reais).
  await db.from("matches").delete().like("external_ref", "demo-video-%");
  await db
    .from("matches")
    .delete()
    .eq("reported_by", demoPlayer.id)
    .eq("status", "pending");
  await db.from("invites").delete().eq("name", CONVITE.nome);

  // Convite de demonstração usado na tela /ativar do ato público.
  const { error: convErr } = await db.from("invites").insert({
    name: CONVITE.nome,
    activation_code: CONVITE.codigo,
  });
  if (convErr) throw new Error("criar convite demo: " + convErr.message);

  // Sem a cena do jogador no run, a pendência do impacto é criada direto (o
  // mesmo resultado que a UI gravaria); com a cena, a UI cria durante a
  // gravação e o setup apenas limpou sobras acima.
  if (!cenas.has("jog-novo")) {
    const { error } = await db.from("matches").insert({
      level_id: level.id,
      player1_id: demoPlayer.id,
      player2_id: CTX.adversarioId,
      sets: [[3, 6], [4, 6]],
      status: "pending",
      reported_by: demoPlayer.id,
      played_on: hojeISO(),
      source: "web",
      format: "normal",
      external_ref: "demo-video-impacto",
    });
    if (error) throw new Error("criar pendência demo: " + error.message);
    log("  pendência demo criada (cena do jogador fora do run):", CTX.adversario);
  }

  return db;
}

/**
 * Restaura o banco ao backup gravado no setup: remove o que a demo criou,
 * devolve o que mudou (status, etiquetas, códigos) e repõe o snapshot
 * publicado exatamente como estava.
 */
async function restore(db) {
  if (!fs.existsSync(BACKUP_FILE)) {
    log("  sem backup.json — removendo apenas os marcadores demo...");
    await db.from("matches").delete().like("external_ref", "demo-video-%");
    await db.from("invites").delete().eq("name", CONVITE.nome);
    return;
  }
  const bk = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf8"));
  const ctx = bk.ctx;

  // 1) partidas: remove as criadas pela demo e devolve as alteradas
  const bkMatches = new Map(bk.matches.map((m) => [m.id, m]));
  const { data: atuais } = await db.from("matches").select("*");
  const remover = [];
  for (const m of atuais ?? []) {
    const original = bkMatches.get(m.id);
    if (!original) {
      const marcada = (m.external_ref ?? "").startsWith("demo-video-");
      const doDemo =
        m.player1_id === ctx.demoPlayerId || m.player2_id === ctx.demoPlayerId;
      const doAdmin =
        m.played_on === ctx.hoje &&
        [m.player1_id, m.player2_id].includes(ctx.lancarP1Id) &&
        [m.player1_id, m.player2_id].includes(ctx.lancarP2Id);
      if (marcada || doDemo || doAdmin) remover.push(m.id);
      continue;
    }
    const diff = diffCampos(m, original);
    if (Object.keys(diff).length > 0) {
      const { error } = await db.from("matches").update(diff).eq("id", m.id);
      if (error) throw new Error(error.message);
      log("  partida restaurada:", m.id);
    }
  }
  if (remover.length > 0) {
    const { error } = await db.from("matches").delete().in("id", remover);
    if (error) throw new Error(error.message);
    log(`  ${remover.length} partida(s) da demo removida(s).`);
  }

  // 2) convites: remove os criados e devolve os alterados (regeneração)
  const bkInv = new Map(bk.invites.map((i) => [i.id, i]));
  const { data: convAtuais } = await db.from("invites").select("*");
  const convRemover = [];
  for (const i of convAtuais ?? []) {
    const original = bkInv.get(i.id);
    if (!original) {
      convRemover.push(i.id);
      continue;
    }
    const diff = diffCampos(i, original);
    if (Object.keys(diff).length > 0) {
      const { error } = await db.from("invites").update(diff).eq("id", i.id);
      if (error) throw new Error(error.message);
      log("  convite restaurado:", original.name);
    }
  }
  if (convRemover.length > 0) {
    const { error } = await db.from("invites").delete().in("id", convRemover);
    if (error) throw new Error(error.message);
    log(`  ${convRemover.length} convite(s) da demo removido(s).`);
  }

  // 3) perfis: etiqueta A–D, nome, código do Telegram etc.
  const bkProf = new Map(bk.profiles.map((p) => [p.id, p]));
  const { data: profAtuais } = await db.from("profiles").select("*");
  for (const p of profAtuais ?? []) {
    const original = bkProf.get(p.id);
    if (!original) continue;
    const diff = diffCampos(p, original);
    if (Object.keys(diff).length > 0) {
      const { error } = await db.from("profiles").update(diff).eq("id", p.id);
      if (error) throw new Error(error.message);
      log("  perfil restaurado:", original.name, `(${Object.keys(diff).join(", ")})`);
    }
  }

  // 4) snapshot publicado — reposto exatamente como estava pré-demo
  for (const s of bk.snapshots ?? []) {
    const { error } = await db
      .from("ranking_snapshots")
      .upsert(
        { level_id: s.level_id, data: s.data, computed_at: s.computed_at },
        { onConflict: "level_id" },
      );
    if (error) throw new Error(error.message);
  }
  log("  snapshot da classificação reposto ao estado pré-demo.");

  // 5) conferência final: nenhuma sobra demo no banco
  const { data: restantes } = await db
    .from("matches")
    .select("id, status")
    .or(
      `external_ref.like.demo-video-%,reported_by.eq.${ctx.demoPlayerId}`,
    );
  if ((restantes ?? []).length > 0) {
    log(`  ⚠ ${restantes.length} partida(s) demo ainda no banco — verifique.`);
  } else {
    log("  conferência: nenhuma partida demo restante.");
  }
}

/** Diferença de colunas entre a linha atual e a do backup (ignora updated_at). */
function diffCampos(atual, original) {
  const diff = {};
  for (const c of Object.keys(original)) {
    if (c === "updated_at" || c === "id") continue;
    if (JSON.stringify(atual[c] ?? null) !== JSON.stringify(original[c] ?? null)) {
      diff[c] = original[c];
    }
  }
  return diff;
}

/** Ranking em ordem de pontos (empate = mesma posição, ex.: 1, 2, 2, 4). */
function aplicarPosicoes(rows) {
  const arr = rows
    .slice()
    .sort((a, b) => b.pts - a.pts || a.nome.localeCompare(b.nome, "pt-BR"));
  let lastPts = null;
  let lastPos = 0;
  arr.forEach((r, i) => {
    if (r.pts === lastPts) r.pos = lastPos;
    else {
      r.pos = i + 1;
      lastPts = r.pts;
      lastPos = r.pos;
    }
  });
  return arr;
}

/**
 * Ranking publicado aplicando a janela de 12 meses (mesma leitura do app).
 * `snapData` é o jsonb do snapshot; `byId` mapeia profiles por id.
 */
function rankingAtual(snapData, byId) {
  const inicio = janelaInicio();
  const base = [];
  for (const p of snapData?.players ?? []) {
    const prof = byId.get(p.id);
    if (!prof || !prof.active || prof.pending_approval) continue;
    const g = (p.g ?? []).filter(([d]) => d >= inicio);
    if (g.length === 0) continue;
    base.push({
      id: p.id,
      nome: prof.name,
      pts: g.reduce((a, [, v]) => a + v, 0),
      jogos: g.length,
    });
  }
  return aplicarPosicoes(base);
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

/** Início da janela de 12 meses e do semestre corrente (datas ISO). */
function janelaInicio() {
  const h = hojeISO();
  return `${Number(h.slice(0, 4)) - 1}${h.slice(4)}`;
}
function semestreInicio() {
  const h = hojeISO();
  return Number(h.slice(5, 7)) >= 7
    ? `${h.slice(0, 4)}-07-01`
    : `${h.slice(0, 4)}-01-01`;
}

const parOrdenado = (a, b) => [a, b].sort().join("|");

// ───────────────────────────────────────────────── Playwright

async function waitForHydrated(page, locator, timeout = 60000) {
  const first = locator.first();
  const el = await first.elementHandle({ timeout: 60000 });
  await page.waitForFunction(
    (node) =>
      !!node &&
      Object.keys(node).some(
        (k) => k.startsWith("__reactProps$") || k.startsWith("__reactFiber$"),
      ),
    el,
    { timeout },
  );
  return first;
}

function makeHelpers(page, scene) {
  const h = {
    async card() {
      const q = new URLSearchParams({
        k: scene.card.kicker,
        t: scene.card.titulo,
        s: scene.card.subtitulo,
        b: scene.card.itens.join(";;"),
      });
      await page.goto(`file://${path.join(HERE, "assets", "card.html")}?${q.toString()}`, {
        waitUntil: "load",
        timeout: 60000,
      });
      await page.locator("#titulo").waitFor({ timeout: 30000 });
    },
    async goto(route) {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.locator("h1").first().waitFor({ timeout: 60000 });
    },
    async hyd(locator) {
      return waitForHydrated(page, locator);
    },
    async click(locator) {
      const el = locator.first();
      await el.waitFor({ state: "visible", timeout: 60000 });
      // Componentes de cliente precisam de hidratação; links e forms renderizados
      // no servidor não expõem props do React — nesse caso, clique direto.
      try {
        await waitForHydrated(page, el, 20000);
      } catch {
        /* servidor-renderizado: clique nativo */
      }
      await el.click();
    },
    /**
     * Clica e espera o elemento desaparecer (linhas que saem da lista após a
     * ação). Reclica se a primeira tentativa cair numa corrida de hidratação.
     */
    async clickUntilDetached(locator, timeout = 75000) {
      const el = locator.first();
      const deadline = Date.now() + timeout;
      let lastError = null;
      while (Date.now() < deadline) {
        try {
          await h.click(el);
        } catch (e) {
          lastError = e;
        }
        try {
          await el.waitFor({ state: "detached", timeout: 10000 });
          return;
        } catch (e) {
          lastError = e;
        }
      }
      throw new Error(
        `elemento não desapareceu após o clique: ${lastError?.message?.split("\\n")[0] ?? "?"}`,
      );
    },
    async login(email, senha) {
      let motivo = "";
      for (let attempt = 1; attempt <= 4; attempt++) {
        await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 90000 });
        await waitForHydrated(page, page.locator("form"));
        await page.getByLabel("E-mail").fill(email);
        await page.getByLabel("Senha").fill(senha);
        await waitForHydrated(page, page.getByRole("button", { name: "Entrar" }));
        await page.getByRole("button", { name: "Entrar" }).click();
        try {
          await page.waitForURL("**/app", { timeout: 25000 });
          await page.locator("h1").first().waitFor({ timeout: 60000 });
          return;
        } catch {
          const alerta = await page
            .locator(".alert-error")
            .first()
            .textContent()
            .catch(() => null);
          motivo = (alerta ?? "").replace(/\s+/g, " ").trim();
          log(
            `    login tentativa ${attempt} falhou (${email}); url=${page.url()}` +
              (motivo ? ` · aviso na tela: ${motivo}` : ""),
          );
          await page.waitForTimeout(3000);
        }
      }
      throw new Error(
        `login falhou para ${email}${motivo ? ` (${motivo})` : ""}`,
      );
    },
  };
  return h;
}

/**
 * Mantém o compositor do Chromium produzindo quadros durante trechos longos
 * sem interação (páginas estáticas). Sem isso, a gravação do Playwright pode
 * encerrar antes do fim da cena e a narração seria cortada no mux.
 * O elemento é 2x2 px quase transparente no canto — imperceptível.
 */
function pulso() {
  if (window.top !== window) return;
  const install = () => {
    if (!document.body || document.getElementById("__demo-pulso")) return;
    const st = document.createElement("style");
    st.textContent = "@keyframes __demoPulso{0%{opacity:.02}50%{opacity:.06}100%{opacity:.02}}";
    const dot = document.createElement("div");
    dot.id = "__demo-pulso";
    dot.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;background:#fff;opacity:.03;pointer-events:none;z-index:2147483647;animation:__demoPulso 1s linear infinite";
    (document.head || document.documentElement).appendChild(st);
    document.body.appendChild(dot);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
}

async function warmup() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  const routes = ["/", "/rules", "/rankings", "/results", "/atletas", "/agenda", "/ativar", "/login"];
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  }
  // aquece rotas autenticadas (evita tela de compilação durante a gravação)
  const h = makeHelpers(page, { card: null });
  for (const conta of [CONTAS.jogador, CONTAS.admin]) {
    await h.login(conta.email, conta.senha).catch((e) => log("  warm login:", e.message.split("\n")[0]));
    for (const r of ["/app", "/app/results", "/app/results/new", "/app/agenda", "/profile", "/admin", "/admin/results", "/admin/results?status=pending", "/admin/results?status=confirmed", "/admin/results/new", "/admin/players", "/admin/players/new", "/admin/convites", "/admin/verify"]) {
      await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    }
    await ctx.clearCookies();
  }
  await ctx.close();
  await browser.close();
}

async function recordScene(browser, scene, durations) {
  const vdir = path.join(OUT, "video");
  fs.mkdirSync(vdir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // Cenas de login começam limpas; as demais herdam a sessão da cena
    // anterior (senão o contexto novo derruba a autenticação no meio do ato).
    ...(CENAS_LOGIN.has(scene.id) || !fs.existsSync(STATE_FILE)
      ? {}
      : { storageState: STATE_FILE }),
    ...(DRY ? {} : { recordVideo: { dir: vdir, size: VIEW } }),
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => {
    log(`    diálogo aceito: ${d.message().slice(0, 60)}`);
    d.accept().catch(() => {});
  });
  await ctx.addInitScript(pulso);
  const h = makeHelpers(page, scene);
  const t0 = Date.now();
  const start = [];
  const end = [];
  const waitUntil = async (sec) => {
    const left = sec * 1000 - (Date.now() - t0);
    if (left > 0) await page.waitForTimeout(left);
  };

  try {
    for (let i = 0; i < scene.falas.length; i++) {
      const f = scene.falas[i];
      if (i > 0) await waitUntil(end[i - 1] + 0.15);
      if (f.acao) await f.acao(page, h);
      const actionEnd = (Date.now() - t0) / 1000;
      start[i] = Math.max(actionEnd + 0.25, i === 0 ? 0.8 : 0);
      end[i] = start[i] + durations[i];
      log(
        `    fala ${i + 1}/${scene.falas.length}: ação ${actionEnd.toFixed(1)}s · fala ${start[i].toFixed(2)}s a ${end[i].toFixed(2)}s`,
      );
    }
    await waitUntil(end[end.length - 1] + (DRY ? 0.2 : TAIL));
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `falhou-${scene.id}.png`), fullPage: true }).catch(() => {});
    throw new Error(`cena "${scene.id}" falhou: ${e.message.split("\n")[0]}`);
  }

  const videoPathPromise = page.video()?.path() ?? null;
  // Persiste a sessão para as próximas cenas (mesmo que a cena falhe).
  await ctx.storageState({ path: STATE_FILE }).catch(() => {});
  await ctx.close();
  const video = videoPathPromise ? await videoPathPromise : null;
  return { video, start, end };
}

// ───────────────────────────────────────────────── pós-produção

function mixScene(scene, timeline, lineFiles, durations) {
  const mixDir = path.join(OUT, "mix");
  fs.mkdirSync(mixDir, { recursive: true });
  const id = scene.id;
  const audio = path.join(mixDir, `${id}.wav`);
  const ass = path.join(mixDir, `${id}.ass`);
  const mp4 = path.join(mixDir, `${id}.mp4`);

  buildSceneAudio(id, lineFiles, durations, timeline.start, audio);
  writeAss(scene, timeline.start, timeline.end, durations, ass);

  // A duração da cena é ditada pela NARRAÇÃO: o vídeo gravado pode ser mais
  // curto (páginas estáticas não repintam e o webm do Playwright pode terminar
  // antes), então clonamos o último quadro e cortamos exatamente no áudio.
  const audioDur = probeDuration(audio);
  const videoDur = probeDuration(timeline.video);
  const cloneFor = Number.isFinite(videoDur) ? Math.max(2, audioDur - videoDur + 2) : 120;
  run(FFMPEG, [
    "-y",
    "-i", timeline.video,
    "-i", audio,
    "-filter_complex",
    `[0:v]fps=25,tpad=stop_mode=clone:stop_duration=${cloneFor.toFixed(1)},format=yuv420p,subtitles=${path.basename(ass)}:fontsdir=${FONTDIR}[v]`,
    "-map", "[v]",
    "-map", "1:a",
    "-c:v", "libx264", "-preset", "fast", "-crf", "22",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-t", audioDur.toFixed(3),
    "-movflags", "+faststart",
    mp4,
  ], { cwd: mixDir });

  // quadros de conferência (legendas/posição)
  const framesDir = path.join(OUT, "frames");
  fs.mkdirSync(framesDir, { recursive: true });
  const picks = [...new Set([0, Math.floor(scene.falas.length / 2), scene.falas.length - 1])];
  for (const i of picks) {
    const at = Math.max(0, timeline.start[i] + durations[i] * 0.6);
    run(FFMPEG, ["-y", "-ss", at.toFixed(2), "-i", mp4, "-frames:v", "1", path.join(framesDir, `${id}-${i}.png`)]);
  }
  return mp4;
}

/** Concatena cenas mixadas num MP4 (cópia direta, com fallback re-encodando). */
function concatVideos(mp4s, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const list = path.join(OUT, `concat-${path.basename(outFile)}.txt`);
  fs.writeFileSync(list, mp4s.map((m) => `file '${m}'`).join("\n") + "\n");
  try {
    run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", outFile]);
    const sum = mp4s.reduce((acc, m) => acc + probeDuration(m), 0);
    const got = probeDuration(outFile);
    if (Math.abs(sum - got) > 1.5) {
      log(`  concat com -c copy ficou ${got.toFixed(1)}s (esperado ${sum.toFixed(1)}s); re-encodando...`);
      throw new Error("durante divergente");
    }
  } catch {
    run(FFMPEG, [
      "-y", "-f", "concat", "-safe", "0", "-i", list,
      "-c:v", "libx264", "-preset", "fast", "-crf", "22",
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
      outFile,
    ]);
  }
  return probeDuration(outFile);
}

/** Legenda lado a lado de um trecho (offsets acumulados das cenas do trecho). */
function srtDoTrecho(cenas, timelines, outFile) {
  const cues = [];
  let offset = 0;
  for (const scene of cenas) {
    const tl = timelines[scene.id];
    if (tl) {
      scene.falas.forEach((f, i) => {
        cues.push({ start: offset + tl.start[i], end: offset + tl.end[i] + 0.3, text: falaTexto(f) });
      });
    }
    offset += probeDuration(path.join(OUT, "mix", `${scene.id}.mp4`));
  }
  writeSrt(cues, outFile);
}

// ───────────────────────────────────────────────── main

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  if (CLEANUP_ONLY) {
    log("▸ restaurando o banco ao estado pré-demo (backup)...");
    await restore(supabaseAdmin());
    return;
  }

  const scenes = ONLY ? CENARIOS.filter((c) => c.id === ONLY) : CENARIOS;
  if (ONLY && scenes.length === 0) throw new Error(`cena desconhecida: ${ONLY}`);

  await ensureServer();
  const db = await setup(scenes);

  // Run completo começa sem sessão (público anônimo na frente); em --only a
  // sessão do run anterior é reaproveitada — cenas de login refazem a própria.
  if (!ONLY && fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);

  let falhou = null;
  try {
  log("▸ etapa 1/5: narração (Piper, pt-BR)...");
  const audioByScene = new Map();
  for (const sc of scenes) {
    const lines = sc.falas.map(falaTexto);
    const files = [];
    const durations = [];
    if (!DRY) {
      for (const t of lines) {
        const { file, dur } = tts(t);
        files.push(file);
        durations.push(dur);
      }
    } else {
      for (let i = 0; i < lines.length; i++) durations.push(1.2);
    }
    const total = durations.reduce((a, b) => a + b, 0);
    audioByScene.set(sc.id, { files, durations });
    log(`  ${sc.id}: ${lines.length} falas · ${total.toFixed(1)}s de narração`);
  }

  log("▸ etapa 2/5: aquecimento do app (evita telas de compilação)...");
  await warmup();

  log("▸ etapa 3/5: gravação das cenas (Playwright)...");
  const browser = await chromium.launch();
  const timelines = {};
  try {
    for (const sc of scenes) {
      log(`  ▸ ${sc.id} — ${sc.nome}`);
      const { files, durations } = audioByScene.get(sc.id);
      const tl = await recordScene(browser, sc, durations);
      timelines[sc.id] = { start: tl.start, end: tl.end, video: tl.video };
      if (tl.video) log(`    vídeo: ${path.basename(tl.video)}`);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "timelines.json"), JSON.stringify(timelines, null, 2));

  log("▸ etapa 4/5: áudio + legendas + mux...");
  const mp4s = [];
  for (const sc of scenes) {
    const { files, durations } = audioByScene.get(sc.id);
    const tl = timelines[sc.id];
    if (!tl.video) {
      log(`  ${sc.id}: sem vídeo gravado (modo dry); pulando mux`);
      continue;
    }
    mp4s.push(mixScene(sc, tl, files, durations));
    log(`  ${sc.id}: ok → ${path.basename(mp4s[mp4s.length - 1])}`);
  }

  if (ONLY) {
    log(`\nCena "${ONLY}" pronta em: ${mp4s[0] ?? "(nenhuma)"}`);
    return;
  }

  if (DRY) {
    log("\n✅ dry-run concluído: todos os seletores/ações responderam.");
    return;
  }

  if (mp4s.length !== scenes.length) {
    throw new Error(`esperava ${scenes.length} cenas mixadas, tenho ${mp4s.length}`);
  }

  log("▸ etapa 5/5: concatenação final (completo + um vídeo por ato)...");
  const dur = concatVideos(mp4s, FINAL_MP4);
  srtDoTrecho(scenes, timelines, FINAL_SRT);
  log("");
  log("✅ vídeo completo:", FINAL_MP4);
  log("   duração:", `${Math.floor(dur / 60)}min ${Math.round(dur % 60)}s`);
  log("   tamanho:", (fs.statSync(FINAL_MP4).size / (1024 * 1024)).toFixed(1) + " MB");
  log("   legendas:", FINAL_SRT);
  for (const ato of ATOS) {
    const cenas = scenes.filter((s) => s.ato === ato);
    if (cenas.length === 0) continue;
    const arqs = cenas.map((s) => path.join(OUT, "mix", `${s.id}.mp4`));
    const d = concatVideos(arqs, ACT_MP4(ato));
    srtDoTrecho(cenas, timelines, ACT_SRT(ato));
    log(
      ` ✅ ${ato}: ${path.basename(ACT_MP4(ato))} · ${Math.floor(d / 60)}min${Math.round(d % 60)}s` +
        ` · ${path.basename(ACT_SRT(ato))}`,
    );
  }
  } catch (e) {
    falhou = e;
  } finally {
    // Restaura SEMPRE (inclusive em dry-run, que também executa ações reais):
    // o banco nunca fica sujo entre tentativas, e o próprio restore é testado.
    log("");
    log("▸ restaurando o banco ao estado pré-demo...");
    try {
      await restore(db);
      log("✅ restauração concluída — banco idêntico ao pré-demo.");
    } catch (e) {
      log("❌ falha na restauração:", e.message);
      log("   rode: node scripts/demo-video/build.mjs --cleanup");
    }
  }
  if (falhou) throw falhou;
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
