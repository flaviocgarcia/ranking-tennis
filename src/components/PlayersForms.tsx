"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createPlayerAction,
  resetPlayerPasswordAction,
  updatePlayerAction,
} from "@/actions/players";
import type { ActionResult } from "@/types/db";

export interface LevelOption {
  id: string;
  name: string;
}

/** Níveis A–D do atleta — inclui as formas intermediárias da planilha. */
const REF_LEVEL_OPTIONS = ["A+", "A", "A/B", "B", "B/A", "B/C", "C", "C/B", "D"];

function TempPassword({
  email,
  password,
}: {
  email?: string | null;
  password: string;
}) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const loginUrl = origin ? `${origin}/login` : "/login";
  const accessText = [
    "Seu acesso ao ranking de tênis:",
    `1) Abra: ${loginUrl}`,
    `2) E-mail: ${email ?? "(o e-mail cadastrado)"}`,
    `3) Senha temporária: ${password}`,
    "No primeiro acesso o sistema pede para você criar a sua própria senha.",
  ].join("\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(accessText);
    } catch {
      // Navegador antigo/sem permissão: método clássico.
      const area = document.createElement("textarea");
      area.value = accessText;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="alert alert-warn">
      <strong>Senha temporária (exibida apenas agora):</strong>{" "}
      <code>{password}</code>
      {email && (
        <>
          {" "}
          · e-mail de login: <code>{email}</code>
        </>
      )}
      <p className="small" style={{ margin: "8px 0 6px" }}>
        <strong>Como o jogador entra:</strong> abra{" "}
        <Link href="/login">/login</Link> e informe o e-mail e esta senha
        temporária. No primeiro acesso o sistema pede para ele criar a senha
        definitiva. <strong>Não use &ldquo;Ativar cadastro&rdquo;</strong> —
        aquela página é só para quem recebeu um código de convite.
      </p>
      <div className="row-actions">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => void copiar()}>
          {copied ? "Copiado!" : "Copiar dados de acesso"}
        </button>
        <Link href="/login" className="btn btn-sm btn-secondary" target="_blank">
          Abrir tela de login
        </Link>
      </div>
    </div>
  );
}

/** Cadastro de usuário pelo administrador. */
export function CreatePlayerForm({
  levels,
  lockedLevelId = null,
  canManageAdmins = true,
}: {
  levels: LevelOption[];
  /** Administrador de nível: o novo usuário entra fixo nesse nível. */
  lockedLevelId?: string | null;
  /** Somente o administrador geral cria outros administradores. */
  canManageAdmins?: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<
    ActionResult<{ tempPassword: string; email: string }> | null,
    FormData
  >(createPlayerAction, null);

  return (
    <form className="form" action={action}>
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}
      {state?.ok && state.data && (
        <TempPassword email={state.data.email} password={state.data.tempPassword} />
      )}

      <div className="inline-fields">
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" type="text" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail (login)</label>
          <input id="email" name="email" type="email" required maxLength={200} />
        </div>
      </div>
      <div className="inline-fields">
        <div className="field">
          <label htmlFor="level_id">Nível</label>
          {lockedLevelId ? (
            <>
              <input type="hidden" name="level_id" value={lockedLevelId} />
              <p className="muted" style={{ margin: "8px 0 0" }}>
                {levels.find((l) => l.id === lockedLevelId)?.name ?? "Seu nível"}
              </p>
            </>
          ) : (
            <select id="level_id" name="level_id" required defaultValue="">
              <option value="" disabled>
                Selecione...
              </option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {canManageAdmins && (
          <div className="field">
            <label htmlFor="role">Perfil</label>
            <select id="role" name="role" defaultValue="player">
              <option value="player">Jogador</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        )}
      </div>

      {canManageAdmins && (
        <div className="field">
          <label htmlFor="admin_level_id">
            Escopo do administrador <span className="hint">usado só se o perfil for Administrador</span>
          </label>
          <select id="admin_level_id" name="admin_level_id" defaultValue="">
            <option value="">Administrador geral (todos os níveis)</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                Somente {l.name}
              </option>
            ))}
          </select>
          <p className="hint">
            Com um nível escolhido, o administrador gerencia apenas jogadores e
            resultados desse nível (não cria níveis nem outros administradores).
          </p>
        </div>
      )}

      <div className="row-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Criando..." : "Criar usuário"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.push("/admin/players")}
        >
          Voltar
        </button>
      </div>
    </form>
  );
}

