import { adminScope, requireAdmin } from "@/lib/auth/session";
import { clubName } from "@/lib/env";
import {
  buildResultsWorkbook,
  type ExportRanking,
} from "@/lib/export/results-workbook";
import { listLevelsAdmin } from "@/lib/queries/levels";
import { listConfirmedMatchesForExport } from "@/lib/queries/matches";
import { loadPublicRanking } from "@/lib/ranking/public";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "F CHALLENGER" => "f-challenger" (nome de arquivo seguro). */
function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * GET /admin/results/export/xlsx
 *
 * Planilha Excel (.xlsx) com duas abas:
 *  - "Resultados": todos os resultados confirmados + pontuação de cada lado;
 *  - "Classificação": a classificação publicada (janela de 12 meses).
 *
 * Mesmo escopo do CSV: administrador de nível exporta só o próprio nível;
 * quem não é admin é redirecionado.
 */
export async function GET(): Promise<Response> {
  const info = await requireAdmin();
  const scope = adminScope(info);
  const supabase = await createSupabaseServer();

  const [results, allLevels] = await Promise.all([
    listConfirmedMatchesForExport(supabase, scope),
    listLevelsAdmin(supabase),
  ]);

  const levels = (scope ? allLevels.filter((l) => l.id === scope) : allLevels).filter(
    (l) => l.active,
  );

  const rankings: ExportRanking[] = [];
  for (const level of levels) {
    const data = await loadPublicRanking(supabase, level);
    rankings.push({
      levelName: level.name,
      rows: data.rows,
      computedAt: data.computedAt,
      windowFrom: data.windowFrom,
      matchesCount: data.matchesCount,
    });
  }

  const buffer = await buildResultsWorkbook({
    results,
    rankings,
    generatedAt: new Date(),
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const filename = `resultados-e-classificacao-${slug(clubName())}-${hoje}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
