-- Central de notificações: o dono pode apagar as próprias notificações.
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
