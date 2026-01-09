import { standardResponse } from '../utils/response-formatter.utils.js';
import { authService, userService, emailService } from '../services/index.js';
import { model } from '../models/index.js';
import { generatePasswordResetToken } from '../services/auth.service.js';
import { DateTime } from 'luxon';
import { Op } from 'sequelize';

/**
 * Login de usuario
 */
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await authService.authenticateUser(email, password);

        const accessToken = authService.generateAccessToken(user);
        const refreshToken = authService.generateRefreshToken(user);

        const userResponse = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            first_login: user.first_login
        };

        // Power user nunca requiere cambio de contraseña
        const requiresPasswordChange = user.role === 'power_user' ? false : user.first_login;

        standardResponse(res, 200, 'Login exitoso', {
            user: userResponse,
            accessToken,
            refreshToken,
            requiresPasswordChange
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Obtener usuario actual
 */
export const getCurrentUser = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const user = await userService.getUserById(userId);

        standardResponse(res, 200, '', {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            first_login: user.first_login,
            is_active: user.is_active
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Cambiar contraseña
 */
export const changePassword = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;

        await userService.changePassword(userId, currentPassword, newPassword);

        standardResponse(res, 200, 'Contraseña actualizada correctamente', null);
    } catch (error) {
        next(error);
    }
};

/**
 * Solicitar recuperación de contraseña
 */
export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        const user = await userService.getUserByEmail(email);

        if (!user) {
            // Por seguridad, no revelar si el email existe o no
            standardResponse(res, 200, 'Si el email existe, se enviará un enlace de recuperación', null);
            return;
        }

        const resetToken = generatePasswordResetToken();
        const resetExpires = DateTime.now().plus({ hours: 1 }).toJSDate();

        await user.update({
            password_reset_token: resetToken,
            password_reset_expires: resetExpires
        });

        // Intentar enviar email (no fallar si no está configurado)
        try {
            await emailService.sendPasswordResetEmail(email, resetToken);
        } catch (emailError) {
            console.error('Error enviando email de recuperación:', emailError);
            // Continuar aunque falle el email (el token se guardó)
        }

        standardResponse(res, 200, 'Si el email existe, se enviará un enlace de recuperación', null);
    } catch (error) {
        next(error);
    }
};

/**
 * Resetear contraseña con token
 */
export const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;

        const user = await model.UserModel.findOne({
            where: {
                password_reset_token: token,
                password_reset_expires: {
                    [Op.gt]: new Date()
                }
            }
        });

        if (!user) {
            return standardResponse(res, 400, 'Token inválido o expirado', null);
        }

        const { hashPassword } = await import('../services/auth.service.js');
        const hashedPassword = await hashPassword(newPassword);

        await user.update({
            password: hashedPassword,
            password_reset_token: null,
            password_reset_expires: null,
            first_login: false
        });

        standardResponse(res, 200, 'Contraseña restablecida correctamente', null);
    } catch (error) {
        next(error);
    }
};

/**
 * Renovar token de acceso
 */
export const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return standardResponse(res, 401, 'Refresh token requerido', null);
        }

        const decoded = authService.verifyToken(refreshToken, true);

        const user = await model.UserModel.findByPk(decoded.userId);

        if (!user || !user.is_active) {
            return standardResponse(res, 401, 'Usuario no válido', null);
        }

        const newAccessToken = authService.generateAccessToken(user);
        const newRefreshToken = authService.generateRefreshToken(user);

        standardResponse(res, 200, 'Token renovado', {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken
        });
    } catch (error) {
        next(error);
    }
};

