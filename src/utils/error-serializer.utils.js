import { CustomError } from '../errors/index.js';

/**
 * Extrae el cuerpo de error crudo de Siigo u otro upstream (axios / CustomError).
 */
export const extractUpstreamBody = (error) => {
    if (!error) return null;

    if (error instanceof CustomError) {
        return (
            error.data?.upstreamResponse ??
            error.data?.Errors ??
            error.data?.errors ??
            (error.data?.upstreamMessage ? error.data : null)
        );
    }

    return error.response?.data ?? error.data ?? null;
};

/**
 * Normaliza cualquier error a un objeto JSONB apto para transaction.error / reproceso manual.
 * Mantiene compatibilidad con el front que lee Errors[].Message y errors[].message.
 */
export const serializeErrorForDb = (error) => {
    if (!error) return { message: 'Error desconocido' };

    const upstream = extractUpstreamBody(error);
    const source = error?.source ?? error?.data?.source ?? upstream?.source ?? null;
    const operation = error?.data?.operation ?? null;
    const upstreamStatus = error?.data?.upstreamStatus ?? error?.response?.status ?? error?.code ?? null;

    const siigoErrors =
        upstream?.Errors ??
        upstream?.errors ??
        error?.data?.Errors ??
        error?.data?.errors ??
        null;

    const primaryMessage =
        (Array.isArray(siigoErrors) && (siigoErrors[0]?.Message || siigoErrors[0]?.message)) ||
        upstream?.message ||
        error?.data?.upstreamMessage ||
        error?.message ||
        'Error en integración';

    const payload = {
        message: primaryMessage,
        source,
        operation,
        upstreamStatus,
        upstreamMessage: error?.data?.upstreamMessage ?? upstream?.message ?? null,
    };

    if (Array.isArray(siigoErrors) && siigoErrors.length > 0) {
        payload.Errors = siigoErrors.map((e) => ({
            Message: e.Message ?? e.message ?? String(e),
            Code: e.Code ?? e.code ?? null,
            Params: e.Params ?? e.params ?? null,
        }));
        payload.errors = siigoErrors.map((e) => ({
            message: e.message ?? e.Message ?? String(e),
            code: e.code ?? e.Code ?? null,
        }));
    }

    if (upstream && typeof upstream === 'object' && !payload.Errors) {
        payload.upstreamResponse = upstream;
    }

    return payload;
};

const VALIDATION_FIELDS = [
    { field: 'document_validator_status', details: 'document_validator_details', label: 'Documento' },
    { field: 'cost_center_validator_status', details: 'cost_center_validator_details', label: 'Centro de costo' },
    { field: 'contact_validator_status', details: 'contact_validator_details', label: 'Contacto' },
    { field: 'items_validator_status', details: 'items_validator_details', label: 'Ítems' },
    { field: 'payments_validator_status', details: 'payments_validator_details', label: 'Pagos' },
];

const detailToMessage = (details) => {
    if (!details) return null;
    if (typeof details === 'string') return details;
    if (details.message) return details.message;

    if (Array.isArray(details)) {
        for (const entry of details) {
            if (entry?.message) return entry.message;
            if (entry?.status === 'failed' || entry?.status === 'not_found') {
                const nested = entry.details?.error ?? entry.details?.Errors?.[0]?.Message ?? entry.details;
                if (typeof nested === 'string') return nested;
                if (nested?.Errors?.[0]?.Message) return nested.Errors[0].Message;
                if (entry.item) return `Ítem ${entry.item}: validación fallida`;
            }
            if (entry?.name && entry?.status === 'not_found') {
                return `Impuesto no encontrado: ${entry.name}`;
            }
        }
    }

    return null;
};

/**
 * Arma resumen de error cuando la transacción falla en validación (sin llegar a Siigo invoice).
 */
export const buildValidationErrorSummary = (transaction) => {
    const failures = [];

    for (const { field, details, label } of VALIDATION_FIELDS) {
        if (transaction[field] === 'failed') {
            const msg = detailToMessage(transaction[details]);
            failures.push({ field: label, message: msg || `${label}: validación fallida` });
        }
    }

    if (failures.length === 0) {
        return { message: 'Validación fallida sin detalle específico', source: 'internal', failures: [] };
    }

    return {
        message: failures.map((f) => f.message).join(' | '),
        source: 'validation',
        failures,
        Errors: failures.map((f) => ({ Message: `${f.field}: ${f.message}` })),
    };
};

/**
 * Repara un error ya guardado en BD (wrapper CustomError, upstreamMessage suelto, etc.).
 */
export const normalizeStoredError = (error, transaction = null) => {
    if (!error || (typeof error === 'object' && Object.keys(error).length === 0)) {
        return transaction ? buildValidationErrorSummary(transaction) : null;
    }

    if (typeof error === 'string') {
        return { message: error, source: 'legacy', Errors: [{ Message: error }] };
    }

    const upstream = error.upstreamResponse ?? null;
    const siigoErrors = error.Errors ?? error.errors ?? upstream?.Errors ?? upstream?.errors ?? null;
    const message =
        error.message ||
        error.upstreamMessage ||
        (Array.isArray(siigoErrors) && (siigoErrors[0]?.Message || siigoErrors[0]?.message)) ||
        null;

    if (message) {
        const payload = {
            ...error,
            message,
            source: error.source ?? upstream?.source ?? 'siigo',
        };
        if (Array.isArray(siigoErrors) && siigoErrors.length > 0 && !payload.Errors) {
            payload.Errors = siigoErrors.map((e) => ({
                Message: e.Message ?? e.message ?? String(e),
            }));
        }
        return payload;
    }

    if (transaction) {
        const fromValidation = buildValidationErrorSummary(transaction);
        if (fromValidation.failures?.length > 0) {
            return fromValidation;
        }
    }

    return null;
};

/** Indica si transaction.error está vacío o no es usable en UI/reproceso. */
export const isMissingTransactionError = (error) => {
    if (error == null) return true;
    if (typeof error === 'string') return error.trim().length === 0;
    if (typeof error !== 'object') return true;
    if (Object.keys(error).length === 0) return true;

    const hasMessage = typeof error.message === 'string' && error.message.trim().length > 0;
    const hasUpstream = typeof error.upstreamMessage === 'string' && error.upstreamMessage.trim().length > 0;
    const hasErrors =
        (Array.isArray(error.Errors) && error.Errors.length > 0) ||
        (Array.isArray(error.errors) && error.errors.length > 0);

    return !hasMessage && !hasUpstream && !hasErrors;
};

/**
 * Construye el error final para backfill de transacciones dañadas.
 */
export const rebuildTransactionError = (transaction) => {
    let rebuilt = normalizeStoredError(transaction.error, transaction);

    if (isMissingTransactionError(rebuilt)) {
        rebuilt = buildValidationErrorSummary(transaction);
    }

    if (isMissingTransactionError(rebuilt) || rebuilt?.message === 'Validación fallida sin detalle específico') {
        if (transaction.siigo_body) {
            return {
                message: 'Error al sincronizar con Siigo (detalle no registrado). Tiene siigo_body — puede reprocesarse o editarse.',
                source: 'siigo',
                recoverable: true,
                Errors: [{ Message: 'Error al sincronizar con Siigo (detalle no registrado)' }],
            };
        }
        return {
            message: 'Transacción fallida (detalle no registrado). Puede reprocesarse.',
            source: 'internal',
            recoverable: true,
            Errors: [{ Message: 'Transacción fallida (detalle no registrado)' }],
        };
    }

    return { ...rebuilt, recoverable: true };
};
