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
import { CENARIOS, BASE, CONTAS, CONTA_VIDEO, CTX } from "./narrativa.mjs";

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
const FINAL_MP4 = path.join(FINAL_DIR, "ranking-tenis-demonstracao.mp4");
const FINAL_SRT = path.join(FINAL_DIR, "legendas.srt");

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
      `Dialogue: 0,${assTime(start[i])},${assTime(end[i] + 0.3)},Legenda,,0,0,0,,${cleanAss(f.texto)}`,
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

async function setup() {
  const db = supabaseAdmin();
  const { data: levels, error: levErr } = await db.from("levels").select("id,slug").eq("active", true);
  if (levErr) throw new Error(levErr.message);
  CTX.levelA = levels.find((l) => l.slug === "a")?.id ?? "";
  CTX.levelB = levels.find((l) => l.slug === "b")?.id ?? "";
  if (!CTX.levelA || !CTX.levelB) throw new Error("níveis A/B não encontrados");

  // Conta pendente usada no cenário de auto-cadastro/aprovação.
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = (list?.users ?? []).find((u) => u.email === CONTA_VIDEO.email);
  if (!user) {
    const r = await db.auth.admin.createUser({
      email: CONTA_VIDEO.email,
      password: CONTA_VIDEO.senha,
      email_confirm: true,
      user_metadata: { name: CONTA_VIDEO.nome, initials: "CV" },
    });
    if (r.error) throw new Error("criar conta demo: " + r.error.message);
    user = r.data.user;
    log("  conta pendente criada:", CONTA_VIDEO.email);
  }
  const { data: dLevel } = await db.from("levels").select("id").eq("slug", "d").single();
  const { data: perfilAntes } = await db
    .from("profiles")
    .select("pending_approval, level_id")
    .eq("id", user.id)
    .maybeSingle();
  const { error: profErr } = await db
    .from("profiles")
    .update({
      name: CONTA_VIDEO.nome,
      initials: "CV",
      level_id: dLevel.id,
      pending_approval: true,
      active: true,
      must_change_password: false,
      role: "player",
      admin_level_id: null,
    })
    .eq("id", user.id);
  if (profErr) throw new Error(profErr.message);
  // Aprovar a conta coloca o jogador no elenco do nível e entra no ranking
  // publicado; voltar a "pendente" exige recalcular esse nível.
  const contaMudou =
    !perfilAntes ||
    perfilAntes.pending_approval !== true ||
    perfilAntes.level_id !== dLevel.id;

  // Normaliza as partidas demo: as com sufixo "-pending" devem ficar pendentes e
  // as demais confirmadas (o vídeo confirma e reabre duas delas; uma execução
  // interrompida pode ter deixado o estado trocado).
  const { data: demoMatches } = await db
    .from("matches")
    .select("id, external_ref, status, played_on")
    .like("external_ref", "demo-%");
  const normalizar = [];
  for (const m of demoMatches ?? []) {
    if (m.external_ref === "demo-a-pending") CTX.dataA = dataBR(m.played_on);
    if (m.external_ref === "demo-b-pending") CTX.dataB = dataBR(m.played_on);
    if (m.status !== "pending" && m.status !== "confirmed") continue;
    const alvo = m.external_ref.endsWith("-pending") ? "pending" : "confirmed";
    if (m.status !== alvo) normalizar.push({ id: m.id, status: alvo, external_ref: m.external_ref });
  }
  if (!CTX.dataA || !CTX.dataB) {
    throw new Error("pendências demo (demo-a-pending/demo-b-pending) não encontradas");
  }
  let recalculou = false;
  if (normalizar.length > 0) {
    for (const n of normalizar) {
      const { error } = await db
        .from("matches")
        .update({
          status: n.status,
          confirmed_at: n.status === "confirmed" ? new Date().toISOString() : null,
          confirmed_by: null,
        })
        .eq("id", n.id);
      if (error) throw new Error(error.message);
    }
    log("  partidas demo normalizadas:", normalizar.map((n) => n.external_ref).join(", "));
    recalculou = true;
  }
  if (contaMudou) {
    log("  conta de demonstração reiniciada como pendente (nível D)");
    recalculou = true;
  }
  if (recalculou) {
    run("node", [path.join(ROOT, "scripts", "rebuild-rankings.mjs")], { cwd: ROOT });
  }

  // Sobras do cenário do jogador (resultado criado e não retirado).
  await removePlayerLeftovers(db, "quiet");
  return db;
}

async function removePlayerLeftovers(db, mode = "quiet") {
  const { data: profs } = await db
    .from("profiles")
    .select("id")
    .in("name", ["Rafael Almeida", "Bruno Carvalho"]);
  const ids = new Set((profs ?? []).map((p) => p.id));
  if (ids.size !== 2) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const { data: found } = await db
    .from("matches")
    .select("id, status, player1_id, player2_id")
    .eq("played_on", today)
    .eq("status", "pending")
    .eq("source", "site");
  const leftovers = (found ?? []).filter(
    (m) => ids.has(m.player1_id) && ids.has(m.player2_id),
  );
  if (leftovers.length > 0) {
    if (mode !== "quiet") log("  removendo sobras do cenário do jogador:", leftovers.length);
    await db.from("matches").in("id", leftovers.map((m) => m.id)).delete();
  }
  return leftovers.length;
}

