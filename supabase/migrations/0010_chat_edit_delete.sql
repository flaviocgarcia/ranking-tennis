-- ============================================================
-- 0010_chat_edit_delete.sql — editar e apagar as PRÓPRIAS mensagens
--
-- O autor pode corrigir o corpo da mensagem (edited_at marca a
-- edição) ou apagá-la. Ninguém toca na mensagem dos outros: a RLS
-- restringe UPDATE/DELETE a sender_id = auth.uid(), e os privilégios
-- de UPDATE são por COLUNA (só body/edited_at) — nem o autor consegue
-- trocar channel_id/sender_id de uma mensagem.
-- ============================================================

alter table public.chat_messages
  add column if not exists edited_at timestamptz;

-- Colunas editáveis pelo cliente autenticado: só o corpo e o carimbo.
revoke update on public.chat_messages from authenticated;
grant update (body, edited_at) on public.chat_messages to authenticated;

-- Autor edita/apaga apenas as próprias mensagens (a política de
-- insert já exigia sender_id = auth.uid(); agora o update/delete
-- seguem a mesma regra).
drop policy if exists "chat_messages_self_update" on public.chat_messages;
create policy "chat_messages_self_update" on public.chat_messages
  for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

drop policy if exists "chat_messages_self_delete" on public.chat_messages;
create policy "chat_messages_self_delete" on public.chat_messages
  for delete to authenticated
  using (sender_id = auth.uid());

-- Replica identity FULL: sem isso o payload.old do evento realtime de
-- DELETE traz só a PK (id), o filtro `channel_id=eq.X` não bate e a
-- exclusão nunca chega aos outros membros do canal.
alter table public.chat_messages replica identity full;
