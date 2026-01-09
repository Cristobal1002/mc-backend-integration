import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { model } from '../models/index.js';
import { CustomError } from '../errors/index.js';

// Tiempos de expiración hardcodeados (24h para access, 7d para refresh)
const JWT_EXPIRES_IN = '24h';
const JWT_REFRESH_EXPIRES_IN = '7d';

// Función helper para obtener JWT_SECRET con validación lazy
const getJWTSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('❌ ERROR: JWT_SECRET no está definido en las variables de entorno');
        console.error('Por favor, agrega JWT_SECRET a tu archivo .env');
        console.error('Variables de entorno disponibles:', {
            hasJWT_SECRET: !!process.env.JWT_SECRET,
            JWT_SECRET_value: process.env.JWT_SECRET || 'undefined',
            JWT_SECRET_type: typeof process.env.JWT_SECRET,
            allEnvKeys: Object.keys(process.env).filter(k => k.includes('JWT') || k.includes('SECRET'))
        });
        throw new Error('JWT_SECRET no está configurado. Revisa tu archivo .env');
    }
    return secret;
};

// Función helper para obtener JWT_REFRESH_SECRET
const getJWTRefreshSecret = () => {
    return process.env.JWT_REFRESH_SECRET || getJWTSecret();
};

/**
 * Hashea una contraseña
 */
export const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

/**
 * Compara una contraseña con su hash
 */
export const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

/**
 * Genera un token JWT de acceso
 */
export const generateAccessToken = (user) => {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role
    };
    return jwt.sign(payload, getJWTSecret(), { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Genera un token JWT de refresh
 */
export const generateRefreshToken = (user) => {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        type: 'refresh'
    };
    return jwt.sign(payload, getJWTRefreshSecret(), { expiresIn: JWT_REFRESH_EXPIRES_IN });
};

/**
 * Verifica y decodifica un token JWT
 */
export const verifyToken = (token, isRefresh = false) => {
    try {
        const secret = isRefresh ? getJWTRefreshSecret() : getJWTSecret();
        return jwt.verify(token, secret);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new CustomError({
                message: 'Token expirado',
                code: 401,
                data: { expired: true }
            });
        }
        throw new CustomError({
            message: 'Token inválido',
            code: 401,
            data: null
        });
    }
};

/**
 * Autentica un usuario con email y password
 */
export const authenticateUser = async (email, password) => {
    const user = await model.UserModel.findOne({
        where: { email: email.toLowerCase(), is_active: true }
    });

    if (!user) {
        throw new CustomError({
            message: 'Credenciales inválidas',
            code: 401,
            data: null
        });
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
        throw new CustomError({
            message: 'Credenciales inválidas',
            code: 401,
            data: null
        });
    }

    return user;
};

/**
 * Genera un token de recuperación de contraseña
 */
export const generatePasswordResetToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

/**
 * Genera una contraseña temporal aleatoria
 */
export const generateTemporaryPassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
};

