import { formatDate, formatWeekday } from "@/lib/format";
import { slotLabel, type AgendaDay } from "@/lib/domain/availability";

/**
 * Lista agrupada da agenda (compartilhada entre /agenda e /app/agenda).
 * Componente de servidor: sem estado, sem JavaScript extra no cliente.
 */
export function AgendaList({ days }: { days: AgendaDay[] }) {
  if (days.length === 0) {
    return (
      <div className="card mt empty">
        <p className="muted">
          Ninguém marcou disponibilidade nas próximas semanas. Entre na área do
          jogador e marque a sua — seu nome aparece aqui na hora.
        </p>
      </div>
    );
  }

  return (
    <>
      {days.map((day) => (
        <section className="card mt" key={day.date}>
          <p>
            <strong>{formatDate(day.date)}</strong>{" "}
            <span className="muted small">{formatWeekday(day.date)}</span>{" "}
            <span className="badge">
              {day.total} {day.total === 1 ? "jogador" : "jogadores"}
            </span>
          </p>
          {day.levels.map((lg) => (
            <div key={lg.levelId}>
              <p className="small muted">{lg.name}</p>
              <p>
                {lg.players.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 ? " · " : ""}
                    <strong className={p.isMe ? undefined : "muted"}>
                      {p.name}
                      {p.isMe ? " (você)" : ""}
                    </strong>{" "}
                    <span className="small muted">{slotLabel(p.slot)}</span>
                  </span>
                ))}
              </p>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
