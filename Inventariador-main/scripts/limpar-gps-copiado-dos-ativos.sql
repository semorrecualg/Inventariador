-- ============================================================================
-- LIMPEZA: GPS COPIADO DA ÂNCORA DA UNIDADE PARA OS ATIVOS
-- ============================================================================
-- Contexto: até o commit 9ce58e5 (branch fix/gps-ancora-unidade-operacional) o
-- App tinha um efeito de "reparo automático de GPS" que copiava a âncora da
-- unidade para `latitude/longitude` de TODO ativo conferido sem coordenadas, e
-- o envio seguinte levava isso para `assets.gps_lat/gps_lng`. Resultado: linhas
-- com a coordenada exata da âncora — que não é leitura de GPS do ativo.
--
-- Regra de negócio: `assets.gps_lat/gps_lng` só é gravado na conferência do
-- inventário (leitura do dispositivo ou registro do momento). Se estava vazio,
-- fica vazio. A âncora fica só na configuração da filial
-- (`inventory_config.data` / `unit_configs.lat,lng`).
--
-- ESTE FICHEIRO NÃO FOI EXECUTADO. Ordem recomendada:
--   1. secção 1 (diagnóstico, só leitura)   -> mede o estrago
--   2. secção 2 (backup)                    -> grava as coordenadas atuais
--   3. secção 3 (limpeza segura)            -> termina em `rollback;` de propósito
--      confira as contagens, depois troque `rollback;` por `commit;`
--   4. secção 4 (revisão)                   -> conferidos com a coordenada da
--      âncora; NÃO são apagados aqui, exigem decisão humana
--   5. secção 5 (verificação e restauro)
--
-- A CTE `ancora` lê as DUAS fontes por filial: `public.unit_configs` (canónica,
-- onde `saveUnitConfigFlags` grava e onde `scripts/unit-configs-flags.sql` faz
-- backfill) e `public.inventory_config.data` (registo histórico). Nesta base
-- `unit_configs` está vazia e só `inventory_config` tem âncoras.
-- Ajuste o tenant nas consultas: o exemplo usa 'CICOPAL'.
-- Idempotente: rodar duas vezes não apaga nada além do mesmo conjunto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DIAGNÓSTICO (só leitura)
-- ----------------------------------------------------------------------------

-- 1.1 Quantos ativos partilham exatamente a mesma coordenada, por filial.
--     GPS real de inventário é variado; uma linha a dominar a filial inteira é
--     a assinatura da âncora copiada.
SELECT a.filial,
       a.gps_lat,
       a.gps_lng,
       count(*) AS ativos
  FROM public.assets a
 WHERE a.tenantid = 'CICOPAL'
   AND a.gps_lat IS NOT NULL
   AND a.gps_lng IS NOT NULL
 GROUP BY a.filial, a.gps_lat, a.gps_lng
 ORDER BY ativos DESC
 LIMIT 30;

-- 1.2 Ativos cuja coordenada é a MESMA da âncora da filial, separados por
--     evidência de conferência. `nunca_conferidos`/`sem_data_leitura` são os
--     que com certeza nunca foram lidos: a coordenada só pode ter sido copiada.
WITH ancora AS (
  SELECT uc.tenantid,
         upper(trim(uc.filial)) AS filial_norm,
         uc.lat,
         uc.lng
    FROM (
      -- `unit_configs` é a tabela canónica da filial; `inventory_config.data` é
      -- o registo histórico. Nesta base só `inventory_config` tem âncoras, por
      -- isso a leitura é a UNIÃO das duas — ler só uma delas reportaria zero.
      SELECT tenantid, filial, lat, lng
        FROM public.unit_configs
       WHERE filial IS NOT NULL
      UNION ALL
      SELECT tenantid, filial,
             NULLIF(data->>'lat', '')::numeric AS lat,
             NULLIF(data->>'lng', '')::numeric AS lng
        FROM public.inventory_config
       WHERE filial IS NOT NULL AND data IS NOT NULL
    ) uc
   WHERE uc.tenantid = 'CICOPAL'
     AND coalesce(uc.lat, 0) <> 0
     AND coalesce(uc.lng, 0) <> 0
)
SELECT a.tenantid,
       a.filial,
       g.lat  AS ancora_lat,
       g.lng  AS ancora_lng,
       count(*)                                                   AS ativos_com_gps_da_ancora,
       count(*) FILTER (WHERE NOT coalesce(a.conferido, false))    AS nunca_conferidos,
       count(*) FILTER (WHERE a.data_leitura IS NULL)              AS sem_data_leitura,
       count(*) FILTER (WHERE coalesce(a.conferido, false))        AS conferidos
  FROM public.assets a
  JOIN ancora g
    ON upper(trim(g.tenantid)) = upper(trim(a.tenantid))
   AND g.filial_norm = upper(trim(a.filial))
 WHERE a.gps_lat IS NOT NULL
   AND abs(a.gps_lat - g.lat) < 0.000001
   AND (a.gps_lng IS NULL OR abs(a.gps_lng - g.lng) < 0.000001)
 GROUP BY a.tenantid, a.filial, g.lat, g.lng
 ORDER BY ativos_com_gps_da_ancora DESC;

