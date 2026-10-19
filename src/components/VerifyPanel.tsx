"use client";

import { useActionState } from "react";
import { verifyRankingsAction } from "@/actions/verify";
import type { ActionResult, ConsistencyReport } from "@/types/db";

/** Painel de verificação de consistência dos rankings. */
export function VerifyPanel() {
  const [state, action, pending] = useActionState<
    ActionResult<ConsistencyReport[]> | null,
    FormData
  >(async (prev, fd) => {
    void prev;
    void fd;
    return verifyRankingsAction();
  }, null);

  return (
    <div>
      <form action={action}>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Verificando..." : "Verificar consistência agora"}
        </button>
      </form>

      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}

      {state?.ok && state.data && (
        <div className="mt">
          {state.data.length === 0 ? (
            <p className="muted">Nenhum nível cadastrado.</p>
          ) : (
            state.data.map((r) => (
              <section key={r.levelId} className="card">
                <div className="row-actions" style={{ justifyContent: "space-between" }}>
                  <strong>{r.levelName}</strong>
                  <span className={`badge ${r.consistent ? "badge-confirmed" : "badge-rejected"}`}>
                    {r.consistent ? "Consistente" : "Divergente"}
                  </span>
                </div>
                <p className="muted small" style={{ marginBottom: 6 }}>
                  {r.matchesUsed} partida(s) confirmada(s) · snapshot de{" "}
                  {r.snapshotAt ?? "—"}
                  {r.invalidCount > 0 && (
                    <>
                      {" "}
                      · <strong style={{ color: "var(--danger)" }}>
                        {r.invalidCount} placar(es) inválido(s) ignorado(s)
                      </strong>
                    </>
                  )}
                </p>
                {r.diffs.length > 0 && (
                  <ul className="small" style={{ color: "var(--danger)" }}>
                    {r.diffs.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
