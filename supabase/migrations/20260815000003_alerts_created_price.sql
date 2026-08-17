-- E8 · preço no momento da criação: base da barra de progresso até o alvo (tela 12)
alter table public.alerts add column if not exists created_price numeric;