-- 1.3 Fotografia geral por filial antes de mexer em qualquer linha.
SELECT filial,
       count(*)                                             AS total,
       count(*) FILTER (WHERE gps_lat IS NOT NULL)          AS com_gps,
       count(*) FILTER (WHERE coalesce(conferido, false))   AS conferidos
  FROM public.assets
 WHERE tenantid = 'CICOPAL'
 GROUP BY filial
 ORDER BY total DESC;

-- ----------------------------------------------------------------------------
-- 2. BACKUP (executar antes da limpeza)
-- ----------------------------------------------------------------------------
-- Guarda a coordenada atual de TODOS os ativos que têm alguma, para restauro
-- por `id`. Não mexe em `assets`.
CREATE TABLE IF NOT EXISTS public.assets_gps_backup_20261116 AS
SELECT a.id,
       a.tenantid,
       a.filial,
       a.primarykey,
       a.etiqueta,
       a.gps_lat,
       a.gps_lng,
       a.conferido,
       a.auditor,
       a.data_leitura,
       now() AS backup_em
  FROM public.assets a
 WHERE a.tenantid = 'CICOPAL'
   AND (a.gps_lat IS NOT NULL OR a.gps_lng IS NOT NULL);

-- As linhas do backup servem de rede de segurança; nada mais depende delas.
SELECT count(*) AS linhas_no_backup FROM public.assets_gps_backup_20261116;

-- ----------------------------------------------------------------------------
-- 3. LIMPEZA SEGURA (nunca conferidos, sem data de leitura, coordenada = âncora)
-- ----------------------------------------------------------------------------
-- Critério conservador: só toca no que não tem NENHUMA evidência de leitura.
-- Ativos conferidos ficam para a revisão da secção 4.
-- O bloco termina em `rollback;` DE PROPÓSITO: o ficheiro pode ser colado e
-- executado inteiro sem apagar nada. Confira a contagem devolvida pelo UPDATE e
-- só então troque `rollback;` por `commit;`.
BEGIN;

WITH ancora AS (
  SELECT uc.tenantid,
         upper(trim(uc.filial)) AS filial_norm,
         uc.lat,
         uc.lng
    FROM (
      -- `unit_configs` é a tabela canónica da filial; `inventory_config.data` é
      -- o registo histórico. Nesta base só `inventory_config` tem âncoras, por
      -- isso a leitura é a UNIÃO das duas — ler só uma delas reportaria zero.
      SELECT tenantid, filial, lat, lng
        FROM public.unit_configs
       WHERE filial IS NOT NULL
      UNION ALL
      SELECT tenantid, filial,
             NULLIF(data->>'lat', '')::numeric AS lat,
             NULLIF(data->>'lng', '')::numeric AS lng
        FROM public.inventory_config
       WHERE filial IS NOT NULL AND data IS NOT NULL
    ) uc
   WHERE uc.tenantid = 'CICOPAL'
     AND coalesce(uc.lat, 0) <> 0
     AND coalesce(uc.lng, 0) <> 0
)
UPDATE public.assets a
   SET gps_lat = NULL,
       gps_lng = NULL
  FROM ancora g
 WHERE upper(trim(a.tenantid)) = upper(trim(g.tenantid))
   AND upper(trim(a.filial)) = g.filial_norm
   AND NOT coalesce(a.conferido, false)
   AND a.data_leitura IS NULL
   AND a.gps_lat IS NOT NULL
   AND abs(a.gps_lat - g.lat) < 0.000001
   AND (a.gps_lng IS NULL OR abs(a.gps_lng - g.lng) < 0.000001);

-- Confira quantas linhas o UPDATE anterior reportou e então:
--   commit;     -> aplica a limpeza
--   rollback;   -> aborta (estado original)
ROLLBACK;

