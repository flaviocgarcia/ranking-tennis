-- ============================================================
-- 0009_chat_push.sql — Chat do clube + Web Push
--
-- Chat: canal GERAL único (todo mundo aprovado é membro) + conversas
-- diretas (DM) por par de jogadores. Mensagens são imutáveis (sem
-- update/delete para o cliente); leituras limitadas a membros via RLS.
--
-- Push: inscrições Web Push (chaves VAPID) por usuário. O envio
-- acontece nas server actions (lib `web-push`); inscrições mortas
-- (404/410) são removidas no próprio envio.
-- ============================================================

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('geral', 'dm')),
  -- dm: par ordenado "uuidMenor|uuidMaior" — garante UMA conversa por par.
  dm_pair text unique,
  created_at timestamptz not null default now(),
  constraint chat_channels_dm_pair_check check ((kind = 'dm') = (dm_pair is not null))
);

create table if not exists public.chat_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_members_user on public.chat_members (user_id);
create index if not exists idx_chat_messages_channel_created
  on public.chat_messages (channel_id, created_at desc);
create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions (user_id);

-- ------------------------------------------------------------
-- Canal geral + todos os perfis como membros + entra-no-geral para
-- usuários novos (trigger). Quem ainda está com cadastro pendente já
-- entra; as actions de chat bloqueiam o envio até a aprovação.
-- ------------------------------------------------------------
insert into public.chat_channels (kind) values ('geral')
on conflict do nothing;

insert into public.chat_members (channel_id, user_id)
select c.id, p.id
from public.chat_channels c
cross join public.profiles p
where c.kind = 'geral'
on conflict do nothing;

create or replace function public.chat_join_general()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_members (channel_id, user_id)
  select id, new.id from public.chat_channels where kind = 'geral'
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_chat_join_general on public.profiles;
create trigger trg_chat_join_general
  after insert on public.profiles
  for each row execute function public.chat_join_general();

-- ------------------------------------------------------------
-- Membership sem recursão de RLS: as policies precisam saber "este
-- usuário participa do canal?" consultando `chat_members` — mas uma
-- policy USING que consulta a própria tabela gera recursão infinita.
-- A função SECURITY DEFINER resolve: roda como o dono (dono da tabela
-- não sofre RLS) e expõe apenas o "sim/não" do chamador.
-- ------------------------------------------------------------
create or replace function public.is_chat_member(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where channel_id = p_channel and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_chat_member(uuid) from public, anon;
grant execute on function public.is_chat_member(uuid) to authenticated;

-- ------------------------------------------------------------
-- Resumo das minhas conversas (não lidas + última mensagem) em UMA
-- consulta. SECURITY DEFINER com guarda `p_user = auth.uid()` — só o
-- próprio usuário lê o próprio resumo.
-- ------------------------------------------------------------
create or replace function public.chat_channel_summary(p_user uuid)
returns table (
  channel_id uuid,
  unread bigint,
  last_at timestamptz,
  last_body text,
  last_sender uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.channel_id,
    count(msg.*) filter (
      where msg.created_at > m.last_read_at and msg.sender_id <> p_user
    ) as unread,
    max(msg.created_at) as last_at,
    (array_agg(msg.body order by msg.created_at desc))[1] as last_body,
    (array_agg(msg.sender_id order by msg.created_at desc))[1] as last_sender
  from chat_members m
  left join chat_messages msg on msg.channel_id = m.channel_id
  where m.user_id = p_user and p_user = auth.uid()
  group by m.channel_id;
$$;

revoke execute on function public.chat_channel_summary(uuid) from public, anon;
grant execute on function public.chat_channel_summary(uuid) to authenticated;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.chat_channels enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.push_subscriptions enable row level security;

-- Canais: leitura para membros (e admin); escrita só via servidor
-- (service role) — nenhuma policy de insert/update/delete para o cliente.
drop policy if exists "chat_channels_member_read" on public.chat_channels;
create policy "chat_channels_member_read" on public.chat_channels
  for select to authenticated
  using (
    public.is_admin()
    or public.is_chat_member(id)
  );

-- Membros: quem participa do canal vê os membros dele (necessário para
-- identificar o parceiro da DM); atualiza apenas o próprio last_read_at.
drop policy if exists "chat_members_channel_read" on public.chat_members;
create policy "chat_members_channel_read" on public.chat_members
  for select to authenticated
  using (
    public.is_admin()
    or public.is_chat_member(channel_id)
  );

drop policy if exists "chat_members_self_update" on public.chat_members;
create policy "chat_members_self_update" on public.chat_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Mensagens: membros leem; membro envia como ele mesmo. Sem update/
-- delete para o cliente (histórico imutável no MVP).
drop policy if exists "chat_messages_member_read" on public.chat_messages;
create policy "chat_messages_member_read" on public.chat_messages
  for select to authenticated
  using (public.is_chat_member(channel_id));

drop policy if exists "chat_messages_member_insert" on public.chat_messages;
create policy "chat_messages_member_insert" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_chat_member(channel_id)
  );

-- Inscrições de push: cada usuário cuida das próprias.
drop policy if exists "push_subscriptions_self_read" on public.push_subscriptions;
create policy "push_subscriptions_self_read" on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_subscriptions_self_insert" on public.push_subscriptions;
create policy "push_subscriptions_self_insert" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_self_delete" on public.push_subscriptions;
create policy "push_subscriptions_self_delete" on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- Privilégios (mesmo padrão do 0001; default privileges do Supabase
-- já cobrem, mas deixamos explícito)
-- ------------------------------------------------------------
grant select, insert, update, delete
  on public.chat_channels, public.chat_members, public.chat_messages,
     public.push_subscriptions
  to authenticated;
grant all
  on public.chat_channels, public.chat_members, public.chat_messages,
     public.push_subscriptions
  to service_role;

-- ------------------------------------------------------------
-- Realtime: só chat_messages (INSERT). O browser assina o canal com a
-- sessão do usuário e o Realtime aplica as policies de SELECT acima —
-- cada um só recebe mensagens dos canais de que participa.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
