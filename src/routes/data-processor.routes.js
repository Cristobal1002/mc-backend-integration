import express from "express";
import {dataProcessorController} from "../controllers/index.js";
import {hioposValidator} from "../validators/index.js";
import {validateRequestMiddleware, authMiddleware} from "../middleware/index.js";
import {authenticateToken, requireRole} from "../middleware/auth.middleware.js";

export const dataProcessor =  express.Router();

// Todas las rutas requieren autenticación
dataProcessor.use(authenticateToken);

// Procesamiento manual de compras (compras, admin, power_user)
dataProcessor.post(`/manual-purchases`, 
    requireRole(['admin', 'power_user', 'compras']),
    dataProcessorController.manualProcessingLote
);

// Procesamiento manual de ventas (ventas, admin, power_user)
dataProcessor.post(`/manual-sales`, 
    requireRole(['admin', 'power_user', 'ventas']),
    dataProcessorController.manualProcessingLote
);

// Operaciones generales (todos los autenticados)
dataProcessor.post(`/reprocessing`, dataProcessorController.dataReprocessing);
dataProcessor.get(`/get-transaction`, dataProcessorController.getTransactionById);
dataProcessor.put(`/transactions/:id/siigo-body`, dataProcessorController.updateTransactionById);
dataProcessor.post(`/lote/reprocessing`, dataProcessorController.reprocessLote);

// Operaciones administrativas (solo admin y power_user)
dataProcessor.delete(`/transactions`, 
    requireRole(['admin', 'power_user']),
    dataProcessorController.deleteTransactionsById
);

dataProcessor.delete(`/lotes/date-range`, 
    requireRole(['admin', 'power_user']),
    authMiddleware.requireAdminKey, 
    hioposValidator.deleteLotesByDateRange, 
    validateRequestMiddleware.validateRequest, 
    dataProcessorController.deleteLotesByDateRange
);