import { CustomError } from '../errors/index.js';

export const errorHandler = async (err, _, res, next) => {
    if (!err) return next(); // Si no hay error, continúa con el siguiente middleware

    // Si el error es una instancia de CustomError
    if (err instanceof CustomError) {
        const serializedError = err.serialize();
        const statusCode = err.code || 500;  // Si no hay código definido, usar 500 por defecto

        return res.status(statusCode).json({
            status: 'error',
            message: serializedError.message || 'Error desconocido',
            data: serializedError.data || null,
        });
    }

    // Manejo genérico para errores no controlados
    return res.status(500).json({
        status: 'error',
        message: 'Error interno del servidor',
        error: err.message || 'Algo salió mal',
    });
};
