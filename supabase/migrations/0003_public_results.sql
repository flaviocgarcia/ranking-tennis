-- ============================================================
-- 0003_public_results.sql — lista pública de jogos (páginas
-- /results e /results/[slug], estáticas como as de ranking)
--
-- O site público passa a exibir a lista de partidas. Expor APENAS o
-- necessário e somente o que já é oficial:
--
--   * colunas mínimas para renderizar: id, nível, jogadores, placar,
--     data e situação;
--   * linhas com status 'confirmed' — pendentes e rejeitadas continuam
--     privadas (a autenticação continua vendo tudo, por RLS existente).
--
-- Fora do alcance do anon permanecem: `reported_by`, `confirmed_by`,
-- `confirmed_at`, `source`, `external_ref` e `created_at`.
-- ============================================================

revoke select on public.matches from anon;

grant select (id, level_id, player1_id, player2_id, sets, status, played_on)
  on public.matches to anon;

drop policy if exists "matches_public_confirmed" on public.matches;
create policy "matches_public_confirmed" on public.matches
  for select to anon
  using (status = 'confirmed');
