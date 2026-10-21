"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  activateAccountAction,
  previewInviteAction,
} from "@/actions/invites";
import { normalizeActivationCode } from "@/lib/validation";
import type { ActionResult } from "@/types/db";

/**
 * Ativação de conta do F CHALLENGER (2 etapas):
 *  1) código de ativação → servidor devolve o nome do atleta;
 *  2) e-mail + senha → cria a conta vinculada ao convite e já entra.
 */
export function ActivationForm() {
  const router = useRouter();
  const [step, setStep] = useState<"code" | "data">("code");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, startTransition] = useTransition();

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    activateAccountAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/app");
      router.refresh();
    }
  }, [state, router]);

  function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeActivationCode(code);
    if (normalized.length < 4) {
      setError("Informe o código de ativação.");
      return;
    }
    startTransition(async () => {
      const result = await previewInviteAction(normalized);
      if (!result.ok || !result.data) {
        setError(result.ok ? "Falha ao validar o código." : result.error);
        return;
      }
      setCode(normalized);
      setName(result.data.name);
      setStep("data");
    });
  }

  if (step === "code") {
    return (
      <form className="form" onSubmit={submitCode}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="code">Código de ativação</label>
          <input
            id="code"
            name="code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            placeholder="ex.: K3MQ7XZ2"
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            required
          />
          <p className="hint">
            O código foi enviado a você pelo administrador do torneio.
          </p>
        </div>
        <button className="btn" type="submit" disabled={checking}>
          {checking ? "Verificando..." : "Continuar"}
        </button>
        <p className="small mt">
          Já ativou? <Link href="/login">Entre com e-mail e senha</Link>.
        </p>
      </form>
    );
  }

  return (
    <form className="form" action={formAction}>
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}

      <div className="alert">
        Atleta: <strong>{name}</strong> · Código: <strong>{code}</strong>
      </div>
      <input type="hidden" name="code" value={code} />

      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@email.com"
          required
        />
        <p className="hint">Use um e-mail que você tenha acesso — é por ele que você entra.</p>
      </div>

      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password2">Confirmar senha</label>
        <input
          id="password2"
          name="password2"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="row-actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Ativando..." : "Ativar e entrar"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setError(null);
            setStep("code");
          }}
        >
          Trocar código
        </button>
      </div>
      <p className="small muted">
        Depois disso você sempre entra por <Link href="/login">este login</Link>.
      </p>
    </form>
  );
}
