import express from "express";
import {validateRequestMiddleware} from "../middleware/index.js";
import {siigoController} from "../controllers/index.js";

export const siigo = express.Router()

siigo.get(`/contacts`, siigoController.getContactByIdentification);
siigo.get(`/products`, siigoController.getItemByCode);
siigo.post('/purchase/invoice', siigoController.createSiigoInvoice)
