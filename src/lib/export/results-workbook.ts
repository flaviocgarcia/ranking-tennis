import ExcelJS from "exceljs";
import type { ChallengerViewRow } from "@/lib/domain/challenger";
import { formatDate, formatDateTime, scoreText } from "@/lib/format";
import { matchPoints, validateChallengerScore } from "@/lib/domain/challenger";
import type { ExportMatchRow } from "./results-csv";

/**
 * Backup em Excel (XLSX) dos resultados + classificação publicada.
 *
 * Duas abas, pensadas para quem vai LER a planilha (não só arquivar):
 *  1. "Resultados"    — uma linha por partida confirmada, com a
 *                       pontuação atribuída a cada lado;
 *  2. "Classificação" — a mesma classificação do site (janela de 12
 *                       meses), com posição, pontos, jogos e média.
 *
 * Formatação: cabeçalho fixo e colorido, painel congelado, filtro,
 * datas e números como valores de verdade (dá para ordenar e somar),
 * largura de coluna ajustada e rodapé com a data de geração.
 */

export interface ExportRanking {
  levelName: string;
  rows: ChallengerViewRow[];
  computedAt: string | null;
  /** Início da janela de 12 meses (YYYY-MM-DD). */
  windowFrom: string;
  /** Partidas confirmadas no histórico (sem janela). */
  matchesCount: number;
}

export interface ResultsWorkbookInput {
  results: ExportMatchRow[];
  rankings: ExportRanking[];
  generatedAt: Date;
}

const HEADER_BG = "FF1F3864";
const ZEBRA_BG = "FFF2F5FA";
const BORDER_COLOR = "FFD9D9D9";
const WINNER_COLOR = "FF1E6F3C";
const MUTED_COLOR = "FF666666";

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

/** "YYYY-MM-DD" às 12h UTC (mesma regra de exibição do site). */
function dateOnly(iso: string): Date | null {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateTime(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface ColumnSpec {
  header: string;
  key: string;
  width: number;
  /** "text" | "center" | "date" | "datetime" | "int" | "decimal" */
  type?: "text" | "center" | "date" | "datetime" | "int" | "decimal";
}

/** Define as colunas (chave + largura) — precisa vir ANTES dos addRow. */
function setColumns(ws: ExcelJS.Worksheet, columns: ColumnSpec[]): void {
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
}

/** Aplica cabeçalho + corpo com o mesmo visual nas duas abas. */
function styleSheet(
  ws: ExcelJS.Worksheet,
  columns: ColumnSpec[],
  lastDataRow: number,
): void {
  const header = ws.getRow(1);
  header.height = 26;
  for (let i = 1; i <= columns.length; i += 1) {
    const cell = header.getCell(i);
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER;
  }

  for (let r = 2; r <= lastDataRow; r += 1) {
    const row = ws.getRow(r);
    row.height = 20;
    for (let c = 0; c < columns.length; c += 1) {
      const spec = columns[c];
      const cell = row.getCell(c + 1);
      cell.border = BORDER;
      cell.alignment = {
        vertical: "middle",
        horizontal:
          spec.type === "center" || spec.type === "int" || spec.type === "decimal"
            ? "center"
            : "left",
      };
      if (spec.type === "date") cell.numFmt = "dd/mm/yyyy";
      if (spec.type === "datetime") cell.numFmt = "dd/mm/yyyy hh:mm";
      if (spec.type === "int") cell.numFmt = "0";
      if (spec.type === "decimal") cell.numFmt = "0.0";
      if (r % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: ZEBRA_BG },
        };
      }
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (lastDataRow >= 1) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastDataRow, column: columns.length },
    };
  }
}

/** Rodapé de contexto abaixo da tabela (fora do filtro). */
function addFooter(
  ws: ExcelJS.Worksheet,
  lastDataRow: number,
  text: string,
): void {
  const row = lastDataRow + 2;
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { italic: true, size: 9, color: { argb: MUTED_COLOR } };
  cell.alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(row, 1, row, Math.min(ws.columnCount, 6));
  ws.getRow(row).height = 26;
}

