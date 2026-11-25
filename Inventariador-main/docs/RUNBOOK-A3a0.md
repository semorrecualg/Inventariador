# Runbook — A.3a.0: medir a base real no aparelho

> **Para quem:** operador com o aparelho de campo na mão.
> **Para quê:** preencher a coluna **«Base (antes de A)»** de §8 da agenda, com
> números do aparelho — nunca de sandbox.
> **O que NÃO se faz aqui:** nenhuma alteração de código, nenhum reset de base,
> nenhum restauro de pacote. Tudo o que se pede é abrir, medir, exportar e
> copiar.

---

## 0. Estado de partida (confirmar antes de começar)

| Item | Como confirmar | Esperado |
|---|---|---|
| Versão instalada | `main` do repositório | `01dc943` (A.3a.4 integrado) |
| Schema local | Gestor de Base → espelhos | **v11**, 10 tabelas, **sem** `assets` |
| Base | Gestor de Base → total de ativos | **12.636** linhas no contrato real |
| SQL `assets_updated_at` no Supabase | Anexo B (somente leitura) | trigger `assets_touch_updated_at` presente |
| Instrumentação F0 | Gestor de Base → «Linha de Base (F0)» | painel com `Boot`, `Pull completo`, `Delta`, `Push`, `Save` |

Se a versão instalada for anterior a `01dc943`, o schema ainda tem a store
`assets` e a linha «Linhas por espelho» mede três tabelas. Nesse caso, **não
meças**: atualiza a app primeiro e recomeça.

---

## 1. Regras da medição

1. **No aparelho**, com a base real. Números de portátil ou de sandbox não entram
   em §8.
2. **Três rondas** por métrica sempre que a métrica for um tempo (o painel dá
   p50/p95; uma amostra só é ruído).
3. **Mesma versão do início ao fim.** Se a app atualizar a meio, descarta e
   recomeça.
4. **Sem «Preparar Nova Carga»**, sem limpar dados da app, sem restaurar
   pacotes. O passo 5 e a medição de `pull.full` (§2, *Passo 1b*) escrevem — e a
   segunda é o único ponto que volta a descarregar a base inteira.
5. **Nunca apagar a base do aparelho de campo para medir.** Se a janela de
   trabalho não permitir uma descarga completa, a medição faz-se noutro aparelho
   com a mesma base (ver *Passo 1b*).
5. Registar sempre **data + modelo do aparelho** ao lado do número; §8 fica com
   o valor e o runbook guarda o rasto no Anexo C.

---

## 2. Passo 1 — linha de base F0 (espelhos + p50/p95)

**Onde:** Gestor de Base → cartão **«Linha de Base (F0)»**.

| Botão | O que faz |
|---|---|
| **Registrar** | Conta `local_assets` e `ativos`, lê as últimas 200 amostras e grava o retrato (`gbr_perf_baseline_v1`). |
| **Copiar** | Copia o snapshot em JSON, já **redigido** (contrato, e-mails, URLs). |
| **Exportar** | Descarrega um JSON cujo nome começa por *linha-de-base-f0-* (data incluída), também redigido. |

O painel mostra, por métrica, `p50 / p95 ms · n=…` — ou «sem amostra».

### O que cada métrica mede e como se produz a amostra

| Métrica (painel) | Mede | Como nasce a amostra |
|---|---|---|
| `Boot` | Da navegação (`performance.timeOrigin`) até `isDataLoaded` — documento, scripts e dados | Automática, uma vez por arranque. `count` = ativos carregados |
| `Pull completo` | Um `fetchFullInventory` **sem** `since` | Menu Dados → **«Sincronizar Tudo»**; ou a primeira sincronização de uma instalação, ou depois de trocar de unidade (*Passo 1b*) |
| `Delta` | Um pull com `since` (checkpoint) | Qualquer sincronização seguinte |
| `Push` | Envio de eventos/ativos para a nuvem | Fim de um envio com sucesso |
| `Save` | `saveInventory` completo, do início ao `finally` | Qualquer gravação do inventário; `count` = ativos no estado |

