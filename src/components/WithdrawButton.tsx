"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawMatchAction } from "@/actions/matches";

/** Retira uma pendente própria; erro exibido inline (sem derrubar a página). */
export function WithdrawButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) return <span className="small" style={{ color: "var(--danger)" }}>{error}</span>;

  return (
    <button
      type="button"
      className="btn btn-danger btn-sm"
      disabled={pending}
      onClick={() => {
        const fd = new FormData();
        fd.set("id", id);
        startTransition(async () => {
          try {
            await withdrawMatchAction(fd);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao retirar.");
          }
        });
      }}
    >
      {pending ? "Retirando..." : "Retirar"}
    </button>
  );
}
