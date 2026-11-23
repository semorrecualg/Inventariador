# Migração `audit_logs.client_event_id` (F2)

Guia operacional da coluna que dá idempotência à trilha de auditoria enviada pelo
app. Sem ela, a fila `services/auditoriaNuvem.ts` não sobe nada: cada lote falha
com o erro carimbado na linha (`_syncError`) e o Gestor mostra «N por subir» sem
baixar. Nada é apagado nem dado como enviado.

> **Estado em 23/11/2026: aplicada e verificada em produção.** A coluna
> `client_event_id text` existe, o índice `audit_logs_client_event_id_key` é
> `UNIQUE` e válido (`indisvalid = true`), não havia duplicados e o teste de
> `upsert` do passo 4 devolveu 1 linha. Falta apenas a prova de envio no APK
> nativo (passo 5).
>
> **Atenção — a tabela de produção é legada e diverge de `docs/supabase_bootstrap.sql`.**
> Pontos confirmados no Supabase de produção:
>
> | Item | Produção | `supabase_bootstrap.sql` |
> |---|---|---|
> | `id` | `uuid` com default `gen_random_uuid()` | igual |
> | `user_email` | `text NOT NULL` | igual |
> | `details` | `jsonb` (confirmado na `information_schema`) | igual |
>
> O `CREATE TABLE IF NOT EXISTS` do bootstrap **não** corrige a tabela existente.
> Por isso este guia descobre as colunas obrigatórias antes de testar, e passa
> `details` como JSON.

## 0. Onde correr

Supabase Dashboard → **SQL Editor** do projeto de produção (ou `psql` com a
connection string, que não deve ser guardada no repositório). As consultas são de
leitura até ao passo 2; o passo 4 corre numa transação com `rollback`.

## 1. Diagnóstico (sem tocar em colunas que podem não existir)

### 1.1 Inventário da tabela

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_logs'
order by ordinal_position;
```

Confirma `client_event_id` (já presente em produção desde 23/11/2026) e anota
`user_email`, `tenantid` e `details` — os tipos e a nulabilidade são o que manda
no teste do passo 4. O resultado em produção: 13 colunas, `details` em `jsonb`,
`user_email` e `action` `NOT NULL`.

### 1.2 Duplicados de `client_event_id` (condicional)

Só faz sentido se a coluna **já existir** (migração anterior a meio). Antes de a
coluna existir, a consulta rebenta com `42703`; esta versão não:

```sql
do $$
declare dups int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs'
      and column_name = 'client_event_id'
  ) then
    execute 'select count(*) from (
               select client_event_id from public.audit_logs
               where client_event_id is not null
               group by 1 having count(*) > 1) d' into dups;
    raise notice 'client_event_id duplicados: %', dups;
  else
    raise notice 'client_event_id ainda nao existe — primeira migracao';
  end if;
end $$;
```

O resultado sai no separador **Notices**. Se `duplicados > 0`, resolve-os antes
de criar o índice único (o passo 2 falha com `23505`).

### 1.3 Colunas `NOT NULL` sem default

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_logs'
  and is_nullable = 'NO'
  and column_default is null
order by ordinal_position;
```

Tudo o que aparecer aqui tem de ser preenchido no teste do passo 4. Em produção,
`user_email` e `action` estão nesta lista — são os dois que o teste tem de
preencher.

## 2. Aplicar a migração (idempotente)

```sql
begin;

alter table public.audit_logs
  add column if not exists client_event_id text;

create unique index if not exists audit_logs_client_event_id_key
  on public.audit_logs (client_event_id);

commit;
```

`NULL` convive com `NULL` num índice único, por isso as linhas antigas (sem
`client_event_id`) continuam válidas.

### Variante sem bloquear escritas

`CREATE UNIQUE INDEX CONCURRENTLY` existe desde o PostgreSQL 9.5 e **não pode
correr dentro de uma transação**. A sintaxe com `IF NOT EXISTS` também é aceite
desde o 9.5, por isso qualquer projeto Supabase (PostgreSQL 14+) a aceita —
confirma a versão exata do teu projeto com:

```sql
select version();
```

**Mas não uses `IF NOT EXISTS` na versão concorrente.** A cláusula verifica só o
*nome* do índice, nunca se ele está válido. Se uma tentativa anterior falhou a
meio (deadlock, `statement_timeout`, sessão cortada, valor duplicado), ficou um
índice marcado `INVALID` com esse nome; repetir com `IF NOT EXISTS` imprime
«already exists, skipping» e deixa o índice inválido para sempre, sem erro.
Verifica antes:

```sql
select i.indisvalid, pg_get_indexdef(i.indexrelid) as definicao
from pg_index i
where i.indexrelid = to_regclass('public.audit_logs_client_event_id_key');
```

- **0 linhas** (índice não existe) → cria, sem `IF NOT EXISTS`:

```sql
create unique index concurrently audit_logs_client_event_id_key
  on public.audit_logs (client_event_id);
```

- **`indisvalid = false`** → apaga e repete (as duas fora de transação):

```sql
drop index concurrently public.audit_logs_client_event_id_key;
```

- **`indisvalid = true`** → já está feito; nada a criar.

Para esta tabela, a versão dentro de transação (passo 2) é a preferível: a
tabela é pequena e o `ALTER TABLE` já pede um lock curto.

## 3. Validar o esquema

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_logs'
  and column_name = 'client_event_id';

select indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'audit_logs_client_event_id_key';
```

Esperado: coluna `text` e um `CREATE UNIQUE INDEX ... (client_event_id)`.
Confirmado em produção a 23/11/2026, com `audit_logs_client_event_id_key`
`indisvalid = true` e a consulta de duplicados do passo 1.2 em 0 linhas.

## 4. Teste de `upsert` (transação com `rollback`)

O `details` é `jsonb` em produção (confirmado na `information_schema` em
23/11/2026): um literal de texto direto rebenta com `22P02`.
`to_jsonb('…'::text)` produz a string JSON válida e continua a ser a forma
segura. O `user_email` e o `action` (as colunas da lista 1.3) têm de ser
preenchidos.

```sql
begin;

insert into public.audit_logs
  (tenantid, user_email, action, table_name, record_id, details, origin, client_event_id, created_at)
values
  ('__MIGRACAO_TESTE__', 'migracao@teste.local', 'MIGRATION_CHECK', 'audit_logs',
   '__migracao_check__', to_jsonb('teste de upsert'::text), 'APP', '__migracao_check__', now())
on conflict (client_event_id) do update set action = excluded.action;

-- Repetição idêntica: prova que o índice único + on conflict atualizam em vez de duplicar.
insert into public.audit_logs
  (tenantid, user_email, action, table_name, record_id, details, origin, client_event_id, created_at)
values
  ('__MIGRACAO_TESTE__', 'migracao@teste.local', 'MIGRATION_CHECK', 'audit_logs',
   '__migracao_check__', to_jsonb('teste de upsert'::text), 'APP', '__migracao_check__', now())
on conflict (client_event_id) do update set action = excluded.action;

select count(*) from public.audit_logs
where client_event_id = '__migracao_check__';
-- esperado: 1

rollback;
```

Se a base tiver mais colunas obrigatórias, acrescenta-as ao `insert` com um valor
válido — o erro nomeia a que faltar.

**Permissões:** o app já escrevia em `audit_logs` antes desta migração, por isso
a política e os grants existentes chegam. Só se aparecer `permission denied` ou
`new row violates row-level security policy` é que verificas:

```sql
select polname, polcmd from pg_policy
where polrelid = 'public.audit_logs'::regclass;
```

## 5. Confirmar que a fila começa a subir

1. **Onde:** no **APK/nativo** em **Base Oficial**. A fila é hermética por
   desenho — `canPushToCloud()` exige `Capacitor.isNativePlatform()` **e** modo
   online; no browser/PWA nada sobe, mesmo com a migração aplicada.
2. **No Gestor de Base** → cartão «Registros de Auditoria (local)»:
   - «N por subir para a nuvem» tem de **descer** entre ciclos (a fila corre no
     ciclo de sincronização e no «Sincronizar tudo»);
   - «N na nuvem · contrato X» tem de **subir** e mostrar o contrato consultado;
   - se a nuvem recusar, aparece «nuvem indisponível: …» e o motivo vai para
     `[SRE_AUDITORIA]` no log do Gestor.
3. **Contra-prova no SQL:**

```sql
select count(*) as total, max(created_at) as ultimo_evento
from public.audit_logs
where tenantid = 'CICOPAL';  -- o contrato em maiúsculas

select action, count(*)
from public.audit_logs
where tenantid = 'CICOPAL'
  and created_at > now() - interval '15 minutes'
group by 1
order by 2 desc;
```

### Se «N por subir» não descer

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `column audit_logs.client_event_id does not exist` | migração não aplicada | passo 2 |
| `null value in column "user_email"` | linha local sem e-mail | corrigir a origem; o app envia `''`, nunca `null` |
| `invalid input syntax for type json` | payload com `details` inválido | o app envia documento JSON; o erro só aparece em SQL manual (passo 4) |
| `duplicate key value violates unique constraint` no índice único | duplicados prévios | passo 1.2 |
| índice existe mas não bloqueia duplicados / `indisvalid = false` | build `CONCURRENTLY` anterior falhou | apagar o índice e recriar (variante concorrente) |
| `AUDIT_PUSH_TIMEOUT` | rede lenta (> 8 s) | repetir; a linha continua na fila |
| nada sobe e não há erro | browser/PWA ou Base Local | confirmar nativo + Base Oficial (passo 5.1) |

O motivo fica sempre carimbado na linha (`_syncError`, `_syncAttempts`) e a
retenção preserva o não confirmado durante 30 dias (o confirmado sai aos 7).

## 6. Reverter (só com o app sem F2)

```sql
drop index if exists public.audit_logs_client_event_id_key;
alter table public.audit_logs drop column if exists client_event_id;
```

Reverter com o app F2 a correr faz o envio falhar de novo — a fila fica
carimbada, sem perder linhas locais. Preferir reaplicar o passo 2.

## 7. Alinhamento do esquema

O `docs/supabase_bootstrap.sql` e o `docs/SCHEMA_BASELINE.md` foram alinhados com
o esquema real observado em 23/11/2026 (`id uuid` com default, `user_email
NOT NULL`, `details` em JSON, `client_event_id text` + índice único). O
`CREATE TABLE IF NOT EXISTS` só afeta instalações novas — a base de produção já
existente não é alterada.

Confirmado a 23/11/2026 contra o projeto de produção: `details` é **`jsonb`** —
a mensagem 22P02 diz «type json» para os dois tipos, por isso só a
`information_schema` responde —, `user_email` e `action` são `NOT NULL` sem
default, e o índice único criado é válido. O app lê ambos os tipos.

A migração está aplicada em produção: não há mais nada a executar nos passos 1
a 3; resta a prova de envio do passo 5, no APK nativo em Base Oficial.
