import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {hioposService} from "../services/index.js";
export const getHioposToken = async (req, res, next) => {
    try {
        // Llamar al servicio para obtener el token
        const response = await hioposService.getHioposToken();

        // Si la respuesta está vacía o contiene un mensaje de error
        if (!response || response.error) {
            return unauthorizedResponse(res,null, response.error)
        }

        // Si todo va bien, respondemos con la respuesta del servicio
        return standardResponse(res, 200, 'Peticion exitosa', response.data)
    } catch (error) {
        console.error("Error en el controlador:", error); // Log de lo que pasó
        return next(error); // Pasar al middleware de manejo de errores
    }
};

export const getPurchaseInvoices = async (req, res, next) => {
    try {
        const response = await hioposService.getPurchaseInvoices(req.body)
        return standardResponse(res, 200, 'Peticion exitosa', response.data)
    } catch (error) {
        console.error("Error en el controlador:", error); // Log de lo que pasó
        return next(error); // Pasar al middleware de manejo de errores
    }
}


