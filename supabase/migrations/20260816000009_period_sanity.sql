-- Intervalos de horário nunca podem ser vazios ou invertidos — nem por bug de cliente.
alter table public.reservations
  add constraint reservations_period_not_empty check (not isempty(period));
alter table public.google_events
  add constraint google_events_range_valid check (ends_at > starts_at);
