# Sincronização multi-agente — conflito por campo e blindagem

> Complementa o diagnóstico «Sincronização multi-agente — diagnóstico e plano de
> trabalho» (rev. 3), Fases 2, 3 e 4. O que aqui se descreve é o comportamento
> que o app tem hoje; o que falta da Fase 5 está no fim.

## 1. Dois auditores no mesmo ativo

O ativo é uma linha só na nuvem (`public.assets`, chave `(tenantid, primarykey)`)
e cada aparelho guarda a sua cópia local. Dois auditores podem tocar no mesmo
ativo em horas diferentes — um confere, o outro corrige o endereço ou lê o GPS.

Sem regra, o último que **sincroniza** ganha o registo inteiro. Isso apagava
trabalho alheio: a conferência de quem conferiu às 10:00 desaparecia porque
outro aparelho, com a fila parada desde as 09:00, subiu às 11:00.

A regra passou a ser **por campo, decidida por tempo**:

| Grupo | Campos | Quem vence |
|---|---|---|
| Conferência | `conferido`, `auditor`, `data_leitura`, `status` | a `data_leitura` mais recente |
| Ponto | `gps_lat`, `gps_lng` | a `data_leitura` mais recente (a nuvem não tem carimbo próprio do ponto) |
| Resto | etiqueta, descrição, endereço, quantidade… | este aparelho (é trabalho local por subir) |

A mesma regra vale nos dois sentidos:

- **descida** (`utils/mergePorCampo`, `utils/pendencia`, `utils/assetGps`): o
  pull não desfaz a conferência deste aparelho nem aceita um ponto mais antigo;
- **subida** (`utils/conflitoSubida`): antes do envio, o ciclo lê numa consulta
  só o estado remoto das chaves pendentes (`fetchCloudConflictRows`) e, quando a
  nuvem tem a leitura mais recente, os campos do grupo **saem do payload** — o
  `ON CONFLICT DO UPDATE` só toca nas colunas enviadas, por isso a coluna remota
  fica como está — e o registo local adota os valores da nuvem na mesma escrita
  que o marca como sincronizado.

Sem prova de tempo não se decide contra o aparelho: linha remota ausente, sem
`data_leitura` ou leitura local mais recente continuam a subir como antes. Nunca
se inventa uma data para ganhar o conflito.

## 2. O conflito fica na trilha

Cada conflito resolvido escreve **uma** linha `SYNC_CONFLICT` em `audit_logs`
por ativo e por janela (a mesma janela das recusas de envio, para o ciclo de
60 s não inundar a trilha). O texto diz quais os grupos em disputa e quem ficou
com a leitura. O painel (`Dashboard`) já conta essa ação.

Limite conhecido: o modelo não tem carimbo por campo. Fora dos dois grupos
acima, o resto do registo é deste aparelho — e o conflito fica registado para
não ser silencioso.

## 3. Blindagem física (`is_system_locked`)

O «Pronto para Campo» do Gestor de Base grava `is_system_locked = 'true'` e
congela o aparelho. A partir daqui a chave trava **os dois sentidos**:

| Caminho | Onde a chave é lida |
|---|---|
| Subida (fila de ativos, fotos, campanhas, trilha, envio em massa) | `canPushToCloud` (`services/pushGate.ts`) |
| Descida/sincronização manual e automática | `syncFromCloud` (`App.tsx`) |
| Realtime (ativos e configuração) | callbacks das duas subscriptions (`App.tsx`), evento a evento |

A leitura é por evento e por ciclo, não no arranque: o Administrador pode
blindar o aparelho com o app já aberto, e o ciclo seguinte já não envia. A
grafia não muda — só o valor exato `'true'` fecha o sistema; qualquer outro
valor (ausente, `'1'`, `'TRUE'`) é sistema aberto.

A regra vive em `utils/systemLock.ts` (`isSystemLocked`). Uma comparação à mão
em qualquer outro sítio é regressão: o teste `src/__tests__/systemLock.test.ts`
falha se a chave voltar a ser lida fora do módulo.

## 4. Tempo real: evento por campo e releitura por checkpoint

O canal (`subscribeToAssetChanges`) era o caminho com janela de perda. Foram
duas as correções (H1 · Fase 4):

**No próprio evento** (`utils/realtimeAtivos`): o payload do canal é a linha
CRUA do Postgres e passa por `mapCloudAssetRow` — antes entrava no estado sem
mapeamento (`gps_lat`/`data_leitura` em vez de `latitude`/`_dataLeitura`). Se o
ativo tem pendência neste aparelho (`_is_synced = 0` ou toque da sessão em
`dirtyAssetsRef`), o evento passa pelo mesmo merge do pull
(`mesclarConflitoPorCampo`): a conferência e o ponto de GPS ficam com a leitura
mais recente — a da nuvem pode ser de outro auditor — e o resto do registo
continua a ser deste aparelho. Sem pendência, a nuvem substitui como antes. Se
o merge não altera nenhum campo local, não há escrita.

