"use server";

import { revalidatePath } from "next/cache";
import { requireGlobalAdmin } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { rebuildRankingSnapshot, revalidateLevelPages } from "@/lib/ranking/service";
import { getLevelAdmin } from "@/lib/queries/levels";
import {
  boolish,
  intInRange,
  parseLevelConfig,
  requiredString,
  slugify,
  uuidString,
} from "@/lib/validation";
import type { ActionResult } from "@/types/db";
import type { LevelConfig } from "@/lib/domain/config";

interface LevelFields {
  code: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  config: LevelConfig;
}

function readLevelFields(formData: FormData): LevelFields {
  const code = requiredString(formData.get("code"), "Código", 20);
  const name = requiredString(formData.get("name"), "Nome", 80);
  const config = parseLevelConfig({
    setsToWin: formData.get("setsToWin"),
    superTiebreak: {
      enabled: formData.get("stEnabled"),
      points: formData.get("stPoints"),
    },
    scoring: {
      winStraight: formData.get("winStraight"),
      winExtended: formData.get("winExtended"),
      loss: formData.get("loss"),
      deciderLoserPoint: formData.get("deciderLoserPoint"),
    },
    tiebreakers: formData.getAll("tiebreakers"),
  });
  const slug = slugify(requiredString(formData.get("slug") || code, "Slug", 40));
  if (!slug) throw new Error("Código/Slug inválido.");
  return {
    code,
    name,
    slug,
    sortOrder: intInRange(formData.get("sort_order") ?? "0", "Ordem", 0, 9999),
    active: boolish(formData.get("active")),
    config,
  };
}

function revalidatePublic(fields: { slug: string }, oldSlug?: string): void {
  revalidateLevelPages(fields.slug, oldSlug);
  revalidatePath("/rules");
  // A lista de níveis do auto-cadastro também é estática (lida no build).
  revalidatePath("/register");
}

/** Cria um novo nível/categoria (A, B, C, D, Feminino, ...). */
export async function createLevelAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireGlobalAdmin();
    const fields = readLevelFields(formData);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("levels")
      .insert({
        code: fields.code,
        slug: fields.slug,
        name: fields.name,
        sort_order: fields.sortOrder,
        active: fields.active,
        config: fields.config,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: `Já existe um nível com código/slug "${fields.code}".` };
      }
      throw new Error(error.message);
    }

    // Publica o ranking (vazio) do nível novo para que a página exista com
    // snapshot válido desde o início.
    const result = await rebuildRankingSnapshot(data.id);
    revalidatePublic({ slug: result.slug });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar nível." };
  }
}

/**
 * Edita nível (nome, ordem, ativo e TODA a configuração).
 * A configuração alterada recalcula o ranking do nível imediatamente
 * e limpa apenas as páginas públicas afetadas.
 */
export async function updateLevelAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireGlobalAdmin();
    const id = uuidString(formData.get("id"), "Nível");
    const fields = readLevelFields(formData);

    const admin = createSupabaseAdmin();
    const existing = await getLevelAdmin(admin, id);
    if (!existing) return { ok: false, error: "Nível não encontrado." };

    const { error } = await admin
      .from("levels")
      .update({
        code: fields.code,
        slug: fields.slug,
        name: fields.name,
        sort_order: fields.sortOrder,
        active: fields.active,
        config: fields.config,
      })
      .eq("id", id);
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: `Já existe um nível com código/slug "${fields.code}".` };
      }
      throw new Error(error.message);
    }

    // A pontuação/desempate mudou => recalcula o ranking deste nível.
    const result = await rebuildRankingSnapshot(id);
    revalidatePublic({ slug: result.slug }, existing.slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao salvar nível." };
  }
}

/**
 * Publicação MANUAL da classificação: recalcula o snapshot (se preciso)
 * e revalida as páginas públicas deste nível. Sem cron, sem atualização
 * periódica.
 */
export async function publishRankingAction(formData: FormData): Promise<void> {
  await requireGlobalAdmin();
  const id = uuidString(formData.get("id"), "Nível");
  const result = await rebuildRankingSnapshot(id);
  revalidateLevelPages(result.slug);
}
