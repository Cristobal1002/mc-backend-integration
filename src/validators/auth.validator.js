import { body } from 'express-validator';

export const loginValidator = [
    body('email')
        .notEmpty().withMessage('El email es requerido')
        .isEmail().withMessage('El email debe tener un formato válido')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('La contraseña es requerida')
        .isLength({ min: 1 }).withMessage('La contraseña es requerida')
];

export const changePasswordValidator = [
    body('currentPassword')
        .notEmpty().withMessage('La contraseña actual es requerida'),
    body('newPassword')
        .notEmpty().withMessage('La nueva contraseña es requerida')
        .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
    body('confirmPassword')
        .notEmpty().withMessage('La confirmación de contraseña es requerida')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Las contraseñas no coinciden');
            }
            return true;
        })
];

export const forgotPasswordValidator = [
    body('email')
        .notEmpty().withMessage('El email es requerido')
        .isEmail().withMessage('El email debe tener un formato válido')
        .normalizeEmail()
];

export const resetPasswordValidator = [
    body('token')
        .notEmpty().withMessage('El token de recuperación es requerido'),
    body('newPassword')
        .notEmpty().withMessage('La nueva contraseña es requerida')
        .isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
    body('confirmPassword')
        .notEmpty().withMessage('La confirmación de contraseña es requerida')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Las contraseñas no coinciden');
            }
            return true;
        })
];

