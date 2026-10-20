-- ============================================================
-- 0005_availability.sql — agenda de disponibilidade
--
-- "Quem quer jogar em determinada data": o jogador marca sua
-- disponibilidade (data + período) e a página pública /agenda mostra
-- quem está marcado, agrupado por data e nível.
--
-- Princípios (mesmos das migrations anteriores):
-- * leitura pública mínima — só o que a agenda exibe, e apenas de
--   perfis ATIVOS (o join interno com profiles cai no RLS do 0002:
--   para o anon, linha de jogador inativo nem existe);
-- * escrita apenas do próprio jogador, sempre no nível atual dele,
--   uma marca por data (reenvio vira atualização via upsert);
-- * zero rotinas periódicas: datas passadas não precisam ser
--   apagadas — são filtradas na leitura.
-- ============================================================

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  level_id uuid not null references public.levels (id) on delete cascade,
  play_date date not null,
  -- período em que a pessoa pode jogar naquela data
  slot text not null default 'any'
    check (slot in ('morning', 'afternoon', 'evening', 'any')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- uma marca por jogador por data (segundo envio atualiza a primeira)
  constraint availability_player_date_key unique (player_id, play_date)
);

create index if not exists availability_play_date_idx
  on public.availability (play_date, level_id);

create trigger trg_availability_touch before update on public.availability
  for each row execute function public.touch_updated_at();

alter table public.availability enable row level security;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
-- anon: leitura pública apenas das colunas que a agenda exibe
-- (a paridade com o padrão de privacidade da 0002/0003).
revoke all on public.availability from anon;
grant select (id, player_id, level_id, play_date, slot)
  on public.availability to anon;

-- authenticated: operações de escrita (o select comum já vem do
-- default privilege do projeto; a política abaixo restringe o alcance)
grant insert, update, delete on public.availability to authenticated;
grant all on public.availability to service_role;

-- ------------------------------------------------------------
-- Políticas
-- ------------------------------------------------------------
-- Agenda é informação de coordenação do clube: visível para todos
-- (nomes de jogadores já aparecem no ranking público).
drop policy if exists "availability_public_read" on public.availability;
create policy "availability_public_read" on public.availability
  for select to anon, authenticated
  using (true);

-- Só a própria marca, e somente no nível em que o jogador está hoje
-- (impede marcar por conta de outrem ou "mudar de nível" na agenda).
drop policy if exists "availability_insert_self" on public.availability;
create policy "availability_insert_self" on public.availability
  for insert to authenticated
  with check (
    player_id = auth.uid()
    and level_id = (select p.level_id from public.profiles p where p.id = auth.uid())
  );

-- Mesma regra no UPDATE: necessário porque o formulário faz upsert
-- (mesma data marcada de novo => atualiza período/nível).
drop policy if exists "availability_update_self" on public.availability;
create policy "availability_update_self" on public.availability
  for update to authenticated
  using (player_id = auth.uid())
  with check (
    player_id = auth.uid()
    and level_id = (select p.level_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "availability_delete_self" on public.availability;
create policy "availability_delete_self" on public.availability
  for delete to authenticated
  using (player_id = auth.uid());

-- Defesa adicional: administrador pode limpar marcas (ex.: jogador
-- que saiu do clube) — mesma estrutura das demais tabelas.
drop policy if exists "availability_admin_all" on public.availability;
create policy "availability_admin_all" on public.availability
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
