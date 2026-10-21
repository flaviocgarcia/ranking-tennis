/**
 * QA objetivo do vídeo: confere, por análise de pixels e áudio, que
 *  - as legendas estão QUEIMADAS no rodapé (a faixa inferior muda quando a
 *    fala aparece/some, enquanto o resto do quadro permanece igual);
 *  - a narração está audível exatamente no intervalo da legenda;
 *  - o áudio fica em silêncio no fim de cada cena (intervalo sem legenda).
 *
 * Uso: node scripts/demo-video/_qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CENARIOS } from "./narrativa.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.join(os.homedir(), ".local", "video-demo");
const FFMPEG = path.join(TOOLS, "ffmpeg", "bin", "ffmpeg");
const FFPROBE = path.join(TOOLS, "ffmpeg", "bin", "ffprobe");
const TMP = "/tmp/opencode/qa";
fs.mkdirSync(TMP, { recursive: true });
const timelines = JSON.parse(fs.readFileSync(path.join(HERE, "out", "timelines.json"), "utf8"));

function run(bin, argv) {
  const r = spawnSync(bin, argv, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} falhou: ${r.stderr?.split("\n")[0]}`);
  return r.stdout.trim();
}

const dur = (f) =>
  parseFloat(
    run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]),
  );

function frame(mp4, t, dest) {
  run(FFMPEG, ["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", dest]);
  return dest;
}

/** Diferença média (0..255) entre duas imagens numa faixa horizontal. */
function diff(a, b, w, h, y) {
  const out = run("convert", [
    "(", a, "-crop", `${w}x${h}+0+${y}`, "+repage", ")",
    "(", b, "-crop", `${w}x${h}+0+${y}`, "+repage", ")",
    "-compose", "difference", "-composite",
    "-format", "%[fx:mean*255]", "info:",
  ]);
  return parseFloat(out);
}

function meanVolume(mp4, t, seconds) {
  const out = run(FFMPEG, [
    "-v", "error", "-ss", String(t), "-t", String(seconds), "-i", mp4,
    "-af", "volumedetect", "-f", "null", "-",
  ]);
  void out;
  const r = spawnSync(FFMPEG, [
    "-ss", String(t), "-t", String(seconds), "-i", mp4,
    "-af", "volumedetect", "-f", "null", "-",
  ], { encoding: "utf8" });
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
  return m ? parseFloat(m[1]) : NaN;
}

console.log(
  "cena".padEnd(16),
  "dur".padStart(6),
  "falaFinal".padStart(9),
  "difTotal".padStart(9),
  "difTopo".padStart(8),
  "difRodape".padStart(9),
  "volFala".padStart(8),
  "volSilencio".padStart(11),
);
let problemas = 0;
for (const sc of CENARIOS) {
  const tl = timelines[sc.id];
  const mp4 = path.join(HERE, "out", "mix", `${sc.id}.mp4`);
  const d = dur(mp4);
  const lastEnd = tl.end[tl.end.length - 1];
  const tOn = Math.max(0.5, lastEnd - 0.4);
  const tOff = Math.min(d - 0.2, lastEnd + 1.1);
  if (tOff <= tOn + 0.2) {
    console.log(`${sc.id}: duração curta demais para comparar (${d.toFixed(1)}s)`);
    continue;
  }
  const on = frame(mp4, tOn, path.join(TMP, `${sc.id}-on.png`));
  const off = frame(mp4, tOff, path.join(TMP, `${sc.id}-off.png`));
  const total = diff(on, off, 1280, 800, 20);
  const topo = diff(on, off, 1280, 140, 0);
  const rodape = diff(on, off, 1280, 150, 650);
  // Mede a voz dentro da ÚLTIMA fala inteira (excluindo a cauda de ~0,5s de
  // silêncio que o Piper grava após a palavra final e que entra no timeline).
  const f0 = tl.start[tl.start.length - 1];
  const vFala = meanVolume(mp4, f0 + 0.1, Math.max(0.4, lastEnd - f0 - 0.3));
  const vSil = meanVolume(mp4, tOff, 0.8);
  console.log(
    sc.id.padEnd(16),
    d.toFixed(1).padStart(6),
    lastEnd.toFixed(2).padStart(9),
    total.toFixed(2).padStart(9),
    topo.toFixed(2).padStart(8),
    rodape.toFixed(2).padStart(9),
    vFala.toFixed(1).padStart(8),
    vSil.toFixed(1).padStart(11),
  );
  // Checagens: legenda muda a faixa inferior sem mudar o topo; fala audível e
  // silêncio no fim.
  if (rodape < 1.5) {
    console.log(`  ⚠ ${sc.id}: rodapé não mudou — legenda pode estar ausente`);
    problemas++;
  }
  if (topo > 6) {
    console.log(`  ⚠ ${sc.id}: faixa superior mudou muito (${topo.toFixed(1)}) — página animou?`);
  }
  if (!(vFala > vSil + 25)) {
    console.log(`  ⚠ ${sc.id}: áudio da fala não se destaca do silêncio (${vFala} vs ${vSil})`);
    problemas++;
  }
}
console.log(problemas === 0 ? "\n✅ QA objetivo: tudo ok" : `\n⚠ ${problemas} ponto(s) a revisar`);
