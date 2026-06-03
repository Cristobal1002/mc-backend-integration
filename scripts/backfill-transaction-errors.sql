-- =============================================================================
-- Backfill: transacciones FAILED de abril/mayo 2026 sin error usable
-- Ejecutar en PostgreSQL (base: integrations / myriam-camhi)
-- =============================================================================

-- 1) PREVIEW: cuántas están dañadas
SELECT
  COUNT(*) AS total_failed,
  COUNT(*) FILTER (
    WHERE error IS NULL
       OR error = 'null'::jsonb
       OR error = '{}'::jsonb
       OR (
         COALESCE(error->>'message', '') = ''
         AND COALESCE(error->>'upstreamMessage', '') = ''
         AND (error->'Errors') IS NULL
         AND (error->'errors') IS NULL
       )
  ) AS danadas_sin_error
FROM transactions
WHERE status = 'failed'
  AND "deletedAt" IS NULL
  AND document_date BETWEEN '2026-04-01' AND '2026-05-31';


-- 2) PREVIEW: listado de dañadas
SELECT
  id,
  document_number,
  type,
  document_date,
  lote_id,
  siigo_body IS NOT NULL AS tiene_siigo_body,
  document_validator_status,
  contact_validator_status,
  items_validator_status,
  payments_validator_status,
  cost_center_validator_status,
  error
FROM transactions
WHERE status = 'failed'
  AND "deletedAt" IS NULL
  AND document_date BETWEEN '2026-04-01' AND '2026-05-31'
  AND (
    error IS NULL
    OR error = 'null'::jsonb
    OR error = '{}'::jsonb
    OR (
      COALESCE(error->>'message', '') = ''
      AND COALESCE(error->>'upstreamMessage', '') = ''
      AND (error->'Errors') IS NULL
      AND (error->'errors') IS NULL
    )
  )
ORDER BY document_date, document_number;


-- 3) UPDATE simple: las que tienen siigo_body (fallaron al sincronizar con Siigo)
--    Les pone un error genérico recuperable para ver en UI y reprocesar.
UPDATE transactions
SET error = jsonb_build_object(
  'message', 'Error al sincronizar con Siigo (detalle no registrado). Tiene siigo_body — puede reprocesarse o editarse.',
  'source', 'siigo',
  'recoverable', true,
  'Errors', jsonb_build_array(
    jsonb_build_object('Message', 'Error al sincronizar con Siigo (detalle no registrado)')
  )
)
WHERE status = 'failed'
  AND "deletedAt" IS NULL
  AND document_date BETWEEN '2026-04-01' AND '2026-05-31'
  AND siigo_body IS NOT NULL
  AND (
    error IS NULL
    OR error = 'null'::jsonb
    OR error = '{}'::jsonb
    OR (
      COALESCE(error->>'message', '') = ''
      AND COALESCE(error->>'upstreamMessage', '') = ''
      AND (error->'Errors') IS NULL
      AND (error->'errors') IS NULL
    )
  );


-- 4) UPDATE simple: las que NO tienen siigo_body (fallaron en validación)
UPDATE transactions
SET error = jsonb_build_object(
  'message',
  CASE
    WHEN document_validator_status = 'failed' THEN 'Documento: validación fallida'
    WHEN contact_validator_status = 'failed' THEN 'Contacto: validación fallida'
    WHEN items_validator_status = 'failed' THEN 'Ítems: validación fallida'
    WHEN payments_validator_status = 'failed' THEN 'Pagos: validación fallida'
    WHEN cost_center_validator_status = 'failed' THEN 'Centro de costo: validación fallida'
    ELSE 'Transacción fallida (detalle no registrado). Puede reprocesarse.'
  END,
  'source', 'validation',
  'recoverable', true,
  'Errors', jsonb_build_array(
    jsonb_build_object(
      'Message',
      CASE
        WHEN document_validator_status = 'failed' THEN 'Documento: validación fallida'
        WHEN contact_validator_status = 'failed' THEN 'Contacto: validación fallida'
        WHEN items_validator_status = 'failed' THEN 'Ítems: validación fallida'
        WHEN payments_validator_status = 'failed' THEN 'Pagos: validación fallida'
        WHEN cost_center_validator_status = 'failed' THEN 'Centro de costo: validación fallida'
        ELSE 'Transacción fallida (detalle no registrado)'
      END
    )
  )
)
WHERE status = 'failed'
  AND "deletedAt" IS NULL
  AND document_date BETWEEN '2026-04-01' AND '2026-05-31'
  AND siigo_body IS NULL
  AND (
    error IS NULL
    OR error = 'null'::jsonb
    OR error = '{}'::jsonb
    OR (
      COALESCE(error->>'message', '') = ''
      AND COALESCE(error->>'upstreamMessage', '') = ''
      AND (error->'Errors') IS NULL
      AND (error->'errors') IS NULL
    )
  );


-- 5) UPDATE: reparar wrappers rotos (tienen upstreamMessage pero no message)
UPDATE transactions
SET error = error
  || jsonb_build_object('message', error->>'upstreamMessage')
  || jsonb_build_object(
    'Errors',
    jsonb_build_array(jsonb_build_object('Message', error->>'upstreamMessage'))
  )
WHERE status = 'failed'
  AND "deletedAt" IS NULL
  AND document_date BETWEEN '2026-04-01' AND '2026-05-31'
  AND error IS NOT NULL
  AND COALESCE(error->>'message', '') = ''
  AND COALESCE(error->>'upstreamMessage', '') <> '';


-- 6) VERIFICACIÓN post-update
SELECT
  id,
  document_number,
  document_date,
  error->>'message' AS mensaje,
  error->'Errors'->0->>'Message' AS siigo_style
FROM transactions
WHERE status = 'failed'
  AND "deletedAt" IS NULL
  AND document_date BETWEEN '2026-04-01' AND '2026-05-31'
ORDER BY document_date, document_number;
