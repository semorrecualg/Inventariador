# Changelog

All notable changes to the GBR KARDEK Inventariador project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Adicionado — guarda contra o regresso do espelho local `assets`

- `npm run verify:assets-removida` (passo próprio no CI) falha se o código
  voltar a usar `db.assets`, `.table('assets')` ou `mirrors.assets`, se o
  schema declarar a tabela, se `MirrorCounts` voltar a contar três espelhos ou
  se os docs voltarem a apresentar `assets` como tabela local («três
  espelhos», linha de tabela, `db.assets`).
- Isenções explícitas: `CHANGELOG.md`, os docs de decisão/análise anteriores à
  A.3a.4, linhas de remoção («saiu na v11»), `public.assets`/`table_name` da
  auditoria, a tabela de versões do `docs/SCHEMA_BASELINE.md` e o upgrade v5.
  `localDb.assets` continua válido: é fachada de escrita para `ativos` +
  `local_assets`, não a store removida.
- Prova da própria guarda: `src/__tests__/verificaAssetsRemovida.test.ts`
  (detecta as regressões e aceita os históricos).

### Documentado — fim do terceiro espelho local e filtro de auditoria da nuvem

- `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/MIGRACAO_HIBRIDA.md`,
  `docs/LIMPEZA_COPIAS_EXATAS.md`, `docs/VISAO_MALHA_AUDITORIA_CAMPO.md` e
  `docs/PERFORMANCE_SINCRONIZACAO.md` deixam de tratar `assets` como tabela
  local: a store saiu na `version(11)` e as contagens/transações usam
  `local_assets` + `ativos`. A tabela `assets` que resta é a da nuvem
  (`public.assets`).
- `fetchAssetAuditLogs` (`services/supabaseService.ts`): documentado o filtro
  `table_name in ('assets','ativos','local_assets')` — os três nomes são o
  histórico real do campo (carga/eventos na nuvem, tabela local atual e espelho
  legado), não um resto da store removida.

### Corrigido — carga da planilha: tenantid por linha, filial única e órfãs

- **`tenantid` em cada linha:** a carga passa a bloquear quando qualquer linha
  preenchida vem sem `tenantid` e a mensagem nomeia as linhas do arquivo
  (1 = cabeçalho). Antes só bloqueava com a coluna vazia em todas as linhas, e
  uma linha isolada entrava com a chave composta `['', primarykey]`.
- **Filial única:** `injetarDadosEmLotes` passa a resolver a filial pela mesma
  cadeia das outras vias (`filial` → `unidade` → `unit` → `unitid` → `unit_id` →
  unidade do operador). A identidade derivada usa a filial, por isso a mesma
  planilha importada por vias diferentes criava registos novos.
- **Órfãs da reimportação:** a reconciliação deteta os registos que ficaram na
  base com a identidade antiga da mesma `source_primarykey` (mesmo contrato e
  filial), regista-os em `audit_logs` (`orphans`/`orphanKeys`) e no terminal do
  Gestor de Base. Nenhum registo é apagado automaticamente.

### Adicionado — runbook de medição do A.3a.0

- `docs/RUNBOOK-A3a0.md`: procedimento para o operador medir a base real no
  aparelho (linha de base F0, pacote F7 com checksum por tabela,
  `navigator.storage.estimate()`, arranque Android × PWA, `save` com 1 e 300
  ativos) e preencher a coluna «Base» de §8. Sem alterações de código.

### Adicionado — selo de geração da base

- **O que era:** o reset da nuvem só limpava o aparelho onde «Preparar Nova Carga»
  era corrido. Um segundo aparelho com a base antiga reenviava as chaves velhas no
  primeiro sync e repovoava a tabela `assets` — em silêncio, porque a nuvem não
  tinha como saber que aquela geração já não valia.
- **Agora:** `public.base_generation` (uma linha, `generation` uuid + `seq`) dá
  identidade à geração corrente; o aparelho espelha-a em `localStorage` e
  `exigirGeracaoBaseCorrente` compara antes de qualquer upsert nos dois caminhos
  que escrevem em `assets` (`syncAssetsToCloud` e a fila
  `processDataSyncQueue`). Geração igual segue;
  base local vazia ou primeira geração (rollout) adota; qualquer outra diferença
  bloqueia o envio com aviso na barra de sincronização e pede «Preparar Nova
  Carga». Falha aberta: sem tabela, sem rede ou resposta inválida o envio segue
  sem portão (projetos que ainda não correram o bootstrap novo), com tecto de
  4 s na leitura para um pedido pendurado não travar a fila.
- **Restauro depois de um reset:** o pacote não leva selo e ficava bloqueado para
  sempre. O Gestor de Base ganhou «Adotar geração atual» — confirmação explícita,
  não apaga nem envia nada, grava o selo da nuvem e limpa o aviso; a mensagem de
  bloqueio passou a apontar esse caminho quando houve restauro.
- **Ecrã em branco no arranque/login:** o ramo do boot que decide a sessão
  repetia a lógica à mão em vez de usar `resolveSessionAfterCloudCheck`, por isso
  um `getSession()` lento apagava o login local recém-concluído. Passou a usar o
  helper (que relê o cache depois do await) e os três caminhos de LOGIN forçado
  escrevem `#/login` — sem rota para o ecrã conduzido pelo estado, a página ficava
  vazia.
- **Operação:** o § 2-B de `scripts/reset-test-database.sql` gira o selo depois
  do bootstrap; ver `docs/GERACAO_BASE.md`.
- **Testes:** `baseGeneration` (16), 8 em `syncAssetsToCloudGuard` (guarda +
  adoção explícita) e o encaixe na fila em `syncPushQueue`.

### Adicionado — reset da base de teste e preparação para nova carga

- **O que era:** reiniciar a base de teste no Supabase exigia cirurgia manual
  de tabelas e índices, e o aparelho continuava com as linhas da carga anterior.
  O primeiro sync reenviava tudo e anulava o reset da nuvem; a fila durável da
  âncora podia ainda empurrar uma âncora de um contrato já reiniciado.
- **Agora:** `scripts/reset-test-database.sql` dropa as tabelas de
  inventário/auditoria que o bootstrap recria (com autorização explícita,
  `auth.users` e `user_permissions` intactos por omissão) e deixa a recriação
  para `docs/supabase_bootstrap.sql`; as tabelas sem DDL no repositório ficam
  mantidas salvo autorização própria. No Gestor de Base, «Preparar Nova Carga»
  limpa o inventário local, os três espelhos, os endereços, a trilha e o espelho
  virtual, e remove a fila `gbr_unit_config_pending`.
- **Testes:** `freshLoadReset` (4).

### Adicionado — recuperação de senha e diagnóstico de erros de login

- **O que era:** quem esquecia a senha não tinha saída própria — só o «Redefinir
  Acesso», que limpa o estado local e não envia e-mail. O link de recuperação do
  Supabase abria uma sessão e a app entrava como login normal, sem ecrã para
  definir a senha nova. E a resposta real do GoTrue (`Invalid login
  credentials`) não casava o teste `invalid credentials`, por isso o formulário
  mostrava o texto cru em inglês.
- **Agora:** «Esqueci a senha» no login pede o e-mail pelo `resetPassword`
  existente e confirma o que é verificável (o pedido foi aceite; se a conta
  existir, o link chega). O link de recuperação passa a ser reconhecido antes de
  o supabase-js consumir o hash, abre o ecrã «Definir Nova Senha», grava com
  `auth.updateUser` e encerra a sessão temporária; no APK o e-mail aponta para o
  deep link `com.gbr.kardek://recovery` (guia em
  `docs/RECUPERACAO_SENHA_MOBILE.md`). Os erros de login passam a distinguir
  credencial inválida de e-mail por confirmar, mostram o código do Auth, o ref do
  projeto Supabase em uso e a última recusa no próprio formulário, e registam
  uma linha `[Login]` no log do SRE com os mesmos campos (a senha nunca entra).
- **Testes:** `loginErrors` (11), `supabaseProjectRef` (3), `passwordRecovery`
  (4), `recoveryLink` (8) e `recoveryPasswordScreen` (5), mais 3 casos de
  «Esqueci a senha» em `loginFluxoUnico`.

### Adicionado — pacote de backup exportável com hash verificado (F7)

- **O que era:** o export de segurança já levava contagem e checksum SHA-256 por
  tabela, mas nada selava o pacote inteiro e o restauro escrevia sem verificar
  nada — um ficheiro corrompido ou editado à mão substituía o trabalho de campo
  em silêncio. E não havia botão para o exportar: o serviço só era exercido nos
  testes.
- **Agora:** o formato v1.1 sela o pacote com `packageChecksum` (SHA-256 do corpo
  canónico, com as tabelas ordenadas por nome). `verifySecurityExport` confere a
  contagem de cada tabela e o hash do pacote — o hash já cobre os registos, por
  isso não recalcula o SHA-256 tabela a tabela; `restoreSecurityExport` corre
  essa verificação **antes da primeira escrita** e recusa o pacote inteiro
  quando algo não bate. «EXPORTAR PACOTE VERIFICADO» está no Gestor de Base e na
  **Gestão e Manutenção** (junto ao backup), com um ponto único de montagem e
  verificação: só descarrega o `.json`/`.dat` depois de a verificação passar, e
  o resultado mostra o total de registos, a versão do schema e o início do hash.
- **Restauro (2/2):** «RESTAURO DO PACOTE DE BACKUP» no Gestor de Base — seleciona
  o `.json`/`.dat`, apresenta o relatório de `verifySecurityExport` (schema, data
  do snapshot, total de registos, SHA-256 do pacote e contagem por tabela) e só
  habilita o restauro quando o pacote confere. A base só é substituída depois da
  confirmação explícita; o resultado lista as tabelas restauradas e as puladas
  (ausentes na base-alvo). Um ficheiro que não é JSON válido é recusado na
  leitura, sem tocar na base.
- Testes: `securityPackageRestore.test.tsx` cobre os três caminhos do ecrã —
  pacote íntegro restaurado só depois da confirmação, pacote adulterado recusado
  no relatório (base-alvo intacta) e ficheiro que não é JSON.
- Testes: `securityExport.test.ts` cresce de 6 para 12 casos — pacote selado e
  verificado, export verificado com o total de registos, registo adulterado
  (recusa sem tocar no destino), contagem que não bate com os registos, hash do
  pacote substituído e hash de forma inválida (`checksum_error`), que antes
  compararia igual a si próprio e passaria sem selo.

### Corrigido — a âncora GPS volta noutro aparelho (F5)

- **O que era:** a âncora marcada no `UnitConfigurator` só chegava à nuvem se a
  gravação coubesse naquele instante. Sem rede, em BASE LOCAL ou com o servidor
  a recusar, a âncora ficava no aparelho e nunca era reenviada: reconectar não
  bastava e a filial continuava em «FALTA ÂNCORA GPS» nos outros aparelhos.
- **Agora:** quando a nuvem não confirma, a âncora entra numa fila durável
  (`gbr_unit_config_pending`, uma entrada por filial com a posição mais
  recente) e sobe no arranque seguinte (`fetchUnitConfigs`) e quando a rede
  volta (`online` no `App`). Em BASE LOCAL a fila espera sem uma única chamada
  de rede — a base local continua hermética (F1). Uma âncora revogada na nuvem
  sai da fila em vez de ser reposta. O envio só é dado por confirmado quando
  `inventory_config` **e** `unit_configs` (âncora + regras da unidade) aceitam
  a gravação.
- Testes: `ancoraPendente` cobre a fila (unidade única, coordenada inválida,
  lixo no storage) e `ancoraEntreDispositivos` prova o percurso sem rede →
  reconexão → outro aparelho com storage vazio, incluindo o reenvio no arranque
  e a recusa em modo BASE LOCAL.

### Corrigido — a confirmação ao sair só aparece com escritas por enviar

- **O que era:** o `beforeunload` pedia confirmação sempre que houvesse ativos
  carregados (`inventory.assets.length > 0`). Com a base toda sincronizada o F5
  abria o diálogo nativo na mesma e, sem resposta, a recarga nunca commitava —
  num build de produção isso parece um separador «preso».
- **Agora:** a guarda conta o que as filas ainda não subiram — ativos não
  sincronizados, fotos na fila de envio e eventos da trilha por enviar (estes
  só quando `canPushToCloud`, para a contagem não ficar presa em BASE LOCAL ou
  no browser). Sem pendências, fechar e recarregar seguem sem diálogo; a chave
  `__gbr_allow_reload` continua a deixar o próprio app recarregar-se.
- Teste: `guardaSaida` cobre a regra (base sincronizada, cada fila isolada,
  soma robusta a lixo), a mensagem no singular/plural e o contrato com o
  `App.tsx` (a guarda deixa de decidir por `inventory.assets.length`).

### Corrigido — a URL passa a mandar na navegação (F5 cai no ecrã certo e o «voltar» funciona)

- **O que era:** o hash da URL era só de escrita. Com sessão válida, um F5 em
  `#/audit-logs` ancorava sempre no contrato de trabalho (`#/contexto`), porque
  o arranque decidia a tela pela sessão sem olhar à URL; e o «voltar/avançar» do
  browser mudava o hash sem mudar o ecrã (só um separador novo recuperava a
  navegação à mão).
- **Agora:** `telaDoHash` lê a rota (`#/audit-logs`, `#/contexto/`,
  `#/audit-logs?aba=x`, `#/asset/<etiqueta>`) como inverso de `screenToPath`; o
  arranque ancora a pilha nessa tela (`historicoDeAncoragem`), com o contrato
  por baixo para o «voltar» ter destino, e sem sessão uma rota profunda
  continua a pedir login; um `hashchange` corta ou empurra a pilha
  (`proximaPilha`) e o ecrã acompanha. As telas com `<Route>` própria no
  `App.tsx` (`/login`, `/menu`, `/db-manager`, `/dashboard`) ficam de fora: a
  URL já as desenha e pôr o estado a segui-las acionava os guards de unidade
  (o dashboard era rebatido para o contrato). A escrita estado → URL ficou em
  `escreverHash`, que não duplica a entrada atual.
- Testes: `navegacaoHash` cobre o inverso de `screenToPath`, as rotas com
  prefixo/barra/query, a âncora e o «voltar/avançar»; `sessionPersistence` ganha
  o F5 numa tela profunda e o controlo sem sessão.

### Corrigido — arranque à prova de um módulo que não chega (F5)

- **O que era:** com o servidor a devolver `503` na rajada de pedidos de um F5,
  o `import()` de `App.tsx` rejeitava com «Failed to fetch dynamically imported
  module» e o `ErrorBoundary` mostrava «Ops! Algo deu errado» — mas o loader do
  `index.html` (`position: fixed; z-index: 9999`) ficava por cima até aos 95 s,
  com o botão «Recarregar» inalcançável. Além disso o `React.lazy` era criado
  dentro do render (novo tipo a cada render → remontagem do `App` inteiro) e um
  único `503` matava o arranque sem segunda tentativa. O vigia de 6 s limpava
  `isInitializing` e `sqliteStatus`, mas não `authLoading` — um init travado
  deixava o splash para sempre. E o Dexie (8 versões) não tratava
  `blocked`/`versionchange`: uma aba antiga segurava a base e o F5 ficava à
  espera indefinidamente.
- **Agora:** o `React.lazy` vive no escopo do módulo e repete a falha de rede
  três vezes com espera crescente; `vite:preloadError` e o `ErrorBoundary`
  recarregam uma única vez (janela de 20 s em `sessionStorage`, sem ciclos), o
  loader sai do caminho no erro e o fallback estático cai para 20 s; o vigia do
  arranque limpa os três sinais do splash, `authLoading` incluído; e o Dexie
  fecha a ligação em `blocked`/`versionchange`, registando o motivo em
  `estadoBloqueioDexie`.
- Testes: `bootArranque` (16) cobre o retry, a guarda de recarga, a remoção do
  loader, o vigia do arranque e as guardas do Dexie.

### Corrigido — login na nuvem: perfil com contrato e sem filial deixa de ser expulso

- **O que era:** ao entrar no browser com um perfil que tem `tenantid` em
  `user_permissions` e nenhuma `filial`/`units`, o `processSession` tratava a
  falta de contrato e a falta de filial como o mesmo erro: limpava a sessão,
  fazia `signOut` e mostrava «SESSÃO EXPIRADA · Identificador de Contrato ou
  Filial ausente para isolamento do banco RLS. Por favor, reautentique.».
  Reautenticar nunca preenche a filial do perfil — era um beco sem saída, e a
  sessão do Supabase era destruída sem necessidade.
- **Agora:** sem contrato a sessão continua a ser encerrada (não há banco a
  isolar), com a mensagem certa — «Acesso sem contrato», a pedir o vínculo em
  `user_permissions`. Com contrato e sem filial a sessão é mantida e a entrada
  segue para o CONTRATO DE TRABALHO (`/contexto`), que lista as filiais da
  nuvem desse contrato; o sync espera a escolha da filial, para nunca descer o
  contrato inteiro (mesma regra do arranque).
- Teste: `authSemFilial` — login de nuvem com perfil sem filial não chama
  `signOut`, não mostra «Sessão Expirada» e chega a `/contexto`.

### Adicionado — reconciliação da trilha de ativos entre aparelho, arquivo e `asset_logs` (F2, 3.º passo)

- **O que era:** a aba «Ativos» da Trilha lia `asset_logs` da nuvem e o Dexie,
  mas ignorava os eventos que a fila da F2 já tinha arquivado em `audit_logs`.
  Num aparelho reinstalado esses eventos desapareciam do ecrã (o aparelho já
  não os tinha), e o mesmo evento podia aparecer duas vezes quando as fontes
  tinham detalhes diferentes.
- **Agora:** `reconciliarTrilha` junta as três fontes — arquivo da nuvem
  (`audit_logs`, ligado ao evento local por `client_event_id`), histórico de
  triggers (`asset_logs`) e trilha do aparelho — com prioridade à identidade e
  recurso ao conteúdo só quando não há id. Cada linha ganha a marca «app · na
  nuvem», «app · só aparelho» ou «nuvem · asset_logs», para o operador saber se
  o evento sobrevive a uma desinstalação.
- `fetchAssetAuditLogs` faz a leitura paginada (500) dos eventos de ativo do
  arquivo; os testes `auditReconciliacao` cobrem fusão por `client_event_id`,
  evento só na nuvem, só no aparelho, duplicado com trigger e ordenação.

### Documentado — esquema real da `audit_logs` no bootstrap e no baseline

- **O que era:** `docs/supabase_bootstrap.sql` declarava `audit_logs` com `id
  bigint identity`, `user_email` nulável e `details text`; a produção tem `id
  uuid` com default, `user_email NOT NULL` e `details` em JSON. O `CREATE TABLE
  IF NOT EXISTS` nunca corrigiu a tabela existente, e o teste manual da migração
  bateu nos três sintomas (23502 e 22P02).
- **Agora:** o `CREATE TABLE` descreve o esquema real (`uuid` + default,
  `user_email NOT NULL`, `details jsonb`, `client_event_id text` com índice
  único) e o `SCHEMA_BASELINE` ganha §3.2.1 com a tabela de equivalência, as
  divergências observadas e a consulta de `information_schema` para confirmar
  `json` vs `jsonb`. Um teste do bootstrap falha se a declaração voltar ao
  esquema antigo.

### Adicionado — contador remoto da trilha por contrato (F2, 2.º passo)

- **O que era:** o Gestor mostrava quantos eventos estavam no aparelho e quantos
  faltavam subir, mas não dizia quantos já tinham chegado à nuvem — para
  confirmar que a fila começou a subir era preciso abrir o Supabase.
- **Agora:** o cartão «Registros de Auditoria» mostra também o total da trilha
  **do contrato** na nuvem, lido com `count: 'exact'` e `head: true` (só
  leitura: nenhuma linha é transferida, enviada ou alterada).
  `contarAuditoriaNuvem` devolve `off` em BASE LOCAL ou offline (a nuvem nem é
  chamada), `erro` sem contrato resolvido (não faz contagem global, por
  isolamento multi-tenant) e `erro` carimbado quando a nuvem recusa ou o pedido
  passa dos 8 s — por exemplo, com a migração `client_event_id` por aplicar.
- Teste: `auditoriaNuvemContador`.

### Corrigido — a trilha lida da nuvem aceita `details` como objeto

- **O que era:** em produção a coluna `audit_logs.details` é `json` (o
  bootstrap declara `text`), por isso o PostgREST devolve objeto/array. O ecrã da
  Trilha rebentava em `details.toLowerCase()`, o Histórico de Cargas em
  `details.match(...)` e a narrativa do evento tentava renderizar o objeto.
- **Agora:** `textoDoDetails` normaliza no bordo — `fetchAuditLogs`,
  `fetchAssetLogs` e `fetchLoadHistory` devolvem sempre `details` em texto
  (objetos serializados em JSON legível) e `parseAssetCountFromDetails` /
  `isDeltaSyncEntry` aceitam `unknown`, por isso a contagem de ativos continua a
  ser encontrada dentro do JSON.
