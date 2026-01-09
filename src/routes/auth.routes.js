import express from "express";
import { validateRequestMiddleware } from "../middleware/index.js";
import { authValidator } from "../validators/index.js";
import { authController } from "../controllers/index.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

export const auth = express.Router();

// Rutas públicas
auth.post('/login', 
    authValidator.loginValidator, 
    validateRequestMiddleware.validateRequest, 
    authController.login
);

auth.post('/forgot-password',
    authValidator.forgotPasswordValidator,
    validateRequestMiddleware.validateRequest,
    authController.forgotPassword
);

auth.post('/reset-password',
    authValidator.resetPasswordValidator,
    validateRequestMiddleware.validateRequest,
    authController.resetPassword
);

auth.post('/refresh-token', authController.refreshToken);

// Rutas protegidas
auth.get('/me', 
    authenticateToken, 
    authController.getCurrentUser
);

auth.post('/change-password',
    authenticateToken,
    authValidator.changePasswordValidator,
    validateRequestMiddleware.validateRequest,
    authController.changePassword
);

