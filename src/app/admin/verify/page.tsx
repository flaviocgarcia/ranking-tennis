import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { VerifyPanel } from "@/components/VerifyPanel";

export const metadata: Metadata = { title: "Verificar consistência" };

/**
 * Verificação sob demanda (§5 do requisito): recalcula cada ranking a
 * partir dos resultados oficiais com a MESMA função de domínio e compara
 * com o snapshot publicado. Nada é alterado; nada roda periodicamente.
 */
export default async function VerifyPage() {
  await requireAdmin();
  return (
    <>
      <h1 className="page-title">Verificar consistência</h1>
      <p className="page-sub">
        Compara o ranking publicado com o recálculo a partir dos resultados
        confirmados — sem alterar dados.
      </p>
      <div className="card">
        <VerifyPanel />
      </div>
      <p className="small">
        <Link href="/admin">← Painel</Link>
      </p>
    </>
  );
}