-- ----------------------------------------------------------------------------
-- 4. REVISÃO HUMANA (conferidos com a coordenada da âncora) — só leitura
-- ----------------------------------------------------------------------------
-- Estes ativos TÊM evidência de conferência, mas a coordenada é exatamente a da
-- filial. Pode ser (a) a âncora copiada pelo reparo antigo, ou (b) o fallback
-- administrativo que grava a âncora quando o GPS do aparelho falha. Decida por
-- filial/auditor: só apague depois de confirmar que ninguém esteve no local.
WITH ancora AS (
  SELECT uc.tenantid,
         upper(trim(uc.filial)) AS filial_norm,
         uc.lat,
         uc.lng
    FROM (
      -- `unit_configs` é a tabela canónica da filial; `inventory_config.data` é
      -- o registo histórico. Nesta base só `inventory_config` tem âncoras, por
      -- isso a leitura é a UNIÃO das duas — ler só uma delas reportaria zero.
      SELECT tenantid, filial, lat, lng
        FROM public.unit_configs
       WHERE filial IS NOT NULL
      UNION ALL
      SELECT tenantid, filial,
             NULLIF(data->>'lat', '')::numeric AS lat,
             NULLIF(data->>'lng', '')::numeric AS lng
        FROM public.inventory_config
       WHERE filial IS NOT NULL AND data IS NOT NULL
    ) uc
   WHERE uc.tenantid = 'CICOPAL'
     AND coalesce(uc.lat, 0) <> 0
     AND coalesce(uc.lng, 0) <> 0
)
SELECT a.filial,
       coalesce(a.auditor, '(sem auditor)') AS auditor,
       count(*)                              AS conferidos_com_gps_da_ancora,
       min(a.data_leitura)                   AS primeira_leitura,
       max(a.data_leitura)                   AS ultima_leitura
  FROM public.assets a
  JOIN ancora g
    ON upper(trim(g.tenantid)) = upper(trim(a.tenantid))
   AND g.filial_norm = upper(trim(a.filial))
 WHERE a.gps_lat IS NOT NULL
   AND abs(a.gps_lat - g.lat) < 0.000001
   AND (a.gps_lng IS NULL OR abs(a.gps_lng - g.lng) < 0.000001)
   AND coalesce(a.conferido, false)
 GROUP BY a.filial, coalesce(a.auditor, '(sem auditor)')
 ORDER BY conferidos_com_gps_da_ancora DESC;

-- Se a decisão for limpar também estes (mesmo critério de coordenada da âncora),
-- use este bloco, novamente com `rollback;` até conferir:
-- BEGIN;
-- WITH ancora AS (
--   SELECT uc.tenantid, upper(trim(uc.filial)) AS filial_norm, uc.lat, uc.lng
--     FROM (public.unit_configs UNION ALL public.inventory_config) uc  -- ver secção 1
--    WHERE uc.tenantid = 'CICOPAL'
--      AND coalesce(uc.lat, 0) <> 0 AND coalesce(uc.lng, 0) <> 0
-- )
-- UPDATE public.assets a
--    SET gps_lat = NULL, gps_lng = NULL
--   FROM ancora g
--  WHERE upper(trim(a.tenantid)) = upper(trim(g.tenantid))
--    AND upper(trim(a.filial)) = g.filial_norm
--    AND coalesce(a.conferido, false)
--    AND a.gps_lat IS NOT NULL
--    AND abs(a.gps_lat - g.lat) < 0.000001
--    AND (a.gps_lng IS NULL OR abs(a.gps_lng - g.lng) < 0.000001);
-- ROLLBACK;

-- ----------------------------------------------------------------------------
-- 5. VERIFICAÇÃO E RESTAURO
-- ----------------------------------------------------------------------------

-- 5.1 Depois da limpeza: quantos ativos ficaram sem GPS e quantos ainda têm a
--     coordenada da âncora (deve ser 0 no critério da secção 3).
WITH ancora AS (
  SELECT uc.tenantid,
         upper(trim(uc.filial)) AS filial_norm,
         uc.lat,
         uc.lng
    FROM (
      -- `unit_configs` é a tabela canónica da filial; `inventory_config.data` é
      -- o registo histórico. Nesta base só `inventory_config` tem âncoras, por
      -- isso a leitura é a UNIÃO das duas — ler só uma delas reportaria zero.
      SELECT tenantid, filial, lat, lng
        FROM public.unit_configs
       WHERE filial IS NOT NULL
      UNION ALL
      SELECT tenantid, filial,
             NULLIF(data->>'lat', '')::numeric AS lat,
             NULLIF(data->>'lng', '')::numeric AS lng
        FROM public.inventory_config
       WHERE filial IS NOT NULL AND data IS NOT NULL
    ) uc
   WHERE uc.tenantid = 'CICOPAL'
     AND coalesce(uc.lat, 0) <> 0
     AND coalesce(uc.lng, 0) <> 0
)
SELECT a.filial,
       count(*)                                            AS total,
       count(*) FILTER (WHERE a.gps_lat IS NULL)           AS sem_gps,
       count(*) FILTER (
         WHERE a.gps_lat IS NOT NULL
           AND g.lat IS NOT NULL
           AND abs(a.gps_lat - g.lat) < 0.000001
           AND (a.gps_lng IS NULL OR abs(a.gps_lng - g.lng) < 0.000001)
       )                                                   AS ainda_com_gps_da_ancora
  FROM public.assets a
  LEFT JOIN ancora g
    ON upper(trim(g.tenantid)) = upper(trim(a.tenantid))
   AND g.filial_norm = upper(trim(a.filial))
 WHERE a.tenantid = 'CICOPAL'
 GROUP BY a.filial
 ORDER BY total DESC;

-- 5.2 Restauro a partir do backup, se necessário (por id; só repõe o que estava
--     preenchido no backup).
-- UPDATE public.assets a
--    SET gps_lat = b.gps_lat,
--        gps_lng = b.gps_lng
--   FROM public.assets_gps_backup_20261116 b
--  WHERE a.id = b.id
--    AND a.tenantid = b.tenantid
--    AND b.gps_lat IS NOT NULL;
