-- Seed de DESENVOLVIMENTO (roda a cada supabase db reset — nunca em produção).
-- Usuários fixos: senha Elev@2026 para todos.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'lacerdafilipe@gmail.com', crypt('Elev@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'rafael.moura@elev.test', crypt('Elev@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'bruno.salles@elev.test', crypt('Elev@2026', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"lacerdafilipe@gmail.com"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"rafael.moura@elev.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333',
   '{"sub":"33333333-3333-3333-3333-333333333333","email":"bruno.salles@elev.test"}', 'email', now(), now(), now())
on conflict do nothing;

insert into public.profiles (id, name, email, role, advisor_code) values
  ('11111111-1111-1111-1111-111111111111', 'Filipe Lacerda', 'lacerdafilipe@gmail.com', 'admin', null),
  ('22222222-2222-2222-2222-222222222222', 'Rafael Moura', 'rafael.moura@elev.test', 'advisor', '31342'),
  ('33333333-3333-3333-3333-333333333333', 'Bruno Salles', 'bruno.salles@elev.test', 'advisor', '31390')
on conflict (id) do nothing;

update public.mt_connection
set status = 'ativa', login = '50191', server = 'XPMT5-Real02', connected_at = now(), last_quote_at = now()
where id = 1;

-- Sala de reunião única do escritório (o PO mantém só a Sala 1).
insert into public.rooms (name, capacity, resources) values
  ('Sala 1', 6, array['TV', 'Videoconferência', 'Quadro'])
on conflict (name) do nothing;
