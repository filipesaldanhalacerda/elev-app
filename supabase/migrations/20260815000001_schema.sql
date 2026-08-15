-- Elev · E3 — modelo de dados + RLS
-- Regra de ouro: um assessor enxerga SOMENTE os clientes do próprio código,
-- imposta AQUI no banco. Admin enxerga tudo. RLS ativa em TODAS as tabelas.

create extension if not exists btree_gist;

-- ---------- Funções auxiliares ----------

-- A31342 e 31342 são o MESMO assessor: canônico = dígitos sem prefixo/zeros à esquerda.
create or replace function public.normalize_advisor_code(raw text)
returns text
language sql
immutable
as $$
  select case
    when raw is null then null
    when upper(trim(raw)) ~ '^A?[\s-]?\d+$'
      then ltrim(regexp_replace(upper(trim(raw)), '^A[\s-]?', ''), '0')
    else null
  end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  advisor_code text, -- null para admin puro; preenchido = também atende carteira
  role text not null check (role in ('admin', 'advisor')),
  is_active boolean not null default true,
  theme text not null default 'sistema' check (theme in ('claro', 'escuro', 'sistema')),
  push_prefs jsonb not null default '{"alerta_preco": true, "lembrete_diario": true, "card_delegado": true, "movimentacoes": false}',
  reminder_time time not null default '08:00',
  created_at timestamptz not null default now()
);

create or replace function public.my_advisor_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select advisor_code from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- ---------- Identidade e acesso ----------

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null,          -- nunca em claro
  expires_at timestamptz not null,  -- 24h
  used_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- Importações (origem de todos os dados de cliente) ----------

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('positivador', 'diversificacao', 'captacao', 'saldo_consolidado')),
  variant text check (variant in ('mensal', 'semanal')),
  file_name text not null,
  file_size bigint not null,
  file_hash text not null,          -- reimportar o mesmo arquivo não duplica
  ref_date date not null,
  status text not null default 'processando' check (status in ('processando', 'concluida', 'falhou')),
  counts jsonb not null default '{}',   -- registros válidos, inválidos, clientes novos, assessores desconhecidos
  warnings jsonb not null default '[]', -- avisos acionáveis exibidos na tela 21
  error text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (kind, file_hash)
);

-- ---------- Clientes ----------

