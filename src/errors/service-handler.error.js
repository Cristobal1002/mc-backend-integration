import { CustomError } from './custom.error.js';
import { buildIntegrationError } from './integration.error.js';

export const handleServiceError = (error, { operation, source } = {}) => {
    if (error instanceof CustomError) {
        throw error;
    }

    if (error?.response || error?.config?.url) {
        throw buildIntegrationError({ error, operation, source });
    }

    if (error) {
        throw new CustomError({
            message: error.message || 'Error en el servidor',
            code: error.code || 500,
            source: source || null,
            data: error.data || null,
        });
    }

    throw new CustomError({
        message: 'Error desconocido',
        code: 500,
    });
};