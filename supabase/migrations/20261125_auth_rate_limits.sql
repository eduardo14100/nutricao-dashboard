-- =====================================================================
-- Migração: limite de tentativas de PIN (anti força-bruta)
-- Executar UMA vez no Supabase → SQL Editor → New query → Run.
-- É idempotente (pode rodar de novo sem quebrar nada).
-- =====================================================================

-- 1) Tabela de controle. Guarda apenas um HASH do IP (nunca o IP puro).
create table if not exists public.auth_rate_limits (
  key          text primary key,           -- sha256(ip + segredo) ou '__global__'
  failures     integer     not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.auth_rate_limits enable row level security;
alter table public.auth_rate_limits force row level security;
-- Nenhum papel lê/escreve a tabela diretamente; só as funções abaixo.
revoke all on table public.auth_rate_limits from public, anon, authenticated;

-- 2) Consulta se a chave (ou o painel inteiro) está bloqueada.
create or replace function public.auth_gate_check(p_key text)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select max(locked_until)
  from public.auth_rate_limits
  where key in (p_key, '__global__')
    and locked_until > now();
$$;

-- 3) Registra uma tentativa errada e aplica o bloqueio progressivo.
--    Por IP: a cada 5 erros bloqueia 5 min, depois 10, 20, 40... (máx. 24 h).
--    O contador zera após 24 h sem erros.
--    Global: 30 erros (de qualquer IP) em sequência sem pausa de 15 min
--    bloqueiam novos logins por 15 min (proteção contra ataque distribuído).
create or replace function public.auth_gate_fail(p_key text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fail  integer;
  v_gfail integer;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid key';
  end if;

  insert into public.auth_rate_limits as r (key, failures, updated_at)
  values (p_key, 1, now())
  on conflict (key) do update
    set failures   = case when r.updated_at < now() - interval '24 hours' then 1 else r.failures + 1 end,
        updated_at = now()
  returning failures into v_fail;

  if v_fail % 5 = 0 then
    update public.auth_rate_limits
       set locked_until = now() + least(interval '5 minutes' * power(2, (v_fail / 5) - 1), interval '24 hours')
     where key = p_key;
  end if;

  insert into public.auth_rate_limits as r (key, failures, updated_at)
  values ('__global__', 1, now())
  on conflict (key) do update
    set failures   = case when r.updated_at < now() - interval '15 minutes' then 1 else r.failures + 1 end,
        updated_at = now()
  returning failures into v_gfail;

  if v_gfail >= 30 then
    update public.auth_rate_limits
       set locked_until = now() + interval '15 minutes', failures = 0
     where key = '__global__';
  end if;

  return public.auth_gate_check(p_key);
end;
$$;

-- 4) Zera o contador do IP após login correto (só usuário autenticado).
create or replace function public.auth_gate_reset(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_rate_limits where key = p_key;
$$;

-- 5) Permissões: check/fail podem ser chamados antes do login; reset só autenticado.
revoke all on function public.auth_gate_check(text) from public;
revoke all on function public.auth_gate_fail(text)  from public;
revoke all on function public.auth_gate_reset(text) from public;
grant execute on function public.auth_gate_check(text) to anon, authenticated;
grant execute on function public.auth_gate_fail(text)  to anon, authenticated;
grant execute on function public.auth_gate_reset(text) to authenticated;
