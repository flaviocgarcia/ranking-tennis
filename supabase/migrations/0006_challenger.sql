-- ============================================================
-- 0006_challenger.sql — F CHALLENGER
--
-- Novo torneio (regras da planilha "F CHALLENGER R25"):
--  * Partida pode ser NORMAL (melhor de 3, 3º set é tiebreakão a 10),
--    GRAND SLAM (melhor de 5, sem tiebreakão) ou W.O. (incomparecimento).
--  * W.O.: 300/50 — exige informar o vencedor; sem sets.
--  * Limite de 2 partidas por semestre contra o mesmo adversário é
--    aplicado na server action (validação de aplicação, não constraint).
--  * Pontos caducam após 1 ano: a janela é aplicada na leitura do
--    ranking (o snapshot guarda as contribuições por data).
--
-- Também cria `invites`: pré-cadastro dos atletas da planilha (ainda
-- sem conta/e-mail). Cada convite tem um CÓDIGO DE ATIVAÇÃO — credencial
-- que dá direito a criar a conta. Por isso a tabela é privada: nenhuma
-- leitura para anon/authenticated, apenas service_role (ações do
-- servidor).
-- ============================================================

-- ------------------------------------------------------------
-- 1) matches: formato da partida + vencedor do W.O.
-- ------------------------------------------------------------
alter table public.matches
  add column if not exists format text not null default 'normal',
  add column if not exists walkover_winner smallint;

alter table public.matches
  drop constraint if exists matches_format_check;
alter table public.matches
  add constraint matches_format_check
    check (format in ('normal', 'grand_slam', 'walkover'));

alter table public.matches
  drop constraint if exists matches_walkover_winner_check;
alter table public.matches
  add constraint matches_walkover_winner_check
    check (walkover_winner is null or walkover_winner in (1, 2));

-- Consistência: W.O. exige vencedor e placar vazio; formatos com sets
-- não podem ter vencedor declarado.
alter table public.matches
  drop constraint if exists matches_walkover_consistent;
alter table public.matches
  add constraint matches_walkover_consistent
    check (
      (format = 'walkover' and walkover_winner is not null and sets = '[]'::jsonb)
      or (format <> 'walkover' and walkover_winner is null)
    );

-- A página pública de resultados exibe o distintivo (GRAND SLAM / W.O.).
grant select (format, walkover_winner) on public.matches to anon;

-- ------------------------------------------------------------
-- 2) invites: pré-cadastro de atletas sem conta (código de ativação)
-- ------------------------------------------------------------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  -- Nível de referência vindo da planilha (informativo; o torneio não
  -- tem divisão de classes).
  ref_level text,
  -- Credencial de ativação (única). Gerada na importação ou pelo admin.
  activation_code text not null unique,
  -- Preenchido quando o atleta ativa a conta.
  auth_user_id uuid unique references auth.users (id) on delete set null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invites enable row level security;

-- Os códigos são credenciais: nenhuma leitura direta do navegador.
revoke all on public.invites from anon, authenticated;
grant all on public.invites to service_role;

drop trigger if exists trg_invites_touch on public.invites;
create trigger trg_invites_touch before update on public.invites
  for each row execute function public.touch_updated_at();
