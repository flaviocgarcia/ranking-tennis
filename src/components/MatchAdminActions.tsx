"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteMatchAction, setMatchStatusAction } from "@/actions/matches";
import type { MatchStatus } from "@/types/db";

type Target = "confirmed" | "pending" | "rejected";

const LABEL: Record<Target, string> = {
  confirmed: "Confirmar",
  pending: "Reabrir",
  rejected: "Rejeitar",
};

/**
 * Ações administrativas sobre um resultado (server actions diretas,
 * com erro exibido inline). Nenhuma chamada extra além do clique.
 */
export function MatchAdminActions({
  id,
  status,
}: {
  id: string;
  status: MatchStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transitions: { target: Target; className: string }[] = [];
  if (status === "pending") {
    transitions.push(
      { target: "confirmed", className: "btn btn-sm" },
      { target: "rejected", className: "btn btn-danger btn-sm" },
    );
  } else {
    transitions.push({ target: "pending", className: "btn btn-secondary btn-sm" });
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha na operação.");
      }
    });
  }

  function setStatus(target: Target) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("target", target);
    run(() => setMatchStatusAction(fd));
  }

  function remove() {
    if (!window.confirm("Excluir este resultado definitivamente?")) return;
    const fd = new FormData();
    fd.set("id", id);
    run(() => deleteMatchAction(fd));
  }

  return (
    <span className="row-actions">
      {transitions.map((t) => (
        <button
          key={t.target}
          type="button"
          className={t.className}
          disabled={pending}
          onClick={() => setStatus(t.target)}
        >
          {pending ? "..." : LABEL[t.target]}
        </button>
      ))}
      <Link href={`/admin/results/${id}`} className="btn btn-secondary btn-sm">
        Editar
      </Link>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={pending}
        onClick={remove}
      >
        Excluir
      </button>
      {error && (
        <span className="small" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
