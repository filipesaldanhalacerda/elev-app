-- Saúde da conexão MetaTrader: o tempo de resposta exibido passa a ser o MEDIDO
-- no último teste (nada de número decorativo na tela 18).
alter table public.mt_connection add column if not exists response_seconds numeric;
