import type { LevelConfig, ScoreSet, TiebreakKey } from "@/lib/domain/config";
import { TIEBREAK_ORDER } from "@/lib/domain/config";

/** Helpers de validação de formulário (sem dependência externa). */

export function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function requiredString(v: unknown, label: string, max = 120): string {
  const s = asString(v);
  if (!s) throw new Error(`${label} é obrigatório.`);
  if (s.length > max) throw new Error(`${label} muito longo (máx. ${max}).`);
  return s;
}

export function optionalString(v: unknown, max = 120): string | null {
  const s = asString(v);
  if (!s) return null;
  if (s.length > max) throw new Error(`Valor muito longo (máx. ${max}).`);
  return s;
}

export function intInRange(
  v: unknown,
  label: string,
  min: number,
  max: number,
): number {
  const n = typeof v === "number" ? v : Number.parseInt(asString(v), 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${label} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return Math.trunc(n);
}

export function boolish(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === "1";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailString(v: unknown): string {
  const s = asString(v).toLowerCase();
  if (!EMAIL_RE.test(s)) throw new Error("E-mail inválido.");
  if (s.length > 200) throw new Error("E-mail muito longo.");
  return s;
}

export function uuidString(v: unknown, label: string): string {
  const s = asString(v);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new Error(`${label} inválido.`);
  }
  return s;
}

export function dateString(v: unknown, label: string): string {
  const s = asString(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new Error(`${label} inválida.`);
  }
  return s;
}

/** Slug simples usado nas URLs públicas (/rankings/a). */
export function slugify(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Converte entradas de formulário (["6","4"]) em ScoreSet validado. */
export function parseSets(rows: unknown): ScoreSet[] {
  if (!Array.isArray(rows)) throw new Error("Informe o placar.");
  const out: ScoreSet[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 2) {
      throw new Error("Placar inválido.");
    }
    const a = Number.parseInt(String(row[0]), 10);
    const b = Number.parseInt(String(row[1]), 10);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      throw new Error("Placar inválido.");
    }
    out.push([a, b]);
  }
  if (out.length === 0) throw new Error("Informe ao menos um set.");
  return out;
}

/** Converte strings "6-4" (enviadas pelo formulário) em ScoreSet. */
export function parseSetStrings(values: unknown): ScoreSet[] {
  if (!Array.isArray(values)) throw new Error("Informe o placar.");
  const out: ScoreSet[] = [];
  for (const raw of values) {
    const s = String(raw ?? "").trim();
    const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(s);
    if (!m) throw new Error(`Set inválido: "${s}". Use o formato 6-4.`);
    const a = Number.parseInt(m[1], 10);
    const b = Number.parseInt(m[2], 10);
    out.push([a, b]);
  }
  if (out.length === 0) throw new Error("Informe ao menos um set.");
  return out;
}

/** Valida a configuração de um nível vinda do formulário. */
export function parseLevelConfig(raw: unknown): LevelConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const setsToWin = intInRange(obj.setsToWin, "Sets para vencer", 1, 3);
  const st = (obj.superTiebreak ?? {}) as Record<string, unknown>;
  const points = intInRange(st.points, "Pontos do tiebreakão", 2, 30);
  const sc = (obj.scoring ?? {}) as Record<string, unknown>;

  // Preserva a ORDEM escolhida pelo administrador (o desempate é
  // ordenável por requisito); TIEBREAK_ORDER entra apenas como lista de
  // valores válidos — deduplicados, na ordem enviada pelo formulário.
  const rawTie = Array.isArray(obj.tiebreakers) ? obj.tiebreakers : [];
  const tiebreakers: TiebreakKey[] = [];
  for (const value of rawTie) {
    const key = String(value) as TiebreakKey;
    if (TIEBREAK_ORDER.includes(key) && !tiebreakers.includes(key)) {
      tiebreakers.push(key);
    }
  }
  if (tiebreakers.length === 0) {
    throw new Error("Informe ao menos um critério de desempate.");
  }

  return {
    setsToWin,
    superTiebreak: { enabled: boolish(st.enabled), points },
    scoring: {
      winStraight: intInRange(sc.winStraight, "Pontos por vitória 2x0", 0, 100),
      winExtended: intInRange(sc.winExtended, "Pontos por vitória com set cedido", 0, 100),
      loss: intInRange(sc.loss, "Pontos do perdedor", 0, 100),
      deciderLoserPoint:
        sc.deciderLoserPoint === undefined || sc.deciderLoserPoint === null
          ? true
          : boolish(sc.deciderLoserPoint),
    },
    tiebreakers,
  };
}

/** Senha temporária curta e legível gerada no servidor. */
export function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
