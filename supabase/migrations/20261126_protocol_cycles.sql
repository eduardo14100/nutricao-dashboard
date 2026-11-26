-- =====================================================================
-- Migração: histórico de ciclos de protocolo (início, fim, metas)
-- Executar UMA vez no Supabase → SQL Editor → New query → Run.
-- É idempotente (pode rodar de novo sem quebrar nada).
-- =====================================================================

create table if not exists public.protocol_cycles (
  id                    bigserial    primary key,
  user_id               uuid         not null default auth.uid(),
  name                  text         not null,
  start_date            date         not null,
  end_date              date         not null,
  start_weight_kg       numeric(5,2) not null,
  target_weight_min_kg  numeric(5,2) not null,
  target_weight_max_kg  numeric(5,2) not null,
  sim_deficit           integer      not null default 530,
  final_weight_kg       numeric(5,2),
  is_active             boolean      not null default false,
  notes                 text,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now(),
  constraint protocol_cycles_dates_chk  check (end_date > start_date),
  constraint protocol_cycles_target_chk check (target_weight_min_kg <= target_weight_max_kg),
  constraint protocol_cycles_weight_chk check (start_weight_kg between 35 and 250)
);

-- Garante no máximo 1 ciclo ativo por usuário
create unique index if not exists protocol_cycles_one_active_per_user_idx
  on public.protocol_cycles (user_id)
  where is_active;

create index if not exists protocol_cycles_user_start_idx
  on public.protocol_cycles (user_id, start_date desc);

-- Isolamento estrito (mesmo padrão RLS das demais tabelas do painel)
alter table public.protocol_cycles enable row level security;
alter table public.protocol_cycles force row level security;

revoke all on table public.protocol_cycles from public, anon;
grant select, insert, update, delete on table public.protocol_cycles to authenticated;
grant usage, select on sequence public.protocol_cycles_id_seq to authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'protocol_cycles'
       and policyname = 'protocol_cycles_owner_all'
  ) then
    create policy protocol_cycles_owner_all
      on public.protocol_cycles
      for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;
