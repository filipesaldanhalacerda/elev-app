-- Sincronização de mão dupla com o Google Agenda:
-- origem do evento (criado no Elev ou importado do Google) + chave para reconciliar.
alter table public.google_events
  add column if not exists origin text not null default 'elev' check (origin in ('elev', 'google'));
create unique index google_events_user_google
  on public.google_events (user_id, google_id)
  where google_id is not null;