async function cleanup(db) {
  await removePlayerLeftovers(db, "log");
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (list?.users ?? []).find((u) => u.email === CONTA_VIDEO.email);
  if (user) {
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw new Error(error.message);
    log("  conta demo removida:", CONTA_VIDEO.email);
  } else {
    log("  conta demo não encontrada (já removida).");
  }
  // Se a conta chegou a ser aprovada, ela entrou no ranking publicado do nível D;
  // removê-la exige recalcular para o publicado voltar a bater com o cálculo.
  run("node", [path.join(ROOT, "scripts", "rebuild-rankings.mjs")], { cwd: ROOT });
  log("Rankings recalculados após a limpeza.");
}

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
  const routes = ["/", "/rules", "/rankings", "/rankings/a", "/results", "/register", "/login"];
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  }
  // aquece rotas autenticadas (evita tela de compilação durante a gravação)
  const h = makeHelpers(page, { card: null });
  for (const conta of [CONTAS.jogador, CONTAS.adminB, CONTAS.admin]) {
    await h.login(conta.email, conta.senha).catch((e) => log("  warm login:", e.message.split("\n")[0]));
    for (const r of ["/app", "/app/results", "/app/results/new", "/profile", "/admin", "/admin/results?status=pending", "/admin/players", "/admin/players/new", "/admin/levels", `/admin/levels/${CTX.levelA}`, "/admin/verify", "/admin/players?pending=1", "/admin/results?status=confirmed"]) {
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
    ...(DRY ? {} : { recordVideo: { dir: vdir, size: VIEW } }),
  });
  const page = await ctx.newPage();
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

function concatFinal(mp4s, timelines) {
  fs.mkdirSync(FINAL_DIR, { recursive: true });
  const list = path.join(OUT, "concat-list.txt");
  fs.writeFileSync(list, mp4s.map((m) => `file '${m}'`).join("\n") + "\n");

  const copy = ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", FINAL_MP4];
  try {
    run(FFMPEG, copy);
    const sum = mp4s.reduce((acc, m) => acc + probeDuration(m), 0);
    const got = probeDuration(FINAL_MP4);
    if (Math.abs(sum - got) > 1.5) {
      log(`  concat com -c copy ficou ${got.toFixed(1)}s (esperado ${sum.toFixed(1)}s); re-encodando...`);
      throw new Error("durante divergente");
    }
  } catch {
    run(FFMPEG, [
      "-y", "-f", "concat", "-safe", "0", "-i", list,
      "-c:v", "libx264", "-preset", "fast", "-crf", "22",
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
      FINAL_MP4,
    ]);
  }

  // legenda lado a lado (mesmas falas, com offset acumulado)
  const cues = [];
  let offset = 0;
  for (const m of mp4s) {
    const scene = CENARIOS.find((s) => path.join(OUT, "mix", `${s.id}.mp4`) === m);
    const tl = scene && timelines[scene.id];
    if (scene && tl) {
      scene.falas.forEach((f, i) => {
        cues.push({ start: offset + tl.start[i], end: offset + tl.end[i] + 0.3, text: f.texto });
      });
    }
    offset += probeDuration(m);
  }
  writeSrt(cues, FINAL_SRT);
  return probeDuration(FINAL_MP4);
}

// ───────────────────────────────────────────────── main

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  if (CLEANUP_ONLY) {
    log("▸ removendo dados da demonstração...");
    await cleanup(supabaseAdmin());
    return;
  }

  await ensureServer();
  const db = await setup();
  void db;

  const scenes = ONLY ? CENARIOS.filter((c) => c.id === ONLY) : CENARIOS;
  if (ONLY && scenes.length === 0) throw new Error(`cena desconhecida: ${ONLY}`);

  log("▸ etapa 1/5: narração (Piper, pt-BR)...");
  const audioByScene = new Map();
  for (const sc of scenes) {
    const lines = sc.falas.map((f) => f.texto);
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

  log("▸ etapa 5/5: concatenação final...");
  const dur = concatFinal(mp4s, timelines);
  log("");
  log("✅ vídeo final:", FINAL_MP4);
  log("   duração:", `${Math.floor(dur / 60)}min ${Math.round(dur % 60)}s`);
  log("   tamanho:", (fs.statSync(FINAL_MP4).size / (1024 * 1024)).toFixed(1) + " MB");
  log("   legendas (lado a lado):", FINAL_SRT);
  log("");
  log("Observações:");
  log(" • a demo CONFIRMA e REABRE pendências de demonstração (A e B) e aprova a conta demo;");
  log('   para remover a conta demo e sobras: node scripts/demo-video/build.mjs --cleanup');
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
