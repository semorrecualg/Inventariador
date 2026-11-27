# Sincronização multi-agente — conflito por campo e blindagem

> Complementa o diagnóstico «Sincronização multi-agente — diagnóstico e plano de
> trabalho» (rev. 3), Fases 2 e 3. O que aqui se descreve é o comportamento que
> o app tem hoje; o que falta das Fases 4 e 5 está no fim.

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

## 4. O que ainda falta de H1

- **Fase 4 — realtime com revisão/reconciliação e sem janela de perda:** hoje o
  evento de um ativo que este aparelho tem pendente é descartado (o pull
  seguinte resolve) e não há revisão nem reconciliação depois de uma queda do
  canal. Falta a leitura por checkpoint ao reconectar e o merge por campo no
  próprio evento.
- **Fase 5 — matriz S1–S9 com dois agentes reais:** exige dois aparelhos e a
  nuvem de produção; não se substitui por teste de unidade.
