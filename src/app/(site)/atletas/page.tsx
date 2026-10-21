import type { Metadata } from "next";
import Link from "next/link";
import { listPublicAthletes } from "@/lib/queries/players";
import { createSupabaseAnon } from "@/lib/supabase/anon";
import { Avatar } from "@/components/Avatar";

export const metadata: Metadata = {
  title: "Atletas",
  description: "Relação de atletas participantes do F CHALLENGER.",
};

export const revalidate = 3600;

/**
 * Relação pública de participantes — ESTÁTICA com ISR horário (mesmo
 * padrão de /rankings). A política `profiles_public_names` devolve
 * apenas atletas ativos e aprovados: cadastros pendentes e contas de
 * teste ficam de fora sem nenhum filtro extra nesta página.
 */
async function loadAthletes() {
  try {
    const rows = await listPublicAthletes(createSupabaseAnon());
    return { kind: "ok" as const, rows };
  } catch (e) {
    console.error("[atletas] falha ao carregar:", e);
    return { kind: "error" as const };
  }
}

export default async function AtletasPage() {
  const data = await loadAthletes();

  if (data.kind === "error") {
    return (
      <>
        <h1 className="page-title">Atletas</h1>
        <div className="card">
          <p className="muted">
            Não foi possível carregar a relação agora. Tente novamente em
            instantes.
          </p>
        </div>
      </>
    );
  }

  const rows = data.rows;

  return (
    <>
      <h1 className="page-title">Atletas</h1>
      <p className="page-sub">
        {rows.length} atleta{rows.length === 1 ? "" : "s"} participante
        {rows.length === 1 ? "" : "s"} ·{" "}
        <Link href="/rankings">Classificação</Link> ·{" "}
        <Link href="/results">Resultados</Link>
      </p>

      {rows.length === 0 ? (
        <div className="card">
          <p className="muted">Nenhum atleta cadastrado até o momento.</p>
        </div>
      ) : (
        <div className="grid mt">
          {rows.map((p) => (
            <div className="card athlete" key={p.id}>
              <Avatar initials={p.initials} />
              <span className="athlete-name">{p.name}</span>
              {p.ref_level && (
                <span className="badge badge-level">{p.ref_level}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
