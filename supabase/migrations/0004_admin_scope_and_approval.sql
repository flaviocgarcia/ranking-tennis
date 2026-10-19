-- ============================================================
-- 0004_admin_scope_and_approval.sql
--
-- Duas mudanças de produto:
--
--  1) Administrador com escopo de UM nível.
--     `admin_level_id` vazio = administrador GERAL (todos os níveis).
--     Preenchido = administrador SOMENTE daquele nível.
--     O escopo é aplicado nas server actions (todas as escritas
--     administrativas usam a chave de service, portanto a checagem
--     acontece no servidor, depois de `requireAdmin()`).
--
--  2) Auto-cadastro sujeito a aprovação.
--     Quem se cadastra em /register escolhe o nível, mas entra com
--     `pending_approval = true` e só participa do ranking/resultados
--     após o administrador aprovar no painel.
--
-- Observações de segurança:
--  * O trigger NUNCA lê `role` das metadata (escalação de privilégio).
--  * `pending_approval` nasce SEMPRE true para usuários criados no Auth.
--    A criação pelo administrador (chave de service) marca false na
--    sequência; o auto-cadastro permanece pendente até a aprovação.
--    Assim o fluxo falha "fechado" (nunca aprova por omissão).
--  * O nível escolhido no auto-cadastro vem das metadata, mas é
--    validado no banco (precisa existir e estar ativo); senão cai no
--    primeiro nível ativo.
-- ============================================================

alter table public.profiles
  add column if not exists admin_level_id uuid
    references public.levels(id) on delete set null,
  add column if not exists pending_approval boolean not null default false;

create index if not exists profiles_admin_level_idx
  on public.profiles (admin_level_id);
create index if not exists profiles_pending_idx
  on public.profiles (pending_approval)
  where pending_approval;

-- A sessão (role authenticated) precisa ler o escopo administrativo e a
-- situação de aprovação do próprio perfil. São dados de baixa
-- sensibilidade (não expõem e-mail/telefone); a leitura continua limitada
-- pelas políticas de RLS já existentes.
grant select (admin_level_id, pending_approval)
  on public.profiles to authenticated;

-- ------------------------------------------------------------
-- Trigger de criação de perfil: nível escolhido + aprovação pendente.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_level uuid;
  v_initials text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1));
  v_name := coalesce(nullif(trim(v_name), ''), 'Jogador');

  -- Nível escolhido no auto-cadastro (metadata). É validado aqui: precisa
  -- existir e estar ativo; qualquer outro valor cai no primeiro nível ativo.
  begin
    if (new.raw_user_meta_data ->> 'level_id') is not null then
      select id into v_level from public.levels
        where active
          and id = (new.raw_user_meta_data ->> 'level_id')::uuid
        limit 1;
    end if;
  exception
    when invalid_text_representation then
      v_level := null;
  end;

  if v_level is null then
    select id into v_level from public.levels
      where active order by sort_order, code limit 1;
  end if;

  v_initials := coalesce(
    nullif(new.raw_user_meta_data ->> 'initials', ''),
    upper(
      left(split_part(v_name, ' ', 1), 1) ||
      coalesce(nullif(split_part(v_name, ' ', 2), ''), '')
    )
  );

  insert into public.profiles (
    id, email, name, initials, role, level_id, must_change_password,
    telegram_link_code, pending_approval
  ) values (
    new.id,
    new.email,
    v_name,
    v_initials,
    -- NUNCA ler `role` das metadata: elas vêm do cliente e qualquer um pode
    -- chamar signUp() com metadata arbitrária (escalação de privilégio).
    -- O papel de admin é atribuído depois, no servidor, pela ação
    -- administrativa que usa a chave de service (ver createPlayerAction).
    'player',
    v_level,
    coalesce((new.raw_user_meta_data ->> 'must_change') = 'true', false),
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    -- Falha "fechado": todo usuário novo aguarda aprovação. A criação pelo
    -- administrador desmarca logo em seguida (mesma requisição, service key).
    true
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Defesa adicional em RLS: cadastro pendente não insere resultados.
-- (O app já bloqueia em `submitMatchAction`; isto fecha o caminho REST
-- direto com a chave anon + sessão do usuário.)
-- ------------------------------------------------------------
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and not pending_approval
  );
$$;

revoke execute on function public.is_approved() from public, anon, authenticated;
grant execute on function public.is_approved() to authenticated, service_role;

drop policy if exists "matches_insert_reporter" on public.matches;
create policy "matches_insert_reporter" on public.matches
  for insert to authenticated
  with check (
    status = 'pending'
    and reported_by = auth.uid()
    and (player1_id = auth.uid() or player2_id = auth.uid())
    and public.is_approved()
  );
