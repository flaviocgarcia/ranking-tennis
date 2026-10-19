-- ============================================================
-- 0001_initial.sql — estrutura base do ranking de tênis
-- Compatível com Supabase Free (PostgreSQL gerenciado).
-- Aplicar na ordem: 0001, depois 0002 (RLS).
-- ============================================================

-- Níveis/categorias (A, B, C, D, Feminino, ...). A configuração de formato
-- da partida, pontuação e desempate vive em `config` (JSONB) e é 100%
-- editável pelo administrador.
create table if not exists public.levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  config jsonb not null default '{
    "setsToWin": 2,
    "superTiebreak": {"enabled": true, "points": 10},
    "scoring": {"winStraight": 3, "winExtended": 2, "loss": 0},
    "tiebreakers": ["wins", "head_to_head", "set_diff", "game_diff"]
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Jogadores (perfis ligados ao auth.users).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null,
  initials text not null default '?',
  role text not null default 'player' check (role in ('admin', 'player')),
  level_id uuid references public.levels (id) on delete set null,
  active boolean not null default true,
  must_change_password boolean not null default false,
  telegram_id bigint unique,
  telegram_link_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partidas/resultados. `sets` é o placar detalhado: [[6,4],[5,7],[10,6]]
-- (sets na ordem: jogador 1, jogador 2).
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.levels (id) on delete cascade,
  player1_id uuid not null references public.profiles (id) on delete restrict,
  player2_id uuid not null references public.profiles (id) on delete restrict,
  sets jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  reported_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  played_on date not null default current_date,
  source text not null default 'web' check (source in ('web', 'telegram', 'admin')),
  -- Referência idempotente de origem externa (ex.: update_id do Telegram),
  -- usada para ignorar reenvios duplicados do webhook.
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_distinct_players check (player1_id <> player2_id)
);

-- Snapshot publicado da classificação (única fonte de leitura do ranking;
-- recalculada apenas quando um resultado oficial muda ou na publicação manual).
create table if not exists public.ranking_snapshots (
  level_id uuid primary key references public.levels (id) on delete cascade,
  data jsonb not null,
  computed_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Índices (somente os necessários para as consultas da aplicação)
-- ------------------------------------------------------------
create index if not exists idx_levels_active_sort on public.levels (active, sort_order);
create index if not exists idx_profiles_level_active on public.profiles (level_id) where active;
create index if not exists idx_profiles_name_lower on public.profiles (lower(name));
create index if not exists idx_matches_level_status on public.matches (level_id, status);
create index if not exists idx_matches_played_on on public.matches (played_on desc);
create index if not exists idx_matches_player1 on public.matches (player1_id);
create index if not exists idx_matches_player2 on public.matches (player2_id);
-- Reenvios duplicados do webhook do Telegram são ignorados.
create unique index if not exists uq_matches_external_ref
  on public.matches (external_ref) where external_ref is not null;

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_levels_touch on public.levels;
create trigger trg_levels_touch before update on public.levels
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_matches_touch on public.matches;
create trigger trg_matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Criação automática do perfil ao cadastrar usuário (self-signup ou
-- criação pelo administrador — ambas passam por auth.users).
-- Atribui automaticamente o primeiro nível ativo quando houver.
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

  select id into v_level from public.levels
    where active order by sort_order, code limit 1;

  v_initials := coalesce(
    nullif(new.raw_user_meta_data ->> 'initials', ''),
    upper(
      left(split_part(v_name, ' ', 1), 1) ||
      coalesce(nullif(split_part(v_name, ' ', 2), ''), '')
    )
  );

  insert into public.profiles (
    id, email, name, initials, role, level_id, must_change_password, telegram_link_code
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
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- is_admin(): usada nas políticas de RLS. SECURITY DEFINER para não
-- gerar recursão com as políticas da própria tabela profiles.
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

revoke execute on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated, service_role;

-- ------------------------------------------------------------
-- Privilégios. O servidor (server components/actions) faz todas as
-- leituras/escritas; o navegador só usa o Auth. Mesmo assim, RLS +
-- privégios por coluna impedem escrita direta via API REST.
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated, service_role;
grant insert, update, delete on all tables in schema public to authenticated, service_role;

-- profiles: clientes autenticados só atualizam colunas próprias seguras.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (name, initials, must_change_password, telegram_id, telegram_link_code, updated_at)
  on public.profiles to authenticated;

-- service_role: acesso completo (ações administrativas e bot no servidor).
grant all on public.levels, public.profiles, public.matches, public.ranking_snapshots
  to service_role;

-- Garante que a chave de serviço ignora RLS (necessário para as ações
-- administrativas executadas no servidor após checagem de sessão).
-- No Supabase a role service_role já é gerenciada pela plataforma e já vem
-- com bypassrls. Em Postgres local, aplicamos; se não houver permissão,
-- apenas avisamos (não interrompe a migration).
do $$
begin
  alter role service_role bypassrls;
exception
  when insufficient_privilege then
    raise notice 'Sem permissão para alterar service_role (normal no Supabase); ignorando.';
end $$;
