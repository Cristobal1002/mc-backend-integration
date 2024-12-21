import express from "express";
import {validateRequestMiddleware} from "../middleware/index.js";
import {hioposController} from "../controllers/index.js";
import {getHioposToken} from "../controllers/hiopos.controller.js";
export const hiopos = express.Router()

hiopos.get (`/test`,   hioposController.getHioposToken)
hiopos.post(`/purchaseInvoices`,hioposController.getPurchaseInvoices)