**Ao reconectar** (`fetchAssetsChangedSince` + `mergeDeltaPull`): o segundo
`SUBSCRIBED` do canal (o primeiro é a abertura normal, coberta pelo pull de
arranque) dispara uma leitura de `assets` com `updated_at > checkpoint`, para o
contrato, aplicada com o mesmo merge do delta — inclui a exclusão da nuvem, que
vence a pendência local. O checkpoint começa no checkpoint do último pull e só
avança com o `updated_at` da nuvem (nunca com a hora deste aparelho, que pode
estar adiantada e abrir um buraco na janela). Se a leitura falhar, devolve
`null` e o checkpoint **não** avança: a próxima reconexão repete a janela.

A escrita segue o caminho do delta do pull: a reconciliação calcula as linhas
que ficaram diferentes (`linhasQueMudaram`) e grava **só essas** — `saveInventory`
com `skipSqlAssetsInsert` e um `persistAssetsBatch` do subconjunto. Um
`saveInventory(newState)` sem lista regrava a base inteira
(`bulkInsertAssets` de todos os ativos) a cada reconexão, que é exactamente o
que o pull já tinha deixado de fazer.

O evento singular segue a mesma regra: `linhasQueMudaram` com o id do evento
devolve a linha final que difere do estado anterior, e só essa é gravada
(`skipSqlAssetsInsert` + `persistAssetsBatch`). Um `INSERT`/`UPDATE` grava uma
linha; um `UPDATE` cujo merge não alterou nada e um `DELETE` não gravam
nenhuma — no `DELETE` o registo sai do estado e o espelho não ganha escrita
(`persistAssetsBatch` é upsert), como já acontecia com o save completo.

A normalização de `_dataLeitura` do arranque (leituras anteriores a 15/03/2026
passam a «ontem») deixou de gravar a base inteira: a regra passou para
`utils/normalizacaoLeitura` (`normalizarLeiturasDeConferencia`), devolve só as
linhas que mudaram e é **idempotente** — só normaliza o que ainda está antes do
alvo, por isso a segunda passagem não tem nada a fazer. Antes a data gravada
(`2026-03-15T12:00:00Z`) continuava «anterior a 2026-03-16» e o arranque
reescrevia a base em todos os arranques. O JSON legado usa a mesma regra.

O pull do arranque também deixou de regravar a base: `fetchFullInventory` já
escreve as linhas com `markSynced: true` e o estado é montado com essas mesmas
linhas, que não trazem `_is_synced` (`mapCloudAssetRow` não o produz). Regravá-
las com `saveInventory(newState)` sem lista devolvia o selo a 0 — a base
recém-descarregada ficava "pendente de nuvem". Os dois caminhos do arranque
(pull do boot loader e verificação secundária) passam `skipSqlAssetsInsert` e
gravam só configuração; `bootPullSeloSynced` fixa o caso.

O aviso de foto sincronizada (`gbr_photo_synced`) segue o mesmo recorte: troca
`_photoUrl` no estado e grava **só** esse ativo (`linhasQueMudaram` com o id do
aviso + `persistAssetsBatch`), em vez da base inteira por cada foto. Foto
repetida ou ativo fora do estado não gravam nada.

A troca de modo de base e o fim do onboarding também deixaram de gravar
ativos: só a configuração muda (`skipSqlAssetsInsert`). Com isso, os únicos
saves que ainda gravam a base inteira são os que substituem a base — a
recuperação do JSON legado — e o autosave, que passa a lista de sujos.

A blindagem física vale também aqui: com `is_system_locked = 'true'` nem o
evento nem a reconciliação aplicam linhas alheias.

Limite conhecido: uma exclusão **física** (`DELETE` sem soft delete) não tem
`updated_at` para ser relida pelo checkpoint. O app apaga com `is_deleted`, e
essa linha desce normalmente.

## 5. O que ainda falta de H1

- **Fase 5 — matriz S1–S9 com dois agentes reais:** exige dois aparelhos e a
  nuvem de produção; não se substitui por teste de unidade. O procedimento está
  em [`docs/RUNBOOK-FASE5-S1-S9.md`](RUNBOOK-FASE5-S1-S9.md), com o estado de
  partida, os nove cenários e a folha de recolha. O harness automático de dois
  dispositivos previsto no diagnóstico ainda não existe, por isso nada desta
  matriz está coberto por teste automático hoje.
