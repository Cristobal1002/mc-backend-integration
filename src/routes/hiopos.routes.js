import express from "express";
import {validateRequestMiddleware} from "../middleware/index.js";
import {hioposValidator} from "../validators/index.js";
import {hioposController} from "../controllers/index.js";
import {getHioposData} from "../controllers/hiopos.controller.js";

export const hiopos = express.Router()

hiopos.post(`/purchases`, hioposValidator.purchaseBody, validateRequestMiddleware.validateRequest,  hioposController.getHioposData)
hiopos.post(`/vendors`, hioposValidator.vendorBody, validateRequestMiddleware.validateRequest,  hioposController.getHioposData)
hiopos.post(`/customers`,  hioposController.getHioposData)
hiopos.post(`/sales`, hioposController.getHioposData)
hiopos.post(`/items`, hioposController.getHioposData)