create table public.clients (
  account_code text primary key,          -- conta XP (sem máscara)
  advisor_code text not null,             -- normalizado
  name text,                              -- só vem do Saldo Consolidado
  profession text,
  sex text,
  segment text,
  segmentation text,
  suitability text,
  status text,                            -- ATIVO / INATIVO (Positivador)
  person_type text,
  birth_date date,
  xp_registered_at date,
  first_seen_import uuid references public.imports (id),
  last_seen_import uuid references public.imports (id),
  missing_since date,                     -- sumiu do relatório: sinalizado, nunca apagado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_advisor_idx on public.clients (advisor_code);

-- Cadastro complementar (tela 09): editável no app, auditado. Dados XP são somente leitura.
create table public.client_extras (
  account_code text primary key references public.clients (account_code) on delete cascade,
  phone text,
  email text,
  notes text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- Fotografias do Positivador: 1 linha por cliente × data — nasce aqui a evolução patrimonial.
create table public.positivador_snapshots (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.imports (id) on delete cascade,
  account_code text not null references public.clients (account_code),
  advisor_code text not null,
  ref_date date not null,
  variant text not null check (variant in ('mensal', 'semanal')),
  aplicacao_financeira numeric,
  receita_mes numeric,
  captacao_bruta_m numeric,
  resgates_m numeric,
  captacao_liquida_m numeric,
  net_em_m1 numeric,
  net_em_m numeric,
  net_renda_fixa numeric,
  net_fundos_imobiliarios numeric,
  net_renda_variavel numeric,
  net_fundos numeric,
  net_financeiro numeric,
  net_previdencia numeric,
  net_outros numeric,
  raw_extra jsonb not null default '{}',  -- colunas novas guardadas sem processar (tela 21)
  unique (account_code, ref_date, variant)
);
create index ps_advisor_idx on public.positivador_snapshots (advisor_code);
create index ps_ref_idx on public.positivador_snapshots (account_code, ref_date);

-- Diversificação: posições por cliente × data (aba Carteira + alertas de vencimento).
create table public.positions (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.imports (id) on delete cascade,
  account_code text not null references public.clients (account_code),
  advisor_code text not null,
  ref_date date not null,
  product text not null,
  sub_product text,
  fund_cnpj text,
  asset text not null,
  issuer text,
  maturity_date date,
  quantity numeric,
  value numeric not null
);
create index positions_advisor_idx on public.positions (advisor_code);
create index positions_acc_ref_idx on public.positions (account_code, ref_date);
create index positions_maturity_idx on public.positions (maturity_date) where maturity_date is not null;

-- Captação: movimentações diárias (aba Movimentações + alerta de movimentação relevante).
create table public.movements (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.imports (id) on delete cascade,
  account_code text not null references public.clients (account_code),
  advisor_code text not null,
  mov_date date not null,
  kind text not null,                -- TED, ST, OTA…
  flow text not null check (flow in ('C', 'D')),
  amount numeric not null,           -- com sinal
  segment text
);
create index movements_advisor_idx on public.movements (advisor_code);
create index movements_acc_idx on public.movements (account_code, mov_date desc);

-- Saldo Consolidado: único relatório com o NOME do cliente (+ alerta de dinheiro parado).
create table public.balances (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.imports (id) on delete cascade,
  account_code text not null references public.clients (account_code),
  advisor_code text not null,
  ref_date date not null,
  d0 numeric not null default 0,
  d1 numeric not null default 0,
  d2 numeric not null default 0,
  d3 numeric not null default 0,
  total numeric not null default 0,
  unique (account_code, ref_date)
);
create index balances_advisor_idx on public.balances (advisor_code);

-- Anotações da linha do tempo (tela 10).
create table public.timeline_notes (
  id uuid primary key default gen_random_uuid(),
  account_code text not null references public.clients (account_code) on delete cascade,
  advisor_code text not null,
  author uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);
create index notes_acc_idx on public.timeline_notes (account_code, created_at desc);

-- ---------- Alertas ----------

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  ticker text not null,
  direction text not null check (direction in ('alta', 'baixa')),
  target_price numeric,
  target_day_pct numeric,            -- alternativa por variação % no dia
  account_code text references public.clients (account_code),
  status text not null default 'ativo' check (status in ('ativo', 'disparado', 'cancelado')),
  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  triggered_price numeric,
  check (target_price is not null or target_day_pct is not null)
);
create index alerts_owner_idx on public.alerts (owner, status);

-- Histórico de disparos (inclui alertas automáticos: vencimento, movimentação, saldo parado).
create table public.alert_events (
  id bigint generated always as identity primary key,
  alert_id uuid references public.alerts (id) on delete cascade,
  owner uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('preco', 'vencimento', 'movimentacao', 'saldo_parado')),
  account_code text references public.clients (account_code),
  detail jsonb not null default '{}',
  triggered_at timestamptz not null default now()
);
create index alert_events_owner_idx on public.alert_events (owner, triggered_at desc);

-- Limiar dos alertas automáticos (valor configurável — admin).
create table public.auto_alert_settings (
  id smallint primary key default 1 check (id = 1),
  relevant_movement_threshold numeric not null default 50000,
  idle_cash_threshold numeric not null default 10000,
  maturity_window_days int not null default 30,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.auto_alert_settings (id) values (1);

-- ---------- Cards / tarefas ----------

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  account_code text references public.clients (account_code),
  due_at timestamptz,
  priority text not null default 'media' check (priority in ('baixa', 'media', 'alta')),
  status text not null default 'pendente' check (status in ('pendente', 'andamento', 'concluido')),
  creator uuid not null references public.profiles (id),
  assignee uuid not null references public.profiles (id),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index cards_assignee_idx on public.cards (assignee, status);
create index cards_creator_idx on public.cards (creator);

-- ---------- Salas e reservas ----------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity int not null,
  resources text[] not null default '{}',
  is_active boolean not null default true,
  inactive_reason text,
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  period tstzrange not null,
  title text not null,
  account_code text references public.clients (account_code),
  owner uuid not null references public.profiles (id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  -- Conflito de horário impedido PELO BANCO (tela 14), não só pela aplicação:
  exclude using gist (room_id with =, period with &&) where (cancelled_at is null)
);
create index reservations_owner_idx on public.reservations (owner);

-- ---------- Notificações e push ----------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('alerta_atingido', 'card_delegado', 'lembrete_diario', 'importacao', 'reserva_confirmada')),
  title text not null,
  body text,
  ref jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- Cotações ----------