### Passo 1b — medir o `pull.full` de 12.636 linhas **sem apagar os dados**

O `pull.full` só nasce quando o pedido vai **sem** `since`. Isso consegue-se de
duas maneiras, e a primeira **não** destrói nada:

**(a) No próprio aparelho de campo — «Sincronizar Tudo»**

Menu **Dados** → **«Sincronizar Tudo»** (subtítulo «Forçar pull completo da
Nuvem»). O que acontece, por esta ordem:

1. As alterações pendentes **sobem** primeiro (é o passo de envio normal).
2. É limpo **apenas o checkpoint do delta** — uma chave de `localStorage`
   `[tenant|filial]`. Não é inventário, não são ativos, não é auditoria.
3. Segue `fetchFullInventory` **sem `since`** → amostra `pull.full`, com
   `count` = linhas recebidas (12.636, se o contrato estiver completo).
4. As linhas são gravadas **por chave** (*upsert*) nas duas tabelas vivas. As
   tabelas **não são esvaziadas**.

Ou seja: a base do aparelho fica onde está — ativos, conferências, endereços e
`audit_logs` continuam lá; o que se perde é só o «atalho» do delta, que volta a
ser reconstruído no fim do pull.

**Âmbito — é isto que faz a linha valer 12.636.** O pull é **por
`[tenant|filial]`**: com uma filial seleccionada, o `count` que chega é o dessa
filial, e a amostra `pull.full` fica com algumas centenas de linhas em vez das
12.636. «Sincronizar Tudo» corre com a filial indefinida (âmbito `GERAL`), ou
seja o **contrato inteiro** — é a única forma de a amostra servir para a linha
«Base completa 12.636 (ms)» de §8. Antes de premir, confirmar que o contrato
escolhido é o certo e que a filial não está fixada a montante.

O checkpoint do delta também é chaveado por `[tenant|filial]`: limpar o do
contrato **não** apaga os das filiais, e um pull posterior com filial escolhida
volta a ser delta. Se o `count` do log não for 12.636, o âmbito estava errado —
a amostra não entra em §8.

**Custo, e o que combinar antes:** volta a baixar o contrato inteiro (12.636
linhas). Fazer com **Wi-Fi**, fora do horário de trabalho, e com o operador
avisado de que as edições pendentes vão subir primeiro. Confirmar no log
`>>> [PERF] pull.full: Nms · 12636 registro(s)`.

**(b) Num aparelho de teste com a mesma base**

Se (a) não for aceitável — dados móveis, janela apertada, risco de subir edições
fora de hora —, a medição faz-se num **aparelho de teste com a mesma base de
12.636 linhas** (o pacote F7 restaurado nesse aparelho, ou a primeira
sincronização completa de uma instalação nova). Aí o `pull.full` é o primeiro
pull, sem truques.

Em qualquer dos casos, a célula de §8 diz **em que aparelho** foi medido. E uma
regra que não se quebra: **não se apaga a base do aparelho de campo para
medir** — reinstalar ou «Preparar Nova Carga» no aparelho do operador é
inaceitável, porque apaga conferências e endereços que não voltam da nuvem.

### Limpar o anel antes de uma ronda

O anel guarda as últimas 200 amostras e **não** tem botão na UI. Na consola do
aparelho (Anexo A, snippet 3):

```js
localStorage.removeItem('gbr_perf_samples_v1')
```

Isto apaga **só** o histórico de tempos. Não toca em ativos, espelhos nem
checkpoints.

---

## 3. Passo 2 — pacote F7 (contagens e checksums)

**Onde:** Gestão e Manutenção → **pacote de backup exportável** (o mesmo do
Gestor de Base, F7).

Ao exportar, a app grava um `.json`/`.dat` e escreve no log:

```
[F7] Pacote verificado: N registros, schema v11, SHA-256 <16 hex>…
```

Dentro do ficheiro, o manifesto tem:

