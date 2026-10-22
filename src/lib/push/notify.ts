import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import type { MatchRow, MatchStatus } from "@/types/db";
import { notifyUsers } from "./send";

/** Todos os administradores ativos. */
async function adminUserIds(): Promise<string[]> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true);
  return (data ?? []).map((r) => r.id);
}

/**
 * Gatilho 1 — jogador informou um resultado: avisa todos os
 * administradores que há uma pendência nova no painel.
 */
export async function notifyNewPendingResult(
  reporterName: string,
): Promise<void> {
  await notifyUsers(await adminUserIds(), {
    title: "Novo resultado pendente",
    body: `${reporterName} informou um resultado. Confirme ou rejeite no painel.`,
    url: "/admin/results",
  });
}

/**
 * Gatilho 2 — administrador confirmou/rejeitou: avisa o jogador que
 * informou o resultado (quando não é o próprio administrador).
 */
export async function notifyMatchDecision(
  match: MatchRow,
  status: Extract<MatchStatus, "confirmed" | "rejected">,
): Promise<void> {
  if (!match.reported_by) return;
  const admin = createSupabaseAdmin();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", [match.reported_by, match.player1_id, match.player2_id]);
  const name = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  await notifyUsers([match.reported_by], {
    title:
      status === "confirmed" ? "Resultado confirmado" : "Resultado rejeitado",
    body:
      `${name.get(match.player1_id) ?? "Jogador"} x ` +
      `${name.get(match.player2_id) ?? "Jogador"} — ${formatDate(match.played_on)}`,
    url: "/app/results",
  });
}
