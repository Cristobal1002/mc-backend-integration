import { CustomError } from './custom.error.js';

export const IntegrationSource = {
    HIOPOS: 'hiopos',
    SIIGO: 'siigo',
    INTERNAL: 'internal',
};

const detectSourceFromRequest = (error) => {
    const url = (
        error?.config?.url ||
        error?.response?.config?.url ||
        error?.request?.path ||
        ''
    ).toString().toLowerCase();

    if (url.includes('hiopos.com') || url.includes('cloudlicense.icg.eu')) {
        return IntegrationSource.HIOPOS;
    }
    if (url.includes('siigo.com')) {
        return IntegrationSource.SIIGO;
    }
    return null;
};

const buildAuthMessage = (source, operation) => {
    if (source === IntegrationSource.HIOPOS) {
        return `Hiopos: autenticación rechazada en "${operation}". El token x-auth-token es inválido o expiró.`;
    }
    if (source === IntegrationSource.SIIGO) {
        return `Siigo: autenticación rechazada en "${operation}". El token de acceso es inválido o expiró.`;
    }
    return `Error de autenticación en integración externa (${operation}).`;
};

const buildRateLimitMessage = (source, operation) => {
    if (source === IntegrationSource.SIIGO) {
        return `Siigo: límite de peticiones excedido (429) en "${operation}". Se reintentó automáticamente sin éxito; reduzca la concurrencia o espere unos minutos.`;
    }
    return `Límite de peticiones excedido (429) en "${operation}".`;
};

const buildGenericMessage = (source, operation, upstreamStatus) => {
    const statusLabel = upstreamStatus ? `HTTP ${upstreamStatus}` : 'sin código HTTP';
    if (source === IntegrationSource.HIOPOS) {
        return `Hiopos: error en "${operation}" (${statusLabel}).`;
    }
    if (source === IntegrationSource.SIIGO) {
        return `Siigo: error en "${operation}" (${statusLabel}).`;
    }
    return `Error en integración externa (${operation}, ${statusLabel}).`;
};

/**
 * Convierte errores de axios/integraciones en CustomError con origen explícito.
 * Usa 502 para fallos de auth upstream (evita confundir con JWT 401 del API).
 */
export const buildIntegrationError = ({
    error,
    source = null,
    operation = 'operación desconocida',
    defaultSource = IntegrationSource.INTERNAL,
}) => {
    if (error instanceof CustomError && error.source) {
        return error;
    }

    const resolvedSource = source || detectSourceFromRequest(error) || defaultSource;
    const upstreamStatus = error?.response?.status ?? error?.code ?? null;
    const isAuthError = upstreamStatus === 401 || upstreamStatus === 403;
    const isRateLimit = upstreamStatus === 429;

    const upstreamMessage =
        error?.response?.data?.message ||
        error?.response?.data?.Errors?.[0]?.Message ||
        error?.response?.data?.error ||
        (typeof error?.response?.data === 'string' ? error.response.data : null) ||
        error?.message ||
        null;

    const message = isAuthError
        ? buildAuthMessage(resolvedSource, operation)
        : isRateLimit
            ? buildRateLimitMessage(resolvedSource, operation)
            : buildGenericMessage(resolvedSource, operation, upstreamStatus);

    // 502 = fallo de auth upstream; 429 se conserva para identificar rate limit
    const httpCode = isAuthError
        ? 502
        : (upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 500);

    return new CustomError({
        message,
        code: httpCode,
        source: resolvedSource,
        data: {
            source: resolvedSource,
            operation,
            upstreamStatus,
            upstreamMessage,
            retryable: isAuthError || isRateLimit,
        },
    });
};
