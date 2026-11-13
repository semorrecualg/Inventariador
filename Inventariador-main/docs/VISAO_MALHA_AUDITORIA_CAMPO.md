# Visão — Malha de Auditoria de Campo

> Documento de **proposta**. Não descreve o que já está implementado; descreve o que
> falta para o app ser 100% confiável em modo avião e para vários auditores
> convergirem sem perder evidência. Nada aqui foi codificado ainda.
>
> Estado atual do app: `docs/ARCHITECTURE.md` § 7 e `docs/FLUXO_ACESSO_INICIAL.md`
> (Etapa 5b — delta sync).

---

## 1. O problema real

O app já é "offline-first" no discurso e, em boa parte, na prática: grava em
Dexie/IndexedDB, tem fila de fotos, tem `_is_synced`, tem delta com checkpoint e
escuta o evento `online` para disparar sincronização.

Mas o cenário que decide a compra — **três auditores num galpão, sem sinal, o dia
inteiro, e depois todos voltam para a rede** — hoje tem três furos:

| Furo | Consequência prática |
|---|---|
| Conflito não tem regra escrita | Dois aparelhos leem o mesmo ativo em locais diferentes; o "último que sincronizou" ganha em silêncio e a outra leitura desaparece. |
| Não existe "posse" de território | Dois auditores auditam o mesmo corredor sem saber; retrabalho e leituras duplicadas. |
| Reconexão não é um acordo | O app envia e baixa, mas não existe recibo dos dois lados, nem retomada segura se a conexão cair no meio do envio. |

Some-se a isso: hoje a mesma informação mora em três tabelas locais
(`local_assets`, `ativos`, `assets`), o que multiplica a chance de divergirem
entre si.

O que os concorrentes entregam é "cache offline + última escrita vence". É aí que
está a oportunidade.

---

## 2. A tese

> **O ativo não é o dado principal. O evento de campo é.**

Todo o resto — status do ativo, percentual conferido, divergência, relatório —
passa a ser **calculado** a partir de uma sequência de eventos imutáveis que o
auditor produziu no celular, com hora lógica, GPS, aparelho e assinatura.

Isso muda três coisas de uma vez:

1. **Nada é sobrescrito.** Duas leituras do mesmo ativo coexistem como dois
   eventos; o app decide o estado final por uma regra declarada e, quando a regra
   não basta, **abre um conflito para um humano decidir** — em vez de apagar
   evidência.
2. **Convergência é determinística.** Qualquer aparelho, recebendo o mesmo
   conjunto de eventos, chega ao mesmo resultado. Não importa a ordem de chegada
   na rede. Isso é o que permite "todos na mesma página" de verdade.
3. **Auditoria vira produto.** O log de eventos é a prova: quem leu, onde, quando,
   em qual aparelho, com qual foto e assinatura. É o que uma auditoria externa
   pede e o que quase nenhum app de inventário entrega.

Nome que proponho para o conceito: **Malha de Auditoria de Campo** — cada celular
é um nó da malha, cada território tem um dono temporário, e a reconexão é um
acordo assinado entre os nós.

---

## 3. Os seis pilares

### Pilar 1 — Território com posse (claim)

A unidade de trabalho deixa de ser o ativo e passa a ser o **território**: um
`endereco`/`setor`/`bloco` (o que já existe em `addresses` e em
`getLocationsWithStats`).

- O auditor "assume" um território no celular, **sem rede**. O app grava um
  `claim` local com prazo (lease) de, por padrão, 12 horas.
- Ao reconectar, os claims se encontram: território livre → fica de quem chegou
  primeiro (hora lógica + `device_id` como desempate); território já tomado →
  aparece como "em posse de Fulano" e o app **não** deixa começar uma segunda
  contagem, só consultar.
- Claim vencido (o colega foi embora, o celular descarregou) volta a ficar livre —
  com registro no histórico. Sem isso, um aparelho perdido travaria a operação.
- O gestor pode **transferir posse** pelo painel web, e a transferência desce no
  próximo sync como um evento.

### Pilar 2 — Log de eventos imutável

Cada ação de campo vira um evento só-adição (`field_events`):