- Testes: `auditDetails` (6) e 3 casos novos em `loadHistoryUtils`.

### Documentado — guia da migração `audit_logs.client_event_id`

- **`docs/MIGRACAO_AUDITORIA_CLIENT_EVENT_ID.md`**: passo-a-passo com
  diagnóstico que não toca em colunas inexistentes (duplicados condicional em
  `DO $$`), descoberta das colunas `NOT NULL`, migração idempotente, teste de
  `upsert` com `to_jsonb` para `details` e `rollback`, validação do esquema,
  confirmação da fila no Gestor e tabela de sintomas/causas.
- A variante concorrente documenta que `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
  é aceite desde o PostgreSQL 9.5 mas **não** repara um índice `INVALID` deixado
  por um build falhado: verifica-se `pg_index.indisvalid` antes e só se cria sem
  `IF NOT EXISTS`.
- Regista a divergência real da tabela de produção (`id uuid`, `user_email
  NOT NULL`, `details json`) face ao bootstrap, que fica pendente de alinhamento
  num PR próprio.

### Adicionado — limpeza de cópias exatas, com backup e desfazer

- **O que era:** a base local podia guardar a MESMA linha duas vezes (a chave
  local é composta `[tenantid+primarykey]`, e a carga antiga gravava também sem
  contrato) — 25.272 linhas para 12.636 ativos. O ecrã já mostrava o ativo uma
  vez, mas as linhas continuavam no aparelho.
- **Agora:** o Gestor de Base tem «LIMPAR CÓPIAS EXATAS», que remove só linhas
  com a **mesma `primarykey` normalizada e conteúdo idêntico** — compara todos
  os campos do bem e ignora apenas escopo (`tenantid`/chave), proveniência da
  carga e carimbos de envio. `primarykey`s diferentes nunca são fundidas (os
  bens distintos que partilham etiqueta ficam intactos) e o mesmo `primarykey`
  noutro contrato é preservado, porque é multi-tenant por desenho. Fica sempre a
  linha do contrato ativo e a grafia canónica da chave; a conferência
  (`_conferido`, `_auditor`, `_data_leitura`) faz parte do conteúdo, por isso
  nenhuma auditoria se perde — um grupo que divirja em conteúdo não é tocado.
- **Contagens:** a confirmação e o log mostram ANTES → DEPOIS por espelho
  (`local_assets` · `ativos` · `assets`), cópias removidas, grupos e chaves
  distintas antes/depois (têm de ser iguais; caso contrário a transação aborta
  sem apagar nada).
- **Reverter:** o backup é gravado na **mesma transação** das remoções, na
  tabela `asset_cleanup_backups` (schema v8). «DESFAZER LIMPEZA» devolve as
  linhas com as chaves exatas, inclusive `tenantid` vazio. O JSON de backup do
  Gestor («RECONECTAR BACKUP FÍSICO») restaura a base inteira como segunda via.
  Procedimento em `docs/LIMPEZA_COPIAS_EXATAS.md`. Testes:
  `assetMirrorCleanupService`.

### Corrigido — BASE LOCAL hermética, não envia nada para a nuvem

- **O que era:** o ciclo de fundo (`runSyncLoopCycle`) chamava
  `processDataSyncQueue`, `photoSyncManager` e `processCampaignSyncQueue`, e
  `createCampaign` subia a campanha, sem consultar o modo de base. Com sessão e
  filial activas, ativos conferidos em BASE LOCAL podiam chegar ao Supabase — e a
  campanha subia sempre. O modo dizia «local» e a rede era usada à mesma.
- **Agora:** o portão `syncService.canPushToCloud` exige
  `Capacitor.isNativePlatform()` **e** `isOnlineDatabaseMode(getDatabaseMode())`;
  em `INTERNAL`/`INTERNAL_PLUS` os três ciclos devolvem 0 registos sem tocar na
  nuvem, e `createCampaign` grava só no aparelho. Um aviso permanente no topo do
  app (fora do login) diz que nada sai do aparelho e que desinstalar ou limpar os
  dados apaga a base, a trilha de auditoria e as fotos pendentes. Teste:
  `baseLocalPushGate`.

### Adicionado — a trilha de auditoria sobe em lotes idempotentes (F2, 1.º passo)

- **O que era:** em Base Oficial, `logAuditEvent` fazia um `insert` direto no
  Supabase com timeout de 2 s. Se a rede falhasse, o evento só ficava no log
  técnico: não havia fila, retry nem forma de saber o que faltava. O expurgo aos
  7 dias apagava também o que nunca tinha subido.
- **Agora:** todo o evento é gravado em `audit_logs` do Dexie (`_synced: 0`) e
  sobe pela fila `services/auditoriaNuvem.ts`, em lotes de 200, por `upsert` com
  `client_event_id` (= `id` local) — reenviar não duplica. A recusa da nuvem fica
  carimbada na linha (`_syncError`, `_syncAttempts`), o Gestor mostra «N por
  subir» ao lado da contagem local, e o expurgo só apaga o confirmado aos 7 dias
  (o não confirmado espera a janela de segurança de 30). A fila usa o mesmo
  portão da BASE LOCAL de F1, agora em `services/pushGate.ts`.
- **O contrato viaja com o evento:** `tenantid` é carimbado no nascimento
  (`localDb.auditLogs.add` e `sqliteService.logAuditEvent`), não no envio — um
  evento do contrato A que subisse com o contrato B activo ficava arquivado em B.
- **Os dois estados ficam:** `new_data` e `old_data` passam a ser guardados e
  enviados em colunas próprias; o `delta` antigo escolhia um dos dois e perdia o
  estado anterior (continua como espelho legado, porque a deduplicação de falhas
  lê `delta.signature`).
- **Um só ponto de escrita:** `sqliteService.gravarAuditoria` (e o construtor
  `construirAuditoria`, para os lotes) é o único sítio que escreve em
  `db.audit_logs`. Os escritores directos — `localDb.auditLogs.add` e o flush do
  buffer, `recnoGuardService`, `DatabaseLoaderService` (reconciliação e
  correcções) e `InventoryCard` — passam todos por ele, por isso o contrato, o
  `new_data` e o `_synced` deixam de depender de cada chamada se lembrar.
- **Migração necessária:** `audit_logs.client_event_id` e o índice único, em
  `docs/supabase_bootstrap.sql`. Sem ela, o envio falha com o erro carimbado na
  fila — nada é apagado nem marcado como enviado.
- Testes: `auditoriaNuvem` (portão, idempotência, recusa, contrato do
  nascimento, `old_data`/`new_data`, mapeamento), `auditLogNascimento` (carimbo,
  ponto único e os dois estados), `auditLogPontoUnico` (varredura do código:
  nenhum `db.audit_logs.put` fora do `sqliteService`) e `auditoriaRetencao`
  (janela de segurança).

### Alterado — um só caminho para o Gestor de Base

- **O que era:** o Painel Completo tinha **duas portas** para a mesma base — o
  cartão «Banco de Dados» abria o Gestor de Base e a «Gestão e Manutenção»
  anunciava «Base, sincronização, carga e limpeza» para depois exigir um segundo
  toque num botão «GESTOR DE BASE». A copy prometia contagens que só o Gestor
  mostra, e a caixa «Modalidade de Acesso» dizia «offline-first restrito (sem
  conexão com a nuvem)» logo abaixo do alternador que oferece a Base Oficial —
  dois estados contraditórios no mesmo painel.
- **Agora:** o cartão «Banco de Dados» fica como caminho do menu para o Gestor
  de Base, e na Gestão e Manutenção o botão passa a «ABRIR O GESTOR DE BASE»,
  com a nota de que é o mesmo ecrã (contadores, carga, purga e logs SRE). O
  Painel anuncia-se como «Configuração e Ações do Utilizador»; a caixa
  «Modalidade de Acesso» sai, porque o modo de base vive no alternador Local ↔
  Oficial; o nome do ficheiro vem do caminho real do banco, em vez do
  `GBR_INVENTARIO_EXPERT.DB` fixo. No Gestor, «Registros de Auditoria» passa a
  «(local)», com a nota de que é a contagem do `audit_logs` no Dexie do aparelho.
  Teste: `painelCompletoHub` (o atalho pede o mesmo `AppScreen.DATABASE_MANAGER`).

### Alterado

- **Unidade Operacional fundida no contrato de trabalho.** A rota `/unit` foi
  retirada e a tela `WorkContextSelector` (`/contexto`) passou a concentrar a
  contagem de ativos e conferidos por filial, a geocerca (âncora × posição real),
  a carga de base e a sincronização. As sete entradas que empurravam para
  `/unit` e o recuo do guarda de filial passam a apontar para o contrato; o
  auditor deixa de ter uma tela administrativa fora da trilha.
- **e2e:** `cargaMistaUnidades` confere a contagem por filial no contrato e
  `contextoUnidade` fixa a retirada de `/unit` e a escolha da unidade em
  `/contexto`.

### Corrigido — contagem e consulta mostram o ativo uma vez

- **O que era:** a mesma linha podia viver em `local_assets` com o contrato do
  perfil e com `tenantid` vazio (resíduo de carga antiga) — a chave local é
  composta `[tenantid+primarykey]`, por isso as duas cópias convivem. A consulta
  mostrava o ativo duas vezes e a soma por filial dava 25.272 onde o contrato tem
  12.636 (o SRE, escopado ao contrato, já dizia 12.636).
- **Agora:** `uniqueAssetsForDisplay` (`utils/dedupAssets.ts`) deixa uma linha
  por ativo para ecrã — colapsa a mesma `primarykey` (o mesmo registo gravado
  noutro contrato). `primarykey`s diferentes nunca são fundidas: no aparelho a
  etiqueta `008488 CCPL` tem 18 linhas e 9 chaves (`…CX01` a `…CX09`) e
  `010691` tem 9 itens de uma nota — bens distintos que partilham a etiqueta, e
  a fusão por descrição escondia-os do auditor. Prefere a cópia do contrato
  ativo e a conferida. É usada na lista da unidade (`App`), na contagem por
  filial (`getOperationalUnitsWithStats`) e em «Ativos no aparelho»; linhas de
  outro contrato não entram — nada é apagado da base. O Diagnóstico de Acesso
  passa a mostrar «Linhas lidas» (linhas a mais), «Ativos repetidos» com a
  divisão **mesma primarykey × primarykeys diferentes** e «Chaves distintas»
  com a origem de cada uma (`no contrato` · `só sem contrato` · `noutro
  contrato` · `sem chave`) — a resposta a «de onde vem o excedente acima da
  nuvem?». Os exemplos (filial · etiqueta · chaves, até 3) confirmam o caso no
  aparelho. Testes: `dedupAssets` · `countAtivosByTenant` ·
  `accessDiagnostics` · e2e do contrato fecha o aviso «Sincronização
  Concluída» quando ele aparece por cima do ecrã.
- **Contrato na linha:** `normalizeAssetContract` (`utils/schema.ts`) não lia
  a coluna canónica `tenantid` e gravava `''` por cima dela. Um ativo que só
  trazia a coluna canónica ficava sem contrato em memória — e era re-gravado
  assim. Era isso que fazia o Diagnóstico dizer «no contrato: 0 · só sem
  contrato: 12636» com a base do contrato carregada, e é o mesmo mecanismo que
  esvaziava o contrato na ficha e nos filtros por contrato. O canónico passa a
  ser o primeiro da cadeia e vence as grafias legadas (`tenantId`,
  `_tenantid`, `tenant_id`, `group_id`, `GRUPO_EMPRESARIAL`). Testes:
  `schemaTenantid`.
- **Cartão da filial:** a contagem por filial do CONTRATO DE TRABALHO somava
  linhas — 14.122 em `010101 CICOPAL GO` e 25.272 no cabeçalho, onde o contrato
  tem 12.636 ativos. `countUnitAssets` (`utils/unitAssetStats.ts`) aplica a
  mesma regra do resto do ecrã (uma linha por `primarykey`, preferindo a cópia
  do contrato ativo) antes de alimentar o contador. Testes:
  `unitAssetStats`.
- **Arranque:** a verificação da sessão na nuvem corre em paralelo com o login
  local e podia terminar depois dele. Como o utilizador em cache era lido antes
  do `getSession` (e do arranque do SQLite), a purga apagava o login
  recém-concluído e o contrato ficava sem `user` — ecrã vazio em `/contexto`.
  A purga volta a ler `app_current_user` no momento em que decide e usa
  `isLocalSessionProfile`, pelo que um login local nunca é confundido com uma
  sessão fantasma. A decisão vive em `resolveSessionAfterCloudCheck`, com teste
  de regressão (nuvem a responder sem sessão depois do login local) em
  `bootCloudCheck`.

### Adicionado — cronómetro do `saveInventory` (`perfMetrics`)

- **O que era:** o retrato da linha de base gravava `boot`, `pull.full`,
  `pull.delta` e `push`. As duas linhas de §8 do plano de sincronização —
  «`saveInventory` com 1 ativo (ms)» e «com 300 ativos (ms)» — não tinham
  instrumento, por isso não eram medíveis.
- **Agora:** cada `saveInventory` grava uma amostra `save` com o tamanho do
  inventário no `count`, inclusive quando o save falha (o registo é no
  `finally`). A mesma métrica serve os dois tamanhos: lê-se a amostra com
  `count = 1` e a com `count = 300`, sem uma métrica por tamanho de base. O
  cartão do Gestor de Base mostra o rótulo «Save».
- **Caminho quente:** o save é autosave, por isso a amostra fica em memória e
  só desce ao `localStorage` numa escrita única — no ocioso ou quando alguém lê
  o retrato. Serializar o anel de 200 amostras a cada save custava mais do que
  o próprio save.
- **Testes:** `saveInventoryPerf` (3) fixa a amostra com 300, a separação 1/300
  pelo `count` e a gravação em caso de falha; `perfMetrics` passa a exigir
  `save` no contrato das métricas.

### Alterado — A.3a.4: o terceiro espelho sai do schema (v10 → v11)

- **v10 — resgate.** O Dexie não deixa ler uma store na mesma versão que a
  apaga (dexie#275/#276), por isso a remoção ficou numa versão própria. A v10
  compara `assets` com as duas tabelas vivas por `[tenantid+primarykey]` e
  **acerta os dois espelhos**: se a chave já existe numa delas, é a linha viva
  que se copia para a que falta — a versão atrasada de `assets` não ganha, para
  os espelhos não ficarem divergentes; a linha de `assets` só entra quando a
  chave não existe em nenhuma das duas.
- **v11 — remoção.** `version(11).stores({ assets: null })` apaga a store.
- `countAssetMirrors` devolve só `local_assets`, `ativos` e o total (maior
  espelho); o painel e a linha de base do `perfMetrics` deixaram de mostrar a
  terceira coluna. `migrateLegacyTenantids`, as marcações de sincronização, a
  migração de `_conferido` e todas as transações passaram a duas tabelas.
- O resgate e a declaração das v10/v11 vivem em
  `services/migrationEspelhoAssets` e o construtor da base chama-os; o teste
  **chama a mesma função** em vez de reimplementar a migração.
- Testes: `migracaoV10` (3) prova que a linha que só existia em `assets` é
  resgatada para as duas tabelas, que a chave já viva propaga a linha viva (nos
  dois sentidos: `ativos`→`local_assets` e `local_assets`→`ativos`) e que a
  comparação é pela chave composta (mesmo `primarykey` noutro contrato não
  colide); e que a store desaparece na v11;
  `schemaBaseline` fixa a v10 com 10 tabelas; `countAssetMirrors`,
  `countAtivosByTenant`, `conferidoTipos`, `carimboNoReset`, `migracaoConferido`,
  `addressSearch`, `assetDedupService`, `assetMirrorCleanupService`,
  `freshLoadReset` e `importReconciliation` ajustados ao schema sem `assets`.

### Alterado — A.3a.3: o terceiro espelho deixa de receber escrita

- Criar, editar, carregar planilha, corrigir campo em lote, marcar campanha,
  restaurar backup e sincronizar gravam só em `ativos` + `local_assets`.
  `db.assets` saiu de 14 pontos de escrita e das transações que os envolviam
  (`localDbService`, `DatabaseLoaderService`, `sqliteService`,
  `DatabaseManagerScreen`).
- `assets` continua no schema e continua a ser **limpo** nos resets/expurgo — o
  que evita lixo do antigo espelho — mas já ninguém lhe escreve dados. A
  remoção da tabela é a A.3a.4.
- Testes: `escritasSemTerceiroEspelho` (3) prova a invariante em criar,
  `patchAsset` e retirar campanha; `carimboLimpoNoSucesso`, `pullEmLotes` e
  `importReconciliation` passaram a contar duas tabelas (e `assets` a zero).

### Corrigido — leituras por campanha rebentavam por chave sem índice

- **O que era:** `getMapData` e `removeCampaignFromAssets` filtravam com
  `db.<tabela>.where('currentCampaignId')`. Essa chave **nunca** teve índice —
  nem em `assets` (onde a query nasceu) nem em `ativos`. O Dexie responde com
  `SchemaError: KeyPath currentCampaignId ... is not indexed`, por isso o mapa
  vinha vazio e a limpeza de campanha não fazia nada.
- **Agora:** as duas leituras usam `.filter()` sobre a tabela viva. Sem
  migração de schema; o custo é uma passagem pela tabela que já era carregada.
- **Testes:** `campaignReads` (3) — um caso prova a causa (`.where()` rejeita
  com SchemaError, para travar o regresso), os outros fixam o resultado de
  `getMapData` (campanha certa, exclusão e contrato da sessão).

### Alterado — A.3a.2: listas por nome passam a duas tabelas

- `ASSET_MIRROR_TABLES` (`assetDedupService`) e `ASSET_TABLES` (`migrationV5`)
  ficaram com `local_assets` + `ativos`. `assets` só recebe escrita até à
  A.3a.3/A.3a.4: medi-lo como espelho de negócio inflacionava o relatório de
  cópias e a normalização reescrevia o terceiro espelho sem leitor.
- Consequência assumida: a limpeza de cópias exactas deixa de tocar em `assets`
  (a tabela sai inteira na A.3a.4) e as localidades derivadas passam a sair das
  duas tabelas vivas. As provas foram ajustadas para este contrato.

### Alterado — A.3a.1: leituras deixam de passar pelo terceiro espelho

- **O que era:** quatro leitores ainda iam a `assets`, o espelho canónico do
  último carregamento, que só recebe escrita nos caminhos antigos. Além de ler
  dados velhos, `assets` alimentava as contagens de unidade e as estatísticas de
  localidade.
- **Agora:** o catálogo de contratos lê `local_assets` (o contrato/filial que
  `assets` trazia é o mesmo e a varredura do catálogo já passava por lá);
  `localDb.getMapData` e `localDb.count` leem `ativos` (a tabela viva); a união
  de trabalho das estatísticas de endereço passou de três para **duas** tabelas
  (`ativos` + `local_assets`, com `assets` fora); a conferência do cartão deixa
  de replicar em `assets` — a verificação em `ativos` já cobria o caso.
- **Testes:** as provas que fixavam a união de três tabelas foram actualizadas
  para o contrato de duas (incluindo o fallback de `_is_deleted`, que agora desce
  para o baseline) — nenhuma foi removida nem enfraquecida.
- **Observação:** `getMapData` filtra por `currentCampaignId`, que não é índice
  em `ativos` nem era em `assets`; o comportamento é o mesmo de antes (corrigir a
  query não é desta etapa).

### Corrigido — recuo para o registo que falha sem envelope

- **O que era:** o recuo (`next_attempt_at`) só existia para quem já tinha
  entrada na outbox. Um registo que nunca passou por ela — importação de
  planilha, exclusão, escrita de outro caminho — falhava e voltava a ser tentado
  a cada ciclo de 60 s, sem recuo nenhum.
- **Agora:** a falha é o que cria o envelope. `marcarFalhasOutbox` recebe os
  registos (não só as chaves), cria a entrada em falta com `op` e contrato
  tirados do próprio ativo, `attempts = 1` e a primeira espera de 60 s; entradas
  existentes continuam a subir o recuo exponencial até 30 min. Sem chave ou sem
  contrato não há envelope possível e a fila legada trata o registo como antes.
- **Testes:** `syncOutbox` passa a exigir a criação da entrada; `syncPushQueue`
  fixa o caminho completo — falha sem envelope cria a entrada e o ciclo seguinte
  não volta a tentar.

## [3.1.0] — 2026-11-25

### Adicionado — fila de subida durável (`sync_outbox`, schema v9)

- **O que era:** a fila de envio era o próprio ativo com `_is_synced = 0`.
  Durável, mas sem tentativas, sem recuo e sem ordem: dois ciclos a falhar o
  mesmo registo ficavam indistinguíveis e cada volta tinha de redescobrir o
  estado na nuvem.
- **Agora:** a tabela `sync_outbox` guarda uma linha por ativo pendente, com
  `op` (UPSERT/DELETE), `attempts`, `next_attempt_at` e `last_error`. A chave
  primária é `key` (`tenantid|primarykey`), por isso reenfileirar é idempotente.
  A entrada é escrita na **mesma transacção** da gravação do ativo
  (`saveCollectedAssetAtomic`) e é removida quando a nuvem aceita o envio
  (`markRecordSynced`); as recusas incrementam tentativas com recuo de 30 s a
  30 min.
- **Compatibilidade:** a drenagem continua a ler `_is_synced = 0` — a outbox é
  o envelope, não (ainda) a fonte única; isso chega na Fase 2. Na primeira
  sincronização da sessão, a outbox é semeada com o que a fila legada já tinha,
  sem reiniciar o recuo de quem já falhou. Nenhuma tabela existente muda de
  chave ou de índices (v9 é aditiva, como a v8).
- **Recuo com efeito:** a drenagem passou a saltar os registos cujo
  `next_attempt_at` ainda não chegou (`chavesEmRecuo`). Antes o campo era escrito
  e ninguém o lia: a recusa voltava a ser tentada a cada ciclo de 60 s. Um ciclo
  em que todos os pendentes estão em recuo devolve 0 envios sem os descartar nem
  os auditar como perdidos; um registo sem entrada na outbox segue sem bloqueio
  (a fonte continua a ser `_is_synced` até à Fase 2).
- **Servidor (Fase 0):** o trigger `assets_touch_updated_at` passa a carimbar
  com `clock_timestamp()` em vez de `now()`. `now()` é o instante do BEGIN da
  transacção: duas actualizações do mesmo ativo no mesmo lote ficavam com o
  mesmo `updated_at` e a segunda era invisível ao pull delta
  (`updated_at > checkpoint`); uma transacção longa ainda podia carimbar uma
  linha "no passado" em relação a um checkpoint já distribuído. O `DEFAULT` da
  coluna segue a mesma regra.
- **Testes:** `syncOutbox` (8) fixa a normalização da chave, a idempotência, a
  semeadura a partir da fila legada, a remoção no sucesso e o recuo na falha;
  `syncPushQueue` prova que um registo em recuo **não** é tentado e que volta a
  sê-lo quando o prazo passa; `schemaBaseline` passa a travar `verno === 9` e as
  11 tabelas.

## [3.0.0] — 2026-11-21

### Notas da versão

Marco 3.0.0: o arranque deixou de ser «às vezes» e passou a ser determinístico e
coberto, e a carga de planilhas no Gestor de Base tem prova e2e ponta a ponta —
incluindo a reimportação idempotente.

- **Arranque:** sessão persistida (7 dias, sem senha nem token), Boot Loader
  ancorado no CONTRATO e `bootMount`/`bootLogin` a espiar sinais de comportamento
  em vez de texto de log.
- **Teardown:** o `EnvironmentTeardownError` do Vitest desapareceu com o
  utilitário partilhado `src/__tests__/helpers/teardownBlindado.ts`.
- **e2e:** `login`, `loginContrato`, `navigation`, `dashboard` e
  `cargaMistaUnidades` no job `E2E — Login no contrato` (33 testes); a carga
  mista prova um cartão por filial, total do cabeçalho igual às linhas e
  reimportação sem cópias.
- **Versão:** `package.json` 2.9.0 → 3.0.0; o `versionCode` do APK passa a
  30000, derivado da versão pelo workflow `Build Android APK`.

### Adicionado — carga mista no Gestor de Base confirmada no e2e

- **O que era:** nenhum teste e2e cobria a importação real de uma planilha e o
  efeito dela na Unidade Operacional.
- **Agora:** `tests/e2e/cargaMistaUnidades.spec.ts` carrega pelo
  `#file-loader` uma planilha de 6 linhas (2 filiais, com e sem `tenantid`) e
  confirma na Unidade Operacional um único cartão por filial e o total do
  cabeçalho igual ao número de linhas. Um segundo caso reimporta o mesmo
  ficheiro e prova que continuam 2 cartões e 6 ativos — sem cópias. Corre no
  job `E2E — Login no contrato`.

