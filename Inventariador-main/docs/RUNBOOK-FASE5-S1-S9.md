# Runbook — Fase 5 do H1: matriz S1–S9 com dois agentes

> **Para quem:** par de auditores com **dois aparelhos** e acesso à nuvem de
> produção, num **contrato/unidade de teste**.
> **Para quê:** fechar o H1.5 da agenda — os nove cenários do diagnóstico
> (rev. 3) verdes com dois agentes reais, que é a única prova que o teste de
> unidade não dá.
> **O que NÃO se faz aqui:** nenhuma alteração de código, nenhum reset de base,
> nenhum «Preparar Nova Carga» no aparelho de campo, nenhum restauro de pacote.

---

## 0. Estado de partida (confirmar antes do S1)

| Item | Como confirmar | Esperado |
|---|---|---|
| Versão da app | selo / Gestor de Base | **a mesma** nos dois aparelhos, `main` @ `a024f36` ou posterior |
| Modo de base | selo do canto inferior | **SUPABASE** (verde) nos dois; **nunca** BASE LOCAL |
| Contrato | ecrã do contrato | o **contrato de teste**, o mesmo nos dois, filial indefinida |
| Utilizadores | sessão | **dois** perfis distintos (A e B); sem isso não há dois agentes |
| Blindagem | Gestor de Base | «Pronto para Campo» **desligado** — blindado, nenhum cenário corre |
| Trigger do carimbo | Anexo B, consulta 3 | `assets_touch_updated_at` presente e `sem_carimbo = 0` |
| Base | Gestor de Base → total | anotar o número (N) — é a régua de S3 e S6 |

Se a versão divergir entre os aparelhos, **não comeces**: os cenários comparam
comportamento, e o comportamento mudou em #223–#230.

---

## 1. Regras da matriz

1. **Dois aparelhos reais**, os dois online salvo quando o cenário mandar
   desligar um. Um portátil a fazer de segundo agente não conta.
2. **Contrato de teste**, nunca o contrato de campo em horário de trabalho: os
   cenários apagam, editam e forçam conflitos de propósito.
3. **Nada se apaga para «limpar».** Não há reset, não há reinstalação, não há
   restauro de pacote. O estado entre cenários converge com um «Sincronizar
   Tudo» nos dois aparelhos.
4. **Um cenário por vez.** Antes de começar, anota a etiqueta e a `primarykey`
   do ativo (ou dos 2–3 ativos) que o cenário usa; no fim, confirma na nuvem
   (Anexo B) que o estado é o esperado. Sem isso, o cenário seguinte começa
   sujo.
5. **Falhou é falhou.** Se o critério «falha se» acontecer, registar e seguir —
   não repetir até dar verde. Um cenário que só passa à terceira é um cenário
   instável e tem de ficar escrito assim.
6. **Registar sempre** data, modelo dos dois aparelhos, versão e contrato. §12 é
   a folha de recolha; o resto (capturas, logs, consultas) fica anexado.

---

## 2. Instrumentos (os mesmos nos nove cenários)

| O que se quer ver | Onde |
|---|---|
| Pendentes deste aparelho | selo de sincronização: âmbar `N pendentes` / verde `Sincronizado` |
| Eventos de sync | registos da app (`>>> [Sync] …`), na consola do aparelho (Anexo A) |
| Trilha | Auditoria → acções `SYNC_CONFLICT`, `SYNC_DELETE_WINS`, `SYNC_PULL`, `SYNC_RECORD_FAIL` |
| Tempos | Gestor de Base → «Linha de Base (F0)»: `Boot`, `Pull completo`, `Delta`, `Push`, `Save` |
| Estado da nuvem | SQL Editor, consultas do Anexo B (somente leitura) |
| Pedidos de rede | Android: `chrome://inspect`; PWA: DevTools → Network |
| Offline de **um** aparelho | modo avião (Android) ou DevTools → offline (PWA) — nunca o do outro |

