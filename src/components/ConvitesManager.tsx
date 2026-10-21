"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createInviteAction,
  deleteInviteAction,
  regenerateInviteCodeAction,
} from "@/actions/invites";
import type { InviteRow } from "@/lib/queries/invites";
import type { ActionResult } from "@/types/db";

/**
 * Gestão de convites (pré-cadastro do F CHALLENGER): cria, copia,
 * regenera e remove códigos de ativação. O código é a credencial do
 * atleta — por isso a tabela é privada e só este painel (servidor) lê.
 */

function CodeCell({ code }: { code: string }) {
  return (
    <span style={{ fontFamily: "monospace", letterSpacing: 1 }}>{code}</span>
  );
}

function CopyButton({ code }: { code: string }) {
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => {
        void navigator.clipboard?.writeText(code);
      }}
      title="Copiar código"
    >
      Copiar
    </button>
  );
}

export function ConvitesManager({ invites }: { invites: InviteRow[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ code: string; name: string }> | null,
    FormData
  >(createInviteAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  const used = invites.filter((i) => i.activated_at).length;

  return (
    <>
      <div className="card">
        <h2>Novo convite</h2>
        {state && !state.ok && <div className="alert alert-error">{state.error}</div>}
        {state?.ok && state.data && (
          <div className="alert alert-warn">
            Convite criado para <strong>{state.data.name}</strong> — envie o
            código por WhatsApp: <strong>{state.data.code}</strong>
          </div>
        )}
        <form className="form inline-fields" action={formAction}>
          <div className="field">
            <label htmlFor="name">Nome do atleta</label>
            <input id="name" name="name" maxLength={120} required />
          </div>
          <div className="field">
            <label htmlFor="phone">Telefone (opcional)</label>
            <input id="phone" name="phone" maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="ref_level">Nível da planilha (opcional)</label>
            <input id="ref_level" name="ref_level" maxLength={40} />
          </div>
          <div className="field" style={{ alignSelf: "end" }}>
            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Criando..." : "Criar convite"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>
          Atletas pré-cadastrados{" "}
          <span className="muted small">
            ({invites.length} convite{invites.length === 1 ? "" : "s"} · {used}{" "}
            ativado{used === 1 ? "" : "s"})
          </span>
        </h2>
        {invites.length === 0 ? (
          <p className="muted">Nenhum convite ainda.</p>
        ) : (
          <div className="table-wrap mt">
            <table className="table">
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th className="col-sm">Telefone</th>
                  <th>Código</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                      {i.ref_level && (
                        <span className="muted small"> · {i.ref_level}</span>
                      )}
                    </td>
                    <td className="col-sm">{i.phone ?? "—"}</td>
                    <td>
                      {i.activated_at ? (
                        <span className="muted small">ativado</span>
                      ) : (
                        <CodeCell code={i.activation_code} />
                      )}
                    </td>
                    <td>
                      {i.activated_at ? (
                        <span className="badge badge-confirmed">conta ativa</span>
                      ) : (
                        <span className="badge badge-pending">aguardando ativação</span>
                      )}
                    </td>
                    <td>
                      {!i.activated_at && (
                        <span className="row-actions">
                          <CopyButton code={i.activation_code} />
                          <form action={regenerateInviteCodeAction}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="btn btn-secondary btn-sm" type="submit">
                              Novo código
                            </button>
                          </form>
                          <form action={deleteInviteAction}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="btn btn-secondary btn-sm" type="submit">
                              Remover
                            </button>
                          </form>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small mt">
          O código é de uso único: ao ativar, o atleta define e-mail e senha e a
          conta nasce aprovada. Códigos usados não aparecem mais aqui.
        </p>
      </div>
    </>
  );
}
