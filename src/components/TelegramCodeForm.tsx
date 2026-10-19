"use client";

import { useActionState } from "react";
import { regenerateTelegramCodeAction } from "@/actions/auth";

/**
 * Botão "Gerar novo código" com estado pendente, erro inline e exibição do
 * código gerado. Fica em um client component porque `<form action>` exige
 * função que retorne `void` — o resultado só é observável via
 * `useActionState` (a coluna do código é privada e não é relida na sessão).
 */
export function TelegramCodeForm() {
  const [state, action, pending] = useActionState(
    regenerateTelegramCodeAction,
    null,
  );

  return (
    <form action={action}>
      <button className="btn btn-secondary btn-sm" type="submit" disabled={pending}>
        {pending ? "Gerando..." : "Gerar novo código"}
      </button>
      {state && state.ok && state.data && (
        <span className="small" role="status">
          {" "}
          novo código: <code>{state.data.code}</code>
        </span>
      )}
      {state && !state.ok && (
        <span className="small alert-inline-error" role="alert">
          {" "}
          {state.error}
        </span>
      )}
    </form>
  );
}