| Evento | Significado |
|---|---|
| `LEITURA` | ativo conferido no local (com GPS e hora do aparelho) |
| `DIVERGENCIA` | encontrado em local diferente / sobra / falta |
| `ETIQUETA` | etiqueta trocada ou aplicada |
| `FOTO` | evidência fotográfica anexada |
| `ASSINATURA` | aceite do responsável da unidade |
| `POSSE` | claim, renovação, liberação ou transferência de território |
| `CORRECAO` | ajuste de cadastro pelo auditor (campo, valor antigo, valor novo) |

Cada evento carrega: `event_id` (UUID), `device_id`, `auditor`, `tenantid`,
`filial`, `territory_key`, `asset_key`, `lamport` (contador lógico do aparelho),
`occurred_at` (hora local), `received_at` (hora do servidor), `payload` e
`prev_hash` (encadeamento de hash por aparelho).

O encadeamento de hash é o que impede edição retroativa: se alguém alterar um
evento no meio, a cadeia quebra e o app denuncia.

### Pilar 3 — Reconstrução de estado (projeção)

O status do ativo deixa de ser escrito à mão e passa a ser **projetado**:

```
estado(ativo) = reduzir(eventos do ativo, por ordem determinística)
ordem = (lamport, device_id, event_id)
```

A projeção roda localmente no celular e no servidor, com o **mesmo código**
(`src/services/fieldProjection.ts`, novo), para que os dois lados nunca
discordem. Campos derivados: `_conferido`, `_auditor`, `_dataLeitura`,
`_localMaster`, `gps_lat/lng`, `_version`.

`_version` passa a ser o número de eventos aplicados ao ativo — o que dá
detecção de buraco na sequência (se o celular tem a versão 7 e o servidor a 9,
faltam dois eventos).

### Pilar 4 — Sessão de sincronização com recibo dos dois lados

A reconexão deixa de ser "empurra e puxa" e vira uma **transação com recibo**:

```
1. ABRIR    → servidor devolve: checkpoint do território + último evento conhecido
2. ENVIAR   → eventos pendentes em lote idempotente (event_id é a chave)
3. CONFIRMAR→ servidor devolve os event_id aceitos + os que já tinha
4. PUXAR    → eventos de outros auditores desde o checkpoint
5. APLICAR  → reconstruir estado local
6. RECIBO   → grava sync_session: enviados, aceitos, recebidos, faltantes, hash
```

Propriedades que isso garante:

- **Idempotente**: reenviar o mesmo evento não duplica nada.
- **Retomável**: caiu a conexão no lote 3 de 10? Reabre e continua do ponto.
- **Conferível**: o recibo mostra os dois lados — "enviei 412, aceitos 412; recebi
  37; meus territórios: 4; pendências: 0". É também o que o suporte usa quando o
  auditor diz "subiu tudo?".
- **Recusável com motivo**: evento rejeitado (ex.: território de outro) volta com
  razão explícita e vira item de tela, não erro genérico.

### Pilar 5 — Bússola de Retomada

Ao reconectar no meio do turno, o app abre uma tela única e curta:

> **Você parou no Bloco B — Sala 12.**
> 3 leituras ainda no aparelho · território em sua posse até 18:40
> O Bloco C foi concluído por M. Silva enquanto você estava offline
> **2 conflitos precisam da sua decisão** · 1 etiqueta pendente de foto

Isso responde exatamente ao "verifique o estágio que o auditor está, os itens em
sua posse". É o inverso do "sincronizando..." genérico.

### Pilar 6 — Painel de Convergência (web)

Uma tela no ambiente web que responde "todos estão na mesma página?":

- Mapa/lista de territórios com: **posse atual**, % conferido, último heartbeat,
  conflitos abertos, tempo desde o último sync.
- **Farol de divergência**: ativos lidos por dois auditores em locais diferentes,
  lado a lado, com foto e GPS de cada leitura, e botão "decidir".
- **Selo de integridade**: hash da cadeia por aparelho, para provar que nada foi
  editado depois do fato.

---

## 4. Regras de conflito (a decisão que precisa do dono)

Proponho três camadas, nesta ordem:

1. **Não é conflito se os eventos se complementam.** Auditor A leu o ativo (local
   correto), Auditor B anexou foto: os dois aplicam.
