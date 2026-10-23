"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  clearMustChangeAction,
  updateEmailAction,
  updateNameAction,
} from "@/actions/auth";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import type { ActionResult } from "@/types/db";

/** Formulário de nome (server action + RLS de atualização própria). */
export function NameForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateNameAction,
    null,
  );
  return (
    <form className="form" action={action}>
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}
      {state?.ok && <div className="alert alert-ok">Nome atualizado.</div>}
      <div className="field">
        <label htmlFor="name">Nome exibido no ranking</label>
        <input id="name" name="name" type="text" required maxLength={120} defaultValue={initialName} />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar nome"}
      </button>
    </form>
  );
}

/**
 * Alteração do próprio e-mail de login.
 *
 * Pede o novo e-mail duas vezes; a troca é imediata e a senha atual
 * continua valendo. O e-mail antigo deixa de funcionar.
 */
export function EmailForm({ currentEmail }: { currentEmail: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<
    ActionResult<{ email: string }> | null,
    FormData
  >(updateEmailAction, null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} className="form" action={action}>
      {state && !state.ok && <div className="alert alert-error">{state.error}</div>}
      {state?.ok && state.data && (
        <div className="alert alert-ok">
          E-mail de login alterado para <strong>{state.data.email}</strong>. A
          senha atual continua valendo; use o novo e-mail para entrar da
          próxima vez.
        </div>
      )}
      <p className="muted small">
        Login atual: <strong>{currentEmail ?? "—"}</strong>. A troca é imediata
        — confira bem antes de salvar, pois este endereço passa a ser o seu
        acesso.
      </p>
      <div className="field">
        <label htmlFor="email">Novo e-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={200}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="email2">Confirmar novo e-mail</label>
        <input
          id="email2"
          name="email2"
          type="email"
          autoComplete="email"
          maxLength={200}
          required
        />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Alterando..." : "Alterar e-mail"}
      </button>
    </form>
  );
}

/**
 * Troca de senha via Auth. Quando `mustChange` (senha temporária do
 * administrador), conclui levando o usuário de volta ao painel.
 */
export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (password.length < 8) {
      setError("A senha precisa de ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setPending(true);
    const supabase = createSupabaseBrowser();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError("Não foi possível alterar a senha. Entre novamente e tente.");
      setPending(false);
      return;
    }
    await clearMustChangeAction();
    if (mustChange) {
      router.push("/app");
      router.refresh();
      return;
    }
    setPassword("");
    setConfirm("");
    setOk(true);
    setPending(false);
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      {ok && <div className="alert alert-ok">Senha alterada com sucesso.</div>}
      <div className="field">
        <label htmlFor="new-password">Nova senha</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="confirm-password">Confirmar nova senha</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Alterando..." : mustChange ? "Definir minha senha" : "Alterar senha"}
      </button>
    </form>
  );
}
