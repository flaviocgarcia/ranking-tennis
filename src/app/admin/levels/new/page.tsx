import Link from "next/link";
import type { Metadata } from "next";
import { requireGlobalAdmin } from "@/lib/auth/session";
import { LevelConfigForm } from "@/components/LevelConfigForm";

export const metadata: Metadata = { title: "Novo nível" };

export default async function NewLevelPage() {
  await requireGlobalAdmin();
  return (
    <>
      <h1 className="page-title">Novo nível</h1>
      <p className="page-sub">
        Exemplos: A, B, C, D, Feminino, Iniciante. Você pode ajustar tudo depois.
      </p>
      <div className="card">
        <LevelConfigForm />
      </div>
      <p className="small">
        <Link href="/admin/levels">← Níveis</Link>
      </p>
    </>
  );
}