2. **É conflito quando dois eventos disputam o mesmo campo com valores
   diferentes** (ex.: dois `LEITURA` em endereços distintos, ou duas `CORRECAO`
   no mesmo campo). Nesse caso **não há vencedor automático**: o ativo entra em
   `EM_CONFLITO`, os dois valores ficam preservados e o painel web mostra os dois
   lados para decisão humana. Enquanto não decidido, o relatório marca o ativo
   como pendente — nunca "conferido".
3. **Empate técnico no mesmo campo e mesma hora lógica**: desempate por
   `device_id` (ordem estável), marcado como `resolvido_por_regra` na trilha.

> Alternativa mais simples (se preferirmos velocidade agora): "quem tem a posse do
> território vence; o outro vira sugestão". É menos correto para auditoria, mas
> resolve 90% dos casos sem tela de decisão. **Precisa da sua escolha.**

---

## 5. Modelo de dados proposto

### 5.1 Supabase (proposta — não executar ainda)

```sql
-- Eventos de campo: só adição, nunca UPDATE/DELETE pela aplicação.
create table if not exists field_events (
  event_id      text primary key,              -- UUID gerado no aparelho
  tenantid      text not null,
  filial        text not null,
  device_id     text not null,
  auditor       text not null,
  event_type    text not null,                 -- LEITURA | DIVERGENCIA | ...
  territory_key text,
  asset_key     text,
  lamport       bigint not null,
  occurred_at   timestamptz not null,          -- hora do aparelho
  received_at   timestamptz not null default now(),
  payload       jsonb not null default '{}'::jsonb,
  prev_hash     text,
  hash          text
);
create index if not exists field_events_pull_idx
  on field_events (tenantid, filial, received_at);
create index if not exists field_events_asset_idx
  on field_events (tenantid, asset_key, lamport);

-- Posse de território (lease).
create table if not exists territory_claims (
  tenantid      text not null,
  filial        text not null,
  territory_key text not null,
  holder        text not null,
  device_id     text not null,
  claimed_at    timestamptz not null,
  expires_at    timestamptz not null,
  released_at   timestamptz,
  primary key (tenantid, filial, territory_key, holder, claimed_at)
);

-- Recibo de cada sessão de sincronização.
create table if not exists sync_sessions (
  id           uuid primary key default gen_random_uuid(),
  tenantid     text not null,
  filial       text not null,
  device_id    text not null,
  auditor      text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  sent         int default 0,
  accepted     int default 0,
  received     int default 0,
  rejected     int default 0,
  missing      int default 0,
  detail       jsonb default '{}'::jsonb
);
```

`assets` continua existindo como **projeção** (é o que os relatórios e o painel
leem hoje). A diferença é que ela passa a ser escrita **só** pelo projetor, nunca
pela tela.

### 5.2 Local (Dexie v8)

Novas tabelas: `field_events` (índices `event_id`, `[tenantid+filial]`,
`[tenantid+asset_key]`, `_synced`), `territory_claims` (`[tenantid+filial+territory_key]`)
e `sync_sessions`. Redução das três cópias de ativo a **uma**: `local_assets`
passa a ser a única tabela de estado; `ativos` e `assets` viram aliases de leitura
durante a migração e saem na versão seguinte.

---

## 6. Fases (o que fazer primeiro)

| Fase | Entrega | Critério de aceite | Esforço |
|---|---|---|---|
| **F0** | Medição: cronômetro no monitor SRE do boot, do delta e do push | Relatório com tempos reais no celular (abertura, delta, push de 500 eventos) | 1–2 dias |
| **F1** | `field_events` + projetor + gravação de LEITURA/DIVERGENCIA como evento (projeção ainda escreve em `local_assets`) | Teste de propriedade: 10 mil eventos aleatórios em ordem embaralhada produzem o mesmo estado em dois aparelhos | 1–2 semanas |
| **F2** | Sessão de sync com recibo + idempotência + retomada | Desligar a rede no meio de um lote e retomar sem duplicar nem perder; recibo bate dos dois lados | 1 semana |
| **F3** | Posse de território + Bússola de Retomada | Dois aparelhos em modo avião assumindo territórios; ao reconectar, um vê o outro e não duplica contagem | 1–2 semanas |
| **F4** | Painel de Convergência + conflitos no web | Conflito de duas leituras aparece com foto/GPS dos dois e é decidido no painel | 1–2 semanas |
| **F5** | Redução das três cópias + limpeza | Só `local_assets` ativa; migração testada em base de 12.636 ativos | 3–5 dias |

