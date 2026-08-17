-- Cotações: lembrar que o assessor personalizou os fixados — lista vazia
-- deixa de "ressuscitar" a seleção padrão.
alter table public.profiles add column if not exists quotes_customized boolean not null default false;
