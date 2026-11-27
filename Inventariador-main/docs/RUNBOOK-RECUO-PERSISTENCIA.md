# Runbook — recuar a persistência num aparelho (A.5)

> **Para quem:** operador de campo ou suporte, com o aparelho na mão.
> **Para quê:** devolver a um aparelho o comportamento de leitura/escrita
> anterior à A.5, **sem instalar outra versão**.
> **O que NÃO se faz aqui:** apagar dados da app, «Preparar Nova Carga»,
> restaurar pacotes. Nenhum passo deste runbook apaga o inventário.

---

## 0. O que mudou (o mínimo para decidir)

Desde a A.5 (`6a59099`), um `saveInventory` escreve o inventário **três vezes**:

1. config no Dexie (`saveInventoryConfig`);
2. ativos no Dexie (`bulkInsertAssets` → `ativos` + `local_assets`);
3. config cifrada no localforage.

O blob cifrado **dos ativos** (`inventory_assets_v24_internal_secure` /
`inventory_assets_v24_supabase_secure`, no localforage) passou a ser **recuo**:
só é escrito quando é a única cópia — falha do Dexie, chave
`gbr_legacy_assets_mirror=1`, ou um save que não escreve ativos no cache com o
cache ainda vazio. E o arranque lê o cache Dexie primeiro — no modo oficial,
escopado ao contrato da sessão.

Antes eram **cinco** escritas: as três de cima, mais o blob cifrado dos ativos e
o espelho em lotes que regravava `local_assets` de 1000 em 1000. O teste
`src/__tests__/dexieCacheUnico.test.ts` fixa a contagem em **3** (e **4** com o
recuo ligado): se alguém voltar a acrescentar uma escrita ao save, o teste
falha antes do merge.

---

## 1. As duas chaves

Ambas vivem no `localStorage` do aparelho e são lidas **a cada** save e
arranque (nunca no arranque do módulo) — por isso valem a partir do save/arranque
seguinte, sem reinstalar a app.

| Chave | Padrão (chave ausente) | Para recuar | O que faz |
|---|---|---|---|
| `gbr_read_from_dexie_first` | ligada (`1`) | `0` (ou `false`) | No **modo oficial** (Supabase), o arranque deixa de ler o cache Dexie e volta a ler o blob cifrado primeiro, sem escopo de contrato — a leitura de antes da A.5. No **modo BASE LOCAL** não muda nada: aí o cache já era a primeira leitura. |
| `gbr_legacy_assets_mirror` | desligada (`0`) | `1` (ou `true`) | Volta a gravar o blob cifrado dos ativos em **todos** os saves. É a «release de fallback» da agenda, sem release: custa o `encrypt` da base inteira por save e mais uma escrita (4 em vez de 3). |

Regra de leitura: `0` e `false` **desligam** a chave; qualquer outro valor
**liga**. Remover a chave devolve o padrão.

---

## 2. As quatro combinações

| Leitura | Espelho | Comportamento |
|---|---|---|
| `1` (padrão) | `0` (padrão) | **A.5:** arranque lê o cache; o save não escreve o blob dos ativos. |
| `0` | `1` | **Comportamento antigo completo:** lê o blob primeiro e mantém-no actualizado. |
| `1` | `1` | Lê o cache e mantém o blob actualizado — coexistência durante uma migração, ao custo do espelho. |
| `0` | `0` | ⚠️ **Armadilha:** lê o blob que já ninguém actualiza. Pode estar vazio ou atrasado e o arranque aparece sem inventário, embora o Dexie tenha tudo. Só para diagnóstico. |

**Para voltar ao comportamento antigo, ligue as duas.** Ler pelo blob
(`gbr_read_from_dexie_first=0`) sem o espelho ligado (`gbr_legacy_assets_mirror`
ausente) é a única combinação que mostra dados que o Dexie já não confirma.

---

## 3. Aplicar num aparelho

1. Ligar o aparelho ao computador por USB, com a depuração USB activa, e abrir
   `chrome://inspect` no Chrome do computador; inspecionar a WebView do
   Inventariador.
2. Na consola, escrever as duas chaves:

   ```js
   localStorage.setItem('gbr_read_from_dexie_first', '0');
   localStorage.setItem('gbr_legacy_assets_mirror', '1');
   ```

3. Fechar e reabrir a app.

> **Se `chrome://inspect` não listar a app**, a build instalada não expõe a
> WebView para depuração e as chaves não podem ser mudadas no aparelho. Nesse
> caso o recuo é uma build com a chave já ligada — não há passo de consola em
> campo.

---

## 4. Confirmar que ficou ligado

Na consola da mesma sessão:

```js
localStorage.getItem('gbr_read_from_dexie_first');  // "0"
localStorage.getItem('gbr_legacy_assets_mirror');    // "1"
```

Depois, no save seguinte, a consola mostra
`>>> [Persistence] Blob cifrado gravado como recuo (espelho legado ligado).`
E, no arranque do modo oficial, deixa de aparecer
`ativos carregados do cache Dexie (contrato da sessão)`.

- Se o motivo no log for `Dexie falhou`, o recuo está a fazer o seu trabalho: o
  Dexie não está a aceitar escrita e o blob é a única cópia. Registar o erro.
- Se for `espelho legado ligado`, é a chave — está tudo como pedido.

---

## 5. Voltar ao padrão (A.5)

```js
localStorage.removeItem('gbr_read_from_dexie_first');
localStorage.removeItem('gbr_legacy_assets_mirror');
```

A partir do save/arranque seguinte o aparelho volta à A.5. O blob já escrito
**não é apagado** — fica como recuo para o arranque e para versões anteriores.
Não é preciso limpá-lo, e apagá-lo à mão só remove a segunda cópia.

---

## 6. Quando usar

- **Base oficial que abre vazia ou com o contrato errado** depois da A.5:
  confirmar primeiro que o Dexie tem linhas (Gestor de Base → espelhos). Se
  tiver, é leitura → `gbr_read_from_dexie_first=0` **com** o espelho ligado.
- **Aparelho que vai voltar a uma versão anterior à A.5:** ligar o espelho
  **antes** de instalar a versão antiga — no modo oficial, essa versão lê o
  blob cifrado, que a A.5 deixou de actualizar.
- **Antes de uma operação pesada** em que se quer uma segunda cópia cifrada do
  inventário: espelho ligado durante a operação; removê-lo no fim.

---

## 7. Quando NÃO usar

- Para «corrigir» uma base corrompida ou com faltas: o recuo devolve o
  comportamento antigo, não os dados. Base corrompida resolve-se com uma nova
  descarga do contrato (ver `docs/FLUXO_LOGIN_DOWNLOAD_BASE.md`), nunca com
  estas chaves.
- Deixar o espelho ligado «para sempre»: paga o `encrypt` da base inteira em
  cada save e a escrita extra que a A.5 removeu. É um recuo, não um modo de
  operação.

---

## 8. Onde isto vive no código

`src/services/persistenceService.ts` — `READ_FROM_DEXIE_FIRST_KEY`,
`LEGACY_ASSETS_MIRROR_KEY`, `getPersistenceFlags()`, e as decisões de escrita e
leitura em `saveInventory` / `loadInventory`.
