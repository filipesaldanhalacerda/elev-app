-- Confiabilidade das notificações: deduplicação GARANTIDA pelo banco.
-- 1) Eventos automáticos (vencimento/movimentação/saldo): a chave de dedupe vira índice único —
--    duas varreduras simultâneas não conseguem registrar (nem notificar) o mesmo evento.
create unique index if not exists alert_events_dedupe
  on public.alert_events (kind, account_code, (detail->>'ref'))
  where detail ? 'ref';
