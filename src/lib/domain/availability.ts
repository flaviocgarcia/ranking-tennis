import type { AvailabilitySlot } from "@/types/db";

/**
 * Agenda de disponibilidade — "quem quer jogar em determinada data".
 *
 * Sem rotinas periódicas: datas passadas não são apagadas com o tempo,
 * são simplesmente descartadas na leitura/agrupamento (nenhum cron).
 */

export const AVAILABILITY_SLOTS: AvailabilitySlot[] = [
  "morning",
  "afternoon",
  "evening",
  "any",
];

export const SLOT_LABELS: Record<AvailabilitySlot, string> = {
  morning: "manhã",
  afternoon: "tarde",
  evening: "noite",
  any: "qualquer horário",
};

export function slotLabel(v: string): string {
  return SLOT_LABELS[v as AvailabilitySlot] ?? v;
}

export function isSlot(v: unknown): v is AvailabilitySlot {
  return (
    typeof v === "string" && (AVAILABILITY_SLOTS as readonly string[]).includes(v)
  );
}

/** Máximo de antecedência para uma marca. */
export const MAX_AHEAD_DAYS = 60;

/** Janela exibida pela agenda (hoje .. hoje + N). */
export const AGENDA_HORIZON_DAYS = 30;

/** Data de hoje no fuso usado pelo projeto (UTC — igual a matches.ts). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Soma dias a uma data "YYYY-MM-DD". */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Linha da agenda já hidratada (perfil + nível). */
export interface AgendaEntry {
  id: string;
  playerId: string;
  levelId: string;
  playDate: string;
  slot: AvailabilitySlot;
  profile: { id: string; name: string; initials: string };
  level: {
    id: string;
    code: string;
    name: string;
    slug: string;
    sort_order: number;
  };
}

export interface AgendaPlayer {
  id: string;
  name: string;
  initials: string;
  slot: AvailabilitySlot;
  isMe: boolean;
}

export interface AgendaLevelGroup {
  levelId: string;
  code: string;
  name: string;
  slug: string;
  players: AgendaPlayer[];
}

export interface AgendaDay {
  date: string;
  /** Dias até a data (0 = hoje). */
  daysFromNow: number;
  total: number;
  levels: AgendaLevelGroup[];
}

/**
 * Agrupa as marcas por data (crescente) e, dentro de cada data, por
 * nível (ordem do clube) e nome do jogador. `meId` destaca "você".
 */
export function toAgendaDays(
  entries: AgendaEntry[],
  opts: { today: string; meId?: string | null },
): AgendaDay[] {
  const meId = opts.meId ?? null;

  const byDate = new Map<string, AgendaEntry[]>();
  for (const e of entries) {
    if (e.playDate < opts.today) continue; // marca antiga: descarta
    const list = byDate.get(e.playDate);
    if (list) list.push(e);
    else byDate.set(e.playDate, [e]);
  }

  const days: AgendaDay[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const byLevel = new Map<
      string,
      { level: AgendaEntry["level"]; players: AgendaPlayer[] }
    >();
    for (const e of byDate.get(date) ?? []) {
      const group = byLevel.get(e.levelId) ?? { level: e.level, players: [] };
      group.players.push({
        id: e.profile.id,
        name: e.profile.name,
        initials: e.profile.initials,
        slot: e.slot,
        isMe: e.profile.id === meId,
      });
      byLevel.set(e.levelId, group);
    }

    const levels: AgendaLevelGroup[] = [...byLevel.entries()]
      .sort(
        ([, a], [, b]) =>
          a.level.sort_order - b.level.sort_order ||
          a.level.code.localeCompare(b.level.code),
      )
      .map(([levelId, g]) => ({
        levelId,
        code: g.level.code,
        name: g.level.name,
        slug: g.level.slug,
        players: g.players.sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        ),
      }));

    days.push({
      date,
      daysFromNow: Math.round(
        (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${opts.today}T00:00:00Z`)) /
          86400000,
      ),
      total: levels.reduce((n, l) => n + l.players.length, 0),
      levels,
    });
  }

  return days;
}
