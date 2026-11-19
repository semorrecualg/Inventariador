# Merge de `_conferido` entre as três tabelas — decisão

> **Onde:** `getLocationsWithStats` (`src/services/localDbService.ts`).
> **Regra da marca:** `isConferido` (`src/utils/conferencia.ts`).
> **Testes:** `src/__tests__/conferidoTipos.test.ts`.

## O problema

Os ativos vivem em **três** tabelas do Dexie, com a mesma chave composta
`[tenantid+primarykey]`:

| Tabela | Papel |
|---|---|
| `ativos` | a tabela **viva** — é onde o trabalho de campo grava e apaga |
| `assets` | a **canónica** do último carregamento/pull |
| `local_assets` | o **baseline** do restore do `.dat` |

`getLocationsWithStats` lê as três e junta as cópias do mesmo ativo para contar
«conferidos de total» por localidade. Quando as cópias **discordam** sobre
`_conferido`, é preciso decidir quem manda. Hoje a regra é *monotónica*:
conferido se **qualquer** cópia disser que sim.

O outro lado da pergunta: a desmarcação. Se o merge só sabe somar conferências,
como é que um item desmarcado na tela volta a pendente na contagem?

## Opções consideradas

### 1. OR monotónico (atual)

`_conferido = isConferido(prev) || isConferido(next)`.

- **A favor:** nenhuma conferência de campo se perde na leitura; uma cópia
  atrasada (pull, restore, base antiga) não apaga o trabalho feito.
- **Contra:** uma divergência em que só a tabela viva diz «pendente» continua a
  contar como conferida.

### 2. Precedência da tabela viva

`_conferido` vem sempre de `ativos`; `assets`/`local_assets` só quando a viva não
declara o campo.

- **A favor:** a desmarcação aparece de imediato, mesmo que outra cópia esteja
  atrasada.
- **Contra:** se a cópia viva for a atrasada (base recarregada, restore
  interrompido), a leitura diz «pendente» e a próxima escrita propaga o zero —
  a conferência é **apagada**, não apenas escondida. Irreversível.

### 3. Mais recente vence (por `_lastUpdated` / `_dataLeitura`)

A cópia com o toque mais recente decide; sem data em nenhuma, cai no OR.

- **A favor:** respeita a intenção temporal quando as três cópias têm data.
- **Contra:** `_dataLeitura` **só existe quando há conferência** — `desmarcar`
  apaga-a de propósito (`desmarcarConferido`), por isso a desmarcação nunca tem
  data para comparar e voltaria sempre a perder. Precisaria de carimbar
  `_lastUpdated` em toda a escrita de conferência, alargando o contrato de
  escrita por causa de uma contagem.

### 4. OR monotónico **com a prova**

A decisão é a da opção 1; a diferença é que o registo unido leva também
`_auditor`, `_dataLeitura` e `AUDITOR_STATUS_CONFERENCIA` **da cópia que
conferiu** — em vez de os herdar da cópia de maior precedência, que pode não ter
nenhum.

- **A favor:** não inventa uma conferência sem autor/data (o selo e a
  normalização do arranque leem essa data), e não muda a decisão que já está
  fixada pelos testes.
- **Contra:** são três campos a mais no registo unido — que hoje só alimenta
  contagens.

## Recomendação: opção 1 **com a prova** (4)

A opção 2 e a 3 resolvem um problema que **não existe**: a desmarcação não fica
numa tabela só. Todo o caminho de escrita do ecrã passa por
`localDb.assets.update` (`InventoryCard`, `AssetDetail`, `AccountReconciliation`,
`Labeling`) ou por `SqliteService`, e ambos escrevem **as três tabelas na mesma
transacção**. Ou seja, quando as cópias divergem não é porque alguém desmarcou
numa delas — é porque uma cópia está atrasada (pull, restore, carga antiga).

Nesse cenário, precedência e recência apagam trabalho de campo; o OR guarda-o. A
desmarcação legítima continua a ganhar, porque chega às três cópias e o OR de
três zeros é zero. O que faltava era a **prova**: o registo unido dizia
«conferido» e ficava com a `_dataLeitura` da cópia que não conferiu (vazia).

O contrário também fica decidido e escrito: **não** se aplica monotonicidade à
carga/pull (`bulkInsertAssetsOfflineFirst` e `localDb.assets.bulkAdd`). Se a base
que desce não pode desmarcar, a desmarcação feita noutro aparelho nunca chega a
este — e a nuvem é a fonte de verdade do que já foi sincronizado.

## Efeito por ecrã

| Ecrã / caminho | Lê | Efeito da decisão |
|---|---|---|
| Inventário, cartão do ativo, selo «Pendente Nuvem» | `ativos` (sem merge) | nenhum — a decisão é sobre a união das três |
| Seletor de unidade e contadores por localidade | `getLocationsWithStats` (união) | conferido uma vez por chave; divergência de cópias **não** perde a conferência |
| Painel / estatísticas (`SqliteService`) | `assets` (sem merge) | nenhum |
| Conciliação de contas | ativos do inventário (sem merge) | nenhum |
| Exportação Excel/CSV | `isConferido` por linha | nenhum |
| Envio à nuvem (`buildPayload`) | a cópia enviada | nenhum — a decisão não toca na escrita |

O efeito visível é um só, e é de correção: uma localidade cujo ativo foi
conferido numa cópia e está pendente noutra **conta como conferida** (como já
contava) e o registo unido passa a trazer **a data e o autor dessa conferência**.

## O que fica implementado

- `mergeCopiasDeAtivo` exportado de `src/services/localDbService.ts`: decisão OR
  pela regra única + prova (`_auditor`, `_dataLeitura`,
  `AUDITOR_STATUS_CONFERENCIA`) vinda da cópia que conferiu; sem conferência em
  nenhuma cópia, a marca fica `0` e a prova vazia.
- `getLocationsWithStats` usa essa função (deixou de ter a cópia local).
- Testes em `src/__tests__/conferidoTipos.test.ts`: divergência entre cópias
  (grafias diferentes), conferido só na segunda/terceira cópia, prova herdada,
  e a desmarcação pelo caminho do ecrã (`localDb.assets.update`, três tabelas) a
  voltar a `0 de 1`.
