-- ============================================================
-- 0007_invites_activated_at.sql — F CHALLENGER
--
-- Separa "conta pré-criada" de "ativação concluída":
--
--  * A IMPORTAÇÃO dos 84 jogos históricos precisa que os atletas tenham
--    perfil (`matches.player1_id/2_id` exigem `profiles`, que nasce de
--    `auth.users`). Cada atleta recebe então uma conta PLACEHOLDER já
--    vinculada ao convite (auth_user_id), com e-mail provisório e senha
--    desconhecida — ninguém consegue entrar nela.
--  * `activated_at` nasce null e só é preenchido em /ativar, quando o
--    atleta DIGITA o código e escolhe o próprio e-mail e senha. É ele
--    que sinaliza "código usado" (o `auth_user_id` sozinho não pode:
--    já vem preenchido na importação).
--
-- Convites criados depois, pelo painel (/admin/convites), continuam sem
-- auth_user_id e a ativação cria a conta na hora (fluxo createUser).
-- ============================================================

alter table public.invites
  add column if not exists activated_at timestamptz;
