import express from "express";
import { validateRequestMiddleware } from "../middleware/index.js";
import { userValidator } from "../validators/index.js";
import { userController } from "../controllers/index.js";
import { authenticateToken, requireRole } from "../middleware/auth.middleware.js";

export const users = express.Router();

// Todas las rutas requieren autenticación
users.use(authenticateToken);

// Rutas públicas para todos los usuarios autenticados
users.get('/', userController.listUsers);
users.get('/:id', userController.getUserById);

// Rutas restringidas solo para admin y power_user
users.post('/',
    requireRole(['admin', 'power_user']),
    userValidator.createUserValidator,
    validateRequestMiddleware.validateRequest,
    userController.createUser
);

users.put('/:id',
    requireRole(['admin', 'power_user']),
    userValidator.updateUserValidator,
    validateRequestMiddleware.validateRequest,
    userController.updateUser
);

users.delete('/:id',
    requireRole(['admin', 'power_user']),
    userController.deleteUser
);

users.post('/:id/reset-credentials',
    requireRole(['admin', 'power_user']),
    userController.resetCredentials
);

users.post('/send-credentials',
    requireRole(['admin', 'power_user']),
    userController.sendCredentialsByEmail
);

