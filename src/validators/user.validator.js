import { body } from 'express-validator';

export const createUserValidator = [
    body('username')
        .notEmpty().withMessage('El nombre de usuario es requerido')
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('El nombre de usuario debe tener entre 2 y 100 caracteres'),
    body('email')
        .notEmpty().withMessage('El email es requerido')
        .isEmail().withMessage('El email debe tener un formato válido')
        .normalizeEmail(),
    body('role')
        .notEmpty().withMessage('El rol es requerido')
        .isIn(['admin', 'compras', 'ventas', 'power_user']).withMessage('El rol debe ser uno de: admin, compras, ventas, power_user'),
    body('password')
        .optional()
        .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
];

export const updateUserValidator = [
    body('username')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 }).withMessage('El nombre de usuario debe tener entre 2 y 100 caracteres'),
    body('email')
        .optional()
        .isEmail().withMessage('El email debe tener un formato válido')
        .normalizeEmail(),
    body('role')
        .optional()
        .isIn(['admin', 'compras', 'ventas', 'power_user']).withMessage('El rol debe ser uno de: admin, compras, ventas, power_user'),
    body('is_active')
        .optional()
        .isBoolean().withMessage('is_active debe ser un valor booleano')
];

