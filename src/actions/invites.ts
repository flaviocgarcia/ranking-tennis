"use server";

import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getInviteByCodeAdmin } from "@/lib/queries/invites";
import { emailString, normalizeActivationCode, optionalString, requiredString } from "@/lib/validation";
import type { ActionResult } from "@/types/db";

/**
 * Pré-cadastro (convites) e ATIVAÇÃO DE CONTA do F CHALLENGER.
 *
 * Os 51 atletas da planilha não têm e-mail: o administrador gera um
 * CÓDIGO de ativação para cada um e envia (WhatsApp). O atleta entra em
 * /ativar com o código, escolhe e-mail e senha e a conta nasce já
 * aprovada e vinculada ao convite (o código é de uso único).
 *
 * Segurança:
 *  - a leitura de `invites` só existe aqui (chave de service; a tabela é
 *    privada — sem política de RLS e sem grants para anon/authenticated);
 *  - o código é a credencial (8 caracteres, alfabeto sem caracteres
 *    ambíguos); o e-mail/senha passam a valer depois da ativação;
 *  - a criação usa `email_confirm: true` no servidor: nada de confirmação
 *    por e-mail no meio do caminho, e `handle_new_user` nasce com
 *    `pending_approval = true` (falha "fechado") — a ativação desmarca
 *    logo em seguida, pois o convite É a aprovação.
 */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem O/0/I/1/L
const CODE_LENGTH = 8;

/** Código aleatório sem caracteres ambíguos (ex.: "K3MQ7XZ2"). */
function randomActivationCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/**
 * Etapa 1 de /ativar: valida o código e devolve o nome do atleta.
 * (Só quem tem o código vê o nome — o código é a credencial.)
 */
export async function previewInviteAction(
  rawCode: unknown,
): Promise<ActionResult<{ name: string; phone: string | null }>> {
  try {
    const code = normalizeActivationCode(rawCode);
    if (code.length < 4) {
      return { ok: false, error: "Informe o código de ativação." };
    }
    const admin = createSupabaseAdmin();
    const invite = await getInviteByCodeAdmin(admin, code);
    if (!invite) return { ok: false, error: "Código inválido. Confira com o administrador." };
    if (invite.activated_at) {
      return {
        ok: false,
        error: "Este código já foi usado. Entre com o e-mail e a senha que você definiu.",
      };
    }
    return { ok: true, data: { name: invite.name, phone: invite.phone } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao validar o código." };
  }
}

/**
 * Etapa 2 de /ativar: o atleta escolhe e-mail + senha e a ativação
 * conclui — depois já entra na sessão.
 *
 * Dois caminhos:
 *  - CONTA PRÉ-CRIADA (importação da planilha): a conta placeholder já
 *    existe e está vinculada ao convite; aqui ela só recebe o e-mail
 *    definitivo, a senha e a marcação `activated_at`;
 *  - CONVITE SEM CONTA (criado no painel depois): a conta é criada na
 *    hora (`createUser`) e já nasce aprovada.
 */
export async function activateAccountAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const code = normalizeActivationCode(formData.get("code"));
    const email = emailString(formData.get("email"));
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("password2") ?? "");

    if (password.length < 8) {
      return { ok: false, error: "A senha precisa de ao menos 8 caracteres." };
    }
    if (password !== confirm) {
      return { ok: false, error: "A senha e a confirmação não conferem." };
    }

    const admin = createSupabaseAdmin();
    const invite = await getInviteByCodeAdmin(admin, code);
    if (!invite) return { ok: false, error: "Código inválido. Confira com o administrador." };
    if (invite.activated_at) {
      return {
        ok: false,
        error: "Este código já foi usado. Entre com o e-mail e a senha que você definiu.",
      };
    }

    const nowIso = new Date().toISOString();
    const duplicateMsg =
      "Já existe uma conta com este e-mail. Entre por ela e fale com o " +
      "administrador para concluir a ativação.";

    if (invite.auth_user_id) {
      // --- Conta pré-criada (importação): define e-mail + senha. ---
      const userId = invite.auth_user_id;
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        email,
        password,
        email_confirm: true,
      });
      if (updErr) {
        if (/already|email_exists|registrad/i.test(updErr.message)) {
          return { ok: false, error: duplicateMsg };
        }
        throw new Error(updErr.message);
      }

      // Uso único do código (a condição `.is` fecha corrida).
      const { data: marked, error: markErr } = await admin
        .from("invites")
        .update({ activated_at: nowIso, consumed_at: nowIso })
        .eq("id", invite.id)
        .is("activated_at", null)
        .select("id");
      if (markErr) throw new Error(markErr.message);
      if (!marked || marked.length === 0) {
        return { ok: false, error: "Este código já foi usado em outra ativação." };
      }

      // Perfil: e-mail real (vinha o placeholder) + aprovação final.
      const { error: approveErr } = await admin
        .from("profiles")
        .update({ email, pending_approval: false })
        .eq("id", userId);
      if (approveErr) throw new Error(approveErr.message);
    } else {
      // --- Convite sem conta: cria na hora, já confirmada. ---
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: invite.name },
        });
      if (createErr || !created.user) {
        const duplicate =
          createErr?.status === 422 || /already|registrad/i.test(createErr?.message ?? "");
        if (duplicate) return { ok: false, error: duplicateMsg };
        throw new Error(createErr?.message ?? "Falha ao criar a conta.");
      }
      const userId = created.user.id;

      const { data: linked, error: linkErr } = await admin
        .from("invites")
        .update({
          auth_user_id: userId,
          consumed_at: nowIso,
          activated_at: nowIso,
        })
        .eq("id", invite.id)
        .is("activated_at", null)
        .select("id");
      if (linkErr) throw new Error(linkErr.message);
      if (!linked || linked.length === 0) {
        return { ok: false, error: "Este código já foi usado em outra ativação." };
      }

      // `handle_new_user` nasceu pendente (falha "fechado"): o convite É
      // a aprovação, então desmarca aqui, no servidor.
      const { error: approveErr } = await admin
        .from("profiles")
        .update({ pending_approval: false })
        .eq("id", userId);
      if (approveErr) throw new Error(approveErr.message);
    }

    // Entra na sessão (cookies gravados pela server client).
    const server = await createSupabaseServer();
    const { error: signInErr } = await server.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      return {
        ok: false,
        error:
          "Conta ativada, mas o login automático falhou (" +
          `${signInErr.message}). Entre pela tela de login.`,
      };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao ativar." };
  }
}

