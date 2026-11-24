# Selo de geração da base

Depois de um reset da nuvem (`scripts/reset-test-database.sql`), só o aparelho
onde se correu **Gestor de Base → «Preparar Nova Carga»** fica limpo. Qualquer
outro aparelho com a base antiga reenviaria as chaves velhas no primeiro sync e
repovoava `public.assets` — em silêncio. O selo existe para tornar essa
diferença visível e bloquear o envio.

## Modelo

| Onde | O quê |
|---|---|
| Nuvem | `public.base_generation`: uma linha (`id = 1`) com `generation` (uuid), `seq` (bigint) e `reset_at` |
| Aparelho | `localStorage['gbr_base_generation']` = `{ generation, seq }` |

O app **só lê** a tabela. A escrita é feita pelo SQL de reset, no SQL Editor ou
com `service_role`; o cliente (anon/authenticated) tem apenas política de
`select`.

## Decisão antes de cada envio

`utils/baseGeneration.ts` decide; `exigirGeracaoBaseCorrente` (em
`supabaseService`) aplica antes de qualquer `upsert`, nos **dois** caminhos que
escrevem em `assets`: `syncAssetsToCloud` (carga em massa, autosave, push delta e
envios de uma linha) e `processDataSyncQueue` (a fila normal, que faz upsert
directo por registo).

| Selo local | Geração da nuvem | Base local | Resultado |
|---|---|---|---|
| igual | igual | — | segue |
| ausente | `seq = 1` | com inventário | **adota** (rollout do selo; aparelhos já em campo não param) |
| ausente ou diferente | qualquer | vazia | **adota** (não há nada para repovoar) |
| diferente | qualquer | com inventário | **bloqueia** com `BaseGenerationBlockedError` |
| ausente | `seq > 1` | com inventário | **bloqueia** |

O bloqueio não apaga nem altera nada: o envio é recusado, o aviso
`gbr_base_generation_blocked` sobe para a barra de sincronização do app e o
log diz o que fazer («Preparar Nova Carga» + recarregar + carregar a planilha).

`«Preparar Nova Carga»` limpa o selo junto com a base local: como a base fica
vazia, o envio seguinte adota a geração corrente sem risco.

## Restaurar um pacote depois de um reset

Um pacote de backup não leva o selo, por isso restaurá-lo depois de um reset
ficava bloqueado — e a mensagem mandava limpar a base, o que apagaria o
restauro. O caminho explícito é o botão **«Adotar geração atual»** no Gestor de
Base, ao lado de «Preparar Nova Carga»:

- exige confirmação e diz o que assume (a base local pertence à geração
  corrente da nuvem);
- não apaga nem envia nada, só grava o selo da nuvem no aparelho e limpa o aviso;
- falha aberta: se a nuvem não devolver selo legível, não grava nada e diz porquê.

É o único caminho que adopta a geração **sem** a base estar vazia, e é sempre
uma ação do operador — nunca automática.

## Falha aberta

Sem tabela (projeto que ainda não correu o bootstrap novo), sem rede, erro de
esquema ou resposta inválida, `lerGeracaoNuvem` devolve `null` e o envio segue
**sem portão**. É deliberado: um projeto legado não pode deixar de sincronizar
por causa do selo. O `warn` aparece uma vez por episódio e diz para correr
`docs/supabase_bootstrap.sql`.

A leitura é cacheada 60 s (a fila da nuvem tenta de novo a cada 1,2 s), tem tecto
de 4 s — um pedido pendurado travaria a fila antes do primeiro upsert — e o cache
é limpo em `resetCloudPushBlockedNotice()` e nos testes.

## Operação

1. **Primeira vez:** correr `docs/supabase_bootstrap.sql`. A tabela nasce com
   `seq = 1` e um uuid novo; aparelhos em campo adotam-no no envio seguinte.
2. **Cada reset:** depois do bootstrap, correr o § 2-B de
   `scripts/reset-test-database.sql` (gira `generation` e faz `seq + 1`).
3. **Aparelhos:** nenhum passo. Quem estiver na geração antiga fica bloqueado e
   resolve com «Preparar Nova Carga».

### Limite conhecido (wipe total)

O `seq = 1` distingue o rollout de um reset. Se alguém apagar **também**
`base_generation` (wipe total, fora do guião), o bootstrap volta a semear
`seq = 1` e um aparelho que nunca viu o selo adotaria a base antiga. Para um wipe
total, guarde a geração antes e reponha-a com `seq + 1`:

```sql
insert into public.base_generation (id, generation, seq, reset_at)
values (1, gen_random_uuid(), <seq_antigo + 1>, now())
on conflict (id) do update
  set generation = excluded.generation,
      seq = excluded.seq,
      reset_at = excluded.reset_at;
```

## Testes

- `src/__tests__/baseGeneration.test.ts` — normalização, storage e a tabela de
  decisão (16 casos).
- `src/__tests__/syncAssetsToCloudGuard.test.ts` — o portão no envio em massa:
  bloqueia, segue na geração igual, adota no rollout e falha aberto sem selo;
  e a adoção explícita (grava o selo e liberta o envio; sem selo legível não
  grava nada).
- `src/__tests__/syncPushQueue.test.ts` — o encaixe na fila normal
  (`processDataSyncQueue`): recusa sem tocar no `upsert` e deixa o ativo
  pendente.
