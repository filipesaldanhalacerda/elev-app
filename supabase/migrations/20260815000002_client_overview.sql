-- E6 · visão consolidada do cliente: última fotografia do Positivador por conta.
-- security_invoker: a view respeita o RLS de quem consulta (regra de ouro intacta).

create view public.client_overview
with (security_invoker = true) as
select
  c.account_code,
  c.advisor_code,
  c.name,
  c.status,
  c.suitability,
  c.segment,
  c.profession,
  c.birth_date,
  c.xp_registered_at,
  c.missing_since,
  s.net_em_m as patrimony,
  s.net_em_m1,
  case
    when s.net_em_m1 is not null and s.net_em_m1 <> 0
      then round(((s.net_em_m - s.net_em_m1) / abs(s.net_em_m1)) * 100, 1)
  end as month_pct,
  s.ref_date as position_date,
  s.captacao_liquida_m,
  s.captacao_bruta_m,
  s.resgates_m
from public.clients c
left join lateral (
  select *
  from public.positivador_snapshots s
  where s.account_code = c.account_code
  order by s.ref_date desc
  limit 1
) s on true;

grant select on public.client_overview to authenticated;
