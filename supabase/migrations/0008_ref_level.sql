-- ============================================================
-- 0008 — Nível do atleta (ref_level) + relação pública de atletas
--
-- 1) `profiles.ref_level`: a letra de nível da planilha do F
--    CHALLENGER (A, B, C, D e as formas intermediárias que a
--    planilha usa: A+, B/A, B/C...). É uma ETIQUETA INFORMATIVA —
--    não entra no cálculo do ranking (o torneio não tem divisão de
--    classes, §1 do regulamento). Quem altera é só o administrador,
--    pela chave de serviço: `authenticated` recebe somente SELECT
--    (para exibir na relação de atletas), sem grant de UPDATE.
--
-- 2) A política pública de perfis passa a esconder também cadastros
--    pendentes de aprovação — quem ainda não foi aprovado não é
--    atleta participante em nenhuma página pública. A cláusula USING
--    de política não exige grant de coluna (mesmo mecanismo que já
--    escondia `active` do anon). As contas de teste E2E (e-mail
--    `demo-`) continuam visíveis para o anon (a agenda pública usa o
--    nome delas no E2E) e são filtradas só na relação /atletas.
-- ============================================================

alter table public.profiles
  add column if not exists ref_level text;

alter table public.profiles
  drop constraint if exists profiles_ref_level_check;
alter table public.profiles
  add constraint profiles_ref_level_check
  check (
    ref_level is null
    or ref_level ~ '^[A-D](\+|[+/][A-D])?$'
  );

comment on column public.profiles.ref_level is
  'Nível do atleta segundo a planilha (A-D; admite intermediários como A+ e B/C). Informativo — não altera o ranking.';

grant select (ref_level) on public.profiles to anon;

-- Backfill: a letra veio na importação do F CHALLENGER dentro do
-- convite (invites.ref_level); copia para o perfil de quem já ativou.
update public.profiles p
set ref_level = i.ref_level
from public.invites i
where i.auth_user_id = p.id
  and i.ref_level ~ '^[A-D](\+|[+/][A-D])?$';

drop policy if exists "profiles_public_names" on public.profiles;
create policy "profiles_public_names" on public.profiles
  for select to anon
  using (
    active = true
    and pending_approval = false
  );
