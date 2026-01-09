import { model } from '../models/index.js';
import { hashPassword, generateTemporaryPassword } from './auth.service.js';
import { CustomError } from '../errors/index.js';
import { Op } from 'sequelize';

/**
 * Crea un nuevo usuario
 */
export const createUser = async (userData, createdById) => {
    const { username, email, role, password } = userData;

    // Verificar si el email ya existe (incluyendo usuarios eliminados)
    const existingUser = await model.UserModel.findOne({
        where: { email: email.toLowerCase() },
        paranoid: false // Buscar también en registros eliminados
    });

    // Si el usuario existe y NO está eliminado, lanzar error
    if (existingUser && !existingUser.deletedAt) {
        throw new CustomError({
            message: 'El email ya está registrado',
            code: 409,
            data: null
        });
    }

    // Si no se proporciona password, generar uno temporal
    const finalPassword = password || generateTemporaryPassword();
    const hashedPassword = await hashPassword(finalPassword);

    // Si el usuario existía pero estaba eliminado, restaurarlo
    if (existingUser && existingUser.deletedAt) {
        await existingUser.restore();
        await existingUser.update({
            username: username.trim(),
            password: hashedPassword,
            role: role || 'compras',
            first_login: true,
            created_by: createdById,
            is_active: true,
            password_reset_token: null,
            password_reset_expires: null
        });

        const userResponse = {
            id: existingUser.id,
            username: existingUser.username,
            email: existingUser.email,
            role: existingUser.role,
            first_login: existingUser.first_login,
            is_active: existingUser.is_active
        };

        // Si se generó una contraseña temporal, incluirla en la respuesta
        if (!password) {
            userResponse.temporaryPassword = finalPassword;
        }

        return userResponse;
    }

    // Si no existía, crear uno nuevo
    const newUser = await model.UserModel.create({
        username: username.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        role: role || 'compras',
        first_login: true,
        created_by: createdById,
        is_active: true
    });

    // Retornar el usuario sin la contraseña y con la contraseña temporal si fue generada
    const userResponse = {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        first_login: newUser.first_login,
        is_active: newUser.is_active,
        createdAt: newUser.createdAt
    };

    // Si se generó una contraseña temporal, incluirla en la respuesta (solo esta vez)
    if (!password) {
        userResponse.temporaryPassword = finalPassword;
    }

    return userResponse;
};

/**
 * Obtiene un usuario por ID
 */
export const getUserById = async (userId) => {
    const user = await model.UserModel.findByPk(userId, {
        attributes: { exclude: ['password', 'password_reset_token'] },
        include: [{
            model: model.UserModel,
            as: 'creator',
            attributes: ['id', 'username', 'email']
        }]
    });

    if (!user) {
        throw new CustomError({
            message: 'Usuario no encontrado',
            code: 404,
            data: null
        });
    }

    return user;
};

/**
 * Lista usuarios con paginación
 */
export const listUsers = async (page = 1, limit = 10, filters = {}) => {
    const offset = (page - 1) * limit;
    const where = {};

    if (filters.role) {
        where.role = filters.role;
    }

    if (filters.is_active !== undefined) {
        where.is_active = filters.is_active;
    }

    if (filters.search) {
        where[Op.or] = [
            { email: { [Op.iLike]: `%${filters.search}%` } },
            { username: { [Op.iLike]: `%${filters.search}%` } }
        ];
    }

    const { count, rows } = await model.UserModel.findAndCountAll({
        where,
        attributes: { exclude: ['password', 'password_reset_token'] },
        include: [{
            model: model.UserModel,
            as: 'creator',
            attributes: ['id', 'username', 'email']
        }],
        limit,
        offset,
        order: [['createdAt', 'DESC']]
    });

    return {
        users: rows,
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: page
    };
};

/**
 * Actualiza un usuario
 */
export const updateUser = async (userId, updateData, updatedById) => {
    const user = await model.UserModel.findByPk(userId);

    if (!user) {
        throw new CustomError({
            message: 'Usuario no encontrado',
            code: 404,
            data: null
        });
    }

    // Si se actualiza el email, verificar que no exista
    if (updateData.email && updateData.email.toLowerCase() !== user.email) {
        const existingUser = await model.UserModel.findOne({
            where: { 
                email: updateData.email.toLowerCase(),
                id: { [Op.ne]: userId }
            }
        });

        if (existingUser) {
            throw new CustomError({
                message: 'El email ya está registrado',
                code: 409,
                data: null
            });
        }
        updateData.email = updateData.email.toLowerCase();
    }

    // No permitir actualizar password directamente aquí (usar changePassword o resetCredentials)
    delete updateData.password;

    await user.update(updateData);

    return await getUserById(userId);
};

/**
 * Elimina un usuario (soft delete)
 */
export const deleteUser = async (userId) => {
    const user = await model.UserModel.findByPk(userId);

    if (!user) {
        throw new CustomError({
            message: 'Usuario no encontrado',
            code: 404,
            data: null
        });
    }

    await user.destroy();
    return { message: 'Usuario eliminado correctamente' };
};

/**
 * Resetea las credenciales de un usuario (genera nueva contraseña temporal)
 */
export const resetUserCredentials = async (userId) => {
    const user = await model.UserModel.findByPk(userId);

    if (!user) {
        throw new CustomError({
            message: 'Usuario no encontrado',
            code: 404,
            data: null
        });
    }

    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await hashPassword(temporaryPassword);

    await user.update({
        password: hashedPassword,
        first_login: true,
        password_reset_token: null,
        password_reset_expires: null
    });

    return {
        id: user.id,
        username: user.username,
        email: user.email,
        temporaryPassword: temporaryPassword // Solo se muestra esta vez
    };
};

/**
 * Cambia la contraseña de un usuario
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
    const user = await model.UserModel.findByPk(userId);

    if (!user) {
        throw new CustomError({
            message: 'Usuario no encontrado',
            code: 404,
            data: null
        });
    }

    const { comparePassword } = await import('./auth.service.js');
    const isPasswordValid = await comparePassword(currentPassword, user.password);

    if (!isPasswordValid) {
        throw new CustomError({
            message: 'Contraseña actual incorrecta',
            code: 401,
            data: null
        });
    }

    const hashedPassword = await hashPassword(newPassword);
    await user.update({
        password: hashedPassword,
        first_login: false
    });

    return { message: 'Contraseña actualizada correctamente' };
};

/**
 * Obtiene usuario por email
 */
export const getUserByEmail = async (email) => {
    return await model.UserModel.findOne({
        where: { email: email.toLowerCase() }
    });
};

