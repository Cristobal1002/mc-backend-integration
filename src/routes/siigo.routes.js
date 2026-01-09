import express from "express";
import {validateRequestMiddleware} from "../middleware/index.js";
import {siigoController} from "../controllers/index.js";
import {authenticateToken} from "../middleware/auth.middleware.js";

export const siigo = express.Router()

// Todas las rutas requieren autenticación
siigo.use(authenticateToken);

siigo.get(`/contacts`, siigoController.getContactByIdentification);
siigo.get(`/products`, siigoController.getItemByCode);
siigo.post('/purchase/invoice', siigoController.createSiigoInvoice);