### Adicionado — a sessão sobrevive a fechar o separador

- **O que era:** o login vivia só em `sessionStorage`, que morre com o separador;
  fechar e reabrir a app voltava sempre ao ecrã de entrada.
- **Agora:** o perfil (email, papel, contrato, filial — **sem senha nem token**)
  fica também em `localStorage` (`gbr_persisted_session`) com prazo de **7 dias**;
  `restorePersistedSession()` repõe-no no cache do separador antes de qualquer
  decisão de arranque, com a marca `APP` para não ser tratado como fantasma da
  nuvem. Qualquer logout explícito apaga a cópia (`clearPersistedSession`), tal
  como a expiração de sessão.
- **Arranque sem login intermitente:** `verificarEstadoEBoot`, o fim do
  `initApp` na web e a purga anti-fantasma deixam de ancorar em `LOGIN`/limpar
  a sessão quando há uma sessão local reposta — era isso que fazia o ecrã de
  entrada aparecer por um instante num separador novo. `bootMount.test.tsx`
  monta o `App` com só a cópia em `localStorage` e prova que a primeira rota é
  `#/contexto`, que a sessão reposta é a mesma e que o login nunca é escrito
  nem desenhado.
- **Arranque determinístico:** o Boot Loader, quando o perfil não fixa filial e
  não há última escolha guardada, empurrava a UNIDADE OPERACIONAL sobre o
  CONTRATO — o mesmo arranque acabava em `/contexto` ou `/unit` conforme
  existisse `app_last_work_context` e filiais na base. Passa a manter/levar ao
  CONTRATO, onde a filial é escolhida. A «blindagem de base vazia» virou regra
  explícita (`shouldForceUnitOnEmptyBase`) e deixa de apanhar o passo
  biométrico do pós-login. Testes: `bootRedirects.test.ts` (regra) e
  `bootMount.test.tsx` (dono e não-dono: rota final CONTRATO, sem `/unit` nem
  login no histórico). **Login novo:** `bootLogin.test.tsx` autentica pela
  credencial local no formulário real, passa pelo passo biométrico (casco nativo
  sem autenticador → dispensa explícita) e confirma que o perfil sem filial e
  sem `app_last_work_context` aterra no CONTRATO: o histórico escrito só tem
  `BIOMETRIC_REGISTRATION` e `WORK_CONTEXT_SELECTION`, nunca `UNIT_SELECTION`.
  O teste força o modo nuvem (sem ele o boot rebaixa para INTERNAL e o Boot
  Loader não corre) e falha se **qualquer** escrita do arranque contiver
  `UNIT_SELECTION` — é a rede contra o regresso do `/unit`. A espera é a chamada
  a `resolveBootPullPlan` (a decisão da filial, espiada no teste), não o texto do
  log: reformular a mensagem do Boot Loader não quebra o teste. Como no
  `bootMount`, o `bootLogin` deixa os logs do arranque assentarem antes do
  teardown, e o job e2e guarda o Chromium do Playwright em cache por lockfile.
  A blindagem vive num só sítio — `src/__tests__/helpers/teardownBlindado.ts`
  (`silenciarConsoleDoArranque` + `assentarEAntesDoTeardown`) — para os dois
  testes não voltarem a divergir. O fixture e2e
  (`tests/e2e/fixtures.ts`) e o smoke de login exigem, depois de autenticar, a
  saída para o CONTRATO (`#/contexto`, base carregada) ou para o Gestor de Base
  (`#/db-manager`, aparelho novo com base vazia) — antes aceitavam `/menu`,
  `/dashboard` ou `/unit` como sucesso.
  `@playwright/test` entra nas devDependencies e o CI ganha o job `e2e-login`
  (Chromium + build servido por `vite preview`) que corre
  `tests/e2e/loginContrato.spec.ts`: entrada com o formulário e `admin`/`admin`
  sem aterrar na unidade (num aparelho novo a base vazia abre o Gestor de Base;
  com base carregada, o login fica no CONTRATO), com guarda explícita contra
  `/unit`. Os specs legados `login.spec.ts`, `navigation.spec.ts` e
  `dashboard.spec.ts` acompanham o estado real (selo de ambiente, versão vinda
  do `package.json`, abas do dashboard, entrada sem sessão) e correm no mesmo
  job.
- **Saídas do Login:** «Redefinir Acesso Local» e o bloqueio de perfil sem
  contrato passam pelo mesmo `resetLocalAccessStorage()`, que apaga a cópia
  persistida — antes quem saía por ali voltava a entrar sozinho. Só perfis de
  credencial local são guardados: a sessão DEMO não reabre sozinha e a da nuvem
  continua a ser mantida pelo token do Supabase (não escapa à revalidação).
- **Teste:** `src/__tests__/sessionPersistence.test.ts` cobre gravação, prazo,
  lixo, carimbo no futuro, exclusão do DEMO, reposição no `sessionStorage` e
  purga no logout; `src/__tests__/localAccessReset.test.ts` fixa a limpeza
  (preserva base/ativos, apaga sessão); `loginFluxoUnico.test.tsx` prova que o
  perfil sem contrato não deixa sessão guardada. A regra de arranque vive em
  `resolveInitialScreenHistory()` e está fixada nos mesmos testes: separador
  novo com cópia local válida → `#/contexto`, sem sessão → `#/login`.
  `src/__tests__/bootPipeline.test.ts` fixa o `InitializeBootPipeline`: sessão
  local mantida, fantasma da nuvem purgado e cópia persistida reposta antes da
  decisão de arranque. `loginFluxoUnico.test.tsx` exercita o botão «Redefinir
  Acesso» de ponta a ponta: `signOut`, cópia apagada, separador limpo e
  base/ativos preservados.

### Corrigido — recarregar já não devolve ao login

- **O que era:** `InitializeBootPipeline()` removia `app_current_user` e
  `tenantid` do `sessionStorage` em todos os arranques; a validação anti-fantasma
  seguinte aceitava só `MASTER`/`ADMIN_EMAIL`, pelo que um perfil `ADMIN` num
  aparelho sem base local via a sessão apagada e o F5 caía em `#/login`. O efeito
  de persistência ainda gravava `null` por cima da chave, impedindo qualquer
  recuperação.
- **Agora:** a sessão local válida sobrevive ao arranque (a purga só acontece
  quando o perfil guardado não é local), a lista de perfis é a mesma de todos os
  outros pontos do boot (DEMO/ADMIN/MASTER/MOBILE_SINGLE ou `ADMIN_EMAIL`) e a
  gravação em `sessionStorage` só ocorre com utilizador. O DIAGNÓSTICO DE ACESSO
  passa a dizer «sessão persistida» quando o login veio de credencial local.
- **Prova:** no preview, login → CONTRATO (`#/contexto`) → recarregar → continua
  em `#/contexto` com o mesmo utilizador (`gbr_session_origin = APP`).

### Corrigido — os scripts de campanhas e de políticas deixam de abortar a migração

- **O que era:** `docs/supabase_campanhas_fase1.sql` abortava ao criar o índice
  único `campaigns_uma_aberta_por_filial` (23505) quando já havia duas campanhas
  abertas na mesma filial — era o caso de `010101 CICOPAL GO`. E o PASSO 5-B de
  `docs/supabase_tenantid_migration.sql` abortava a migração inteira (42703) se
  `public._gbr_policies_backup` já existisse noutro formato, sem a coluna `ddl`:
  `CREATE TABLE IF NOT EXISTS` não altera tabelas existentes e o `INSERT` do
  backup falhava **dentro** do `EXCEPTION` que devia tolerar o erro.
- **Agora:** antes do índice, as campanhas abertas duplicadas são **arquivadas**
  (`status = 'ARCHIVED'`), nunca apagadas — a linha inteira fica em
  `public._gbr_campaigns_arquivadas_fase1` e sobrevive a campanha ATIVA mais
  recente (empate resolvido por `start_date`, `created_at` e `id`). No PASSO 5-B
  as colunas do backup são garantidas com `ADD COLUMN IF NOT EXISTS` e a gravação
  do backup passou a ter tratamento de erro próprio: uma política que não possa
  ser recriada (ou cujo backup não possa ser gravado) fica registada, sem
  derrubar a migração.

### Adicionado — diagnóstico de acesso no PAINEL COMPLETO

- **O ecrã que responde ao telefone:** «DIAGNÓSTICO DE ACESSO» no PAINEL
  COMPLETO (ADMIN/MASTER) mostra contrato, modo, contextos, **origem das
  filiais** (base local → lista da nuvem → cache → nenhuma), âncoras GPS,
  campanhas ativas, ativos no aparelho, hora da última consulta de nomes, último
  erro de rede e **se a sessão está persistida** — o achado da prova de arranque
  a frio (sem chave `sb-*`, recarregar cai no login). Um botão copia o bloco
  inteiro para pedir suporte.
- **Teste:** `src/__tests__/accessDiagnostics.test.ts` fixa as regras de origem
  e a leitura da chave de sessão; `src/__tests__/accessDiagnosticPanel.test.tsx`
  cobre o ecrã nos dois modos (SUPABASE com lista da nuvem, INTERNAL com base
  local) e a cópia do texto.

### Alterado — a lista de filiais vem numa consulta e fica em cache por escopo

- **13 pedidos de 1000 linhas para 5 nomes:** a tela de seleção só precisa dos
  nomes das filiais, mas `fetchUnitNamesFromCloud` paginava
  `assets?select=filial` até 13 vezes num contrato de 12.636 ativos. Em campo é
  espera e dados móveis por 5 linhas.
- **Agora é UM pedido:** a função `public.unit_names(p_tenantid)` (em
  `docs/supabase_bootstrap.sql`) faz o `DISTINCT` no servidor e devolve só os
  nomes do contrato; sem contrato devolve vazio, portanto o muro SRE passa a
  estar também do lado do servidor. A paginação antiga fica como reserva para as
  bases onde a função ainda não foi criada (`PGRST202`) — nenhuma instalação
  fica sem filiais por a migração não estar aplicada.
- **Cache por escopo:** a lista passou a ser guardada em `localStorage` com a
  chave de `unitListScope(email, tenantid)` e prazo de **1 dia**. Serve quando a
  rede falha (ou o pedido volta sem nomes), é descartada quando o escopo é outro
  (outra conta/contrato no mesmo aparelho) e é apagada no logout.
- **Prova:** `src/__tests__/fetchUnitNamesFromCloud.test.ts` cobre o caminho de
  uma consulta (sem paginar), a reserva com `PGRST202` e a função que responde
  vazio (não volta a paginar); `src/__tests__/unitNamesCache.test.ts` cobre
  escopo, prazo de 1 dia, lixo e carimbo no futuro.

### Corrigido — o arranque não desce o contrato inteiro sem filial

- **O que era:** o pull automático da nuvem (login, sessão restaurada,
  actualização pendente, troca de modo) corria com a filial indefinida quando o
  perfil não fixa filial e não há última escolha válida — o `fetchFullInventory`
  sem filtro baixava o **contrato inteiro** (12.636 ativos do CICOPAL, medido no
  preview em 5,3 s) e gravava-o na base local. Além do tráfego, isso deixava a
  base local a «ter» o contrato — o estado que fechava o CONTRATO DE TRABALHO —
  e congelava o ecrã enquanto aplicava as linhas.
- **Agora:** `resolveSyncPullScope` decide o pull automático. Sem filial pedida,
  sem filial no perfil e sem última escolha do **mesmo** contrato, o plano é
  `blocked`: nenhum pedido é feito e a filial é escolhida no CONTRATO DE
  TRABALHO antes de qualquer download. `full` fica reservado à acção explícita
  do dono («Sincronizar tudo») e a pulls sem contrato resolvido (dono global),
  onde não há filial a exigir.
- **Teste:** `src/__tests__/unitContextUtils.test.ts` cobre as seis decisões
  (blocked sem filial, filial pedida, filial do perfil, última escolha do mesmo
  contrato, última escolha de outro contrato, «Sincronizar tudo» e sem
  contrato/vários contratos).

### Corrigido — o contrato volta a ver as filiais que estão na nuvem

- **O que era:** a lista de filiais do contrato só era pedida à nuvem quando o
  aparelho não tinha base local **nenhuma**. Uma base de outro contrato (ex.:
  demonstração) ou ativos do próprio contrato sem `filial` contavam como «já
  tenho as filiais» — a nuvem nunca era consultada e o **CONTRATO DE TRABALHO**
  abria com «Nenhuma filial na base deste contrato», deixando o INVENTARIADOR
  inacessível (o «Acessar o Módulo» exige filial).
- **Agora:** a consulta só é dispensada quando a base local responde de facto
  pelas filiais **deste** contrato — `hasFiliaisLocaisDoContrato` (filiais em
  memória do contrato ou unidades lidas do SQL, ambas com filial preenchida).
  Caso contrário a lista vem da nuvem, só nomes (sem baixar ativos).
- **O que era (2):** quando a lista ficava vazia, o aviso dizia «a unidade
  será escolhida na próxima tela» mas o **Acessar o Módulo** ficava desativado
  (o INVENTARIADOR exige filial): sem saída para o INVENTARIADOR, nem para
  cadastrar a filial.
- **Agora (2):** com a lista vazia, quem administra a base segue para a
  **Unidade Operacional** (é lá que a filial é escolhida/cadastrada) e o aviso
  diz isso. O auditor continua bloqueado, com a instrução de pedir ao
  administrador (evita o vaivém `/unit` ↔ `/contexto`).
- **Teste:** `src/__tests__/unitContextUtils.test.ts` cobre base de outro
  contrato, ativos sem filial, SQL por contrato e contrato não resolvido;
  `src/__tests__/accessFlowStandardization.test.ts` cobre a exceção do
  administrador e a manutenção do bloqueio do auditor.

### Corrigido — o «Voltar» do Gestor de Base devolve ao PAINEL COMPLETO

- **O que era:** a rota `/db-manager` tinha o regresso fixo em
  `pushScreen(AppScreen.MODULE_SELECTION)`. Sair do Gestor de Base caía sempre
  na tela legada `/modules` («Selecione o módulo de trabalho»), fora da trilha
  única (contrato → hub → PAINEL COMPLETO) e em círculo para o auditor, cuja
  `UNIT_SELECTION` é rebatida para o contrato pelo RouteGuard.
- **Agora:** `onBack={popScreen}` recua um passo no histórico e devolve o hub
  (`MAIN_MENU`), que reabre o PAINEL COMPLETO de onde se veio; sem histórico,
  ancora no CONTRATO DE TRABALHO.
- **Uma regra só:** `historicoAposVoltar` e `VOLTAR_SEM_HISTORICO`
  (`src/utils/routingUtils.ts`) são a única fonte do regresso — o `popScreen`,
  o `DatabaseManagerScreen` e o `LoadHistoryScreen` deixam de apontar para
  `MODULE_SELECTION`. `/modules` deixa de ser destino de «Voltar».
- **Contrato fixado** em `src/__tests__/voltarGestorBase.test.ts`.

### Adicionado — a recusa da nuvem aparece na ficha do ativo

- **Selo de falha e reenvio no detalhe:** `AssetListItem` e o botão global já
  mostravam a recusa, mas na ficha o operador via só «PENDENTE NUVEM» — sem
  motivo, sem idade e sem forma de tentar outra vez. `AssetDetail` passa a
  mostrar um aviso vermelho com o motivo e a idade (`syncFailureInfo`) e um
  botão **Tentar agora** que chama `processDataSyncQueue` (o mesmo caminho do
  botão global e do ciclo de fundo) e relê a tabela viva `ativos` para o selo
  desaparecer quando o ativo sobe. `_is_synced = 1` cala o aviso mesmo com
  carimbo antigo, como no cartão.

### Corrigido — a guarda de perímetro usa o núcleo único e não tranca por uma leitura má

- **Distância própria fora do núcleo:** o `GPSComplianceGuard` calculava a
  distância com `@turf/turf`, fora do núcleo de GPS que o resto do app já usa —
  outra regra de validação, outro cálculo, outro comportamento. Passa a decidir
  por `DecisorDePerimetro` (`utils/gpsPerimeter`), que assenta no núcleo único e
  leva a precisão da leitura para a decisão.
- **Histerese contra o jitter:** uma leitura isolada fora do raio já não tranca o
  auditor (o sensor de celular oscila dezenas de metros parado). A primeira
  leitura fora mantém o acesso e só a confirmação bloqueia; leitura repetida ou
  salto fisicamente impossível são descartados, e o monitor contínuo passa a
  aceitar posição em cache até 60 s (antes 30 s).
- **Custo:** o auditor que está mesmo fora do perímetro mantém o acesso durante
  a confirmação — uma folga deliberada, não um bypass: o admin continua a ser o
  único perfil que entra sem perímetro.

### Alterado — dois auditores no mesmo ativo deixam de se atropelar

- **O que era:** o merge do pull era last-write-wins por APARELHO. Com a cópia
  local pendente (`_is_synced = 0`), o `{ ...nuvem, ...local }` entrava inteiro —
  a conferência feita por outro auditor, já na nuvem, desaparecia por causa de
  uma edição noutro campo (endereço, descrição, foto). O conflito era detectado
  e registado na trilha, mas a decisão do outro lado perdia-se.
