-- Apagar uma importação não pode ficar refém do carimbo "first_seen":
-- o cliente permanece; só a referência histórica é anulada.
alter table public.clients drop constraint clients_first_seen_import_fkey;
alter table public.clients
  add constraint clients_first_seen_import_fkey
  foreign key (first_seen_import) references public.imports (id) on delete set null;
alter table public.clients drop constraint clients_last_seen_import_fkey;
alter table public.clients
  add constraint clients_last_seen_import_fkey
  foreign key (last_seen_import) references public.imports (id) on delete set null;
