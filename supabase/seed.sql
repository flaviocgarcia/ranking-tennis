-- ============================================================
-- seed.sql (OPCIONAL) — cria os níveis iniciais A, B, C, D com a
-- configuração padrão: 2 sets + tiebreakão de 10 pts, 3 pts por 2x0,
-- 2 pts por 2x1, desempate por vitórias > confronto direto > saldo de
-- sets > saldo de games.
--
-- O administrador pode editar, desativar ou criar novos níveis depois
-- (ex.: Feminino, Duplas). Execute no SQL Editor do Supabase ou via
-- `psql -f supabase/seed.sql`.
-- ============================================================

insert into public.levels (code, slug, name, sort_order, config) values
  ('A', 'a', 'Nível A', 1, '{"setsToWin":2,"superTiebreak":{"enabled":true,"points":10},"scoring":{"winStraight":3,"winExtended":2,"loss":0,"deciderLoserPoint":true},"tiebreakers":["wins","head_to_head","set_diff","game_diff"]}'::jsonb),
  ('B', 'b', 'Nível B', 2, '{"setsToWin":2,"superTiebreak":{"enabled":true,"points":10},"scoring":{"winStraight":3,"winExtended":2,"loss":0,"deciderLoserPoint":true},"tiebreakers":["wins","head_to_head","set_diff","game_diff"]}'::jsonb),
  ('C', 'c', 'Nível C', 3, '{"setsToWin":2,"superTiebreak":{"enabled":true,"points":10},"scoring":{"winStraight":3,"winExtended":2,"loss":0,"deciderLoserPoint":true},"tiebreakers":["wins","head_to_head","set_diff","game_diff"]}'::jsonb),
  ('D', 'd', 'Nível D', 4, '{"setsToWin":2,"superTiebreak":{"enabled":true,"points":10},"scoring":{"winStraight":3,"winExtended":2,"loss":0,"deciderLoserPoint":true},"tiebreakers":["wins","head_to_head","set_diff","game_diff"]}'::jsonb)
on conflict (slug) do nothing;
