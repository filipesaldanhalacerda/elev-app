-- CORRIGE base nova nascendo inacessível: faltavam os GRANTs de tabela.
--
-- Sem eles, um banco criado do zero (o deploy de produção) responde
-- "permission denied for table profiles" a qualquer login — o app não abre.
-- Quem filtra LINHA é o RLS (ativo em todas as tabelas, verificado); o GRANT é só
-- a permissão de falar com a tabela. Sem policy para uma operação, ela segue bloqueada.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- tabelas e sequências criadas daqui pra frente já nascem acessíveis
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;

-- anon continua sem alcançar nada: neste produto tudo exige login
revoke all on all tables in schema public from anon;