- **O que passa a ser:** o merge decide por grupos, com os carimbos que já
  existem (`_dataLeitura`, `_gps_at`, `_lastUpdated`, `updated_at`). A
  **conferência** e o **ponto de GPS** ficam com a leitura mais recente — venha
  ela da nuvem ou deste aparelho; o **resto dos campos** continua a ser deste
  aparelho, porque é trabalho de campo por subir. Resultado: um auditor fica com
  a conferência e o outro mantém o endereço que editou.
- **Regra única:** `src/utils/mergePorCampo.ts`, usada pelo pull completo
  (`App`) e pelo delta (`mergeDeltaPull`). A exclusão da nuvem continua a vencer
  o registo inteiro.
- **O `status` só volta quando é prova de conferência:** a conferência da nuvem
  a vencer repunha o `status` inteiro, e um estado pendente deste aparelho
  («EM MANUTENÇÃO», «BAIXADO»…) era apagado sem nunca ter subido. O campo
  continua no grupo da conferência **apenas** quando o valor da nuvem é o
  marcador (`statusDeConferencia`, o mesmo predicado do desmarcar); um estado
  de outro teor fica com quem o alterou. Se o aparelho não tiver o campo, o da
  nuvem mantém-se.
- **Limite (declarado):** fora da conferência e do GPS o modelo não tem carimbo
  por campo, por isso continua a vencer este aparelho — mas o conflito deixa de
  ser silencioso: a trilha grava `SYNC_CONFLICT` com os grupos em disputa.
- **Sem schema novo:** nenhuma coluna, nenhuma migração, nenhum SQL para correr.

## [2.9.0] — 2026-11-20

### Alterado — o pull grava a base uma vez, não três

- **Três passagens para o mesmo pull:** o download gravava as 12.636 linhas nos
  três espelhos, e o `saveInventory` que vinha a seguir reescrevia a base inteira
  (`bulkInsertAssets`) e ainda o espelho do `localDb` — três passagens completas
  para corrigir as poucas linhas em que a decisão local vence a da nuvem. O
  delta, que é o pull do dia a dia, tinha o mesmo custo: algumas dezenas de
  linhas novas reescreviam a base inteira.
- **Ganho ESTRUTURAL (a única alegação deste item):** por pull completo, as
  linhas escritas nos espelhos passam de **37.908** (3 × 12.636) para **12.656**
  (uma passagem do download + o subconjunto com decisão local). O delta passa de
  37.908 para o número de linhas com decisão local — no teste, **2 de 200**.
- **Sem alegação de tempo:** não há medição de tempo no aparelho. O harness de
  testes usa `fake-indexeddb`, que mede a semântica do código e não o custo do
  IndexedDB real (lá, actualizar uma linha existente é muito mais caro do que
  inserir uma nova), pelo que nenhum número de milissegundos deste trabalho
  sustenta ganho de tempo. Só medições no APK, comparando o mesmo pull antes e
  depois, poderiam sustentá-lo.
- **O quê:** o pull passa `skipSqlAssetsInsert` ao `saveInventory` (grava
  configuração e cache, não os ativos) e persiste à parte, numa única transação
  (`sqliteService.persistAssetsBatch`), só as linhas cuja decisão local foi
  reposta — GPS mais recente (`preservarGpsMaisRecente`), pendência preservada e
  edição por enviar. O merge do delta passou a ser uma regra própria
  (`utils/mergeDeltaPull`), que devolve o estado e a lista `decisaoLocal`. O
  mapeamento nuvem→espelhos vive num método só (`mapAssetToDexie`), usado pelo
  lote e pelo subconjunto, para os dois não divergirem; o subconjunto respeita o
  `_is_synced` de cada linha.
- **Prova:** `src/__tests__/pullEmLotes.test.ts` (7 casos) fixa o subconjunto
  (GPS nas duas grafias e proveniência nos três espelhos, `_is_synced` das
  pendentes preservado, linhas fora do subconjunto intactas, guarda entre
  contratos, um único mapeamento) e `src/__tests__/deltaPullDecisaoLocal.test.ts`
  (7 casos) fixa o caminho do delta: 200 linhas na base, delta de 2 linhas com
  decisão local (GPS do aparelho e edição por enviar) → exactamente 2 voltam ao
  disco, as outras 198 ficam como o download as gravou, a base continua com 200
  e a pendência continua pendente.


### Alterado — as falhas de envio têm teto: uma linha por dia

- **A trilha preservada crescia sem limite:** as recusas de envio
  (`SYNC_RECORD_FAIL`/`SYNC_RECORD_EXCEPTION`) ficaram fora do expurgo de 7 dias
  — são a prova de por que um ativo não subiu —, mas a janela de deduplicação era
  de 10 min: um ativo preso com o mesmo erro escrevia 144 linhas por dia, para
  sempre, na trilha que existe para diagnosticar exactamente isso.
- **A janela passa a ser o DIA (UTC):** `inicioDoDiaDaFalha` define o corte e a
  mesma assinatura (`primarykey|erro estável`) escreve no máximo uma linha por
  dia. O dia seguinte ganha a sua — a falha continua visível enquanto durar.
- **O histórico já gravado é colapsado:** `idsDeFalhasRepetidas` deixa a linha
  mais recente de cada (ação + registo + dia + assinatura) e o expurgo apaga as
  restantes; o resultado do expurgo passa a reportar `consolidadas`. Linhas de
  falha sem assinatura legível não são tocadas (não há como provar que são a
  mesma). O resto da trilha continua a expirar aos 7 dias.
