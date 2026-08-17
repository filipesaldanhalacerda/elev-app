-- Cada assessor escolhe a hora do próprio lembrete diário de tarefas.
alter table public.profiles
  add column if not exists reminder_time time not null default '08:00';