O selo e a trilha são a prova principal: tempo em segundos vê-se no relógio, mas
«B reenviou o que recebeu» ou «ficou marcado sincronizado sem confirmação» só se
vê no selo, nos pedidos e na nuvem.

---

## 3. S1 — Dois auditores online no mesmo contrato

**Objetivo:** o evento chega ao outro aparelho sem reiniciar a app.

**Preparação:** os dois online, no mesmo contrato; ativo `X` ainda não conferido
na nuvem (confirma no Anexo B, consulta 1).

**Passos**
1. B abre a lista de ativos e fica no ecrã.
2. A confere `X` (leitura por scanner ou pela ficha).
3. Contar do toque em A até B mostrar `X` conferido — sem tocar em B.

**Registar:** tempo A→B (≤ 2 s esperado); `_auditor` e `_data_leitura` que B
mostra; linha `>>> [Sync]` de B, se aparecer.

**Falha se:** B só mostra a conferência depois de reiniciar a app.

---

## 4. S2 — Anti-eco

**Objetivo:** o aparelho que **recebe** um evento não o devolve à nuvem.

**Preparação:** S1 verde; B já tem `X` conferido por A e o selo em
`Sincronizado`.

**Passos**
1. Anotar em B o contador de pendentes e o `updated_at` de `X` na nuvem.
2. Esperar **dois ciclos** de sync (60 s cada) com B online e sem tocar em `X`.
3. Ver em B os pedidos a `assets` que saíram nesse intervalo e reler o
   `updated_at` de `X`.

**Registar:** upserts de B para `X` (esperado **0**); `updated_at` inalterado;
pendentes de B (esperado 0).

**Falha se:** B reenvia o que acabou de receber (upsert de `X` sem edição local,
ou `updated_at` a mudar sozinho).

---

## 5. S3 — Zona cega de 2 h

**Objetivo:** quem esteve offline duas horas não perde nem duplica trabalho.

**Preparação:** N anotado (§0). A fica offline; B online.

**Passos**
1. **A offline**, fazer **300 operações** (conferir/editar 300 ativos).
2. **B online**, fazer **50 operações** em ativos **diferentes** dos de A.
3. Ligar A, esperar o selo `Sincronizado` (drenagem automática). Não forçar
   «Sincronizar Tudo» neste passo.
4. Nos dois aparelhos e na nuvem: contar os ativos conferidos/editados do
   intervalo e procurar duplicados por `primarykey`.

**Registar:** total em A = total em B = total na nuvem; lista de chaves em falta
(esperado nenhuma); duplicados (esperado nenhum).

**Falha se:** faltar 1 ativo ou sobrar 1 duplicado.

---

## 6. S4 — Drenagem em lote

**Objetivo:** 1.000 pendentes sobem em poucos pedidos, não um a um.

**Preparação:** A com **1.000 pendentes** (importar a planilha de teste nessa
unidade e conferir/editar o lote), offline até começar o passo 1.

**Passos**
1. Abrir o painel de rede de A, ligar A.
2. Contar os pedidos de escrita a `assets` até o selo ficar `Sincronizado`.

**Registar:** número de pedidos; tamanho de cada lote; duração total.

**Falha se:** mais de 5 pedidos, ou uma série de 1.000 pedidos (um por ativo).

---

## 7. S5 — Corte a meio da drenagem

**Objetivo:** uma queda de rede no meio do lote não «marca como sincronizado»
o que não confirmou.

**Preparação:** A com ~1.000 pendentes, como no S4.

**Passos**
1. Ligar A e, assim que o **segundo** pedido de escrita começar, cortar a rede
   (modo avião).
2. Na nuvem, anotar quais das chaves desse lote chegaram.
3. Repor a rede e deixar drenar até `Sincronizado`.
4. Procurar em A algum registo com o selo de sincronizado que **não** exista na
   nuvem (Anexo B, consulta 1, para uma amostra das chaves cortadas).

