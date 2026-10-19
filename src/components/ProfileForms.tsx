"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clearMustChangeAction, updateNameAction } from "@/actions/auth";
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
