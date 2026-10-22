import type { ScoreSet } from "@/lib/domain/config";
import {
  MATCH_FORMAT_LABELS,
  matchPoints,
  validateChallengerScore,
  type MatchFormat,
} from "@/lib/domain/challenger";
import { formatDate, formatDateTime, scoreText } from "@/lib/format";

/**
 * Backup em planilha dos resultados confirmados.
 *
 * Gera CSV (não XLSX) de propósito: abre direto no Excel/Google Sheets,
 * não depende de biblioteca externa e envelhece bem como formato de
 * arquivo. Separador ";" e BOM UTF-8 = Excel em português abre já com
 * acentos e colunas certas, sem assistente de importação.
 *
 * A pontuação é recalculada pela MESMA fonte do ranking
 * (`matchPoints`), então o backup reflete exatamente o que foi
 * atribuído a cada jogador.
 */

export interface ExportMatchRow {
  id: string;
  played_on: string;
  sets: ScoreSet[];
  format: MatchFormat;
  walkover_winner: 1 | 2 | null;
  confirmed_at: string | null;
  source: string;
  level: { name: string } | null;
  p1: { name: string } | null;
  p2: { name: string } | null;
  rep: { name: string } | null;
  conf: { name: string } | null;
}

/** Cabeçalho na ordem das colunas (todas em português). */
export const RESULT_CSV_HEADER = [
  "Data",
  "Nível",
  "Formato",
  "Jogador 1",
  "Jogador 2",
  "Sets J1",
  "Sets J2",
  "Placar",
  "Vencedor",
  "Perdedor",
  "Pontos J1",
  "Pontos J2",
  "Origem",
  "Informado por",
  "Confirmado por",
  "Confirmado em",
  "ID da partida",
] as const;

const SOURCE_LABELS: Record<string, string> = {
  web: "Site",
  telegram: "Telegram",
  admin: "Admin",
};

/** Escapa uma célula (separador ";", aspas e quebras de linha). */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Uma linha do backup, já com a pontuação atribuída aos dois lados. */
function toRow(m: ExportMatchRow): Array<string | number> {
  let winner: "p1" | "p2" | null = null;
  let winnerSets = 0;
  let loserSets = 0;
  let pts1: number | "" = "";
  let pts2: number | "" = "";

  if (m.format === "walkover") {
    winner =
      m.walkover_winner === 1 ? "p1" : m.walkover_winner === 2 ? "p2" : null;
    if (winner) {
      const points = matchPoints("walkover", {
        winner,
        winnerSets,
        loserSets,
      });
      pts1 = points.p1;
      pts2 = points.p2;
    }
  } else {
    const result = validateChallengerScore(m.sets, m.format);
    if (result.ok) {
      winner = result.winner;
      winnerSets = result.winnerSets;
      loserSets = result.loserSets;
      const points = matchPoints(m.format, result);
      pts1 = points.p1;
      pts2 = points.p2;
    }
  }

  const sets1 =
    winner === "p1" ? winnerSets : winner === "p2" ? loserSets : 0;
  const sets2 =
    winner === "p1" ? loserSets : winner === "p2" ? winnerSets : 0;
  const winnerName =
    winner === "p1" ? m.p1?.name : winner === "p2" ? m.p2?.name : "";
  const loserName =
    winner === "p1" ? m.p2?.name : winner === "p2" ? m.p1?.name : "";

  return [
    formatDate(m.played_on),
    m.level?.name ?? "",
    MATCH_FORMAT_LABELS[m.format],
    m.p1?.name ?? "",
    m.p2?.name ?? "",
    sets1,
    sets2,
    m.format === "walkover" ? "W.O." : scoreText(m.sets),
    winnerName ?? "",
    loserName ?? "",
    pts1,
    pts2,
    SOURCE_LABELS[m.source] ?? m.source,
    m.rep?.name ?? "",
    m.conf?.name ?? "",
    m.confirmed_at ? formatDateTime(m.confirmed_at) : "",
    m.id,
  ];
}

/**
 * Monta o CSV completo (BOM + cabeçalho + uma linha por partida).
 * Linhas com placar irreconhecível ficam com pontuação vazia — o
 * resultado continua no backup, sem inventar pontos.
 */
export function buildResultsCsv(rows: ExportMatchRow[]): string {
  const lines = [RESULT_CSV_HEADER.join(";")];
  for (const row of rows) {
    lines.push(toRow(row).map(csvCell).join(";"));
  }
  return `\ufeff${lines.join("\r\n")}\r\n`;
}
