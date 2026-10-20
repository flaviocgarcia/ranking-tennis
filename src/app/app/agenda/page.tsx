import type { Metadata } from "next";
import Link from "next/link";
import { removeAvailabilityAction } from "@/actions/availability";
import { AgendaList } from "@/components/AgendaList";
import { AvailabilityForm } from "@/components/AvailabilityForm";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import {
  AGENDA_HORIZON_DAYS,
  MAX_AHEAD_DAYS,
  addDaysISO,
  slotLabel,
  toAgendaDays,
  todayISO,
} from "@/lib/domain/availability";
import { listUpcomingMember } from "@/lib/queries/availability";
import type { AgendaEntry } from "@/lib/domain/availability";

export const metadata: Metadata = { title: "Agenda" };

interface PageData {
  kind: "ok" | "error";
  rows: AgendaEntry[];
}

/**
 * Agenda do jogador: marcar/desmarcar própria disponibilidade + visão
 * completa (com "você" destacado). Dinâmica por ler cookies no layout.
 * Uma única consulta cobre as duas listas (minhas = mesmo conjunto).
 */
async function loadPage(): Promise<PageData> {
  try {
    const supabase = await createSupabaseServer();
    const today = todayISO();
    const rows = await listUpcomingMember(
      supabase,
      today,
      addDaysISO(today, AGENDA_HORIZON_DAYS),
    );
    return { kind: "ok", rows };
  } catch (e) {
    console.error("[app/agenda] falha ao carregar:", e);
    return { kind: "error", rows: [] };
  }
}

export default async function MemberAgendaPage() {
  const info = await requireUser();
  const today = todayISO();
  const data = await loadPage();

  const mine = data.rows
    .filter((r) => r.playerId === info.userId)
    .sort((a, b) => a.playDate.localeCompare(b.playDate));
  const days = toAgendaDays(data.rows, { today, meId: info.userId });

  const semNivel = !info.profile.level_id;
  const pendente = info.profile.pending_approval;

  return (
    <>
      <h1 className="page-title">Agenda</h1>
      <p className="page-sub">
        Marque os dias em que você pode jogar. Quem marcar a mesma data fica
        sabendo pela <Link href="/agenda">agenda pública</Link>.
      </p>

      <div className="card mt">
        <h2 className="page-sub">Quero jogar</h2>
        {pendente ? (
          <p className="muted">
            Seu cadastro ainda aguarda aprovação do administrador — a agenda
            fica disponível depois da aprovação.
          </p>
        ) : semNivel ? (
          <p className="muted">
            Você ainda não foi incluído em um nível. Fale com o administrador
            para usar a agenda.
          </p>
        ) : (
          <AvailabilityForm
            minDate={today}
            maxDate={addDaysISO(today, MAX_AHEAD_DAYS)}
          />
        )}
      </div>

      <div className="card mt">
        <h2 className="page-sub">Minhas marcações</h2>
        {data.kind === "error" ? (
          <p className="muted">
            Não foi possível carregar a agenda agora. Recarregue a página.
          </p>
        ) : mine.length === 0 ? (
          <p className="muted small">
            Nenhuma marcação para os próximos {AGENDA_HORIZON_DAYS} dias.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Período</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mine.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.playDate)}</td>
                    <td>{slotLabel(m.slot)}</td>
                    <td className="row-actions">
                      <form action={removeAvailabilityAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          className="btn btn-secondary btn-sm"
                          type="submit"
                        >
                          Remover
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="page-sub mt">
        Próximas datas — {days.length === 0 ? "nenhuma marca" : "todos os níveis"}
      </h2>
      {data.kind === "error" ? null : <AgendaList days={days} />}
    </>
  );
}
