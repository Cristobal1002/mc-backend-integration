import express from "express";
import {reportsController} from "../controllers/index.js";
import {validateRequestMiddleware} from "../middleware/index.js";

export const reports = express.Router()

reports.get(`/daily-stats`, validateRequestMiddleware.validateRequest, reportsController.getDailyStats )
reports.get(`/transaction-list`, validateRequestMiddleware.validateRequest,reportsController.getPaginatedTransactions)
reports.get(`/lotes-list`, validateRequestMiddleware.validateRequest, reportsController.getPaginatedLotes)