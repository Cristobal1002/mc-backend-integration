import express from "express";
import {validateRequestMiddleware} from "../middleware/index.js";
import {hioposValidator} from "../validators/index.js";
import {hioposController} from "../controllers/index.js";

export const hiopos = express.Router()

hiopos.post(`/purchaseInvoices`, hioposValidator.purchaseBody, validateRequestMiddleware.validateRequest,  hioposController.getPurchaseInvoices)