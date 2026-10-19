import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireGlobalAdmin } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getLevelAdmin } from "@/lib/queries/levels";
import { LevelConfigForm } from "@/components/LevelConfigForm";

export const metadata: Metadata = { title: "Editar nível" };

export default async function EditLevelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireGlobalAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const level = await getLevelAdmin(supabase, id);
  if (!level) notFound();

  return (
    <>
      <h1 className="page-title">Editar {level.name}</h1>
      <p className="page-sub">
        Alterações recalculam e republicam apenas este nível.
      </p>
      <div className="card">
        <LevelConfigForm
          levelId={level.id}
          initial={{
            code: level.code,
            name: level.name,
            slug: level.slug,
            sort_order: level.sort_order,
            active: level.active,
            config: level.config,
          }}
        />
      </div>
      <p className="small">
        <Link href="/admin/levels">← Níveis</Link>
      </p>
    </>
  );
}
