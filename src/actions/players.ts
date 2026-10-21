"use server";

import { revalidatePath } from "next/cache";
import { adminScope, requireAdmin } from "@/lib/auth/session";
import { adminAvailable, createSupabaseAdmin } from "@/lib/supabase/admin";
import { getProfileAdmin } from "@/lib/queries/players";
import { rebuildAndRevalidate } from "@/lib/ranking/service";
import { initialsFromName } from "@/lib/domain/initials";
import {
  emailString,
  requiredString,
  tempPassword,
  uuidString,
} from "@/lib/validation";
import type { ActionResult } from "@/types/db";

const NEED_SERVICE_KEY =
  "Recurso indisponível: configure SUPABASE_SERVICE_ROLE_KEY (Supabase > Settings > API) para cadastrar/editar usuários pelo painel.";

/**
 * Cria um usuário pelo administrador.
 *
 * - Cria o login no Auth com senha temporária (exibida UMA vez).
 * - O usuário entra e é obrigado a definir a própria senha
 *   (`must_change_password`), atendendo ao fluxo "adm cadastra,
 *   cada um define sua senha".
 */
export async function createPlayerAction(
  _prev: ActionResult<{ tempPassword: string; email: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ tempPassword: string; email: string }>> {
  try {
    const info = await requireAdmin();
    if (!adminAvailable()) return { ok: false, error: NEED_SERVICE_KEY };

    const name = requiredString(formData.get("name"), "Nome", 120);
    const email = emailString(formData.get("email"));

    // Administrador de nível só cria jogadores NO seu nível — e não cria
    // outros administradores (não concede privilégio que não possui).
    const scope = adminScope(info);
    const levelId = scope ?? uuidString(formData.get("level_id"), "Nível");
    const role = scope
      ? "player"
      : formData.get("role") === "admin"
        ? "admin"
        : "player";
    const adminLevelRaw = formData.get("admin_level_id");
    const adminLevelId =
      role === "admin" && !scope && adminLevelRaw
        ? uuidString(adminLevelRaw, "Nível do administrador")
        : null;

    const admin = createSupabaseAdmin();
    const password = tempPassword();

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        initials: initialsFromName(name),
        must_change: "true",
      },
    });
    if (error) {
      if (/already/i.test(error.message)) {
        return { ok: false, error: "Já existe um usuário com este e-mail." };
      }
      throw new Error(error.message);
    }

    // O trigger atribuía o primeiro nível ativo e sempre cria como
    // "player" (as metadata do cliente nunca definem papel). Aplica aqui,
    // no servidor com a chave de service, o nível e o papel escolhidos.
    const { error: updErr } = await admin
      .from("profiles")
      .update({
        level_id: levelId,
        role,
        admin_level_id: adminLevelId,
        // Usuário criado pelo administrador já nasce aprovado.
        pending_approval: false,
        must_change_password: true,
      })
      .eq("id", data.user.id);
    if (updErr) throw new Error(updErr.message);

    revalidatePath("/admin/players");
    return { ok: true, data: { tempPassword: password, email } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar usuário." };
  }
}

