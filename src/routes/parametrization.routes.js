import express from "express";
import {parametrizationController} from "../controllers/index.js";
import {validateRequestMiddleware} from "../middleware/index.js";
import {authenticateToken, requireRole} from "../middleware/auth.middleware.js";

export const parametrization = express.Router()

// Todas las rutas requieren autenticación
parametrization.use(authenticateToken);

// Ver parametrización (todos los autenticados)
parametrization.get(`/get-params`, 
    validateRequestMiddleware.validateRequest, 
    parametrizationController.getParametrization
);

// Actualizar parametrización (solo admin y power_user)
parametrization.put(`/update-params`, 
    requireRole(['admin', 'power_user']),
    validateRequestMiddleware.validateRequest, 
    parametrizationController.updateParametrization
);