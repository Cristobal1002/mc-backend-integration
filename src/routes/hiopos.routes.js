import express from "express";
import {validateRequestMiddleware} from "../middleware/index.js";
import {hioposValidator} from "../validators/index.js";
import {hioposController} from "../controllers/index.js";
import {getHioposData} from "../controllers/hiopos.controller.js";
import {authenticateToken, requireRole} from "../middleware/auth.middleware.js";

export const hiopos = express.Router()

// Todas las rutas requieren autenticación
hiopos.use(authenticateToken);

// Rutas de compras solo para usuarios con rol compras, admin o power_user
hiopos.post(`/purchases`, 
    requireRole(['admin', 'power_user', 'compras']),
    hioposValidator.purchaseBody, 
    validateRequestMiddleware.validateRequest,  
    hioposController.getHioposData
);

hiopos.post(`/vendors`, 
    requireRole(['admin', 'power_user', 'compras']),
    hioposValidator.vendorBody, 
    validateRequestMiddleware.validateRequest,  
    hioposController.getHioposData
);

// Rutas de ventas solo para usuarios con rol ventas, admin o power_user
hiopos.post(`/sales`,
    requireRole(['admin', 'power_user', 'ventas']),
    hioposController.getHioposData
);

hiopos.post(`/customers`,
    requireRole(['admin', 'power_user', 'ventas']),
    hioposController.getHioposData
);

// Items accesible por todos los roles autenticados
hiopos.post(`/items`, hioposController.getHioposData);