| Campo | Serve para |
|---|---|
| `schemaVersion` | Confirmar **11** |
| `tables.<nome>.count` | Contagem por tabela (`local_assets`, `ativos`, `audit_logs`, …) |
| `tables.<nome>.checksum` | **SHA-256 por tabela** — a linha «Checksum SHA-256 por tabela» de §8 |
| `packageChecksum` | Hash do pacote inteiro (selo) |

Guardar o ficheiro com um nome começado por *f7-base-* (com a data) e registar no Anexo C,
por tabela, os 64 hex. Em §8 basta o prefixo (`sha256:9f2c…`) — os valores
completos vivem no anexo.

**Não restaurar** este pacote: é só leitura.

---

## 4. Passo 3 — tamanho do IndexedDB

Na consola do aparelho (Anexo A, snippet 1):

```js
await navigator.storage.estimate()
```

Converter `usage` para MB (`usage / 1048576`, uma casa decimal). Registar também
`quota` no Anexo C — serve para saber quanto falta até ao limite.

**Ficheiro SQLite:** nesta versão **não existe** ficheiro SQLite local; a base é
IndexedDB (Dexie). Em §8 escreve-se `n/a (IndexedDB)` e a métrica só passa a ter
número quando a Fase B/C criar ficheiro físico.

---

## 5. Passo 4 — arranque (Android × PWA)

Protocolo igual nos dois, para os números serem comparáveis:

1. Fechar a app por completo (Android: remover dos recentes; PWA: fechar o
   separador/janela).
2. Abrir e esperar até a lista de ativos estar pronta.
3. Repetir **3 vezes**, sem limpar dados e sem rede a mudar a meio.
4. Gestor de Base → **Registrar**, e ler `Boot` no painel (`p50 / p95 ms · n`).

Fazer primeiro **Android (APK)** e depois **PWA**, cada um com o seu «Registrar»,
e copiar o snapshot de cada um (o ficheiro diz a data e o contrato).

Não comparar um arranque a quente (app em segundo plano) com um a frio.

---

## 6. Passo 5 — `save` com 1 ativo e com 300 ativos

Esta é a única medição que **escreve**. Faz-se num **contrato/unidade de teste**,
nunca no contrato real em horário de trabalho: `saveInventory` grava localmente e
pode disparar envio para a nuvem.

1. Contrato de teste, unidade de teste.
2. Inventário com **1 ativo** → gravar → esperar o log `>>> [PERF] save: Nms · 1 registro(s)`.
3. Repetir 3 vezes (abrir/gravar), limpando o anel entre rondas se quiseres um
   p50/p95 só desta série.
4. Inventário com **300 ativos** (importar a planilha de teste) → gravar →
   confirmar `300 registro(s)` no log.
5. Registar, no Anexo C, `p50`/`p95` de cada série e o `count` que o log
   mostrou.

O `count` do painel é o do **estado** no momento do save — se o número não for 1
nem 300, a amostra não serve para §8.

---

## 7. Passo 6 — contagem total e coerência

No Gestor de Base:

- `local_assets` = **?**
- `ativos` = **?**
- total (maior espelho) = **12.636** esperado
- `audit_logs` = **?** (informativo)

Se `local_assets` e `ativos` divergirem, **não corrigir nada à mão**: registar os
dois números. É precisamente essa a fotografia que a coluna «Base» tem de
mostrar — a etapa A existe para os igualar.

---

## 8. Como preencher a coluna «Base (antes de A)» de §8

Uma célula por linha, com esta forma:

```
<valor> · <origem> · <data> · <aparelho>
```

- **Tempos:** `p50/p95 ms · n=… · 2026-11-25 · Galaxy A54`
- **Tamanhos:** `18,4 MB · storage.estimate · 2026-11-25 · Galaxy A54`
- **Contagens:** `12.636 · Gestor · 2026-11-25`
- **Checksums:** `sha256:9f2c… (completo no Anexo C) · F7 · 2026-11-25`

Mapa linha → fonte:

