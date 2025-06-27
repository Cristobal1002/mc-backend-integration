import express from "express";
import {dataProcessorController} from "../controllers/index.js";

export const dataProcessor =  express.Router();

dataProcessor.post(`/manual-purchases`, dataProcessorController.manualProcessingLote )
dataProcessor.post(`/manual-sales`, dataProcessorController.manualProcessingLote )
dataProcessor.post(`/reprocessing`, dataProcessorController.dataReprocessing)
dataProcessor.get(`/get-transaction`, dataProcessorController.getTransactionById)
dataProcessor.delete(`/transactions`, dataProcessorController.deleteTransactionsById)