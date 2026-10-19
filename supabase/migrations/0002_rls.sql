-- ============================================================
-- 0002_rls.sql — Row Level Security
--
-- Princípios:
-- * Leituras públicas (nível ativo, snapshot publicado) para anon.
-- * Jogadores autenticados leem dados internos do clube; escrevem
--   apenas o que podem (resultado pendente reportado por eles,
--   dados próprios de perfil).
-- * Toda escrita administrativa acontece NO SERVIDOR após checagem
--   de sessão, usando a chave de service (bypass RLS). As políticas
--   de admin abaixo existem como defesa adicional.
-- * Nenhum dado dependente de sessão é servido por cache público
--   (as páginas privadas nunca são estáticas).
-- ============================================================

alter table public.levels enable row level security;
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.ranking_snapshots enable row level security;

-- ------------------------------------------------------------
-- levels
-- ------------------------------------------------------------
drop policy if exists "levels_public_read" on public.levels;
create policy "levels_public_read" on public.levels
  for select to anon, authenticated
  using (active = true);

drop policy if exists "levels_admin_all" on public.levels;
create policy "levels_admin_all" on public.levels
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------
drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_authenticated" on public.profiles
  for select to authenticated
  using (true);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- matches
-- ------------------------------------------------------------
-- Partidas pendentes/confirmadas são visíveis apenas a autenticados
-- (nunca a anon — requisito: dados privados fora de cache público).
drop policy if exists "matches_read_authenticated" on public.matches;
create policy "matches_read_authenticated" on public.matches
  for select to authenticated
  using (true);

-- Qualquer participante pode informar um resultado; entra como pendente.
drop policy if exists "matches_insert_reporter" on public.matches;
create policy "matches_insert_reporter" on public.matches
  for insert to authenticated
  with check (
    status = 'pending'
    and reported_by = auth.uid()
    and (player1_id = auth.uid() or player2_id = auth.uid())
  );

-- Quem informou pode desistir de uma pendente (não uma confirmada).
drop policy if exists "matches_reporter_withdraw" on public.matches;
create policy "matches_reporter_withdraw" on public.matches
  for delete to authenticated
  using (reported_by = auth.uid() and status = 'pending');

drop policy if exists "matches_admin_all" on public.matches;
create policy "matches_admin_all" on public.matches
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- ranking_snapshots (leitura pública; escrita só via servidor)
-- ------------------------------------------------------------
drop policy if exists "snapshots_public_read" on public.ranking_snapshots;
create policy "snapshots_public_read" on public.ranking_snapshots
  for select to anon, authenticated
  using (true);

drop policy if exists "snapshots_admin_write" on public.ranking_snapshots;
create policy "snapshots_admin_write" on public.ranking_snapshots
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- Exposição mínima de perfis (privacidade)
--
-- O auto-cadastro (/register) é aberto, logo "authenticated" NÃO
-- significa "membro do clube". Revogamos do acesso comum as colunas
-- sensíveis: `email` e `telegram_link_code` (credencial de vínculo do
-- bot). Elas são lidas apenas:
--   * pelo próprio dono — e-mail via Auth (getSession), código via
--     chave de service no /profile e ao gerar um novo código;
--   * pelo painel administrativo (chave de service);
--   * pelo bot do Telegram (chave de service, webhook protegido).
-- Os grants de coluna já restritem também UPDATE (0001).
-- ------------------------------------------------------------
revoke select on public.profiles from anon;
revoke select on public.profiles from authenticated;
grant select (
    id, name, initials, role, level_id, active,
    must_change_password, telegram_id, created_at, updated_at
  )
  on public.profiles to authenticated;

-- Leitura PÚBLICA mínima de perfis: as páginas de ranking (estáticas) e a
-- revalidação sob demanda hidratam apenas id/nome/iniciais dos jogadores
-- ATIVOS — são os mesmos dados exibidos no ranking público. `email`,
-- `telegram_link_code` e demais colunas continuam privados para anon.
drop policy if exists "profiles_public_names" on public.profiles;
create policy "profiles_public_names" on public.profiles
  for select to anon
  using (active = true);
grant select (id, name, initials) on public.profiles to anon;
