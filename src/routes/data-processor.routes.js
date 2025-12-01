import express from "express";
import {dataProcessorController} from "../controllers/index.js";
import {hioposValidator} from "../validators/index.js";
import {validateRequestMiddleware, authMiddleware} from "../middleware/index.js";

export const dataProcessor =  express.Router();

dataProcessor.post(`/manual-purchases`, dataProcessorController.manualProcessingLote )
dataProcessor.post(`/manual-sales`, dataProcessorController.manualProcessingLote )
dataProcessor.post(`/reprocessing`, dataProcessorController.dataReprocessing)
dataProcessor.get(`/get-transaction`, dataProcessorController.getTransactionById)
dataProcessor.delete(`/transactions`, dataProcessorController.deleteTransactionsById)
dataProcessor.put(`/transactions/:id/siigo-body`, dataProcessorController.updateTransactionById)
dataProcessor.post(`/lote/reprocessing`, dataProcessorController.reprocessLote)
dataProcessor.delete(`/lotes/date-range`, authMiddleware.requireAdminKey, hioposValidator.deleteLotesByDateRange, validateRequestMiddleware.validateRequest, dataProcessorController.deleteLotesByDateRange)