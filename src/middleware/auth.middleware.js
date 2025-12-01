import { CustomError } from '../errors/index.js';

// Clave de administrador para operaciones de borrado
const ADMIN_KEY = 'AdminTech2025@';

/**
 * Middleware de autenticación para operaciones de borrado
 * Verifica la clave en el body como 'adminKey'
 */
export const requireAdminKey = (req, res, next) => {
    try {
        const providedKey = req.body?.adminKey;

        if (!providedKey) {
            throw new CustomError({
                message: 'Clave de administrador requerida. Proporcione la clave en el body como "adminKey".',
                code: 401,
                data: null
            });
        }

        if (providedKey !== ADMIN_KEY) {
            throw new CustomError({
                message: 'Clave de administrador inválida. Acceso denegado.',
                code: 401,
                data: null
            });
        }

        // Si la clave es válida, eliminarla del body para que no interfiera con otras validaciones
        delete req.body.adminKey;

        // Continuar con la siguiente función
        next();
    } catch (error) {
        next(error);
    }
};

