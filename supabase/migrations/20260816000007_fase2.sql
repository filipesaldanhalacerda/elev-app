-- FASE 2 · F2-09 cards sem delegação entre assessores + F2-03 Google Agenda.

-- Cards: assessor cria card SÓ para si mesmo; delegar é papel do admin.
drop policy cards_insert on public.cards;
create policy cards_insert on public.cards for insert to authenticated
  with check (creator = auth.uid()
    and (assignee = auth.uid() or public.is_admin())
    and (account_code is null or exists (select 1 from public.clients c
         where c.account_code = cards.account_code
         and (c.advisor_code = public.my_advisor_code() or public.is_admin()))));

-- Update: quem não é admin não pode passar o card para um terceiro.
drop policy cards_update on public.cards;
create policy cards_update on public.cards for update to authenticated
  using (creator = auth.uid() or assignee = auth.uid() or public.is_admin())
  with check (assignee = auth.uid() or creator = auth.uid() and assignee = creator or public.is_admin());

-- Conta Google conectada por usuário (tokens ficam SÓ no worker/service role).
create table public.google_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  mode text not null default 'simulado' check (mode in ('real', 'simulado')),
  connected_at timestamptz not null default now()
);
alter table public.google_accounts enable row level security;
-- o dono enxerga a própria conexão (sem tokens: colunas sensíveis só via worker)
create policy google_accounts_select on public.google_accounts for select to authenticated
  using (user_id = auth.uid());

-- Agendamentos: espelho local da agenda (e a própria agenda no modo simulado).
create table public.google_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  google_id text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  account_code text references public.clients (account_code),
  reservation_id uuid references public.reservations (id) on delete set null,
  status text not null default 'confirmado' check (status in ('confirmado', 'cancelado')),
  created_at timestamptz not null default now()
);
alter table public.google_events enable row level security;
create policy google_events_select on public.google_events for select to authenticated
  using (user_id = auth.uid());
create policy google_events_insert on public.google_events for insert to authenticated
  with check (user_id = auth.uid());
create policy google_events_update on public.google_events for update to authenticated
  using (user_id = auth.uid());
create index google_events_user_start on public.google_events (user_id, starts_at);