**Registar:** chaves que ficaram pendentes depois do corte; chaves marcadas
sincronizadas ausentes da nuvem (esperado nenhuma); total final igual nos dois
lados.

**Falha se:** algum registo ficar marcado como sincronizado sem confirmação da
nuvem.

---

## 8. S6 — Paginação concorrente

**Objetivo:** uma descarga grande não deixa buracos quando a nuvem muda a meio.

**Preparação:** B vai fazer um pull completo; A tem um lote grande para subir
(≈5.000 alterações, ou o máximo que o contrato de teste permitir — registar o
número real).

**Passos**
1. A começa a subir o lote.
2. **No mesmo minuto**, B faz Menu Dados → «Sincronizar Tudo» (pull completo).
3. Quando os dois terminarem, comparar chaves: as que mudaram na janela têm de
   estar nos dois aparelhos.
4. Repetir o par (A a subir, B a puxar) **duas vezes** — a primeira pode apanhar
   o caso fácil.

**Registar:** linhas recebidas por B em cada ronda; chaves em falta (esperado
nenhuma); total final.

**Falha se:** qualquer linha omitida em B.

---

## 9. S7 — Exclusão × edição offline

**Objetivo:** um ativo apagado na nuvem não ressuscita pela edição de quem
estava offline.

**Preparação:** ativo `X` sincronizado nos dois aparelhos.

**Passos**
1. **A offline**, editar `X` (descrição/endereço).
2. **B online**, apagar `X` e sincronizar.
3. Ligar A e deixar drenar.
4. Ver `X` em A e na nuvem (Anexo B, consultas 1 e 2).

**Registar:** estado de `X` em A (excluído, não editado) e na nuvem; linha
`SYNC_DELETE_WINS` na trilha.

**Falha se:** `X` volta a aparecer vivo na nuvem.

---

## 10. S8 — Relógio adiantado 2 h

**Objetivo:** um aparelho com a hora errada não ganha todos os conflitos, e o
checkpoint do pull não segue a hora local.

**Preparação:** colocar o relógio de **A adiantado 2 h** (manual, sem hora
automática de rede). `X` conferido na nuvem por B às T.

**Passos**
1. Em A (relógio +2 h), conferir `X` às T+5 min reais — a `data_leitura` de A
   aparece como T+2 h 05.
2. Deixar A subir.
3. Ver quem ficou com a conferência de `X` e qual `data_leitura` está na nuvem.
4. Provocar um pull em A (Menu Dados → «Sincronizar Tudo») e confirmar que o
   checkpoint de A não salta para o futuro: o delta seguinte continua a apanhar
   alterações feitas na nuvem «no passado» de A.

**Registar:** `data_leitura` final; `auditor` final; linha `SYNC_CONFLICT` (com
o motivo); checkpoint de A antes/depois.

**Falha se:** A ganha **todos** os conflitos, ou o delta seguinte de A deixa de
ver alterações da nuvem.

**No fim:** repor a hora automática em A.

---

## 11. S9 — App morto a meio

**Objetivo:** matar a app durante a drenagem não perde operação nem salta o
cursor.

**Preparação:** A com ~1.000 pendentes, online.

**Passos**
1. Com a drenagem a correr, **matar a app** (remover dos recentes).
2. Reabrir e anotar o contador de pendentes.
3. Deixar drenar até `Sincronizado`; comparar com a nuvem.
4. Fazer um delta pull depois de uma alteração feita em B nesse intervalo e
   confirmar que ela chega a A (o cursor não saltou).

**Registar:** pendentes antes/depois de matar; chaves perdidas (esperado
nenhuma); alteração de B visível em A no delta seguinte.

**Falha se:** a fila perde uma operação, ou o cursor salta e a alteração de B não
desce.

---

## 12. Folha de recolha

