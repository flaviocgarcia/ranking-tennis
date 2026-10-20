"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  MAX_AHEAD_DAYS,
  addDaysISO,
  isSlot,
  todayISO,
} from "@/lib/domain/availability";
import { asString, dateString, uuidString } from "@/lib/validation";
import type { ActionResult } from "@/types/db";

/**
 * Marcar disponibilidade (upsert por jogador+data: reenviar a mesma
 * data apenas atualiza o período). O RLS da 0005 garante que só a
 * própria marca é gravada e sempre no nível atual do jogador.
 */
export async function markAvailabilityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const info = await requireUser();
    if (info.profile.pending_approval) {
      return {
        ok: false,
        error:
          "Seu cadastro ainda aguarda aprovação do administrador para usar a agenda.",
      };
    }
    const levelId = info.profile.level_id;
    if (!levelId) {
      return {
        ok: false,
        error: "Você ainda não foi incluído em um nível. Fale com o administrador.",
      };
    }

    const playDate = dateString(formData.get("play_date"), "Data");
    const today = todayISO();
    if (playDate < today) {
      return { ok: false, error: "Essa data já passou." };
    }
    if (playDate > addDaysISO(today, MAX_AHEAD_DAYS)) {
      return {
        ok: false,
        error: `Marque no máximo ${MAX_AHEAD_DAYS} dias de antecedência.`,
      };
    }

    const slot = asString(formData.get("slot")) || "any";
    if (!isSlot(slot)) return { ok: false, error: "Período inválido." };

    const supabase = await createSupabaseServer();
    const { error } = await supabase.from("availability").upsert(
      {
        player_id: info.userId,
        level_id: levelId,
        play_date: playDate,
        slot,
      },
      { onConflict: "player_id,play_date" },
    );
    if (error) throw new Error(error.message);

    // /agenda é estática: limpa o cache da rota na hora (mesmo
    // mecanismo usado após confirmar um resultado).
    revalidatePath("/agenda");
    revalidatePath("/app/agenda");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Não foi possível marcar.",
    };
  }
}

/** Remover a própria marca (RLS: só marcas do próprio jogador). */
export async function removeAvailabilityAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = uuidString(formData.get("id"), "Marcação");

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("availability")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error("Não foi possível remover essa marcação.");
  }

  revalidatePath("/agenda");
  revalidatePath("/app/agenda");
}
