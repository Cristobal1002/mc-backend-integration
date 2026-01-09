import { standardResponse } from '../utils/response-formatter.utils.js';
import { userService, emailService } from '../services/index.js';

/**
 * Crear nuevo usuario (solo admin/power_user)
 */
export const createUser = async (req, res, next) => {
    try {
        const createdById = req.user.userId;
        const userData = req.body;

        const newUser = await userService.createUser(userData, createdById);

        // No enviar email automáticamente, el admin decidirá si enviarlo
        standardResponse(res, 201, 'Usuario creado correctamente', newUser);
    } catch (error) {
        next(error);
    }
};

/**
 * Listar usuarios (solo admin/power_user)
 */
export const listUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const filters = {
            role: req.query.role,
            is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
            search: req.query.search
        };

        const result = await userService.listUsers(page, limit, filters);

        standardResponse(res, 200, '', result);
    } catch (error) {
        next(error);
    }
};

/**
 * Obtener usuario por ID
 */
export const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await userService.getUserById(id);

        standardResponse(res, 200, '', user);
    } catch (error) {
        next(error);
    }
};

/**
 * Actualizar usuario
 */
export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const updatedById = req.user.userId;

        // Verificar si el usuario a actualizar es power_user
        const userToUpdate = await userService.getUserById(id);
        if (userToUpdate.role === 'power_user') {
            return standardResponse(res, 403, 'No se puede editar un usuario power_user', null);
        }

        const updatedUser = await userService.updateUser(id, updateData, updatedById);

        standardResponse(res, 200, 'Usuario actualizado correctamente', updatedUser);
    } catch (error) {
        next(error);
    }
};

/**
 * Eliminar usuario (soft delete)
 */
export const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Verificar si el usuario a eliminar es power_user
        const userToDelete = await userService.getUserById(id);
        if (userToDelete.role === 'power_user') {
            return standardResponse(res, 403, 'No se puede eliminar un usuario power_user', null);
        }

        const result = await userService.deleteUser(id);

        standardResponse(res, 200, result.message, null);
    } catch (error) {
        next(error);
    }
};

/**
 * Resetear credenciales de usuario
 */
export const resetCredentials = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Verificar si el usuario es power_user
        const userToReset = await userService.getUserById(id);
        if (userToReset.role === 'power_user') {
            return standardResponse(res, 403, 'No se pueden resetear las credenciales de un usuario power_user', null);
        }

        const result = await userService.resetUserCredentials(id);

        // Intentar enviar email con nuevas credenciales
        try {
            await emailService.sendTemporaryCredentialsEmail(result.email, result.temporaryPassword);
        } catch (emailError) {
            console.error('Error enviando email de credenciales:', emailError);
            // Continuar aunque falle el email
        }

        standardResponse(res, 200, 'Credenciales reseteadas correctamente', result);
    } catch (error) {
        next(error);
    }
};

/**
 * Enviar credenciales por email
 */
export const sendCredentialsByEmail = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return standardResponse(res, 400, 'Email y contraseña son requeridos', null);
        }

        const result = await emailService.sendTemporaryCredentialsEmail(email, password);

        if (result.success) {
            standardResponse(res, 200, 'Credenciales enviadas por email correctamente', null);
        } else {
            standardResponse(res, 500, result.message || 'Error al enviar el email', null);
        }
    } catch (error) {
        next(error);
    }
};

