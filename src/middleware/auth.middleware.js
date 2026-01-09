import { CustomError } from '../errors/index.js';
import { authService } from '../services/index.js';
import { model } from '../models/index.js';

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

/**
 * Middleware de autenticación JWT
 * Verifica el token en el header Authorization: Bearer <token>
 */
export const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            throw new CustomError({
                message: 'Token de autenticación requerido',
                code: 401,
                data: null
            });
        }

        const decoded = authService.verifyToken(token, false);
        
        // Verificar que el usuario existe y está activo
        const user = await model.UserModel.findByPk(decoded.userId);

        if (!user || !user.is_active) {
            throw new CustomError({
                message: 'Usuario no válido o inactivo',
                code: 401,
                data: null
            });
        }

        // Agregar información del usuario al request
        req.user = {
            userId: user.id,
            email: user.email,
            role: user.role
        };

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware que requiere autenticación
 * Wrapper simple para authenticateToken
 */
export const requireAuth = authenticateToken;

/**
 * Middleware que verifica que el usuario tenga uno de los roles especificados
 * @param {string[]} allowedRoles - Array de roles permitidos
 */
export const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw new CustomError({
                    message: 'Autenticación requerida',
                    code: 401,
                    data: null
                });
            }

            if (!allowedRoles.includes(req.user.role)) {
                throw new CustomError({
                    message: 'No tienes permisos para realizar esta acción',
                    code: 403,
                    data: null
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Middleware que verifica que el usuario tenga al menos uno de los roles especificados
 * Útil cuando múltiples roles pueden acceder
 */
export const requireAnyRole = (allowedRoles) => {
    return requireRole(allowedRoles);
};

