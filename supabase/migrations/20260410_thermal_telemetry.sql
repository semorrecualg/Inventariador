-- Migração: Telemetria de Inventário e Saúde do Dispositivo
create table if not exists log_inventario_termico (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) not null,
  ativo_tag text,
  temp_celsius numeric(4,1) not null,
  bateria_nivel integer check (bateria_nivel between 0 and 100),
  lanterna_ativa boolean default false,
  timestamp timestamptz default now()
);

-- RLS: Segurança em nível de linha para conformidade auditável
alter table log_inventario_termico enable row level security;

do $$ 
begin
  if not exists (select 1 from pg_policies where policyname = 'Insert individual logs' and tablename = 'log_inventario_termico') then
    create policy "Insert individual logs" 
    on log_inventario_termico for insert 
    with check (auth.uid() = usuario_id);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'View own thermal logs' and tablename = 'log_inventario_termico') then
    create policy "View own thermal logs" 
    on log_inventario_termico for select 
    using (auth.uid() = usuario_id);
  end if;
end $$;

notify pgrst, 'reload schema';
