-- E9 · suporte a cards: delegação precisa listar colegas; card delegado notifica.

-- Perfis: todo usuário autenticado da assessoria enxerga nome/código dos colegas
-- (necessário para Responsável do card, kanban do admin e delegações).
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);

-- Notificação automática de card delegado (tela 15/25: "Bruno delegou um card para você")
create or replace function public.notify_card_delegation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_name text;
  v_due text;
begin
  if new.assignee is distinct from new.creator and (tg_op = 'INSERT' or old.assignee is distinct from new.assignee) then
    select split_part(name, ' ', 1) into v_creator_name from public.profiles where id = new.creator;
    v_due := case when new.due_at is not null
      then ' · prazo ' || to_char(new.due_at at time zone 'America/Sao_Paulo', 'DD/MM')
      else '' end;
    insert into public.notifications (user_id, kind, title, body, ref)
    values (
      new.assignee,
      'card_delegado',
      coalesce(v_creator_name, 'Um colega') || ' delegou um card para você',
      new.title || v_due,
      jsonb_build_object('card_id', new.id)
    );
  end if;
  return new;
end;
$$;

create trigger cards_delegation_notify
  after insert or update of assignee on public.cards
  for each row execute function public.notify_card_delegation();