/** Linha de resultados já com pontos calculados (mesma regra do ranking). */
function resultRow(m: ExportMatchRow): {
  winner: "p1" | "p2" | null;
  values: Record<string, string | number | Date | null>;
} {
  let winner: "p1" | "p2" | null = null;
  let winnerSets = 0;
  let loserSets = 0;
  let pts1: number | null = null;
  let pts2: number | null = null;

  if (m.format === "walkover") {
    winner =
      m.walkover_winner === 1 ? "p1" : m.walkover_winner === 2 ? "p2" : null;
    if (winner) {
      const points = matchPoints("walkover", { winner, winnerSets, loserSets });
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

  const sets1 = winner === "p1" ? winnerSets : winner === "p2" ? loserSets : 0;
  const sets2 = winner === "p1" ? loserSets : winner === "p2" ? winnerSets : 0;
  const winnerName =
    winner === "p1" ? m.p1?.name : winner === "p2" ? m.p2?.name : "";
  const loserName =
    winner === "p1" ? m.p2?.name : winner === "p2" ? m.p1?.name : "";

  return {
    winner,
    values: {
      played_on: dateOnly(m.played_on),
      level: m.level?.name ?? "",
      format:
        m.format === "normal"
          ? "Normal"
          : m.format === "grand_slam"
            ? "Grand Slam"
            : "W.O.",
      p1: m.p1?.name ?? "",
      p2: m.p2?.name ?? "",
      sets1,
      sets2,
      score: m.format === "walkover" ? "W.O." : scoreText(m.sets),
      winner: winnerName ?? "",
      loser: loserName ?? "",
      pts1,
      pts2,
      source:
        m.source === "telegram" ? "Telegram" : m.source === "admin" ? "Admin" : "Site",
      rep: m.rep?.name ?? "",
      conf: m.conf?.name ?? "",
      confirmed_at: dateTime(m.confirmed_at),
      id: m.id,
    },
  };
}

export async function buildResultsWorkbook(
  input: ResultsWorkbookInput,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "F CHALLENGER";
  wb.created = input.generatedAt;
  wb.modified = input.generatedAt;

  // ---------------- Aba 1: Resultados ----------------
  const resultsCols: ColumnSpec[] = [
    { header: "Data", key: "played_on", width: 12, type: "date" },
    { header: "Nível", key: "level", width: 16, type: "text" },
    { header: "Formato", key: "format", width: 12, type: "center" },
    { header: "Jogador 1", key: "p1", width: 24, type: "text" },
    { header: "Jogador 2", key: "p2", width: 24, type: "text" },
    { header: "Sets J1", key: "sets1", width: 10, type: "int" },
    { header: "Sets J2", key: "sets2", width: 10, type: "int" },
    { header: "Placar", key: "score", width: 20, type: "center" },
    { header: "Vencedor", key: "winner", width: 24, type: "text" },
    { header: "Perdedor", key: "loser", width: 24, type: "text" },
    { header: "Pontos J1", key: "pts1", width: 10, type: "int" },
    { header: "Pontos J2", key: "pts2", width: 10, type: "int" },
    { header: "Origem", key: "source", width: 11, type: "center" },
    { header: "Informado por", key: "rep", width: 20, type: "text" },
    { header: "Confirmado por", key: "conf", width: 20, type: "text" },
    { header: "Confirmado em", key: "confirmed_at", width: 18, type: "datetime" },
    { header: "ID da partida", key: "id", width: 38, type: "text" },
  ];

  const wsResults = wb.addWorksheet("Resultados", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  setColumns(wsResults, resultsCols);
  const parsed = input.results.map(resultRow);
  parsed.forEach(({ values }) => wsResults.addRow(values));
  const lastResultsRow = parsed.length + 1;
  styleSheet(wsResults, resultsCols, lastResultsRow);

  // Nome do vencedor e seus pontos em destaque.
  parsed.forEach(({ winner }, i) => {
    if (!winner) return;
    const row = wsResults.getRow(i + 2);
    const winnerCell = row.getCell(winner === "p1" ? 4 : 5);
    winnerCell.font = { bold: true, color: { argb: WINNER_COLOR } };
    const ptsCell = row.getCell(winner === "p1" ? 11 : 12);
    ptsCell.font = { bold: true, color: { argb: WINNER_COLOR } };
  });

  addFooter(
    wsResults,
    lastResultsRow,
    `${input.results.length} resultado(s) confirmado(s) · gerado em ${formatDateTime(
      input.generatedAt.toISOString(),
    )} · pontuação pela regra oficial do F CHALLENGER.`,
  );
  wsResults.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
  };
  wsResults.headerFooter.oddFooter = "&L F CHALLENGER &C Página &P de &N &R Resultados";

  // ---------------- Aba 2: Classificação ----------------
  const singleLevel = input.rankings.length <= 1;
  const rankingCols: ColumnSpec[] = [
    { header: "Posição", key: "pos", width: 10, type: "int" },
    { header: "Jogador", key: "name", width: 30, type: "text" },
    { header: "Pontos", key: "pts", width: 12, type: "int" },
    { header: "Jogos (JGS)", key: "games", width: 13, type: "int" },
    { header: "Média", key: "avg", width: 11, type: "decimal" },
  ];
  if (!singleLevel) {
    rankingCols.push({ header: "Nível", key: "level", width: 18, type: "text" });
  }

  const wsRanking = wb.addWorksheet("Classificação", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  setColumns(wsRanking, rankingCols);
  const rankingRows: Array<Record<string, string | number>> = [];
  for (const rk of input.rankings) {
    for (const r of rk.rows) {
      rankingRows.push({
        pos: r.pos,
        name: r.name,
        pts: r.pts,
        games: r.games,
        avg: Math.round(r.avg * 10) / 10,
        level: rk.levelName,
      });
    }
  }
  rankingRows.forEach((r) => wsRanking.addRow(r));
  const lastRankingRow = rankingRows.length + 1;
  styleSheet(wsRanking, rankingCols, lastRankingRow);

  // Líder em negrito (a posição 1 pode ser compartilhada em caso de empate).
  rankingRows.forEach((r, i) => {
    if (r.pos === 1) {
      const row = wsRanking.getRow(i + 2);
      row.font = { bold: true };
      row.getCell(2).font = { bold: true, color: { argb: WINNER_COLOR } };
    }
  });

  const first = input.rankings[0];
  const nota = first
    ? `Classificação publicada em ${formatDateTime(first.computedAt ?? "")}. ` +
      `Pontuam apenas as partidas a partir de ${formatDate(first.windowFrom)} (janela de 12 meses). ` +
      `${first.matchesCount} partida(s) confirmada(s) no histórico.`
    : "Nenhuma classificação publicada.";
  addFooter(wsRanking, lastRankingRow, nota);
  wsRanking.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
  };
  wsRanking.headerFooter.oddFooter = "&L F CHALLENGER &C Página &P de &N &R Classificação";

  return Buffer.from(await wb.xlsx.writeBuffer());
}