| # | Data | A / B (modelo) | Resultado | Evidência |
|---|---|---|---|---|
| S1 | | | | tempo + log |
| S2 | | | | upserts 0 + selo |
| S3 | | | | totais + chaves em falta |
| S4 | | | | nº de pedidos |
| S5 | | | | amostra de chaves |
| S6 | | | | linhas por ronda |
| S7 | | | | estado de `X` + trilha |
| S8 | | | | `data_leitura` + checkpoint |
| S9 | | | | pendentes + delta |

Resultado por cenário: **✓ verde** · **✗ vermelho** (com o critério que falhou)
· **— não executado** (com o motivo).

---

## 13. Critérios de saída do H1.5

- [ ] Os nove cenários com resultado **✓** ou, se algum ficar ✗, aberto como
      defeito com o critério que falhou e a evidência.
- [ ] Folha de recolha preenchida, com os dois modelos de aparelho e a versão.
- [ ] Nenhum cenário «passado» depois de repetido à terceira sem isso ficar
      escrito.
- [ ] H1.5 passa a ☑ na agenda e o §5 de
      [`docs/SINCRONIZACAO_CONFLITO_E_BLINDAGEM.md`](SINCRONIZACAO_CONFLITO_E_BLINDAGEM.md)
      deixa de dizer que falta a matriz.

Só com esta folha preenchida o M2 fecha e a Etapa B (SQLite como leitura) pode
começar.

---

## Anexo A — offline e consola por aparelho

**Android (APK):** modo avião desliga dados e Wi-Fi de uma vez; para ver a
consola, ligar por USB com depuração e abrir `chrome://inspect` no computador,
*inspect* na WebView da app.

**PWA:** DevTools → *Network* → **Offline** desliga só aquele separador; a
consola é a mesma janela.

Snippet para ler os pendentes e o checkpoint sem tocar em dados:

```js
// pendentes e checkpoint deste aparelho (somente leitura)
Object.keys(localStorage).filter(k => /sync|checkpoint|pend/i.test(k))
```

## Anexo B — verificação na nuvem (somente leitura)

No SQL Editor do Supabase, com `CONTRATO` e `PK` substituídos:

```sql
-- 1) estado do ativo em prova
select primarykey, etiqueta, conferido, auditor, data_leitura,
       gps_lat, gps_lng, is_deleted, updated_at
  from public.assets
 where tenantid = 'CONTRATO' and primarykey = 'PK';

-- 2) quantos ativos vivos no contrato (a régua de S3/S6)
select count(*) as vivos
  from public.assets
 where tenantid = 'CONTRATO' and coalesce(is_deleted, false) = false;

-- 3) o trigger do carimbo existe? (§0)
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.assets'::regclass;

-- 4) trilha do sync nas últimas 2 h
select created_at, action, record_id, left(details, 120) as detalhe
  from public.audit_logs
 where action in ('SYNC_CONFLICT', 'SYNC_DELETE_WINS', 'SYNC_RECORD_FAIL')
 order by created_at desc
 limit 40;
```

Nenhuma destas consultas escreve. Não correr `update`/`delete` à mão para
«preparar» um cenário: o estado prepara-se pela app, que é o que se está a
testar.

## Anexo C — o que fica por automatizar

O diagnóstico previa um harness de dois dispositivos em
`src/__tests__/sync/multiDispositivo.ts` (a criar) — Supabase falso em memória,
`updated_at` monotónico, realtime com broadcast e dois ou três dispositivos com
`fake-indexeddb` isolados — e um E2E de dois contextos de browser «apenas se o
ambiente permitir».

Nem um nem outro existem hoje em `main`: **nada desta matriz está coberto por
teste automático**, e por isso ela é manual. O E2E de dois contextos continua
fora enquanto não houver duas contas e nuvem de produção acessíveis ao CI. Quando
o harness existir, os nove cenários passam a correr em `npm test` e este runbook
fica como a verificação final em aparelho — não como a única prova.