/** Edita jogador (nome, nível, ativo, papel). */
export async function updatePlayerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const info = await requireAdmin();
    if (!adminAvailable()) return { ok: false, error: NEED_SERVICE_KEY };

    const id = uuidString(formData.get("id"), "Jogador");
    const name = requiredString(formData.get("name"), "Nome", 120);
    const active = formData.get("active") === "true";

    const admin = createSupabaseAdmin();
    const existing = await getProfileAdmin(admin, id);
    if (!existing) return { ok: false, error: "Jogador não encontrado." };

    // Escopo: administrador de nível só gerencia jogadores do seu nível e
    // não altera outros administradores (nem concede esse papel).
    const scope = adminScope(info);
    if (scope) {
      if (existing.level_id !== scope) {
        return { ok: false, error: "Jogador fora do nível sob sua responsabilidade." };
      }
      if (existing.role === "admin" && existing.id !== info.userId) {
        return {
          ok: false,
          error: "Somente um administrador geral pode editar outro administrador.",
        };
      }
    }

    const levelRaw = formData.get("level_id");
    const levelId = scope
      ? existing.level_id
      : levelRaw
        ? uuidString(levelRaw, "Nível")
        : null;
    const role = scope
      ? existing.role
      : formData.get("role") === "admin"
        ? "admin"
        : "player";

    // Escopo administrativo: só o administrador geral define/edita.
    let adminLevelId: string | null = null;
    if (role === "admin") {
      if (scope) {
        adminLevelId = existing.admin_level_id;
      } else {
        const raw = formData.get("admin_level_id");
        adminLevelId = raw ? uuidString(raw, "Nível do administrador") : null;
      }
    }

    if (id === info.userId && (!active || role !== "admin")) {
      return { ok: false, error: "Você não pode remover seu próprio acesso de administrador." };
    }

    // Nível A–D do atleta (etiqueta da planilha; não altera o ranking).
    const refRaw = String(formData.get("ref_level") ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 10);
    const refLevel = /^[A-D](\+|[+/][A-D])?$/.test(refRaw) ? refRaw : null;

    const initials = initialsFromName(name);
    const { error } = await admin
      .from("profiles")
      .update({
        name,
        initials,
        level_id: levelId,
        ref_level: refLevel,
        active,
        role,
        admin_level_id: adminLevelId,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    // Nomes aparecem no ranking e na lista de jogos públicos =>
    // limpa o cache estático dessas páginas.
    revalidatePath("/rankings");
    revalidatePath("/results");
    revalidatePath("/admin/players");
    revalidatePath(`/admin/players/${id}`);

    // Desativar/ativar ou trocar de nível muda a composição do ranking:
    // recalcula os níveis envolvidos (antes e depois) para o snapshot não
    // divergir do recálculo (§5 — ver /admin/verify).
    const affectedLevels = new Set<string>();
    if (existing.level_id) affectedLevels.add(existing.level_id);
    if (levelId) affectedLevels.add(levelId);
    for (const lvl of affectedLevels) {
      await rebuildAndRevalidate(lvl);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao salvar." };
  }
}

/**
 * Gera nova senha temporária e exige que o usuário defina a própria
 * senha no próximo acesso.
 */
export async function resetPlayerPasswordAction(
  _prev: ActionResult<{ tempPassword: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ tempPassword: string }>> {
  try {
    const info = await requireAdmin();
    if (!adminAvailable()) return { ok: false, error: NEED_SERVICE_KEY };

    const id = uuidString(formData.get("id"), "Jogador");
    const admin = createSupabaseAdmin();
    const existing = await getProfileAdmin(admin, id);
    if (!existing) return { ok: false, error: "Jogador não encontrado." };

    const scope = adminScope(info);
    if (scope) {
      if (existing.level_id !== scope) {
        return { ok: false, error: "Jogador fora do nível sob sua responsabilidade." };
      }
      if (existing.role === "admin" && existing.id !== info.userId) {
        return {
          ok: false,
          error: "Somente um administrador geral pode redefinir a senha de outro administrador.",
        };
      }
    }

    const password = tempPassword();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) throw new Error(error.message);

    const { error: flagErr } = await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", id);
    if (flagErr) throw new Error(flagErr.message);

    return { ok: true, data: { tempPassword: password } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao redefinir senha." };
  }
}

/**
 * Aprova um auto-cadastro pendente (feito em /register com nível escolhido).
 *
 * Enquanto `pending_approval = true` o usuário pode entrar, mas não aparece
 * no ranking, não é sugerido como adversário e não pode informar resultados.
 * Ao aprovar, o ranking do nível é recalculado (o jogador passa a compor a
 * classificação com 0 ponto).
 */
export async function approvePlayerAction(formData: FormData): Promise<void> {
  const info = await requireAdmin();
  if (!adminAvailable()) throw new Error(NEED_SERVICE_KEY);

  const id = uuidString(formData.get("id"), "Jogador");
  const admin = createSupabaseAdmin();
  const existing = await getProfileAdmin(admin, id);
  if (!existing) throw new Error("Jogador não encontrado.");

  const scope = adminScope(info);
  if (scope && existing.level_id !== scope) {
    throw new Error("Jogador fora do nível sob sua responsabilidade.");
  }
  if (!existing.pending_approval) return;

  const { error } = await admin
    .from("profiles")
    .update({ pending_approval: false, active: true })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  revalidatePath("/admin/players");
  revalidatePath(`/admin/players/${id}`);

  // O jogador aprovado passa a fazer parte do ranking do nível.
  if (existing.level_id) await rebuildAndRevalidate(existing.level_id);
}
