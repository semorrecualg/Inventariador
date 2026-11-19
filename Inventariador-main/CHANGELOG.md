# Changelog

All notable changes to the GBR KARDEK Inventariador project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