/**
 * Criar um convite (administrador): nome + telefone/nível da planilha.
 * Devolve o código gerado para o admin enviar ao atleta.
 */
export async function createInviteAction(
  _prev: ActionResult<{ code: string; name: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ code: string; name: string }>> {
  try {
    await requireAdmin();
    const name = requiredString(formData.get("name"), "Nome", 120);
    const phone = optionalString(formData.get("phone"), 40);
    const refLevel = optionalString(formData.get("ref_level"), 40);

    const admin = createSupabaseAdmin();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomActivationCode();
      const { data, error } = await admin
        .from("invites")
        .insert({
          name,
          phone,
          ref_level: refLevel,
          activation_code: code,
        })
        .select("activation_code, name");
      if (!error && data && data[0]) {
        return { ok: true, data: { code: data[0].activation_code, name } };
      }
      lastError = error;
      // 23505 = violação de unique (colisão de código — sortuda, repete).
      if (error && !String(error.code ?? "").includes("23505")) break;
    }
    throw new Error(
      lastError instanceof Error ? lastError.message : "Falha ao criar o convite.",
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar convite." };
  }
}

/** Gera um novo código para um convite ainda não ativado. */
export async function regenerateInviteCodeAction(formData: FormData): Promise<void> {
  const info = await requireAdmin();
  void info;
  const id = requiredString(formData.get("id"), "Convite", 60);

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("invites")
    .update({ activation_code: randomActivationCode() })
    .eq("id", id)
    .is("activated_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Convite não encontrado ou já ativado.");
  }
}

/**
 * Remove um convite ainda sem conta (nunca um com conta pré-criada —
 * os 84 jogos históricos dependem do perfil — nem um já ativado).
 */
export async function deleteInviteAction(formData: FormData): Promise<void> {
  const info = await requireAdmin();
  void info;
  const id = requiredString(formData.get("id"), "Convite", 60);

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("invites")
    .delete()
    .eq("id", id)
    .is("auth_user_id", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      "Convite não encontrado, já ativado ou com conta pré-criada (não é possível remover).",
    );
  }
}
