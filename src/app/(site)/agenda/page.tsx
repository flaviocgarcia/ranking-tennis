import type { Metadata } from "next";
import Link from "next/link";
import { AgendaList } from "@/components/AgendaList";
import {
  AGENDA_HORIZON_DAYS,
  addDaysISO,
  toAgendaDays,
  todayISO,
} from "@/lib/domain/availability";
import { listUpcomingPublic } from "@/lib/queries/availability";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import type { AgendaDay } from "@/lib/domain/availability";

export const metadata: Metadata = {
  title: "Agenda",
  description:
    "Quem quer jogar nas próximas datas — disponibilidade de jogadores por dia e nível.",
};

interface PageData {
  kind: "ok" | "error";
  days: AgendaDay[];
}

/**
 * Agenda pública de disponibilidade — PÁGINA ESTÁTICA (como /rankings
 * e /results): consulta só na build/revalidação (1 consulta), nada por
 * visita, nenhum cron. A escrita em /app/agenda chama revalidatePath
 * e a página é reconstruída na hora.
 *
 * Os joins `!inner` aplicam o RLS: jogador ou nível inativo não aparece.
 * Se ninguém marcou, o card vazio convida a entrar.
 */
async function loadPage(): Promise<PageData> {
  try {
    const anon = createSupabaseAnon();
    const today = todayISO();
    const rows = await listUpcomingPublic(
      anon,
      today,
      addDaysISO(today, AGENDA_HORIZON_DAYS),
    );
    return { kind: "ok", days: toAgendaDays(rows, { today }) };
  } catch (e) {
    console.error("[agenda] falha ao carregar:", e);
    return { kind: "error", days: [] };
  }
}

export default async function PublicAgendaPage() {
  const data = await loadPage();

  return (
    <>
      <h1 className="page-title">Agenda</h1>
      <p className="page-sub">
        Quem está <strong>marcado para jogar</strong> nas próximas datas.
        Marque a sua na área do jogador e aparece aqui na hora.
      </p>

      {data.kind === "error" ? (
        <div className="card mt">
          <p className="muted">
            Não foi possível carregar a agenda agora. Tente novamente em
            instantes.
          </p>
        </div>
      ) : (
        <AgendaList days={data.days} />
      )}

      <p className="mt">
        <Link href="/app/agenda">Marcar minha disponibilidade →</Link>
        {" · "}
        <Link href="/rankings">Classificações</Link>
        {" · "}
        <Link href="/rules">Regras</Link>
      </p>
      <p className="muted small">
        Exibindo os próximos {AGENDA_HORIZON_DAYS} dias · datas passadas saem
        sozinhas da lista.
      </p>
    </>
  );
}