/** Edição de jogador + redefinição de senha temporária. */
export function EditPlayerForm({
  player,
  levels,
  lockedLevelId = null,
  canManageAdmins = true,
}: {
  player: {
    id: string;
    name: string;
    email: string | null;
    level_id: string | null;
    ref_level: string | null;
    active: boolean;
    role: "admin" | "player";
    admin_level_id: string | null;
    pending_approval: boolean;
  };
  levels: LevelOption[];
  /** Administrador de nível: só edita jogadores do próprio nível. */
  lockedLevelId?: string | null;
  /** Somente o administrador geral altera perfil/escopo de outro admin. */
  canManageAdmins?: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updatePlayerAction,
    null,
  );
  const [pwState, pwAction, pwPending] = useActionState<
    ActionResult<{ tempPassword: string }> | null,
    FormData
  >(resetPlayerPasswordAction, null);

  return (
    <div>
      <form className="form" action={action}>
        {state && !state.ok && <div className="alert alert-error">{state.error}</div>}
        {state?.ok && <div className="alert alert-ok">Jogador atualizado.</div>}
        <input type="hidden" name="id" value={player.id} />

        <div className="field">
          <label htmlFor="name">Nome</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={120}
            defaultValue={player.name}
          />
        </div>
        {player.pending_approval && (
          <div className="alert alert-warn">
            Cadastro aguardando aprovação: o jogador já entra no sistema, mas
            ainda não aparece no ranking nem pode informar resultados.
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail (login)</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={200}
            defaultValue={player.email ?? ""}
          />
          <p className="hint">
            É com este e-mail que o jogador entra no sistema. Corrija aqui se o
            cadastro foi criado com o endereço errado — a senha atual continua
            valendo.
          </p>
        </div>
        <div className="inline-fields">
          <div className="field">
            <label htmlFor="level_id">Nível</label>
            {lockedLevelId || !canManageAdmins ? (
              <>
                <input
                  type="hidden"
                  name="level_id"
                  value={player.level_id ?? ""}
                />
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  {levels.find((l) => l.id === player.level_id)?.name ?? "sem nível"}
                </p>
              </>
            ) : (
              <select id="level_id" name="level_id" defaultValue={player.level_id ?? ""}>
                <option value="">— sem nível —</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="field">
            <label htmlFor="role">Perfil</label>
            {canManageAdmins && !lockedLevelId ? (
              <select id="role" name="role" defaultValue={player.role}>
                <option value="player">Jogador</option>
                <option value="admin">Administrador</option>
              </select>
            ) : (
              <p className="muted" style={{ margin: "8px 0 0" }}>
                {player.role === "admin" ? "Administrador" : "Jogador"}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="active">Situação</label>
            <select id="active" name="active" defaultValue={player.active ? "true" : "false"}>
              <option value="true">Ativo</option>
              <option value="false">Inativo (sai do ranking)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ref_level">
              Nível (A–D) <span className="hint">etiqueta do atleta</span>
            </label>
            <select id="ref_level" name="ref_level" defaultValue={player.ref_level ?? ""}>
              <option value="">— sem nível —</option>
              {REF_LEVEL_OPTIONS.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canManageAdmins && !lockedLevelId && (
          <div className="field">
            <label htmlFor="admin_level_id">
              Escopo do administrador <span className="hint">usado só se o perfil for Administrador</span>
            </label>
            <select
              id="admin_level_id"
              name="admin_level_id"
              defaultValue={player.admin_level_id ?? ""}
            >
              <option value="">Administrador geral (todos os níveis)</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  Somente {l.name}
                </option>
              ))}
            </select>
            <p className="hint">
              Um administrador com nível também pode jogar por esse nível, mas
              só administra ele.
            </p>
          </div>
        )}

        <div className="row-actions">
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar alterações"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.push("/admin/players")}
          >
            Voltar
          </button>
        </div>
      </form>

      <section className="card mt">
        <h2>Redefinir senha</h2>
        <p className="muted small">
          Gera uma nova senha temporária e exige que o jogador defina a própria
          senha no próximo acesso. O login é o e-mail{" "}
          <strong>{player.email ?? "—"}</strong> — envie os dois dados ao
          jogador e peça para entrar em <Link href="/login">/login</Link> (não
          em &ldquo;Ativar cadastro&rdquo;).
        </p>
        {pwState && !pwState.ok && (
          <div className="alert alert-error">{pwState.error}</div>
        )}
        {pwState?.ok && pwState.data && (
          <TempPassword email={player.email} password={pwState.data.tempPassword} />
        )}
        <form action={pwAction}>
          <input type="hidden" name="id" value={player.id} />
          <button className="btn btn-secondary" type="submit" disabled={pwPending}>
            {pwPending ? "Gerando..." : "Gerar nova senha temporária"}
          </button>
        </form>
      </section>
    </div>
  );
}
