# Limpeza de cópias exatas (base local)

Operação do **Gestor de Base de Dados** → cartão «Diagnóstico de Cópias» →
`LIMPAR CÓPIAS EXATAS`. Existe para o caso em que a base do aparelho guarda a
MESMA linha duas vezes (25.272 linhas para 12.636 ativos) enquanto a nuvem tem
12.636. O serviço está em `src/services/assetMirrorCleanupService.ts`.

## O que é «cópia exata»

- Mesma `primarykey` **normalizada** (trim, caixa alta, sem caracteres fora da
  chave — `utils/assetKey.sanitizeAssetKey`).
- Conteúdo idêntico em todos os campos do bem.
- Ficam de fora da comparação, por não serem conteúdo: o escopo
  (`tenantid`/`primarykey`/`id`), a proveniência da carga
  (`source_primarykey`, `source_row`, `import_batch`) e os carimbos de
  sincronização (`_is_synced`, `updated_at`, `_syncFailAt`, `_syncFailReason`).

## O que nunca é tocado

- **`primarykey`s diferentes**, mesmo com a mesma filial, etiqueta e descrição:
  são bens distintos (a etiqueta `008488 CCPL` tem 9 chaves, `010691` tem 9).
- **Grupos com conteúdo diferente**: mesma chave com descrição, série, foto,
  GPS, conferência ou histórico divergentes não é cópia — fica tudo.
- **Outro contrato**: o mesmo `primarykey` em `tenantid` diferentes é
  multi-tenant por desenho (`docs/RECONCILIACAO_IDENTIDADES.md` §5). Com um
  contrato ativo, só entram linhas desse contrato e as sem contrato.

## Contagens antes e depois

A pré-visualização (a confirmação) e o log do SRE mostram, por espelho
(`local_assets` · `ativos` — o `assets` local saiu na v11), `antes → depois · cópias`, além de
grupos de cópia, chaves distintas antes/depois e os grupos preservados por
conteúdo diferente. **Chaves distintas têm de ser iguais antes e depois** — a
limpeza só remove cópias da mesma chave; se o número mudasse, a transação
abortava sem apagar nada.

## Como reverter

1. **«DESFAZER LIMPEZA»** (mesmo cartão): devolve as linhas da última limpeza
   aos dois espelhos, com as chaves exatas que tinham (inclui `tenantid` vazio).
   O backup não é apagado — desfazer é repetível e idempotente.
2. **JSON de backup** («RECONECTAR BACKUP FÍSICO» no Gestor): restaura a base
   inteira a partir do ficheiro exportado antes da operação. É a segunda via,
   para o caso de o backup local ter sido purgado.

Se algo falhar a meio, nada fica pela metade: o backup e as remoções correm na
**mesma transação** Dexie — ou fica tudo, ou a base continua como estava.

## Onde vive o backup

Tabela `asset_cleanup_backups` (schema v8): um registo `meta` por limpeza e
blocos de 1.000 linhas removidas (`kind: 'rows'`), com o `cleanup_id` que o
«DESFAZER» usa. Não é sincronizada com a nuvem e não altera os espelhos.
