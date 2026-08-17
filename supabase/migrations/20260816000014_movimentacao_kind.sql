-- Push de "Movimentações de clientes" (tela 16): novo tipo de notificação.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('alerta_atingido', 'card_delegado', 'lembrete_diario', 'importacao', 'reserva_confirmada', 'movimentacao'));
