import { CustomError } from '../errors/index.js';

export const errorHandler = async (err, req, res, next) => {
    if (!err) return next(); // Si no hay error, continúa con el siguiente middleware

    console.error("Error capturado en el middleware:", err);

    // Si el error es una instancia de CustomError
    if (err instanceof CustomError) {
        const serializedError = err.serialize();
        const statusCode = err.code || 500; // Usar 500 por defecto si no hay código definido

        return res.status(statusCode).json({
            status: 'error',
            message: serializedError.message || 'Error desconocido',
            data: serializedError.data || null, // Los detalles del error en "data"
        });
    }

    // Manejo genérico para errores no controlados
    return res.status(500).json({
        status: 'error',
        message: 'Error interno del servidor',
        data: {
            message: err.message || 'Algo salió mal',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined, // Incluye el stack solo en desarrollo
        },
    });
};