- **Assinatura mais estável:** ids de pedido («req 42», «pedido #7») passam a
  marcador `<pedido>` — a regra dos números de 6+ dígitos não os apanhava e cada
  ciclo reabria a janela.
- **Prova:** `src/__tests__/tetoLinhasFalha.test.ts` (9 casos) — 100 ciclos
  espalhados pelas 24 h do mesmo dia → 1 linha (com a janela de 10 min: 100),
  dia seguinte → 2, erros diferentes no mesmo dia → linhas diferentes, expurgo a
  colapsar 30 linhas do mesmo dia em 1 e a preservar dias distintos, e a regra
  pura (`inicioDoDiaDaFalha`, `chaveDeFalhaNoDia`, `idsDeFalhasRepetidas`). Os
  testes de `syncRecordFailAudit` passam a fixar o contrato do dia (11 min
  depois ainda é a mesma linha; ontem permite a de hoje).

### Corrigido — os últimos ecrãs que decidiam a conferência sozinhos

- **A ficha PDF não mostrava a conferência:** imprimia `_conferidoEm`/
  `_conferidoPor`, campos que não existem no registo — TODOS os cartões saíam
  «DATA AUDITORIA: PENDENTE» e «AUDITOR: NÃO IDENTIFICADO», mesmo os conferidos
  no campo. Passa a usar `auditoriaDoAtivo` (`isConferido` + `_dataLeitura` +
  `_auditor`), com a data legível no formato que o documento já usava.
- **A ficha de impressão dava conformidade por omissão:** sem a coluna de
  auditoria dizia «Conferência física realizada sem ressalvas» também para itens
  por conferir; agora só o diz quando `isConferido` confirma, e os restantes
  ficam «Aguardando conferência física».
- **A coluna de auditoria deixou de ser sobrescrita pela etiqueta:** o fluxo de
  aplicar localização gravava `AUDITOR_STATUS_CONFERENCIA = TAG_INVENTARIO`
  («ETIQUETAR», «ADOTADO»…), apagando a prova `'SIM'` de quem já tinha
  conferido o ativo; agora grava `'SIM'`/`'NAO'` pela regra única.
- **Prova:** `src/__tests__/touchpointsConferido.test.ts` (8 casos) cobre a
  leitura única (`auditoriaDoAtivo`) e o contrato dos ficheiros — nenhum volta a
  ler `_conferidoEm`/`_conferidoPor`, a dar conformidade por omissão, a
  sobrescrever a coluna com a etiqueta ou a decidir pela marca crua
  (`!x._conferido`, `_conferido === 1`, `Number(_conferido)`,
  `AUDITOR_STATUS_CONFERENCIA === 'SIM'`) fora de `utils/conferencia.ts`.
  Com as duas regressões repostas, 2 casos falham.
- **Justificados (escritas, não decisões):** `_conferido: false` ao desmembrar
  (`App.tsx`, filho nasce por conferir), `assetRepository.updateStatus` e os
  seeds de `sqliteService`/`stressTestService` (recebem o booleano já decidido),
  `dedupAssets`/`UnitSelector` (gravam `isConferido`), `syncService` e
  `supabaseService` (leem pela regra), `localDbService.mergeCopiasDeAtivo`
  (merge monotónico por `isConferido`) e os filtros de chaves de `AuditLogs` e
  `constants/schema`.

### Alterado — as grafias antigas de «conferido» ficam numa só

- **A marca continuava gravada como veio:** `isConferido` já aceitava tudo —
  `true`/`false` (Dexie e app), `1`/`0` (carga e espelho SQLite), `'true'`/`'1'`
  (JSON importado) e a coluna de auditoria `AUDITOR_STATUS_CONFERENCIA = 'SIM'`
  —, mas cada gravado guardava a sua grafia. Como a decisão por tempo do pull só
  compara datas quando elas existem, a conferência antiga sem data nunca podia
  valer contra a nuvem.
- **Migração única e idempotente:** `utils/conferencia.normalizarMarcaConferencia`
  decide o patch (é regra, não varredura) e
  `sqliteService.migrateLegacyConferencia()` aplica-o aos três espelhos numa só
  transação, uma vez por base (marcador `f0_conferido_canonical_v1` em
  `SYSTEM_CONTEXT`), no arranque logo a seguir à migração de casing. A marca
  passa a `1` (número) e a data da leitura é preenchida a partir de
  `_dataLeitura` ou, na falta dela, de `_lastUpdated`.
- **Não inventa datas nem desmarca ninguém:** a conferência sem data fica só com
  a flag normalizada — uma data fabricada («agora») faria a decisão local ganhar
  o merge por fabrico. Registos sem prova de conferência ficam como estão.
- **Relatório:** o arranque registra quantos registos (por `primarykey`) e
  quantas linhas dos espelhos foram convertidos.
- **Prova:** `src/__tests__/migracaoConferido.test.ts` (9 casos) — as quatro
  grafias e a coluna de auditoria na mesma base, data preservada/derivada/sem
  invenção, desmarcado intacto nos três espelhos, segunda passagem com
  `jaCorrida: true` e o mesmo estado, e o contrato de que o boot chama a
  passagem. Com a regra a deixar passar todos os registos, 5 casos falham.

### Corrigido — nenhum ponto falso no mapa de calor

- **O mapa aceitava mais do que leitura de campo:** o filtro era só
  `isValidCoordinate` (que já barra `(0,0)` e coordenadas fora de faixa), mas
  deixava entrar coordenadas de contingência (`_gps_source = 'synthetic'`:
  âncora/admin/sandbox) e ruído de rede com precisão acima de 150 m
  (`GPS_ACCURACY.DISCARD`). E lia apenas `latitude`/`longitude`: um ativo com o
  ponto só na grafia da nuvem (`gps_lat`/`gps_lng`) desaparecia do mapa.
- **Uma regra para todo o ecrã:** `utils/assetGps.mapPointOf`/`hasMapCoords`
  (coordenada válida + proveniência ≠ `synthetic` + precisão ≤ 150 m) passam a
  servir os pontos, o grid, a área/perímetro, o centro inicial e o contador —
  sempre pela ponte das duas grafias.
- **A proveniência passou a ser gravada:** a conferência escrevia a coordenada
  sem `_gps_accuracy`/`_gps_source`/`_gps_at` e o mapeamento do lote deixava
  cair esses campos. O sensor declara agora `_gps_source = 'sensor'` com a
  precisão e o instante da leitura, e o lote preserva os três — sem isso a regra
  do mapa não tinha o que consultar (e o item 9 fica com a data do GPS exata).
- **Prova:** `src/__tests__/mapaSemPontoFalso.test.ts` (10 casos): sem GPS,
  `(0,0)`, fora de faixa, sintético (e `' Synthetic '`), precisão 151/200/150,
  legado sem proveniência, `gps_lat`/`gps_lng`, prioridade de `latitude`, a
  proveniência a sobreviver ao lote e o contrato de que o ecrã não tem segunda
  regra.
- **Limite:** registo legado sem `_gps_source` continua a entrar no mapa se o
  par for válido (não há como provar a origem retroativamente).

### Corrigido — o pull não regride a coordenada lida no aparelho

- **O ponto voltava atrás:** o merge do pull remontava a linha do ativo a partir
  da nuvem e a coordenada descia com ela. Um aparelho que já tinha lido o GPS no
  campo recebia de volta o ponto antigo que a nuvem ainda guardava (envio
  anterior, outro aparelho) e o mapa de calor voltava ao lugar errado sem
  ninguém tocar no ativo. O delta tinha o mesmo comportamento.
- **Decidido por tempo, nas duas grafias:** `utils/assetGps.preservarGpsMaisRecente`
  repõe `latitude`/`longitude` e `gps_lat`/`gps_lng` quando a leitura local é
  mais recente — pela data do próprio GPS (`_gps_at`) e, na falta dela, pela
  leitura/toque (`_dataLeitura`, `_lastUpdated`) contra a da nuvem (`updated_at`
  incluído). A nuvem mais recente continua a ganhar e, sem data de nenhum dos
  lados, fica a linha da nuvem. A nuvem sem ponto não apaga a leitura local.
- **Prova:** `src/__tests__/pullGpsMaisRecente.test.ts` (9 casos): local mais
  nova vence, nuvem mais nova vence, nuvem sem ponto, local sem ponto válido,
  ausência de datas, prioridade do `_gps_at` e o `updated_at` da nuvem — mais o
  contrato de que o merge completo e o delta usam a mesma regra.
- **Limite:** a decisão é do registo, não de um ponto por campo — se a nuvem
  tiver uma leitura de GPS legítima mais antiga e o aparelho uma mais nova, fica a
  do aparelho (que sobe no envio seguinte).

### Corrigido — o carimbo da falha sai sempre que o registo fica sincronizado

- **Três escritas de sucesso, uma só limpeza:** `markAssetsSynced` (envio em
  massa e fila de fundo) apagava `_syncFailAt`/`_syncFailReason`; a fila de
  **fotos** marcava `_is_synced = 1` com um `.modify` próprio e deixava o
  carimbo agarrado, e o **estado visual** do App copiava o carimbo para a linha
  «sincronizada». A limpeza passa a ser uma regra só
  (`utils/syncFalha.marcarSincronizadoLocal`), e a foto usa o mesmo ponto
  (`markAssetsSynced` com `_photoUrl`).
- **A recusa atrasada já não carimba um registo igual à nuvem:** a tentativa que
  falhou podia chegar depois de outro caminho (envio em massa, fila, foto,
  pull) já ter marcado o ativo como sincronizado — ficava `_is_synced = 1` com
  selo vermelho, e a recusa antiga reaparecia no toque seguinte. `markAssetsFailed`
  passa a ignorar registos já sincronizados; a falha legítima de um pendente
  continua a ser carimbada.
- **Prova:** `src/__tests__/carimboLimpoNoSucesso.test.ts` (7 casos) cobre o
  patch puro, a fila/envio em massa, a foto, o pull com `markSynced`, a corrida
  nas duas ordens (falha→sucesso e sucesso→falha atrasada) e a contra-prova de
  que uma recusa real não é silenciada.
- **Limite:** bases antigas podem ainda guardar carimbos legados em linhas já
  sincronizadas; o selo continua a escondê-los (`syncFailureInfo`) e a próxima
  escrita de sucesso limpa-os.

### Corrigido — o carimbo da falha morre com o registo na limpeza local

- **O selo contava ativos que já não existiam:** a «Limpeza Total» de uma unidade
  (`MainMenu`/`DataManagementPanel`) e a limpeza em massa filtravam o cache do
  localforage e o estado React, mas deixavam as linhas da unidade nos três
  espelhos Dexie (`local_assets`/`ativos`/`assets`) — com o `_syncFailAt`
  agarrado a elas. O contador do selo somava falhas órfãs e a fila de fundo
  voltava a tentar enviá-las a cada ciclo.
- **A cópia de contingência ressuscitava o ativo:** o rascunho
  `gbr_backup_<tenant>_<filial>` em `localStorage` guarda o ativo inteiro
  (carimbo incluído) e o «Recovery Boot» do Inventory relê-o no arranque. Os
  dois caminhos de limpeza passam a descartar o rascunho e a escrita coalescida
  dos ativos removidos; a limpeza total descarta todos os `gbr_backup_*`.
- **Remoção por unidade, numa transação:** `sqliteService.deleteLocalAssetsByUnits`
  apaga dos três espelhos as linhas das unidades limpas. O carimbo sai com a
  linha e nada mais é tocado: os ativos das outras unidades mantêm
  `_syncFailAt`, `_syncFailReason` e a pendência («morre com o registo, nunca
  antes»).
- **Prova:** `src/__tests__/carimboNoReset.test.ts` (5 casos), um por caminho —
  limpeza total, limpeza de uma unidade, limpeza em massa, «Desvincular e
  Reiniciar» (`hardResetDatabase`) e higienização do Gestor de Base — e em cada
  um o ativo mantido fica com o carimbo intacto.
- **Limite:** a limpeza continua a ser por unidade e sem escopo por `tenantid`
  (a mesma regra que o localforage e o estado já aplicam).

### Adicionado — filtro e exportação das falhas de envio na Auditoria

- **A causa de um «Pendente Nuvem» deixa de se procurar à mão:** a aba «Ativos»
  da Trilha de Auditoria ganha o botão **Só falhas**, que isola as recusas de
  envio (`SYNC_RECORD_FAIL`/`SYNC_RECORD_EXCEPTION`) pela mesma regra
  (`ehFalhaDeEnvio`) dos selos e da retenção de 7 dias. O filtro aplica-se por
  cima da busca, da ação e das datas — dá para cruzar «as falhas de ontem».
- **Levar a lista para fora:** com o filtro ligado, dois botões exportam as
  falhas em **CSV** e **JSON**, com as três colunas que interessam:
  `primarykey` (a chave de origem, ou `record_id` na trilha antiga), `motivo`
  (o detalhe da recusa) e `data`. O ficheiro acompanha o que está no ecrã e um
  motivo com aspas não parte o CSV.
- **Prova:** `src/__tests__/auditoriaFiltroFalhas.test.ts` (11 casos) cobre o
  filtro (uma falha, uma conferência), o cabeçalho e as linhas do CSV, o escape
  de aspas, os campos em falta, as duas ações de recusa e o JSON — mais o
  contrato do ecrã (sem uma segunda regra de falha dentro do componente).

### Corrigido — o pull não desfaz a conferência feita no aparelho

- **A marca voltava a «por conferir»:** o merge do pull remontava a linha da
  nuvem e deixava cair a decisão de conferência da cópia local. Bastava a linha
  da nuvem chegar com `_conferido = 0` (ou sem `data_leitura`) para o item
  conferido no campo voltar a «por conferir» no ciclo seguinte, sem que o
  operador tivesse tocado nele outra vez.
- **Decidida por tempo, nunca por omissão:** `preservarPendenciaLocal` passa a
  receber também a linha da nuvem e, quando a decisão local é mais recente que a
  dela, repõe os campos da decisão (`_conferido`, `_auditor`, `_dataLeitura`,
  `AUDITOR_STATUS_CONFERENCIA` e o `status` textual). A comparação é
  `_dataLeitura` com `_dataLeitura` — e o toque (`_lastUpdated`) quando a
  decisão foi desmarcar, que não tem data de leitura própria. Uma conferência
  da nuvem posterior ao toque continua a ganhar, e sem data de nenhum dos lados
  a linha da nuvem fica.
- **Prova:** `src/__tests__/pullPreservaConferencia.test.ts` (9 casos) cobre o
  desmarcar que não regressa, a marca com autor e data, a nuvem posterior, a
  igualdade de conferência com leitura mais recente e a ausência de datas.
- **Limite:** um aparelho com edição pendente e uma conferência alheia mais
  antiga continua a fazer valer a sua decisão; o conflito por campo (item 24b da
  agenda) é o que resolve dois auditores no mesmo ativo.

### Alterado — Dados e Auditoria passam a viver no Painel Completo

- **Um único hub de governança:** a tool grid da Unidade Operacional fica com
  **AJUSTES · PAINEL**; os botões DADOS e AUDITORIA saíram dela. O **Painel
  Completo** (`isAdminMenuOpen`) passa a abrir os painéis **Gestão e Manutenção**
  (`isDataMenuOpen`, ADMIN) e **Auditoria e Concordância** (`isAuditMenuOpen`,
  TRILHA B) como camadas sobre o próprio hub — o «Voltar» de cada um devolve ao
  Painel Completo, sem passar pelo menu.
- **Acesso ao auditor preservado:** o botão PAINEL aparece para ADMIN **e** AUDITOR,
  para que a TRILHA B continue a chegar à trilha de auditoria; os itens
  administrativos do hub ficam ocultos para quem não é administrador.
- **Contrato fixado por teste:** `src/__tests__/painelCompletoHub.test.tsx` monta a
  grelha (ADMIN e AUDITOR) e prova que só existem AJUSTES e PAINEL, e que o Painel
  Completo abre Gestão e Manutenção e Auditoria (com o «Voltar» a devolver ao hub).
- **Resíduos removidos:** `NavigationParams.openPanel` e o estado do App ficam
  restritos a `'PREFERENCES' | 'ADMIN'`, e saem do efeito do `MainMenu` os ramos
  inalcançáveis de `initialOpenPanel` para `'DATA'` e `'AUDIT'`. O caminho
  `initialDataMenuOpen` (admin com base vazia → Gestão e Manutenção) mantém-se.

### Corrigido — uma só linha de auditoria por alteração em `public.assets`

- **Duas linhas por `UPDATE`:** dois triggers na mesma tabela chamavam duas
  funções de auditoria (`log_asset_changes` e `trg_audit_asset_changes`), e cada
  alteração entrava duas vezes em `public.asset_logs` — a Auditoria mostrava
  pares idênticos e qualquer contagem pela trilha valia o dobro.
- **Um só escritor no servidor:** `scripts/assets-auditoria-unica.sql` remove os
  triggers que chamam `log_asset_changes` (por função, porque o nome do trigger
  varia por base) e deixa a função como pass-through (`RETURN OLD` no `DELETE`).
  Fica apenas `trg_audit_asset_changes`, que cobre CREATE/UPDATE/DELETE, usa o
  e-mail do JWT e grava `timestamp`. A trilha de campo escrita pelo app
  (`auditService.logAssetChange`) não é tocada.
- **Sem risco de ficar sem trilha:** se houver duplicados para remover e a função
  canónica não existir, o script aborta em vez de apagar o segundo escritor.
  Idempotente, com bloco de verificação por `BEGIN … ROLLBACK` no cabeçalho.
- **Prova:** `src/__tests__/assetsAuditoriaUnica.test.ts` fixa o contrato (um só
  escritor, remoção por função, trava antes do `DROP`, pass-through sem
  `asset_logs`) e garante que o bootstrap não reintroduz o segundo trigger.

### Corrigido — o índice da chave de origem tem de servir de alvo ao `ON CONFLICT`

- **Uma base criada pelo bootstrap recusava o upsert da fila:** o
  `docs/supabase_bootstrap.sql` criava `assets_tenant_primarykey_key` como
  índice único **parcial** (`… WHERE primarykey IS NOT NULL`). O PostgREST não
  envia o predicado, o PostgreSQL não consegue inferir o índice para o
  `ON CONFLICT (tenantid, primarykey)` e a escrita vira `INSERT`, que colide no
  próprio índice — `23505` em vez de actualização, e o cartão do ativo preso em
  «FALHA DE ENVIO» a cada ciclo de sincronização. O predicado era redundante:
  num índice único, NULLs são distintos por omissão. O índice passa a ser total
  no bootstrap e há `scripts/fix-assets-conflict-index.sql` para alinhar bases
  antigas; `src/__tests__/assetsConflictIndex.test.ts` fixa as colunas do índice
  iguais a `ASSETS_CONFLICT_TARGET` e proíbe o predicado de voltar.

### Corrigido — a auditoria de ativos deixava de abortar as escritas

- **`log_asset_changes()` lia a coluna legada:** a função, criada na base fora
  do repositório, gravava `NEW._auditor` em `asset_logs.user_email`. Nas linhas
  com `_auditor` nulo o `INSERT` recebia NULL e — como `user_email` é
  `NOT NULL` — a transacção inteira abortava com `23502`. Toda a `UPDATE`
  desses ativos falhava na nuvem, incluindo o restauro pelo app, que passava na
  trava `assets_bloquear_ressurreicao` e estourava a seguir na auditoria.
  O e-mail passa a vir de `coalesce(auditor, _auditor, JWT, 'system@gbr.com.br')`,
  lido por `to_jsonb(NEW)` para não depender de a coluna existir em todas as
  bases. Script: `scripts/fix-asset-log-auditor-legado.sql`; contrato guardado
  por `src/__tests__/assetLogAuditorLegado.test.ts`.

## [2.8.1] — 2026-11-20

### Adicionado — trava no servidor contra a ressurreição de ativos apagados

- **A exclusão deixa de depender do cliente:** a guarda do #128 só existe no
  APK que a tem. Um APK antigo — ou uma cópia local que nunca recebeu a
  exclusão — envia `is_deleted = false` sobre a linha apagada e o ativo volta
  para todos. O trigger `assets_bloquear_ressurreicao` (`BEFORE UPDATE` em
  `public.assets`) recusa essa escrita com P0001, excepto quando a mesma
  escrita traz um `restored_at` novo.
- **A marca de restauro é explícita:** `restored_at` (coluna nova) só é enviada
  pelo caminho de restauro (`syncAssetsToCloud(..., { allowUndelete: true })`,
  usado por `restoreAsset`). Update normal de um ativo apagado passa (a flag
  fica `true`); restauro passa (traz a marca).
- **Blocos SQL:** `scripts/assets-restauro-trigger.sql` para a base actual e
  `docs/supabase_bootstrap.sql` para as bases novas, ambos idempotentes.

### Corrigido — a exclusão que vence a subida passa a ser aplicada ao registo local

- **O registo ficava pendente para sempre:** quando a guarda de envio
  encontrava a linha já apagada na nuvem, nada era enviado mas o registo local
  continuava `_is_synced = 0`. A fila voltava a tentá-lo — e a gravar
  `SYNC_DELETE_WINS` na trilha — a cada ciclo de 60 s, até um pull chegar.
  `markAssetsDeleted` aplica a exclusão no próprio ciclo (`_is_deleted = 1`,
  `_is_synced = 1`, sem carimbo de falha): o registo sai da fila e das listas,
  e o envio em massa faz o mesmo com as linhas que descarta.
- **A trilha tem janela:** `SYNC_DELETE_WINS` é registada uma vez por registo e
  por janela de 10 min. Mesmo que uma gravação de estado atrasada reponha a
  cópia como pendente, a trilha não ganha uma linha por ciclo.

### Corrigido — a subida deixa de reativar um ativo apagado na nuvem

- **O upsert não lia o estado remoto:** um aparelho que ficou offline com a
  cópia ativa de um ativo apagado noutro lado reenviava-a e reactivava a linha
  em todos os aparelhos — a exclusão nunca era definitiva. O envio passa a
  perguntar à nuvem antes de escrever (`fetchCloudDeletedKeys`, uma consulta por
  lote) e deixa de fora as chaves apagadas, tanto no espelhamento
  (`syncAssetsToCloud`) como na fila de fundo (`processDataSyncQueue`).
- **O restauro é a única excepção:** `syncAssetsToCloud(..., { allowUndelete:
  true })`, usado só por `restoreAsset` — é a operação que pode dizer «vivo»
  sobre uma linha apagada.
- **Sem ciclo de pendência:** com a linha apagada, o pull deixa de preservar a
  pendência local (`devePreservarPendencia`). Antes o registo voltava a
  «Pendente Nuvem» e o envio tentava subi-lo em todos os ciclos.
- **Sem a coluna na nuvem a guarda fica inerte:** se a consulta falhar (schema
  antigo), o envio segue como antes — nunca um bloqueio.

### Corrigido — a exclusão da nuvem vence a edição pendente (o ativo deixa de ressuscitar)

- **A cópia local desfazia a exclusão:** o merge do pull reaplica a cópia local
  por cima da linha da nuvem para não perder alterações por subir. Um aparelho
  que ficou com `_is_deleted = 0` (offline durante a exclusão, `delete` que
  falhou antes, base antiga) desfazia a exclusão em todos os aparelhos no ciclo
  seguinte, sem ninguém tocar no ativo. A exclusão não é um campo do registo: é
  o registo inteiro — quando a nuvem diz «apagado», a cópia local perde por
  inteiro, a pendência é largada (não há o que enviar de um registo apagado) e
  a trilha regista `SYNC_DELETE_WINS`. Com a linha viva na nuvem, a edição
  local continua a ganhar como antes (regra em `src/utils/pendencia.ts` →
  `mesclarComExclusao`).

### Adicionado — a exclusão de um ativo chega à nuvem e desaparece nos outros aparelhos

- **O soft delete não saía do aparelho:** `_is_deleted` vive só no registo
  local, a tabela `assets` não tinha onde o guardar e o payload não o enviava.
  A linha da nuvem ficava intacta, o pull seguinte devolvia-a ativa e o ativo
  «ressuscitava» no outro telemóvel — e, ao reiniciar, no próprio aparelho que o
  apagou. A coluna `is_deleted` passa a viajar no envio em massa
  (`buildPayload`) e na fila (`processDataSyncQueue`), e o pull traduz-a de
  volta para `_is_deleted` (`mapCloudAssetRow`). Bloco SQL em
  `scripts/assets-exclusao.sql` para a base actual e em
  `docs/supabase_bootstrap.sql` para as bases novas.
- **A linha continua na nuvem, marcada:** nada é apagado com `delete`, para o
  restauro e a auditoria continuarem possíveis. O restauro sobe
  `is_deleted = false`.
- **A exclusão grava-se no disco antes de falar com a nuvem:** antes só o modo
  interno escrevia o registo apagado (o modo Supabase só o enviava), e o
  `saveInventory` seguinte não apaga linhas — a exclusão perdia-se ao reiniciar
  e o envio seguinte ressuscitava o ativo.

### Corrigido — o `updated_at` de `assets` passa a mudar em cada actualização

- **A conferência de um aparelho não chegava aos outros:** o pull delta baixa
  `updated_at > checkpoint`, mas a coluna só tinha `DEFAULT now()` — valia no
  `INSERT` e nunca mais. O upsert da fila e o espelhamento actualizavam a linha
  (`conferido`, `auditor`, `data_leitura`) sem tocar no carimbo, e a alteração
  ficava invisível a todos os aparelhos até um pull completo. Um trigger
  `BEFORE UPDATE` (`assets_touch_updated_at`) passa a escrever
  `NEW.updated_at = now()` no servidor — bloco em
  `scripts/assets-updated-at-trigger.sql` para a base actual e em
  `docs/supabase_bootstrap.sql` para as bases novas.
- **O cliente não escreve o carimbo:** a fila continua a não enviar
  `updated_at` de propósito. Com o relógio do aparelho adiantado, um carimbo do
  cliente empurrava o checkpoint do pull para o futuro e os restantes aparelhos
  saltavam alterações até esse instante. O carimbo é do servidor; o app só lê.
- **Linhas sem carimbo:** o backfill (`updated_at = COALESCE(created_at,
  now())`) tira do limbo as linhas antigas, que nunca apareciam no delta.

### Corrigido — o `23505` do espelhamento deixa de contar como sincronizado em silêncio

- **A chave existe com outro `id`:** no isolamento por ativo de
  `syncAssetsToCloud`, um `23505` em `(tenantid, primarykey)` era contado como
  sucesso e o payload era deitado fora — o aparelho ficava «sincronizado» e a
  nuvem por actualizar, com a conferência perdida sem aviso. O envio passa a
  repetir o upsert com `onConflict: 'tenantid, primarykey'`, que actualiza a
  linha certa (mantendo a adaptação de `id`/colunas do `sendBatch`). Só se a
  repetição também falhar é que o ativo é dado como recusado, com motivo.

### Corrigido — o timeout deixa de ser carimbado como recusa definitiva

- **Timeout ≠ recusa:** quando o pedido não responde em 15 s, a fila carimbava
  `_syncFailAt` como se a nuvem tivesse recusado o registo — o cartão ficava
  vermelho («Falha de envio») e o operador lia «Tempo esgotado» 14 min depois
  como recusa de dados. `isSyncTimeoutError` (`src/services/syncQueueGuards.ts`)
  separa os dois desfechos: no timeout o registo continua «Pendente Nuvem», a
  trilha guarda `SYNC_RECORD_EXCEPTION` com o motivo «Servidor não respondeu ao
  envio em 15 s — nova tentativa automática» e o ciclo seguinte volta a tentar.
- **O ciclo não insiste com o servidor mudo:** depois de um timeout o laço dos
  registos pára (200 ativos × 15 s seriam 50 minutos presos) e o botão manual
  continua disponível.

### Corrigido — a fila actualiza a linha existente em vez de falhar com `duplicate key`

- **Alvo de conflito na fila:** `processDataSyncQueue` fazia
  `upsert(payload)` sem `onConflict`. A fila não envia `id`, o PostgREST usava a
  chave primária `(tenantid, id)` e o `INSERT` caía sempre no índice único
  `(tenantid, primarykey)` — um ativo que já existia na nuvem ficava em `23505
  duplicate key` em cada ciclo e nunca recebia a conferência. O upsert passa a
  declarar `onConflict: 'tenantid, primarykey'`, o que actualiza a linha
  existente sem tocar no `id`; o alvo acompanha também a repetição que retira
  uma coluna inexistente (PGRST204).
- **`42P10` accionável:** quando a nuvem não tem o índice único em
  `(tenantid, primarykey)`, o motivo mostra primeiro a acção a tomar («falta o
  índice único…», ver `docs/supabase_bootstrap.sql`) em vez de repetir o pedido
  sem explicação.

### Corrigido — a mesma recusa não volta à trilha por causa do texto volátil

- **A assinatura da falha é estável:** a deduplicação de
  `SYNC_RECORD_FAIL`/`SYNC_RECORD_EXCEPTION` comparava `primarykey|detalhe` com
  o detalhe cru. Como a mensagem pode trazer id de pedido, UUID, data/hora ou
  `ficheiro:linha` da pilha, cada tentativa gerava uma assinatura nova e a mesma
  recusa era registada outra vez em cada ciclo de 60 s. `assinaturaDeFalha`
  (`src/utils/syncFalha.ts`) passa a guardar só a causa: código de erro e
  mensagem, com o resto trocado por marcadores fixos. Linhas antigas são
  normalizadas também na leitura, por isso continuam a contar na janela.

### Corrigido — o pull e o expurgo não apagam a prova da falha de envio

- **Descer a base já não apaga o carimbo:** o merge do pull remontava a linha
  local com a versão da nuvem e só preservava `_is_synced`/`_lastUpdated`,
  deixando cair `_syncFailAt`/`_syncFailReason` — o selo vermelho desaparecia a
  cada pull e o registo recusado voltava a parecer apenas «na fila».
  `preservarPendenciaLocal` passa a receber o registo local inteiro e a manter
  o carimbo (e a data do toque) quando eles existem, sem inventar nenhum.
- **O expurgo de 7 dias deixa de apagar as recusas do envio:** as linhas
  `SYNC_RECORD_FAIL`/`SYNC_RECORD_EXCEPTION` são a causa registada de um ativo
  que não sobe e passam a sobreviver ao *disk saturation guard*
  (`src/services/auditoriaRetencao.ts`); o resto da trilha continua a ser
  expurgado aos 7 dias.

### Adicionado — a falha de envio fica visível ao lado do ativo

- **O aparelho distingue «na fila» de «recusado»:** uma recusa da nuvem só
  existia em `audit_logs` (`SYNC_RECORD_FAIL` / `SYNC_RECORD_EXCEPTION`), longe
  do cartão. Os dois caminhos de envio — o ciclo de fundo
  (`processDataSyncQueue`) e o envio em massa (`syncAssetsToCloud`, usado pelo
  autosave, pelo push delta de boot e pelo Gestor) — passam a carimbar o próprio
  registo local (`_syncFailAt`/`_syncFailReason`, `src/utils/syncFalha.ts`), no
  máximo uma vez por janela de 10 min com o mesmo motivo. O carimbo é apagado
  quando o envio é aceite, pelos dois caminhos (`markAssetsSynced`).
- **Selo vermelho no cartão:** o ativo com recusa mostra «Falha de envio ·
  {motivo} · há X» em vez do âmbar «conferência por enviar», sem esconder que
  continua pendente.
- **Botão global em vermelho:** o contador de sincronização mostra quantos
  pendentes têm falha («N falhas de envio») e mantém o toque para forçar o envio.
- **A falha aparece na aba «Ativos» da Auditoria:** as duas ações passam a ser
  classificadas como de ativo e pintadas de vermelho, junto da conferência que
  explica.

### Corrigido — o GPS da conferência chega à ficha, ao mapa e à nuvem

- **Uma ponte para o par de coordenadas:** a conferência grava `latitude`/
  `longitude`, mas a nuvem guarda o mesmo ponto em `gps_lat`/`gps_lng` e o
  envio não convertia — o ativo subia sem coordenada. `src/utils/assetGps.ts`
  faz a conversão nos dois sentidos e é usada pelo envio
  (`syncAssetsToCloud`), pelo ciclo de fundo (`processDataSyncQueue`), pelo
  pull (`mapCloudAssetRow`) e pela gravação local
  (`bulkInsertAssetsOfflineFirst`, que descartava `latitude` ao remontar a
  linha). O ponto da conferência passa a aparecer na ficha e no mapa de calor.
- **O envio não apaga a coordenada da nuvem:** o payload só leva `gps_lat`/
  `gps_lng` quando o ativo tem leitura válida no aparelho. Sem leitura as
  colunas ficam fora do `upsert` (e não a `null`), por isso um ativo conferido
  sem GPS — ou com a leitura descartada — preserva o ponto que já está gravado
  no Supabase.
- **A captura já não perde leitura utilizável:** a conferência cortava a
  leitura aos 3 s e só aceitava até 50 m. Passa a aceitar até ao limite de
  descarte (150 m) e a esperar os limites do sensor (10 s nativo, 5 s web).
- **A Trilha de Auditoria já não abre vazia:** no modo SUPABASE o ecrã lia
  apenas `asset_logs`/`audit_logs` da nuvem, onde a conferência feita no
  aparelho nunca é escrita. Passa a mostrar também a trilha local (Dexie),
  unida à da nuvem e sem duplicar o mesmo evento.

### Corrigido — «CONFERIDO» passa a ter uma regra e uma escrita só

- **Uma definição da regra:** os contadores (unidade, painel, conciliação), a
  etiquetagem, a busca ativa, o seletor de unidade e a deduplicação de cópias
  liam a conferência cada um à sua maneira — uns `_conferido === 1`, outros
  `!!_conferido`, outros só a coluna de auditoria
  (`AUDITOR_STATUS_CONFERENCIA === 'SIM'`). Todos passam a ler `isConferido`
  (`src/utils/conferencia.ts`), que aceita a flag em qualquer das grafias
  (`true`, `1`, `'1'`) e a coluna de auditoria. Deixa de haver ativo contado
  como pendente num ecrã e conferido noutro só porque a marca veio da coluna.
- **Uma escrita para marcar e desmarcar:** cada ecrã montava o patch à mão —
  uns `_conferido: 1`, outros `true`, uns com `_dataLeitura`, outros sem —, e o
  desmarcar de um não resistia ao envio do outro. `marcarConferido` e
  `desmarcarConferido` são agora o par único (com `alternarConferencia` no
  toque), gravado pelo cartão do inventário, pelo detalhe do ativo, pela
  conciliação, pela etiquetagem, pela persistência e pelo espelho local.
- **O tipo acompanha as grafias:** `_conferido` (`MarcaDeConferencia`, em
  `src/utils/conferencia.ts`) admite booleano, `1`/`0` e o texto legado
  (`'true'`, `'1'`, `'0'`), que é o que existe no Dexie, no espelho SQLite e no
  JSON importado. A fronteira do banco normaliza nos dois sentidos: escrever
  `'true'` grava 1 e ler `'1'` entrega `true` à UI (antes o texto voltava como
  pendente). As leituras cruas que sobravam — a normalização do arranque
  (`!a._conferido`), o merge das três tabelas em `localDbService`
  (`prev._conferido ?? next._conferido`), a contagem por localidade e a
  importação de JSON — passam pela regra (`isConferido`), e a marca pela
  grafia canônica (`marcaLocalConferida`).
- **Merge das três tabelas decidido e escrito:** quando `ativos`, `assets` e
  `local_assets` discordam, a conferência continua monotónica (basta uma cópia
  conferir), mas a prova — `_auditor`, `_dataLeitura` e a coluna de auditoria —
  passa a vir da **cópia que conferiu**, e não da de maior precedência.
  `docs/DECISAO_MERGE_CONFERIDO.md` compara as opções (monotónico, precedência
  da cópia viva, recência), recomenda esta e mostra o efeito em cada ecrã; a
  desmarcação continua a ganhar porque escreve as três tabelas na mesma
  transacção.
- **Desmarcar apaga todas as provas de conferência:** o `status` textual com
  «CONFERIDO» é marcador lido pelo envio e pelo pull da nuvem, por isso
  desmarcar só a flag deixava o item voltar conferido na sincronização
  seguinte. `statusAoDesmarcar` troca **só** o marcador por `PENDENTE` (um
  status de outro teor fica como está), a coluna de auditoria vai a `NAO` e a
  `_dataLeitura` é apagada. O filho criado na unitarização deixou de herdar o
  `status` conferido do pai.
- **A conferência da planilha sobrevive ao Gestor de Base:** a carga gravava
  `_conferido: 0` fixo, pelo que um arquivo já conferido entrava inteiro como
  pendente. A linha passa a ler o `status` e a coluna de auditoria pelo
  predicado — o mesmo caminho que a exportação usa para devolver o estado.
- **A exportação devolve o estado pela regra:** o de-para e a coluna de
  auditoria do Excel/CSV saíam de `_conferido === 1`, e um ativo conferido pela
  coluna de auditoria era exportado como «NAO».
- **O de-para do endereço é uma regra só:** a exportação do App comparava
  `endereco` com o local auditado por `normalizeKey` e a do painel (`GBR_AUDIT`)
  por `===` — o mesmo ativo saía «COM ALTERAÇÃO» num ficheiro e «SEM ALTERAÇÃO»
  no outro. O bloco «Fluxo de Adoção» do cartão e do Kardex também abria com
  `_localMaster !== endereco` cru, mostrando uma adoção que só existia na
  caixa das letras. As quatro pontas passam a chamar `mesmoEnderecoAuditado` e
  `rotuloDePara` (`src/utils/assetAddress.ts`), com a mesma tolerância de
  localidade do resto do app.
- **A nuvem lê o predicado:** `buildPayload` e `conferidoDaNuvem` deixaram de
  repetir a derivação à mão; a coluna remota `conferido` é aceita em qualquer
  das grafias (`true`, `1`, `'1'`, `'true'`) e o conflito do pull e o
  enriquecimento GPS no arranque também. O marcador `status` com CONFERIDO
  continua a valer — é o backfill dos registos anteriores à coluna.
- **O gate deixou de ter exceções:** `conferenciaUsoUnico.test.ts` já não
  carrega lista de sítios por migrar e falha em qualquer cópia da regra — e em
  qualquer comparação de `AUDITOR_STATUS_CONFERENCIA` com `'SIM'` fora do
  predicado. A cobertura nova fixa a escrita (`conferidoEscrita`), o desmarcar
  (`conferidoDesmarcar`), a exportação (`conferidoExportacao`), os contadores e
  a conciliação (`conferidoSitios`), a leitura da nuvem
  (`cloudConferenciaLeitura`, `mapCloudAssetRow`) e a importação verbatim da
  planilha (`importVerbatim`).

### Adicionado — a conferência passa a ser verificável fora do app

- **Prova da carga da planilha a correr no CI:** `provaCargaPlanilha.test.ts`
  estava sempre `skipped` — existia, mas nunca provava nada. O passo dos testes
  do `ci.yml` passa a definir `PROVA_CARGA_SINTETICA=1`, e a prova importa
  4.000 linhas pelo caminho real do Gestor de Base (duas filiais, chaves de
  origem repetidas e linhas sem chave), comparando planilha N · base N linha
  por linha. Se a variável desaparecer do workflow, o ficheiro falha em vez de
  voltar a saltar em silêncio; na máquina continua opt-in (`npm run
  prova:carga`), para não pesar cada `npm test`.
- **Diagnóstico da conferência na nuvem:**
  `scripts/assets-conferencia-diagnostico.sql` reúne em blocos A–E, somente
  leitura, a verificação da migração (colunas e índice), o backfill do marcador
  legado, o autor e a data da leitura, o volume e o ritmo por filial, as chaves
  de origem repetidas e um veredicto de cinco linhas.
  `docs/DIAGNOSTICO_CONFERENCIA.md` diz a ordem dos passos e o que fazer em
  cada falha, e `diagnosticoConferencia.test.ts` impede que o SQL ganhe
  DML/DDL fora dos comentários ou se afaste da migração e do documento.

### Corrigido — Leitura de código de barras, lanterna e zoom do scanner

- **Leitura 1D a 10 leituras/s:** a configuração anterior limitava a câmara a
  5 fps e descodificava a `fps: 2` — duas hipóteses por segundo, insuficientes
  para um Code 128 ou Code 39 de etiqueta pequena, mesmo visível no ecrã. Passa
  a descodificar 10 leituras/s (6 em economia de bateria), a capturar a 15 fps
  (10 em economia) e a usar `disableFlip` (a câmara é a traseira).
- **Leitura cega: captura de volta a 1280x720 e região de leitura fixa:** o
  html5-qrcode desenha a região de leitura num canvas do tamanho do viewfinder
  em píxeis CSS (~350 px de largura), por isso pedir 1920x1080 só aumentava a
  redução (~5x) — as barras finas de um Code 128 colapsavam em cinzento e o
  leitor deixou de ler. A captura volta a 1280x720 e a região a 350x150
  (280x280 em QR): uma função calculada a partir do viewfinder podia devolver
  0 px no arranque e deixar o canvas vazio, sem erro visível.
- **ZXing em vez do BarcodeDetector nativo:** `experimentalFeatures` com
  `useBarCodeDetectorIfSupported` não devolvia detecções de códigos 1D nesta
  WebView. `formatsToSupport` continua a ir no construtor do `Html5Qrcode`
  (passado ao `start()` era ignorado), mas sem o detector nativo.
- **Lanterna e zoom não funcionavam:** o código chamava `getRunningTrack()`,
  que não existe na API do html5-qrcode; a excepção era engolida e o track
  nunca era guardado. O track passa a vir do `srcObject` do `<video>`, a
  lanterna reaplica-se após cada reinício/troca de câmara e o zoom usa o
  intervalo real do sensor (min/max/step), mostrando o factor relativo.
- **Zoom morto no telemóvel:** a WebView do Android (Capacitor) não expõe
  `zoom` no `MediaStreamTrack.getCapabilities()` nem aceita a constraint — o
  botão aparecia desactivado a 40% de opacidade e o toque não fazia nada. Sem
  zoom de hardware, o controlo passa a fazer zoom digital de 1x a 3x: o vídeo
  é ampliado e centrado e a região de leitura acompanha o mesmo factor, de modo
  que a caixa azul mostra o que é descodificado e as barras deixam de chegar ao
  leitor reduzidas à largura do ecrã. O recorte interno (`qrRegion`) é validado
  antes de se mexer em qualquer coisa: se uma subida do html5-qrcode o renomear
  ou mudar a forma, o controlo fica desactivado em vez de ampliar só a imagem e
  deixar a descodificação numa zona diferente da que o utilizador vê.
- **Foco contínuo:** aplicado quando a câmara o suporta — a imagem desfocada
  era a causa mais comum de um código visível não ser lido.
- **Botão do zoom cortado:** a barra de controlos era uma fila única de três
  colunas `flex-1` com larguras mínimas fixas; num ecrã de 360 px o grupo do
  zoom saía pela direita. Passa a duas filas (acções da câmara e zoom) abaixo da
  área segura do Android.

### Corrigido — «PENDENTE NUVEM» eterno depois de reiniciar o app

- **A filial de envio vinha só do `sessionStorage`:** o Android esvazia o
  `sessionStorage` quando mata a WebView em segundo plano, e todas as guardas
  de sincronização (`processDataSyncQueue`, fila de fotos, campanhas, contador
  de pendentes e o ciclo de 60 s) liam a filial apenas dali. Depois de um
  reinício o ciclo voltava em silêncio sem enviar nada, e ativos conferidos em
  dias anteriores continuavam com a etiqueta «PENDENTE NUVEM» mesmo com a
  unidade visível no ecrã (a UI já caía para o `localStorage`/sessão). A
  leitura passa a seguir a mesma cascata da UI: sessão → unidade seleccionada →
  `localStorage` persistente.

### Alterado — consumo de bateria e aquecimento durante a leitura

- **A câmara deixa de correr a 30 fps para descodificar 10:** o sensor/ISP
  produzia 30 imagens por segundo e a leitura usava uma em cada três. A captura
  passa a 15 fps (10 fps em economia de bateria), com a mesma resolução e a
  mesma cadência de descodificação — a eficácia não muda e o sensor trabalha
  metade das vezes.
- **Bip, vibração e gravação deixam de se repetir em rajada:** um código parado
  à frente da câmara é descodificado ~10x por segundo e cada leitura gerava
  novo `AudioContext`, bipes, vibrações, flash de ecrã e consulta ao banco.
  Passa a haver uma janela de guarda de 2 s por código e uma trava para leituras
  concorrentes.
- **Um único `AudioContext`, suspenso entre bipes:** antes cada bip criava um
  contexto novo e nunca o fechava, mantendo o áudio acordado e a acumular
  objectos durante toda a sessão.
- **Fim do ciclo de câmara por item:** o cooldown de 500 ms pós-leitura pausava
  o scanner e obrigava a parar/reabrir a câmara a cada código confirmado. Além
  disso, o arranque do leitor dependia de `onScan`, cuja identidade muda a cada
  leitura — qualquer mudança de estado do inventário reiniciava a câmara. O
  callback passa a ser lido de uma ref e a câmara só reinicia quando muda a
  câmara, o modo ou o perfil de consumo.
- **Sem desfoque de fundo sobre o vídeo em direto:** os controlos e o indicador
  de estado usavam `backdrop-blur`, recalculado pelo GPU a cada frame. O fundo
  passou a ser opaco e a animação da linha de leitura corre em `transform`
  (composição) em vez de `top` (layout + pintura a cada frame).

### Corrigido — «Nenhum Endereço Cadastrado» com os ativos na tabela de trabalho

- **O ecrã lia as tabelas erradas:** `getLocationsWithStats` consultava
  `addresses`, `assets` e `local_assets`, mas no modo INTERNAL os ativos vivem
  em **`ativos`** — é a tabela que o Dashboard, a Consulta e o Mapa leem. Num
  aparelho com a base carregada só em `ativos` o ENDEREÇO FÍSICO anunciava
  «Nenhum Endereço Cadastrado» (e não havia caminho para o cadastro de ativos).
  Passa a **unir** as três tabelas (canónica `assets`, trabalho `ativos`,
  baseline `local_assets`) — e não a parar na primeira que tem linhas: se
  `assets` tiver a filial só com linhas sem endereço, as localidades de
  `ativos` continuam a aparecer. Cada tabela tenta o índice exacto e, quando
  não o tem, a varredura tolerante do mesmo contrato.
- **Sem contagens duplicadas:** o mesmo ativo espelhado nas três tabelas é
  unido pela chave `tenantid + primarykey` e conta **uma** vez; o endereço vem
  da cópia que o tiver e o estado de conferência é o mais avançado (o trabalho
  de campo grava em `ativos`/`local_assets`, não necessariamente em `assets`).
- **«SEM LOCAL» como localidade de acesso:** ativos **sem** endereço efectivo
  passam a ter a localidade sintética **«SEM LOCAL»**, com as contagens deles.
  O rótulo vive agora numa constante partilhada
  (`constants/addressLabels.ts`), usada também pelo `assetAddressKey` do
  inventário e pelo filtro de localidade — por isso o toque abre exactamente
  esses ativos e o cadastro deixa de ser inalcançável. Aparece **também**
  quando a filial já tem localidades (são os ativos que estavam invisíveis),
  respeita o termo de busca e nunca duplica uma localidade real com o mesmo
  nome.
- **Uma única porta para os ativos sem endereço:** uma linha do índice
  `addresses` com `codigo_endereco` vazio era listada como «GERAL - NÃO
  ESPECIFICADO» — a chave interna de contagem — ao lado da entrada sintética
  «SEM LOCAL», as duas a apontar para os mesmos ativos. Linhas sem endereço
  deixam de ser listadas: esses ativos aparecem só em «SEM LOCAL», com as
  contagens certas.
- **Busca ativa alinhada com o inventário:** o agrupamento/filtro por
  localidade usava só `endereco` e o rótulo «SEM LOCALIZAÇÃO», pelo que não
  encontrava os ativos que o ENDEREÇO FÍSICO lista como «SEM LOCAL». Passa a
  usar o endereço efectivo partilhado (`utils/assetAddress`, mesma regra do
  `assetAddressKey`), com a chave normalizada — e mostra a localidade no cartão
  do item.
- **`_is_deleted` com precedência definida:** quem decide é a cópia de maior
  precedência — **`ativos` (viva)** → `assets` (canónica) → `local_assets`
  (baseline). Uma baixa feita no aparelho esconde o ativo mesmo que a canónica
  ainda esteja viva; uma reposição feita em `ativos` volta a mostrá-lo; e só
  quando a cópia viva não declara o campo se desce para a seguinte.
- **Endereço efetivo, igual ao do inventário:** a extração e as estatísticas
  usavam só `endereco`. Passam a usar a mesma regra de `assetAddressKey`
  (`Inventory.tsx`): `_localMaster` (local auditado) vence, e as colunas legadas
  `LOCALIZACAO`/`CENTRO_CUSTO` também identificam a localidade.
- *Testes:* `activeSearch` (novo) — busca ativa agrupa e filtra pelo endereço
  efetivo: `_localMaster` vence, sem-endereço vira «SEM LOCAL» (e filtra só
  esses ativos), «SEM LOCALIZAÇÃO» já não existe.
- *Testes:* `addressSearch` (+3) — cenário misto com as localidades no índice
  `addresses` e os ativos sem endereço em `assets` (contagens e `locKey`), o
  mesmo entre tabelas (`ativos`) e a linha de índice com endereço vazio sem
  virar «GERAL - NÃO ESPECIFICADO» nem duplicar «SEM LOCAL».
- *Testes:* `addressSearch` (+16) — «SEM LOCAL» sem coluna de endereço (com
  `total`/`checked`), cenário misto (filial com localidades **e** ativos sem
  endereço), sem duplicar uma localidade real com o mesmo nome, «SEM LOCAL» a
  respeitar a busca, precedência do `_is_deleted` nos três
  casos (vivo na viva vence baixado na canónica; baixa na viva esconde;
  fallback para a canónica quando a viva não declara o campo), localidades só
  em `ativos`, união de
  `assets`+`ativos`, **cenário misto** (`assets` com linhas sem endereço e as
  localidades em `ativos`), ativo espelhado nas três tabelas a contar uma vez,
  conferência feita numa só cópia a valer, filial com `_` a partir do cartão
  com espaços, `_localMaster`/`LOCALIZACAO` como endereço e isolamento por
  contrato. A coluna de endereço da base é `endereco` (confirmado pelo
  utilizador), e é a primeira da regra de endereço efectivo.

### Corrigido — campanha ativa aparecia como «falta campanha»

- **O filtro de unidade ia literal para o PostgREST:** `fetchCampaigns` pedia à
  nuvem `.or('filial.eq.010101 CICOPAL GO,filial.is.null')`. A coluna grava
  `010101_CICOPAL_GO` e um valor com espaços nem é sintaxe válida no PostgREST —
  o erro devolvia **zero campanhas**. O contrato CICOPAL listava as filiais com
  âncora verde e, ao mesmo tempo, «AGUARDANDO LIBERAÇÃO · FALTA CAMPANHA» com o
  botão da campanha vermelho, e o ACESSAR ficava travado. A unidade passa a ser
  filtrada **depois do merge**, com a mesma chave tolerante do caminho local
  (`matchUnitKeys`), que aceita `_`/espaços/caixa.
- **O mapa de liberação passou a incluir a campanha da nuvem:**
  `loadActiveCampaignUnits` lia apenas o `campaigns` local e a campanha que
  existe só na nuvem nunca libertava o cartão. Agora lê o local **sem filtro**
  (registros antigos sem contrato continuam a valer) e acrescenta
  `fetchCampaigns(contrato)` — local do contrato + nuvem, sem filtro de unidade.
- **`mergeCampaignRows` deduplica pelo `id`:** a chave era prefixada pela
  fonte (`local-<id>` / `scoped-<id>`), portanto a MESMA campanha vinda do
  banco local e da nuvem entrava duas vezes — o comentário prometia dedupe por
  `id` e não havia nenhum. Agora é uma linha por campanha e, no mesmo `id`,
  vale a versão da nuvem; linhas sem `id` continuam a entrar todas.
- *Testes:* `campaignRelease` (novo, 10) — dedupe por `id` (incluindo `42` vs
  `'42'`), ids distintos preservados, linhas sem `id` sem colisão, campanha só
  da nuvem a libertar, contrato ausente sem chamada remota e falha de cada
  fonte sem perder a outra.
- **A reunião das fontes saiu do App para `utils/campaignRelease`:**
  `loadCampaignUnitsForRelease` lê o local sem filtro e acrescenta o contrato
  (local + nuvem); devolve as unidades `ACTIVE`/gravadas. É a peça que o App
  usa e que os testes exercitam — o caso real deixa de ser simulado à parte.
- **Modo INTERNAL continua sem nuvem:** por soberania, `fetchCampaigns` devolve
  só o local quando o modo é INTERNAL. Uma campanha que exista **apenas** na
  nuvem NÃO liberta a unidade nesse aparelho — tem de ser criada/ativada
  localmente. Este limite está fixado em teste, não é suposição.
- *Testes:* `campaignUnitFilter` (novo, 5) — campanha da nuvem gravada com
  `_` encontrada para o cartão com espaços, filial alheia não vaza, contrato
  inteiro sem unidade pedida, campanhas `GLOBAL` mantidas e falha de nuvem sem
  exceção; e a consulta deixa de usar `.or` com o rótulo literal.
- *Testes:* `cloudCampaignRelease` (novo, 4) — caso real ponta a ponta com
  campanha **só na nuvem** (`010101_CICOPAL_GO`): a cadeia
  `fetchCampaigns → loadCampaignUnitsForRelease → buildUnitReleaseMap`
  devolve `released: true`, o cartão `010101 CICOPAL GO` mostra **LIBERADA PARA
  INVENTÁRIO** e o ACESSAR liberta; campanha de outra filial não liberta; e, em
  modo INTERNAL, o cartão continua em «FALTA CAMPANHA» (limite do produto).

### Corrigido — «Nenhuma filial na base» com a filial configurada

- **A lista de filiais e o estado de liberação vinham de fontes diferentes:** o
  cartão do contrato (`WorkContextSelector`) montava as filiais a partir de uma
  varredura do catálogo local (`listContracts`, feita uma única vez no mount),
  enquanto o aviso de liberação usava o catálogo vivo do App
  (`fullCompaniesWithStatus`). Num aparelho cuja configuração operacional foi
  gravada **sem contrato** (`unit_configs` sem `tenantid`, que o catálogo
  descarta) o ecrã dizia «Nenhuma filial na base deste contrato» e, ao mesmo
  tempo, avisava «Unidade aguardando liberação (falta campanha)» — um aviso a
  apontar uma filial que não existia na lista, com o acesso travado e sem
  saída.
- **O catálogo vivo passou a alimentar o seletor:** o App entrega
  `availableFiliais` (`tenantid` → filiais) ao `WorkContextSelector`, a MESMA
  lista que gera o mapa de liberação (ativos, base interna, âncoras, campanhas,
  lista da nuvem). A filial que o aviso menciona passa a ter cartão para tocar.
- **Pré-seleção validada:** a última escolha só é pré-selecionada quando é uma
  unidade real deste contrato (opção da lista ou configuração gravada com a
  chave exata `TENANTID::FILIAL`); uma escolha antiga de outra base deixa de
  produzir o aviso órfão.
- *Testes:* `workContextUnitReleaseAction` — catálogo local vazio + catálogo
  vivo com a filial (cartão listado), pré-seleção de unidade configurada sem
  campanha (cartão + aviso) e pré-seleção inexistente (sem aviso órfão).

### Corrigido — «Nenhum Endereço Cadastrado» com a base cheia

- **O ecrã de endereços lia a base com o contrato do PERFIL:** `getCurrentTenantid`
  (`src/services/localDbService.ts`) devolvia `user.tenantid` e mais nada. O dono
  global não declara contrato no perfil, então as consultas `[tenantid+filial]`
  rodavam com contrato vazio e todo o inventário interno aparecia vazio — com a
  base carregada e a filial liberada. Passa a usar a cadeia do resto do app:
  **perfil → sessão (`tenantid`) → armazenamento local**, ignorando sentinelas
  (`NULL`, `UNDEFINED`, `N/A`).
- **A filial era comparada LITERALMENTE no índice:** o cartão mostra
  `010101 CICOPAL GO` e a base gravava `010101_CICOPAL_GO`; `getLocationsWithStats`
  fazia `equals([tenant, '010101 CICOPAL GO'])` e devolvia lista vazia, mesmo com
  os ativos e endereços presentes. Agora há um caminho tolerante — mesma chave
  canónica da lista do inventário (caixa, acentos, espaços, `_`/`-`) — restrito ao
  MESMO contrato: rápido pelo índice exato; se ele vier vazio, varre o contrato e
  compara por `normalizeUnitMatchKey`.
- *Testes:* `addressSearch` — `normalizeUnitMatchKey` (espaço/`_`/`-`/caixa/acentos)
  e `getCurrentTenantid` (perfil vence; sem perfil cai na sessão; sentinelas não
  são contrato).
- *Verificado no preview:* filial `010101_CICOPAL_GO` na base, cartão
  `010101 CICOPAL GO` → `ENDEREÇO FÍSICO` lista as localidades com contagem
  (antes: «Nenhum Endereço Cadastrado»).

### Corrigido — biometria deixa de ser exigida no web/desktop

- **O cadastro biométrico obrigatório abria no navegador:** `resolveBiometricStep`
  tratava «autenticador de plataforma disponível» (`Touch ID`, `Windows Hello`)
  como aparelho de campo e exigia o cadastro a quem entrava pelo desktop/web —
  sem credencial, a tela «SEGURANÇA BIOMÉTRICA · CADASTRO OBRIGATÓRIO» travava o
  acesso. A biometria passa a ser **etapa exclusiva do aplicativo móvel** (casco
  nativo): no navegador/desktop o passo não existe — nem cadastro, nem tela de
  dispensa — e o motivo fica registado como `web-session`.
- **O botão «Entrar com Biometria» também é do app:** `Login` só consulta suporte
  e credencial no casco nativo, então no web o formulário fica exatamente
  utilizador + senha.
- **O app não muda:** no casco nativo continua obrigatório onde há biometria e
  com dispensa explícita onde o hardware não verifica (Fase 2/2b).
- *Testes:* `biometricPolicy` — web com e sem autenticador segue direto
  (`web-session`), cadastro obrigatório só com `isNativeApp + nativeBiometry:
  'available'`.

### Corrigido — contrato sem filiais no seletor

- **O seletor mostrava o contrato sem nenhuma filial:** o catálogo de contratos
  (`listContracts`, `src/utils/tenantCatalog.ts`) montava as filiais apenas a
  partir das tabelas de **ativos**, dos perfis e das licenças. Num aparelho onde
  a base de ativos daquele contrato ainda não tinha sido baixada — mas com
  **âncora GPS e campanha gravadas** nas filiais — o contrato aparecia como
  «SEM FILIAL NA BASE» (ou «Nenhuma filial na base deste contrato») e não havia
  como escolher a unidade nem conferir a liberação.
- **A configuração operacional passou a ser fonte do catálogo:** `unit_configs`
  (âncora GPS) e `campaigns` (campanha) entram na lista, por contrato, com
  dedupe tolerante entre as grafias da unidade (`010101_CICOPAL_GO` e
  `010101 CICOPAL GO` são a mesma filial).
- **A lista de unidades do contrato também as inclui:** `fullCompaniesWithStatus`
  passa a somar as filiais da configuração operacional e as âncoras persistidas
  no aparelho à lista base (o escopo do auditor continua a filtrar), e o
  contrato resolvido (`currentTenantid`) é usado na chave da unidade.
- **Verificado no preview:** depois do login do admin global, o contrato CICOPAL
  passou a listar as filiais — `010101 CICOPAL GO` como **LIBERADA PARA
  INVENTÁRIO** (âncora + campanha ativa) e `010201 SNACKS PA` como «aguardando
  liberação · falta campanha» (só âncora).
- *Testes:* `tenantCatalog` (filiais de âncoras/campanhas sem ativos, fontes
  antigas e sentinelas) e `unitRelease`/`collectConfiguredUnitNames` (três
  grafias, dedupe, contrato alheio não vaza, sentinelas).

### Corrigido — «SESSÃO EXPIRADA» em autosave sem contrato

- **Um save em segundo plano deixava de encerrar a sessão:** `syncConfigToCloud`
  desistia da gravação quando não tinha `tenantid` e disparava
  `gbr_session_expired` — o App respondia com o modal «SESSÃO EXPIRADA · o envio
  das configurações foi bloqueado», derrubava a sessão e voltava ao login. Isso
  acontecia em navegação normal: logout, dono global antes de escolher o
  contrato, base ainda sem unidades. Agora o envio é ignorado com aviso no log e
  a sessão fica intacta; a expiração real continua a ser tratada pelo listener
  de auth do Supabase.
- **O autosave passa a levar o contrato da sessão:**
  `persistenceService.saveInventory` resolve `readSessionTenantId()` /
  `readLocalTenantId()` e envia a configuração para `config_<TENANT>` em vez de
  depender de um `tenantid` que o chamador não passava.

### Adicionado — desbloqueio biométrico como primeira etapa no mobile

- **A biometria passou a ser o primeiro passo, não o segundo:** no casco nativo
  o acesso abre com o **último utilizador autenticado no aparelho** e dispara o
  prompt do sistema automaticamente — sem teclado, sem senha. A senha continua
  sempre disponível em **«Usar senha»** (e «Tentar novamente» quando o prompt é
  recusado ou falha); o prompt é automático uma única vez, nunca em loop.
- **O que decide a tela:** `canOfferBiometricUnlock` (`src/utils/biometricUnlock.ts`)
  exige casco nativo + plugin `available` + credencial **nativa** registada para
  esse último utilizador. O identificador é memorizado em
  `gbr_last_login_user` no login por senha e na entrada biométrica (o perfil
  `DEMO` nunca o substitui).
- **Web sem autenticador continua só utilizador e senha:** a tela de
  desbloqueio só é montada no casco nativo; no navegador o caminho actual não
  muda (o botão de biometria do formulário continua a aparecer apenas com
  plataforma disponível e credencial registada).
- **Primeiro acesso intacto:** aparelho capaz sem credencial → senha e depois o
  **cadastro obrigatório** (`BiometricRegistration`), como na Fase 2; só depois
  é que o desbloqueio biométrico passa a ser a primeira etapa.
- **Segundo utilizador no mesmo aparelho:** a tela passa a oferecer **«Entrar
  com outra conta»**, que esquece o último utilizador (`gbr_last_login_user`) e
  abre o formulário **vazio** — ninguém herda o desbloqueio biométrico de quem
  entrou antes. A credencial registada do anterior continua no aparelho (não se
  apaga registo nenhum); só o «último utilizador» é esquecido.
- **Sessão igual à do login por senha:** a entrada biométrica marca a sessão
  como gerida pelo app, grava `LOGIN` com origem «Desbloqueio do aparelho» no
  `audit_logs` e segue para contrato → módulo.

### Corrigido — campanha criada deixa de ser marcada como inexistente

- **Campanha `CREATED` já conta como campanha da filial:** criar uma campanha
  nasce no status `CREATED` e só depois é ativada. O cartão da unidade só
  olhava `ACTIVE`, então uma campanha recém-criada aparecia como "pendente" e o
  botão 📣 abria o cadastro em branco — caminho para duplicar a campanha. O
  estado de liberação passa a distinguir **campanha gravada** (`CREATED` ou
  `ACTIVE`), que deixa o botão verde e abre a ficha, de **campanha ativa**, que
  continua sendo a única que libera o inventário de campo.
- **Aviso da filial alinhado ao botão:** com campanha criada e ainda não ativa,
  o cartão fica com o botão verde, mas a linha continuava a dizer "falta
  campanha". O rótulo passa a apontar **ativar a campanha** (`describeUnitReleaseMissing`),
  e as mensagens de bloqueio deixam de mandar "configurar" o que já existe.
- **Comparação de filial tolerante na campanha:** a gestão de campanhas e a
  leitura local comparavam a filial por igualdade exata; `010101_CICOPAL_GO` e
  `010101 CICOPAL GO` não se encontravam e a tela abria o cadastro por cima de
  uma campanha existente. Agora a comparação usa a mesma chave normalizada da
  liberação da unidade (caixa, `_`, hífen e acento não separam) e considera os
  três campos da unidade (`filial`, `unit_id`, `_unitid`).

### Corrigido — o mapa GPS abre na âncora da filial

- **A unidade era selecionada antes de as âncoras carregarem:** o efeito de
  `initialUnit` corria no mount, com a lista de configs ainda vazia — a âncora
  gravada não era encontrada, o formulário abria em branco e o mapa ficava no
  centro do país. A seleção agora espera o carregamento e acontece uma única vez.
- **Foco aplicado quando o mapa fica pronto:** se o `flyTo` chegasse antes do
  evento `load` do MapLibre (mapa sem instância), o destino era perdido e o mapa
  abria no Brasil. O destino fica guardado e é aplicado assim que o mapa carrega.
- **Âncora gravada só com `filial` deixou de ser ignorada:** a procura no
  `UnitConfigurator` só olhava `unit_id`; registros antigos/vindos da nuvem só
  com `filial` não eram encontrados. `findUnitConfigForUnit` compara os três
  campos com chave normalizada (caixa, `_`, hífen e acento não separam).

### Alterado — botão CAMPANHA abre a campanha ativa ou o cadastro

- **Botão 📣 verde abre a campanha da filial:** com campanha criada e ativa, o
  toque no botão `Campanha` do cartão leva direto à ficha dessa campanha
  (`initialAction: 'OPEN'`), sem passar pela lista.
- **Botão 📣 vermelho abre o cadastro:** sem campanha ativa na filial, a gestão
  de campanhas já nasce no formulário de cadastro daquela unidade
  (`initialAction: 'CREATE'`); se a leitura não trouxer nenhuma campanha, o
  cadastro abre na mesma, em vez de uma lista vazia.

### Alterado — liberação da filial direto no cartão (sem a UNIDADE OPERACIONAL)

- **Dois botões de estado no próprio cartão da filial:** no CONTRATO DE
  TRABALHO, cada unidade passa a trazer os botões **Âncora GPS** e **Campanha**,
  com o estado real da unidade — **vermelho = pendente**, **verde = OK**. Cada
  botão abre a configuração daquela filial diretamente (`UNIT_CONFIGURATOR` e
  `CAMPAIGN_MANAGEMENT`, com `unitName` em parâmetro).
- **O toque do ADMIN/MASTER resolve a pendência:** numa unidade "AGUARDANDO
  LIBERAÇÃO", tocar no cartão abre direto o que falta — a âncora quando ela
  ainda não existe e a campanha quando a âncora já está fixada (e vice-versa).
  O formulário intermediário da UNIDADE OPERACIONAL deixa de ser etapa.
- **Unidade liberada continua sendo escolha, não navegação:** com âncora e
  campanha OK, o toque no cartão — de qualquer perfil — só marca a filial,
  preservando a trilha filial → módulo → "Acessar o Módulo".

### Acesso padronizado — biometria obrigatória com fallback declarado (Fase 2)

- **A etapa deixou de desaparecer em silêncio:** o passo biométrico só abria
  quando o aparelho anunciava autenticador de plataforma; no WebView do app
  nativo ele era simplesmente saltado. Agora a política
  (`resolveBiometricStep`, em `src/utils/biometricPolicy.ts`) decide entre
  `register`, `fallback` e `proceed`, e o pós-login abre a tela em todos os
  casos não resolvidos.
- **Obrigatória onde é verificável:** aparelho com WebAuthn de plataforma e sem
  credencial deste utilizador → cadastro obrigatório, **sem "Pular por
  enquanto"** (`BiometricRegistration` no modo `required`). Só o perfil `DEMO`
  está isento.
- **Fallback explícito e auditado:** WebView/Capacitor e hardware sem
  autenticador → tela de dispensa com o motivo escrito e confirmação em
  "Continuar sem biometria neste aparelho"; a dispensa é registada em
  `audit_logs` como `BIOMETRIC_FALLBACK` (o cadastro concluído regista
  `BIOMETRIC_REGISTER`). Nenhum avanço silencioso e nenhum beco sem saída: se o
  suporte cair depois da decisão, a tela degrada para o fallback.
- **Dispensa por sessão:** vale para o login atual (reabrir o login não repete a
  pergunta), volta a ser exigida na sessão seguinte e é reposta ao trocar de
  utilizador no mesmo aparelho.
- **Falha do cadastro não prende:** no modo obrigatório, quando o registo falha
  (recusa do sensor, tempo esgotado), a tela oferece **"Tentar novamente"** e uma
  saída explícita — "Continuar sem biometria neste aparelho" — que grava
  `BIOMETRIC_FALLBACK` com o motivo `registration-failed`. Antes deste ajuste o
  utilizador ficava sem qualquer botão depois do erro.
- **Testes:** `biometricPolicy` (matriz de decisão) e
  `biometricRegistrationFallback` (tela sem "Pular", fallback explícito e
  conclusão do cadastro).

### Acesso padronizado — biometria nativa no APK (Fase 2b)

- **O WebView deixou de ser um beco:** o cadastro e o login biométrico no app
  nativo passam pelo plugin `@aparajita/capacitor-biometric-auth@8.0.2` (linha
  do Capacitor 6), em vez de depender do WebAuthn — que o WebView do Android não
  expõe ao autenticador.
- **A política pergunta antes de decidir:** `resolveBiometricStep` recebe
  `nativeBiometry` (`available` / `unavailable` / `unknown`). Disponível →
  cadastro nativo obrigatório; indisponível → fallback com motivo de hardware;
  sem resposta (plugin ausente ou falhou) → fallback do WebView. Nenhum suporte
  é presumido.
- **A marca pertence ao casco:** a credencial nativa grava `method: 'native'` e
  só autentica no app; no navegador continua a WebAuthn (`method: 'webauthn'`,
  ou credenciais antigas sem `method`). O prompt do sistema confirma o registo
  antes de a marca ser gravada.
- **Login com biometria no APK:** `Login`/`LoginFlow` deixam de esconder o botão
  quando o WebAuthn não existe; a verificação de suporte passa a consultar o
  plugin no casco nativo.
- **Testes:** `biometricNativeService` (plugin disponível, indisponível, falha,
  registo, recusa e autenticação) e a matriz de `biometricPolicy` alargada aos
  três estados nativos.

### Acesso padronizado — biometria → contrato → SaaS (Fase 1)

- **O contrato deixa de ser saltado:** a última escolha (`app_last_work_context`)
  já não navega direto para o hub no pós-login. Passa a abrir o seletor de
  contrato com contrato, filial e módulo pré-selecionados e só avança quando o
  utilizador confirma em "Acessar o Módulo" (`resolveWorkContextPreselection`).
- **INVENTARIADOR exige filial:** o botão de acesso fica bloqueado enquanto não
  houver filial escolhida, com o motivo escrito; CONTROLE DE ATIVO continua a
  entrar sem filial. Evita o vaivém `/unit` ↔ `/contexto` do auditor quando o
  contrato ainda não tem filiais na base (`canConfirmWorkContext`).
- **Hub exige contexto ativo:** `MAIN_MENU` ("Auditoria Inteligente", `#/menu`)
  devolve ao contrato quando não há unidade ativa
  (`shouldReturnHubToWorkContext`), exceto nos painéis de governança abertos a
  partir do contrato com `openPanel`.
- **Testes:** `accessFlowStandardization` cobre a pré-seleção (incluindo escolha
  revogada e módulo proibido ao auditor), a exigência de filial e o gate do hub.

### Cadastro de acessos — filiais do contrato lidas também da nuvem

- **Lista de filiais sem beco sem saída:** o modal de novo/editar acesso só
  lia as filiais da base local em disco e mostrava "nenhuma filial na base"
  mesmo quando o contrato tem filiais publicadas na nuvem (aparelho novo, base
  ainda não baixada). O modal passa a consultar `fetchUnitNamesFromCloud` (só a
  coluna `filial`, sem baixar ativos) e a fundir as filiais da nuvem com a base
  local e as unidades já atribuídas a perfis do contrato.
- **Mensagem honesta:** enquanto a consulta corre a lista indica "A procurar
  filiais na nuvem..." e o vazio passa a dizer "Nenhuma filial encontrada",
  em vez de afirmar que não existe filial na base.

### Poda de papéis RBAC — GESTOR excluído, AUXILIARY_AUDITOR fundido em AUDITOR

- **Papéis vivos:** `ADMIN`, `MASTER`, `AUDITOR` e `USER`, mais os fluxos de
  licença `DEMO`/`MOBILE_SINGLE`. `GESTOR` (nunca atribuível, só tratado por
  comparação de string) e `AUXILIARY_AUDITOR` saem do enum `UserRole` e do
  seletor da tela de Acessos.
- **Sem perda de acesso:** `docs/supabase_migracao_papeis_legados.sql` remapeia
  `GESTOR → ADMIN` e `AUXILIARY_AUDITOR → AUDITOR` em `user_permissions`; o
  cliente lê a grafia legada `AUXILIARY_AUDITOR` como `AUDITOR`
  (`src/utils/roles.ts`) até o dispositivo sincronizar.
- **Gates inline:** GPS/geocerca, filiais e rotas deixam de listar papéis por
  string e passam por `canonicalRole`/`isFieldAuditorRole`.
- **Testes:** matriz RBAC, escopo de unidades e contexto de trabalho atualizados
  — o papel legado continua a ser lido como auditor e `GESTOR` já não concede
  governança.

### Carga sem perda de registos e campanha como chave de controlo da filial

- **Carga literal e reconciliada:** a planilha entra copiada campo a campo
  (`_sourceRow`), com datas/valores também tipados, e a carga termina exigindo
  `planilha N = base N` por filial — se uma chave repetida substituir outra linha,
  a carga bloqueia em vez de reportar sucesso.
- **Identidade interna do ativo (Fase 2):** `primarykey`/`id` passam a ser uma
  chave interna derivada (chave de origem única → chave canónica; chave repetida →
  derivada de chave + conteúdo), com a `primarykey` da planilha preservada em
  `source_primarykey` e a proveniência em `source_row`/`import_batch`. Nenhuma
  linha é descartada e reimportar o mesmo arquivo não duplica nem perde registos.
- **Campanha = controlo do inventário (Fase 1):** campanha exige filial, só uma
  campanha aberta (`CREATED`/`ACTIVE`) por filial e por contrato — campanha sem
  `tenantid` não bloqueia a de outro contrato —, e campanha com ativos lidos não
  pode ser excluída. A guarda corre nos serviços (vale offline) e o SQL ganhou
  `CHECK` de filial e índice único parcial na migração da Fase 1.

### Remoção da integração Gemini (código morto e chave exposta ao cliente)

- Saem o serviço de IA, o assistente, o modal de chat e o cartão de insight (este
  último sem uso), junto com a dependência `@google/genai` e o selo «AI» do cabeçalho
  que lia a chave da IA no cliente.
- A chave sai do `.env.example`, do `metadata.json` (`majorCapabilities`) e da
  documentação (README, ARCHITECTURE, SPEC, GOVERNANCA); o painel de desempenho global
  deixa de pedir insights por IA. Os tokens `ai-start`/`ai-end` e a classe
  `.ai-gradient` saem do `index.css` por ficarem sem consumidores.

### Muro multi-tenant ponta a ponta — isolamento por `tenantid` (usuário × contrato)

Fechamento do muro de isolamento entre contratos no local e na nuvem, com login
estritamente amarrado ao contrato do usuário (sem "GLOBAL").

- **Chave composta local `[tenantid+primarykey]`** — migração Dexie v6→v7 em 2 passos
  (v6: DROP + backup integral; v7: RECREATE + restauração), preservando 100% dos
  registros; `primarykey` vira índice. Dois contratos com a mesma chave de origem
  coexistem sem colidir. Guard `filterCrossTenantWrites` bloqueia sobrescritas legadas.
- **Nuvem:** upsert escopado `onConflict('tenantid, id')` no `syncAssetsToCloud` + índice
  único composto no `docs/supabase_bootstrap.sql`; sanitização das cargas misturadas
  (CICOPAL × CLIENTETESTE) local e nuvem.
- **Login por contrato:** perfil do dono amarrado ao `tenantid` (semorr → CICOPAL) no
  `user_permissions` + metadata do auth; Barreira Local bloqueia admin/master sem
  contrato (resolve na nuvem antes); sync do dono não puxa mais todos os contratos.
- **RBAC:** `services/rbacService.ts` + `PermissionGate` nos submenus administrativos e
  de auditoria; matriz documentada em `docs/RBAC_GOVERNANCA.md`.
- **Provisionamento de licença:** `LicenseProvisioning` + `tenantProvisioningService` +
  `passwordPolicy` (senha forte validada) — criação de MASTER amarrado ao tenant; correção
  do erro 500 do signUp (`docs/supabase_signup_500_correcao.sql`).
- **Histórico de cargas:** `LoadHistoryScreen` (import/sync por contrato a partir do
  `audit_logs`); tool grid (AJUSTES/DADOS/PAINEL/AUDITORIA) movida para a tela de
  Unidade Operacional (`UnitSelector`) com navegação por painel via `NavigationParams.openPanel`.
- **Testes:** 295/295 (30 arquivos) — baseline do schema atualizado para `verno 7`;
  novos: `rbacService`, `tenantProvisioning`, `passwordPolicy`, `workContextUtils`,
  `routingTenantIsolation`, `postSelectionRouting`, `tenantContext`, `loadHistoryUtils`,
  `countAtivosByTenant`. Gate: `tsc -b --noEmit` ✓ · `vitest run` 295/295 ✓.

### Fase C — Padronização canônica de chaves/valores (UPPER → minúsculo)

Higienização completa do ecossistema para o canônico minúsculo (`endereco`, `etiqueta`, …),
eliminando a dupla grafia estrutural (D1) e a normalização assimétrica (D2) — sem DDL no
Supabase `public` (26/26 colunas canônicas) e com risco zero de perda de dados.

- **C1–C3:** helpers de normalização por classe (K/T/N/D/F) + `CANONICAL_KEY_MAP` + loader M1
  (3 caminhos) + coerções N/D/F (`normalizeNumeric`/`normalizeDateISO`/`normalizeFlag`).
- **M2:** varredura de ~700 chaves UPPER → canônico em ~40 arquivos (serviços, componentes, sync).
- **C4:** migração Dexie `version(5)` idempotente (`src/services/migrationV5.ts`) — reescreve
  chaves UPPER e normaliza valores com dry-run, flag `NORMALIZE_ON_UPGRADE` e reconcile
  aditivo de `addresses`; sync Supabase alinhado (`mapColumnName` verificado).
- **C5:** remoção da tolerância híbrida (leituras diretas canônicas), do bloco de fallback
  UPPER de escrita (`utils/schema.ts`) e varredura final (`pickCanonical` restrito a payloads
  não migrados: migração v5 e QR público).
- **Fixes SRE:** `findByEtiquetaInUnit` (ramo composto do `where()` agora filtra em memória)
  e `.eq('TAG_INVENTARIO')` realinhado ao contrato do `public` (`fetchCampaignStats`).
- **Testes:** 185 (novos `migrationV5`, `assetRepository.where`; baseline `schemaBaseline`
  atualizado para verno 5). Gate: `tsc -b --noEmit` ✓ · `vitest run` 185/185 ✓.

## [2.8.0] — 2026-11-17

### Versionador único: a versão do app em todas as telas, lida do `package.json`

- **Fonte única:** `utils/appVersion.ts` expõe `APP_VERSION`,
  `APP_VERSION_LABEL` (`v2.8.0`) e `APP_VERSION_STAMP` (`GBR v2.8.0`) a partir do
  `package.json` — o mesmo número que o APK (`android-build.yml`) e o protocolo
  do SRE usam. `sreProtocol` passa a importar daqui; um bump de versão atualiza
  todas as telas de uma vez, sem cópia paralela.
- **Selo global automático:** `AppVersionStamp` é montado no router e aparece em
  todas as telas, no mesmo formato e na mesma posição, sem interceptar toques e
  sem ficar por cima dos modais (z-index abaixo de `z-[20000]`). Quando a tela
  tem barra de ação fixa no rodapé (configuradores, seletores, detalhe do ativo),
  o selo sobe acima dela — deixa de cobrir o botão `Aplicar`.
- **Telas ligadas ao versionador:** `App`, `Login`, `Consultation` e o Gestor de
  Base deixam de importar o `package.json` directamente e passam a ler a versão
  (e a etiqueta) de `utils/appVersion`, incluindo o cabeçalho do pacote de
  diagnóstico.
- **Versões chumbadas removidas:** `Protocolo v24.40`, `Field Guard v24.40`,
  `Aplicar v24.40`, `QR Guard v24.40`, `v24.50.2`, `KARDEX DIGITAL v24.50.3`,
  `GBR Auditoria Patrimonial v24.50 Expert`, `Protocolo de Inventário GBR v24`
  (PDF de assinatura), o Manual do Sistema (`v2.6` e `24.50.03`) e as legendas do
  centro de privacidade e da paleta passam a mostrar a versão do build.

## [2.7.9] — 2026-11-17

### Exportações do Gestor de Base deixam de mostrar o tenantid cru

- **Relatório de recno (CSV):** a coluna `tenantid` sai mascarada (`CICOPAL` →
  `CI***`), como já acontecia no pacote de diagnóstico; filial, recno, etiqueta e
  valor continuam legíveis para a conferência no Protheus.
- **Relatório de cópias (`[DEDUP]`):** a identidade do exemplo
  (`tenantid|filial|etiqueta`) leva o mesmo tratamento — o contrato sai mascarado
  e filial/etiqueta ficam legíveis para dizer qual caminho gravou a cópia.
- **`redactTenantId` em `utils/diagnosticRedaction`:** a máscara de um
  identificador isolado (coluna de CSV, chave de relatório) passa a ter função
  própria, com a normalização da base (trim + maiúsculas).
- **Prova disto mesmo:** a linha de base F0 continua a ser JSON válido depois de
  redigida (`tenantid` → `CI***`, restantes campos intactos) e o CSV de recno tem
  teste a exigir `CI***` na coluna do contrato.

## [2.7.8] — 2026-11-17

### Relatório de cópias deixa de contar linhas sem etiqueta como identidades

- **Duas contas no `[DEDUP]`:** o diagnóstico do Gestor de Base passa a mostrar
  `identidades distintas` (`tenantid + filial + etiqueta`) numa linha e, noutra,
  as `linhas sem etiqueta`, que ficam fora do agrupamento e entram uma a uma na
  projeção de linhas. Antes o total de linhas (11 832) era apresentado como se
  todas fossem identidades — são 11 437 identidades + 395 sem etiqueta.
- **Sem alteração de dados:** continua a ser leitura pura; nenhum registo é
  apagado e a contagem de cópias não muda.

## [2.7.7] — 2026-11-17

### Protocolo SRE com versão fixa e placar das duas bases

- **Versão na primeira linha:** o Gestor de Base de Dados abre com
  `INVENTARIADOR v2.7.7 · SRE · GESTOR DE BASE DE DADOS` na tela e no terminal
  SRE; a mesma linha vai à frente do log copiado e do pacote de diagnóstico
  exportado, para que chat e ticket identifiquem sempre o build.
- **Placar LOCAL × SUPABASE (online):** um cartão mostra o total de registos do
  contrato no aparelho e o total lido agora na tabela `assets` da Nuvem
  (`count: exact`, só leitura), com estado `ONLINE`/`OFFLINE`/`NÃO CONFIGURADO`.
  O botão `ATUALIZAR` repete a consulta; nada é enviado, alterado ou apagado, e
  os dois totais seguem também no log copiado e no pacote `.md`.

## [2.7.6] — 2026-11-17

### Envio à nuvem deixa de recusar etiquetas repetidas da planilha

- **Guarda por registo, não por identidade:** a tabela `assets` guarda uma linha
  por `(tenantid, primarykey)`. Duas linhas da planilha com a mesma etiqueta
  (`tenantid + filial + etiqueta`) são registos distintos e passam a subir as
  duas; o bloqueio fica reservado ao MESMO registo repetido no payload, que o
  upsert por `(tenantid, id)` não consegue gravar (ON CONFLICT ... cannot affect
  row a second time).
- **Identidade repetida vira diagnóstico:** o Gestor de Base continua a mostrar
  quantas linhas partilham a etiqueta e o terminal avisa uma vez, mas o envio
  segue — exigir "limpar cópias" era pedir para apagar registos.
- **Identidade já presente na nuvem com outro `primarykey`** deixa de recusar o
  lote (passa a aviso): a segunda linha legítima da planilha chegava depois da
  primeira e ficava bloqueada.

## [2.7.5] — 2026-11-16

### Summary

Correção da âncora da unidade operacional e da posição dos ativos. APK de campo
`gbr-kardek-v2.7.5-20261116.apk` (release `v2.7.5`, commit `8c09673`), assinado com a
chave fixa de `keystore/debug.keystore` — instala por cima do 2.7.4 sem desinstalar.

### GPS: a posição do ativo deixou de ser inventada

- `FIXAR ÂNCORA GPS` configura a **unidade**; a âncora não é copiada para os ativos.
- Bypass administrativo/offline deixou de gravar a âncora da unidade no ativo e de
  anunciar "POSIÇÃO FIXADA!" sem leitura real.
- `UnitConfigurator` abre sem coordenada (Brasília fica como centro visual do mapa).
- Portão único `persistableAssetGps` recusa bypass/âncora/zero/NaN antes de gravar GPS;
  o administrador lê o sensor como qualquer operador.
- A linha global do `inventory_config` já não zera a âncora da filial.

### Âncoras apagadas na nuvem não voltam pelo cache do aparelho

- `src/utils/revokedAnchors.ts` revoga **MATRIZ** e **010101 CICOPAL GO** pela chave
  *unidade + coordenada exacta* (tolerância 1e-6).
- `fetchUnitConfigs` filtra as revogadas e limpa o `local_unit_configs`;
  `collectGpsAnchorsFromStorage` ignora-as; `saveUnitConfig` recusa a coordenada revogada.
- Reposicionar a filial noutro ponto grava normalmente.

### `unit_configs` é a fonte canônica da âncora

- A linha de `unit_configs` vence o `inventory_config` quando tem coordenada real; o
  `inventory_config` fica como compatibilidade de leitura para APKs antigos.
- `saveUnitConfigFlags` deixou de escrever `lat: 0` numa gravação só de flags.

### Infra

- `versionCode` 20705.
- Removido o `android-build.yml` duplicado dentro do app (ignorado pelo GitHub, disparava
  APK em cada push); o workflow real continua sob demanda (Run workflow, tag `v*`, `/apk`).

### Gates

- `lint` · `tsc --noEmit` · `npm test` (88 ficheiros, 840 testes) · `npm run build` ·
  `check-docs` · `verify:governanca` — todos verdes.

## [2.7.4] — 2026-11-12

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

Fecha a contagem lenta das unidades, devolve a conferência à fila da nuvem, permite escolher
a âncora no mapa por clique/arrasto e sanea o espelho local de ativos.

### Unidades e conferência

- #50–#52 — contagem de ativos por unidade numa só passagem; lista de filiais presa ao
  utilizador e ao contrato; carga inicial exige a filial e nunca baixa o contrato inteiro.
- `_is_synced` zerado no ponto único de gravação; delta aceita o checkpoint do contrato como piso da filial; o selo
  "Sincronizado" só aparece em ativo conferido.
- Envio da conferência do aparelho religado ao Supabase; variações do rótulo da unidade
  aceitas e descarte de pendentes auditado.

### Inventário

- Rótulo `RAD` único por unidade e aparelho, com contador; registro adotado ganha identidade
  `rad_NNNNNN` e `subreg`.
- Cópia para item novo usa lista branca e `rad_recno`; "não localizado" copia os dados em vez
  de adotar outra unidade.
- Lote por plaqueta ou registro num só modal; lote manual renomeado para seleção manual e
  passa a exigir endereço.
- Módulo INVENTARIADOR travado em unidade não liberada.

### Base e ativos

- Chave canônica única em todos os caminhos de escrita, com guardião suave de duplicidade por
  `sn1_recno` do Protheus.
- Limpeza de cópias repetidas por contrato, filial e etiqueta, com registro em auditoria e
  recálculo da unidade.
- Gestor de Base: relatório de recno separado e exportação em CSV.

### Mapa e GPS

- #58 e #59 — âncora escolhida por clique e arrasto no mapa.

### Modo de base e campanhas

- Um único `getDatabaseMode` como resolver do modo, usado por campanhas, snapshots, fila de
  fotos e `updateCampaignStatus`.
- Exclusão de campanha deixa de "não fazer nada" e a permissão fica unificada no cartão e na
  ficha; laudo sempre gravado no aparelho, com leitura de fallback local.

## [2.7.3] — 2026-11-09

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

Ficha do ativo, etiquetagem e tags de auditoria; cabeçalho do inventário com telemetria;
sincronização em lotes paralelos.

- `#32` — liberação da unidade lê a campanha do banco persistido.
- `#33`/`#34` — documentação: migração das colunas de `tenant` para `tenantid` e fluxograma do
  login na nuvem e download da base.
- `#35`/`#36` — tags de auditoria, lista dos ativos do endereço, ficha do ativo consolidada e
  etiquetagem.
- `#37` — ativo localizado pela busca de patrimônio.
- `#38` — painel único de preferências do inventário.
- `#39` — busca por foto removida (sem assets de OCR).
- `#40`–`#43` — telemetria no cabeçalho em marquee, endereço numa linha, confirmação em barra
  na base do card e endereço/progresso acima da barra de busca.
- `#44` — sincronização em lotes paralelos, com a fila de nuvem fora do caminho visual.
- `#45`/`#46` — espelhamento adaptado ao `id` uuid do schema remoto; Gestor de Base conta os
  três espelhos locais e limpa o espelho virtual.
- `#47` — correções da unidade operacional, da configuração e do APK.
- `#48` — conferência em lote volta a ficar pendente de nuvem até subir.
- `#49` — testes do `syncConfigToCloud` deixam de depender das credenciais do ambiente.

## [2.7.2] — 2026-11-08

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

O build do APK passa a falhar em vez de publicar um APK inútil.

- `#29` — o build falha quando a URL do Supabase é inutilizável.
- `#30` — o build falha quando a credencial não fica embutida no APK.
- `#31` — versão para 2.7.2.

## [2.7.1] — 2026-11-08

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

Contrato de trabalho único (base, filial, auditor) e assinatura estável do APK.

- `#19` — o contrato vem da base e libera o dono global.
- `#20` — carga de planilha passa a operar na base local.
- `#21` — saída para o Gestor de Base quando não há contrato.
- `#22` — coluna `filial` exibida exactamente como veio da planilha.
- `#23` — auditor criado com contrato e filial, mantendo a sessão.
- `#24`/`#26`/`#27` — a mesma chave de assinatura em todos os builds: keystore criado antes do
  build, fixo e verificado (sem ele o Android recusa a instalação por cima).
- `#28` — contrato de trabalho único, liberação por âncora/campanha e admin; sobe a versão
  para 2.7.1.

## [2.7.0] — 2026-11-08

> Entrada reconstruída a partir dos squashes em `main`. Foi a primeira versão 2.7 e a única
> da série com tag e release até à 2.7.5.

### Summary

Primeira versão da série 2.7: CI e APK confiáveis, boot e autenticação estáveis, e a
documentação de arquitetura que os builds seguintes usaram. O período entre a 2.6.0 e esta
versão tem 137 commits, boa parte aplicada directamente em `main` — os PRs abaixo são os que
ficaram registados como squash.

- `#9` — admin email e URL do Supabase no workflow.
- `#11` — `AGENTS.md` com a regra de entrega no GitHub.
- `#12`/`#15` — correcção dos nomes e da sintaxe de secrets nos workflows.
- `#13` — o APK deixa de crashar quando a URL do Supabase está malformada.
- `#14` — chip CAMPANHA ao activar em modo offline.
- `#16` — documentação do fluxo build-time até `isInternalMode`.
- `#17` — o build falha quando faltam as credenciais do Supabase.
- `#18` — versão para 2.7.0.
- Trabalho directo em `main` no mesmo período: hardening do workflow Android (Java 21 e
  Gradle 8.11), remoção do `android-build.yml` duplicado dentro do app (`c6e0198`), auto-flush
  no `useBufferController` e correcções de boot/login/imports.

## [2.6.0] — 2026-07-24

### Summary

Major stability release focusing on mobile boot reliability, authentication overhaul with MASTER DRIVE bypass, CI/CD pipeline with automated APK builds, and Dexie.js offline-first persistence.

### Highlights

#### 🚀 MASTER DRIVE — Super Admin Bypass

Users can now authenticate offline with the sovereign credential `Glaucio@1970` / `admin`, bypassing all local validation, SQLite, and Supabase checks. The bypass injects `gbr_admin_scope: GLOBAL_SUPER_ADMIN` and routes directly to the database manager screen.

- Fast credential check at the top of `handleSubmit` — early return guaranteed
- Session cleanup via `sessionStorage.clear()` before injecting admin scope
- `tenantId` set to `GBR_SUPER_ADMIN_CORINGA` for ecosystem-wide access
- Email `semorr@gmail.com` included in the master user profile for post-login routing

#### 🛡️ Boot Stability — No More Black Screen

Three-layer defense against black screen on mobile:

1. **Module-level `InitializeBootPipeline` removed** — previously removed the loader before React mounted. Now runs inside `useEffect` after React is safely mounted
2. **Global try/catch in `index.tsx`** — wraps `createRoot().render()` with a DOM fallback that shows the error and a "REINICIAR APP" button
3. **Init timeout reduced from 35s to 6s** — forces `setIsInitializing(false)` after 6 seconds, guaranteeing the login screen appears even if SQLite hangs

#### 🔐 Offline-First Authentication

Three-tier authentication pipeline:

1. **MASTER DRIVE** (sovereign bypass — `Glaucio@1970` / `admin`)
2. **Dexie.js / localforage lookup** (`localDb.users.get({ email })`) — searches persisted user profiles for offline login
3. **Supabase Cloud Auth** — falls through to cloud with network error detection; successfully authenticated cloud users are persisted locally for future offline access

#### 📱 PWA & CI/CD Improvements

- Android APK workflow with Gradle 8.11.1 and JDK 21
- Explicit Cache scoping to `Inventariador-main/` subdirectory
- PWA precache reconfigured: removed `.wasm` from glob to fix conflicting cache entries
- Service Worker now generates 23 precache entries (down from 24)
- Logo placeholder created in `/public/logo.png` to resolve manifest icon 404

### Features

- `feat(auth)`: MASTER DRIVE — sovereign credential bypass with GLOBAL_SUPER_ADMIN scope ([7d2975c])
- `feat(storage)`: `navigator.storage.persist()` — prevents OS from clearing IndexedDB ([c23b468])
- `feat(persistence)`: Dexie offline-first fallback across Dashboard, Consultation, AssetMap, AssetDetail ([fb1a4d1])
- `feat(ux)`: Loading skeleton states while Dexie queries run ([8d31465])
- `feat(ci)`: Android APK build workflow with dynamic versioning and caching ([8a0a5cc])

### Bug Fixes

- `fix(boot)`: Removed module-level `InitializeBootPipeline()` that removed loader before React mount ([f18a669])
- `fix(boot)`: Added global try/catch in `index.tsx` with DOM error fallback ([f18a669])
- `fix(boot)`: Reduced initialization timeout from 35s to 6s to guarantee login screen ([e7a2dee])
- `fix(boot)`: Fixed black screen after MASTER DRIVE — `LOAD_DATABASE` not in enum, replaced with `DATABASE_MANAGER` ([b54f954])
- `fix(boot)`: Added `.catch(() => 0)` to `countAtivos()` for fresh-install SQLite edge case ([4585782])
- `fix(auth)`: MASTER DRIVE credential changed from `semorr@gmail.com` to `Glaucio@1970` ([ee36aa2])
- `fix(auth)`: Added `email` field to masterUser for post-login routing ([f93d658])
- `fix(auth)`: Added validation console.log at start of `handleSubmit` for mobile diagnostics ([2baff0f])
- `fix(nav)`: Added `/auditor/selecionar-filial` to path mapping ([92a6dc9])
- `fix(ui)`: Replaced hardcoded `VERSÃO 2.6` with dynamic `pkg.version` ([c480ba1])
- `fix(ci)`: Upgraded JDK 17→21 and Gradle 8.11.1 for `bcprov-jdk18on` compatibility ([3d4662d])
- `fix(ci)`: Scoped Cache and Upload paths to `Inventariador-main/` subdirectory ([a92aadf])
- `fix(build)`: Fixed Motion imports for ESM compatibility ([d4517fe])
- `fix(pwa)`: Removed `.wasm` from glob patterns to fix conflicting cache entries ([2baff0f])
- `fix(cleanup)`: Removed ~48 lines of dead commented code (iFrame session injection) from App.tsx ([546eb96])
- `fix(observability)`: Replaced `console.error` with `logger.error` in InitializeBootPipeline for proper error capture in Capacitor WebView ([c508eee])

### Code Cleanup

- `refactor(login)`: Eliminated duplicated `normalizedUsername` declaration — outer scope variable used via closure ([d11b804])
- `chore(docs)`: Upgraded CHANGELOG to Keep a Changelog format ([0cd1a3a])

### Chores

- `chore(ci)`: Force-trigger build workflow ([8428dfb])
- `chore(ci)`: Remove stale nested workflow to avoid duplicates ([c6e0198])

### Dependencies Updated

| Package | From → To | Reason |
|---------|-----------|--------|
| `motion` | 10.16.4 → 11.11.17 | ESM import compatibility |
| `vite-plugin-pwa` | 0.17.4 → 0.19.0 | PWA generation fixes |
| `@capacitor-community/sqlite` | 5.x → 6.x | Native SQLite stability |
| `vite` | 5.0.11 → 5.1.4 | Build toolchain |

### Known Issues

- `logo.png` is a placeholder 1x1 red pixel — needs a proper 192x192 logo for PWA icons
- `sessionStorage.clear()` in MASTER DRIVE is aggressive — may remove boot flags set by other modules
- App may load slowly on first install due to IndexedDB initialization

### Upgrade Guide

1. Update to the latest APK from GitHub Actions
2. Login with the new sovereign credential: `Glaucio@1970` / `admin`
3. If experiencing black screen, wait up to 6 seconds for the forced login render
4. Clear browser/WebView cache if Service Worker conflict errors appear

[2.6.0]: https://github.com/semorrecualg/Inventariador/compare/f93d658...d11b804