| Linha de §8 | Fonte | Observação |
|---|---|---|
| Escritas por save | Código (critério da agenda) | Já preenchido com 5; confirmar, não medir |
| `saveInventory` com 1 ativo (ms) | Passo 5 | `save` com `count=1` |
| `saveInventory` com 300 ativos (ms) | Passo 5 | `save` com `count=300` |
| Base completa 12.636 (ms) | Passo 1b | `pull.full` com `count=12.636` — «Sincronizar Tudo» (contrato inteiro, sem filtro de filial) no aparelho de campo, ou aparelho de teste com a mesma base |
| Arranque até lista pronta — Android (ms) | Passo 4 | `Boot`, APK |
| Arranque até lista pronta — PWA (ms) | Passo 4 | `Boot`, PWA |
| Tamanho do IndexedDB (MB) | Passo 3 | `usage` |
| Tamanho do ficheiro SQLite (MB) | — | `n/a (IndexedDB)` nesta versão |
| Linhas por espelho | Passo 6 | `local_assets` / `ativos` (o `assets` já não existe na v11) |
| Contagem total de ativos | Passo 6 | tem de bater com a nuvem |
| Checksum SHA-256 por tabela | Passo 2 | `tables.<nome>.checksum` do manifesto |

As colunas «Depois de A/B/C» ficam **vazias** até existir uma medição com a
mesma receita e o mesmo aparelho. Comparar números de aparelhos diferentes não
prova nada.

---

## 9. Critérios de saída do A.3a.0

- [ ] As 10 células mensuráveis de «Base» preenchidas com valor + data + aparelho.
- [ ] Snapshots F0 (Android e PWA) anexados ao pedido/agenda.
- [ ] Manifesto F7 guardado, com checksums por tabela no Anexo C.
- [ ] `schemaVersion` do manifesto = **11**.
- [ ] Verificação do SQL (Anexo B) sem resultado inesperado.
- [ ] Nenhuma célula preenchida com número de sandbox.

Fechados os pontos acima, a A.3a.0 passa a ☑ na agenda e a etapa A.3a fica
concluída.

---

## Anexo A — snippets de consola

**Android:** ligar por USB com depuração, abrir `chrome://inspect` no
computador, *inspect* na WebView da app.
**PWA:** DevTools do navegador → *Console*.

```js
// 1) tamanho e quota da base local
await navigator.storage.estimate()

// 2) amostras cruas (nome, ms, data, count)
JSON.parse(localStorage.getItem('gbr_perf_samples_v1') || '[]')

// 3) limpar o anel antes de uma ronda (não toca em dados)
localStorage.removeItem('gbr_perf_samples_v1')

// 4) último retrato da linha de base
JSON.parse(localStorage.getItem('gbr_perf_baseline_v1') || 'null')
```

## Anexo B — verificação do SQL (somente leitura)

No SQL Editor do Supabase:

```sql
-- 1) o trigger existe?
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.assets'::regclass;

-- 2) nenhuma linha sem carimbo
select count(*) as sem_carimbo from public.assets where updated_at is null;
```

Esperado: `assets_touch_updated_at` na lista e `sem_carimbo = 0`.
Se o trigger não aparecer, avisar antes de continuar: sem ele, o `pull.delta`
não vê as conferências dos outros aparelhos.

## Anexo C — folha de recolha

| Campo | Android | PWA |
|---|---|---|
| Data / aparelho | | |
| `schemaVersion` (F7) | | |
| `Boot` p50 / p95 / n | | |
| `Pull completo` p50 / p95 / n | | |
| `pull.full` `count` (tem de ser 12.636 — se for menor, faltou o âmbito do contrato) | | |
| `pull.delta` p50 / p95 / n | | |
| `push` p50 / p95 / n | | |
| `save` (1 ativo) p50 / p95 / n | | |
| `save` (300 ativos) p50 / p95 / n | | |
| IndexedDB `usage` / `quota` | | |
| `local_assets` / `ativos` / total | | |
| `packageChecksum` | | |
| `local_assets.checksum` | | |
| `ativos.checksum` | | |
| `audit_logs.checksum` | | |
