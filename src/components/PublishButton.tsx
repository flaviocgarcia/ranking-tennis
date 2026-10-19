"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishRankingAction } from "@/actions/levels";

/** Publica/republica o ranking de um nível (revalidação manual, §3). */
export function PublishButton({ levelId }: { levelId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="row-actions">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          const fd = new FormData();
          fd.set("id", levelId);
          startTransition(async () => {
            try {
              await publishRankingAction(fd);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Falha ao publicar.");
            }
          });
        }}
      >
        {pending ? "Publicando..." : "Publicar agora"}
      </button>
      {error && (
        <span className="small" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