Ordem recomendada: **F0 → F2 → F1 → F3 → F4**. F2 antes de F1 porque o recibo de
sync é o que impede perda de dados durante a própria migração; a projeção de
eventos (F1) é a mudança mais profunda e pode entrar por baixo, sem trocar a tela.

---

## 7. O que não vamos fazer

- Não trocar Dexie/IndexedDB por outro banco agora: o problema é de fluxo, não de
  motor.
- Não usar sincronização em tempo real (realtime) como base da operação: em campo
  não há rede; realtime é enfeite para o painel web, não fonte de verdade.
- Não sincronizar evento por evento assim que a rede oscila: sessões em lote com
  recibo são mais baratas no 3G da fábrica.
- Não apagar histórico para "resolver" conflito.

---

## 8. Riscos e controles

| Risco | Controle |
|---|---|
| Relógio do celular errado | Hora lógica (`lamport`) + `received_at` do servidor; `occurred_at` só como informação e para detectar fraude |
| Volume de eventos crescer sem limite | Projeção + compactação: eventos acima de 90 dias viram apenas histórico; índice por `received_at` para o delta |
| Aparelho perdido/roubado com base | Lease curto, liberação automática por expiração, criptografia local, e a possibilidade de o gestor revogar o dispositivo |
| Base local corrompida no meio do turno | Caixa-preta: log de eventos append-only + backup físico já existente (`backupDatabaseToPhysicalStorage`) e verificação de hash no boot |
| Complexidade assustar o auditor | Toda a mecânica fica invisível: a tela continua sendo "bipar, conferir, próximo"; o novo aparece só na reconexão (Bússola) e nos conflitos |

---

## 9. Como isso se diferencia do mercado

| Prática comum | Neste app |
|---|---|
| Sincroniza linha a linha, última escrita vence | Eventos imutáveis com ordem determinística e conflito explícito |
| "Offline" = cache que pode ser descartado | Base local é a fonte de verdade do turno; foi feita para durar dias sem rede |
| Dois auditores se atropelam | Posse de território com prazo e transferência registrada |
| Sincronização é caixa-preta | Recibo dos dois lados por sessão, com hash |
| Relatório é a única saída | Trilha de eventos verificável, com GPS, foto, assinatura e hash encadeado |
| Retomada é "Sincronizando..." | Bússola de Retomada: onde parei, o que tenho em mãos, o que mudou, o que decidir |

---

## 10. Decisões tomadas (dono do produto) — 13/11/2026

1. **Conflito**: **decisão humana no painel**, com atalho "aceitar a leitura mais
   recente" para os casos triviais. O app nunca escolhe sozinho entre duas
   leituras que disputam o mesmo campo.
2. **Prazo da posse**: **16 horas** — cobre o turno noturno de 12 h com virada de dia.
3. **Retenção de eventos**: **90 dias** de eventos completos; depois, apenas resumo.
   As sessões de sincronização seguem a mesma janela (`SYNC_SESSION_RETENTION_MS`).
4. **Posse por pessoa**: se o auditor troca de celular no meio do turno, a posse (e a
   sessão de sincronização) **acompanha a pessoa**; o aparelho fica registrado no
   recibo apenas para rastreabilidade.
5. **Escopo de release**: **entregar F2 primeiro** (recibo + idempotência), que já
   resolve a dor mais urgente — "subiu tudo?" — sem esperar o modelo de eventos.

### Status

- **F2 — em implementação** em `src/services/syncSessionService.ts`.

## 11. Próximo passo

F2 em curso (ver § 10). Depois dela: F0 (medir abertura, delta e push no celular
usando o monitor SRE) e então F1 (projeção por eventos), que é a mudança mais
profunda e pode entrar por baixo, sem trocar a tela do auditor.
