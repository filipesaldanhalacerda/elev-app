-- E10 · notificação de reserva confirmada (tela 15: "Reserva confirmada — Ipê, seg 18/08 às 14:00")
create or replace function public.notify_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room text;
begin
  select name into v_room from public.rooms where id = new.room_id;
  insert into public.notifications (user_id, kind, title, body, ref)
  values (
    new.owner,
    'reserva_confirmada',
    'Reserva confirmada — ' || coalesce(v_room, 'sala') || ', ' ||
      to_char(lower(new.period) at time zone 'America/Sao_Paulo', 'DD/MM') || ' às ' ||
      to_char(lower(new.period) at time zone 'America/Sao_Paulo', 'HH24:MI'),
    new.title,
    jsonb_build_object('reservation_id', new.id)
  );
  return new;
end;
$$;

create trigger reservations_notify
  after insert on public.reservations
  for each row execute function public.notify_reservation();
