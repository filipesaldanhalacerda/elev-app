-- E9 · lembrete diário por card (sheet "Novo card": toggle "resumo dos cards do dia às 08:00")
alter table public.cards add column if not exists daily_reminder boolean not null default true;
