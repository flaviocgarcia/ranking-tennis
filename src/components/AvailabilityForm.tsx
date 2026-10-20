"use client";

import { useActionState } from "react";
import { markAvailabilityAction } from "@/actions/availability";
import { AVAILABILITY_SLOTS, SLOT_LABELS } from "@/lib/domain/availability";

/**
 * Formulário "quero jogar nesta data". É client component porque o
 * resultado do envio (erro/sucesso) só é observável via useActionState.
 * O sucesso já revalida /agenda no servidor — nada de polling.
 */
export function AvailabilityForm({
  minDate,
  maxDate,
}: {
  minDate: string;
  maxDate: string;
}) {
  const [state, action, pending] = useActionState(markAvailabilityAction, null);

  return (
    <form className="form" action={action}>
      {state && !state.ok && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}
      {state && state.ok && (
        <div className="alert alert-ok" role="status">
          Disponibilidade marcada — a agenda pública já foi atualizada.
        </div>
      )}
      <div className="inline-fields">
        <div className="field">
          <label htmlFor="play_date">Data</label>
          <input
            id="play_date"
            name="play_date"
            type="date"
            min={minDate}
            max={maxDate}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="slot">Período</label>
          <select id="slot" name="slot" defaultValue="any">
            {AVAILABILITY_SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Marcando..." : "Quero jogar nesta data"}
      </button>
    </form>
  );
}
