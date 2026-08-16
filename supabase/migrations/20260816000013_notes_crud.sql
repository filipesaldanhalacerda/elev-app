-- Aba Notas da ficha: nota vira um registro editável/excluível pelo autor.
alter table public.timeline_notes add column updated_at timestamptz;

create policy notes_update on public.timeline_notes for update to authenticated
  using (author = auth.uid())
  with check (author = auth.uid());

create policy notes_delete on public.timeline_notes for delete to authenticated
  using (author = auth.uid());
