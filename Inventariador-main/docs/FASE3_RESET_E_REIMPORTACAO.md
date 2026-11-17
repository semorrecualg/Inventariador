# Fase 3 — reset da base e reimportação da planilha (prova `planilha N · base N`)

Sequência para limpar a base de um contrato e repor o inventário a partir da
planilha, provando que **cada linha do arquivo fica na base**.

## 1. Backup antes de qualquer coisa

- Gestor de Base → exportar a base atual (snapshot local em disco);
- na nuvem, backup/snapshot do projeto Supabase.

O reset abaixo é **irreversível**.

## 2. Reset da nuvem (só o contrato indicado)

`scripts/reset-base-tenant.sql` apaga `assets`, `asset_logs`, `campaigns` e
`campaign_snapshots` do contrato e imprime as contagens antes/depois. Não toca
em `unit_configs`, `locations`, `audit_logs` nem `user_permissions` — são
cadastro, não inventário.

**No Supabase (SQL Editor):** abra `scripts/reset-base-tenant.sql`, troque o
contrato na linha marcada `CONTRATO` (`select set_config('gbr.reset_tenant', 'CICOPAL', false)`)
e cole o ficheiro inteiro no SQL Editor. Não usa meta-comandos do `psql`, por isso
roda tal como está no editor web.

**No terminal:**

```bash
psql "$SUPABASE_DB_URL" -f scripts/reset-base-tenant.sql
```

Em qualquer dos casos o contrato está no próprio ficheiro (linha `CONTRATO`) —
não há `-v tenantid=` a passar. Contrato vazio aborta sem apagar nada, e a
mensagem `DEPOIS` tem de mostrar `ativos 0 · campanhas 0 · laudos 0 · logs 0`.

**Ordem importa:** os ativos são apagados **antes** dos logs. Um trigger de
auditoria em `public.assets` grava uma linha em `asset_logs` para cada ativo
apagado; limpar os logs primeiro fazia essa auditoria do próprio reset voltar a
encher a tabela (a primeira execução deixou 11.441 logs e zero ativos). A
execução termina com a contagem de logs já depois do trigger, e o script é
idempotente: rodar de novo sobre um resíduo de logs limpa-os (sem ativos não há
trigger para disparar).

Se a mensagem `LOGS RESTANTES` aparecer, é RLS a bloquear o `DELETE` — o
`SELECT` passa e o `DELETE` apaga 0 linhas sem erro. Nesse caso rode como dono
da tabela e desative a RLS dentro da mesma transação:

```sql
begin;
alter table public.asset_logs disable row level security;
-- cole aqui o script
alter table public.asset_logs enable row level security;
commit;
```

## 3. Reset da base local

Gestor de Base → **ZERAR BASE DE DADOS** (`sqliteService.forcePurgeAndConnect`).
Sem isso, o pull seguinte devolve o que já estava no aparelho e a contagem da
importação soma registos antigos.

## 4. Reimportar a planilha

Gestor de Base → selecionar o arquivo CICOPAL → a carga valida o contrato (21
colunas na ordem fixa), grava em lotes e termina com a reconciliação:

```
[CARGA OK] planilha N · base N · K chave(s) distinta(s) em F filial(is).
[CARGA] 010101 CICOPAL GO: planilha N → base N
```

O mesmo resultado fica em `audit_logs` (`acao = IMPORT_RECONCILIATION`), com
`ok`, `planilha`, `gravadas` e `perFilial`.

Se aparecer `CARGA BLOQUEADA`, a carga **não** apagou nada: o relatório nomeia
as linhas ausentes, as que caíram noutra filial e as chaves repetidas.

## 5. Prova automática (opcional, fora do app)

Executa exatamente o caminho do Gestor de Base sobre o arquivo real e compara
linha por linha:

```bash
CARGA_PLANILHA=/caminho/CICOPAL.xlsx npm run prova:carga
```

Sem o ficheiro, o mesmo teste corre com uma planilha sintética (duas filiais,
chaves de origem repetidas e linhas sem chave) só para provar o caminho técnico:

```bash
PROVA_CARGA_SINTETICA=1 npm run prova:carga
```

## 6. Abrir a campanha depois da carga

Primeiro o inventário, depois a campanha — nesta ordem. A campanha exige filial
e só admite uma aberta por filial e contrato; campanha com ativos lidos não pode
ser excluída.
