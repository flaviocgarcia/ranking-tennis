import { adminScope, requireAdmin } from "@/lib/auth/session";
import { clubName } from "@/lib/env";
import { buildResultsCsv } from "@/lib/export/results-csv";
import { listConfirmedMatchesForExport } from "@/lib/queries/matches";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Download autenticado: nunca cacheado, nunca pré-renderizado.
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
 * GET /admin/results/export
 *
 * Backup em planilha (CSV) de TODOS os resultados confirmados do escopo
 * do administrador, com a pontuação atribuída a cada jogador em cada
 * partida. `requireAdmin` redireciona quem não é admin — o arquivo nunca
 * é servido sem sessão.
 */
export async function GET(): Promise<Response> {
  const info = await requireAdmin();
  const scope = adminScope(info);

  const supabase = await createSupabaseServer();
  const rows = await listConfirmedMatchesForExport(supabase, scope);

  const csv = buildResultsCsv(rows);
  const hoje = new Date().toISOString().slice(0, 10);
  const filename = `resultados-${slug(clubName())}-${hoje}.csv`;

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
