import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { listInvitesAdmin } from "@/lib/queries/invites";
import { ConvitesManager } from "@/components/ConvitesManager";

export const metadata: Metadata = { title: "Convites" };

/**
 * Convites e ativação — pré-cadastro dos atletas do F CHALLENGER.
 * A tabela `invites` é privada (migration 0006): a leitura usa a chave
 * de service, então a página roda no servidor com requireAdmin().
 */
export default async function AdminInvitesPage() {
  const info = await requireAdmin();
  // Convites são globais (gestão do torneio): admin de escopo não acessa.
  if (adminScope(info)) notFound();

  const invites = await listInvitesAdmin(createSupabaseAdmin());

  return (
    <>
      <h1 className="page-title">Convites e ativação</h1>
      <p className="page-sub">
        Os atletas do torneio criam a própria conta com o código abaixo — envie
        por WhatsApp. O código é de uso único.
      </p>
      <ConvitesManager invites={invites} />
      <p className="small">
        <a href="/admin/players">→ Jogadores (contas, aprovações e senhas)</a>
      </p>
    </>
  );
}