create table public.quote_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ticker text not null,
  sort_order int not null default 0,
  primary key (user_id, ticker)
);

-- Conexão MetaTrader (tela 18): credencial cifrada pelo Worker, NUNCA reexibida em claro.
create table public.mt_connection (
  id smallint primary key default 1 check (id = 1),
  status text not null default 'desconectada' check (status in ('ativa', 'instavel', 'caida', 'desconectada')),
  login text,
  server text,
  password_ciphertext text,          -- cifrado no Worker; o app nunca vê
  last_quote_at timestamptz,
  connected_at timestamptz,
  health_events jsonb not null default '[]',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.mt_connection (id) values (1);

-- ---------- Auditoria (append-only) ----------

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  category text not null check (category in ('login', 'importacao', 'usuario', 'metatrader', 'cadastro', 'codigo')),
  event text not null,
  detail text,
  actor uuid,
  actor_name text
);
create index audit_at_idx on public.audit_log (at desc);

create or replace function public.log_audit(p_category text, p_event text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.profiles where id = auth.uid();
  insert into public.audit_log (category, event, detail, actor, actor_name)
  values (p_category, p_event, p_detail, auth.uid(), v_name);
end;
$$;

-- ---------- Triggers ----------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
create trigger cards_touch before update on public.cards for each row execute function public.touch_updated_at();
create trigger extras_touch before update on public.client_extras for each row execute function public.touch_updated_at();

-- Assessor só edita as próprias preferências — nunca role/código/ativo (Worker/admin fazem isso).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    if new.role is distinct from old.role
      or new.advisor_code is distinct from old.advisor_code
      or new.is_active is distinct from old.is_active
      or new.email is distinct from old.email then
      raise exception 'Somente o administrador altera perfil, código, e-mail ou status.';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- ---------- RLS: ativa em TODAS as tabelas ----------

alter table public.profiles enable row level security;
alter table public.access_codes enable row level security;
alter table public.imports enable row level security;
alter table public.clients enable row level security;
alter table public.client_extras enable row level security;
alter table public.positivador_snapshots enable row level security;
alter table public.positions enable row level security;
alter table public.movements enable row level security;
alter table public.balances enable row level security;
alter table public.timeline_notes enable row level security;
alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.auto_alert_settings enable row level security;
alter table public.cards enable row level security;
alter table public.rooms enable row level security;
alter table public.reservations enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.quote_favorites enable row level security;
alter table public.mt_connection enable row level security;
alter table public.audit_log enable row level security;

-- profiles: o próprio + admin vê todos; update próprio (trigger barra escalada); admin gerencia.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- access_codes: só admin (geração/validação acontecem no Worker com service_role).
create policy access_codes_admin on public.access_codes for select to authenticated using (public.is_admin());

-- imports: admin lê o histórico; escrita só via Worker (service_role ignora RLS).
create policy imports_admin on public.imports for select to authenticated using (public.is_admin());

-- Dados de cliente: advisor_code = meu OU admin. Escrita de fatos: SÓ Worker.
create policy clients_select on public.clients for select to authenticated
  using (advisor_code = public.my_advisor_code() or public.is_admin());

create policy extras_select on public.client_extras for select to authenticated
  using (exists (select 1 from public.clients c where c.account_code = client_extras.account_code
                 and (c.advisor_code = public.my_advisor_code() or public.is_admin())));
create policy extras_write on public.client_extras for insert to authenticated
  with check (exists (select 1 from public.clients c where c.account_code = client_extras.account_code
              and (c.advisor_code = public.my_advisor_code() or public.is_admin())));
create policy extras_update on public.client_extras for update to authenticated
  using (exists (select 1 from public.clients c where c.account_code = client_extras.account_code
         and (c.advisor_code = public.my_advisor_code() or public.is_admin())));

create policy ps_select on public.positivador_snapshots for select to authenticated
  using (advisor_code = public.my_advisor_code() or public.is_admin());
create policy positions_select on public.positions for select to authenticated
  using (advisor_code = public.my_advisor_code() or public.is_admin());
create policy movements_select on public.movements for select to authenticated
  using (advisor_code = public.my_advisor_code() or public.is_admin());
create policy balances_select on public.balances for select to authenticated
  using (advisor_code = public.my_advisor_code() or public.is_admin());

create policy notes_select on public.timeline_notes for select to authenticated
  using (advisor_code = public.my_advisor_code() or public.is_admin());
create policy notes_insert on public.timeline_notes for insert to authenticated
  with check (author = auth.uid()
    and exists (select 1 from public.clients c where c.account_code = timeline_notes.account_code
                and (c.advisor_code = public.my_advisor_code() or public.is_admin())));

-- alerts: dono OU admin; alerta vinculado a cliente exige acesso ao cliente.
create policy alerts_select on public.alerts for select to authenticated
  using (owner = auth.uid() or public.is_admin());
create policy alerts_insert on public.alerts for insert to authenticated
  with check (owner = auth.uid()
    and (account_code is null or exists (select 1 from public.clients c
         where c.account_code = alerts.account_code
         and (c.advisor_code = public.my_advisor_code() or public.is_admin()))));
create policy alerts_update on public.alerts for update to authenticated
  using (owner = auth.uid() or public.is_admin());
create policy alerts_delete on public.alerts for delete to authenticated
  using (owner = auth.uid() or public.is_admin());

create policy alert_events_select on public.alert_events for select to authenticated
  using (owner = auth.uid() or public.is_admin());

create policy auto_alert_settings_admin_select on public.auto_alert_settings for select to authenticated using (public.is_admin());
create policy auto_alert_settings_admin_update on public.auto_alert_settings for update to authenticated using (public.is_admin());

-- cards: criador OU responsável OU admin; card com cliente SÓ para quem acessa o cliente.
create policy cards_select on public.cards for select to authenticated
  using ((creator = auth.uid() or assignee = auth.uid() or public.is_admin())
    and (account_code is null or exists (select 1 from public.clients c
         where c.account_code = cards.account_code
         and (c.advisor_code = public.my_advisor_code() or public.is_admin()))));
create policy cards_insert on public.cards for insert to authenticated
  with check (creator = auth.uid()
    and (account_code is null or exists (select 1 from public.clients c
         where c.account_code = cards.account_code
         and (c.advisor_code = public.my_advisor_code() or public.is_admin()))));
create policy cards_update on public.cards for update to authenticated
  using (creator = auth.uid() or assignee = auth.uid() or public.is_admin());
create policy cards_delete on public.cards for delete to authenticated
  using (creator = auth.uid() or public.is_admin());

-- salas: agenda é compartilhada (leitura para todos); gestão só admin.
create policy rooms_select on public.rooms for select to authenticated using (true);
create policy rooms_admin_insert on public.rooms for insert to authenticated with check (public.is_admin());
create policy rooms_admin_update on public.rooms for update to authenticated using (public.is_admin());

create policy reservations_select on public.reservations for select to authenticated using (true);
create policy reservations_insert on public.reservations for insert to authenticated with check (owner = auth.uid());
create policy reservations_update on public.reservations for update to authenticated
  using (owner = auth.uid() or public.is_admin());

-- notificações / push / favoritos: só o próprio usuário.
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = auth.uid());
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_own on public.quote_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- MetaTrader: admin lê o painel de saúde; credenciais só transitam no Worker.
create policy mt_admin_select on public.mt_connection for select to authenticated using (public.is_admin());

-- auditoria: admin lê; INSERT via log_audit(); UPDATE/DELETE bloqueados (sem policy).
create policy audit_admin_select on public.audit_log for select to authenticated using (public.is_admin());

-- anon: nenhum acesso a nada.
revoke all on all tables in schema public from anon;
