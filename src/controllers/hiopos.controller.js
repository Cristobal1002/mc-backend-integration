import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {hioposService} from "../services/index.js";


export const getHioposData = async (req, res, next) => {
    try {
        const servicio = req.url
        const response = await hioposService.getBridgeDataByType(servicio, req.body)
        console.log('Repuesta en el controlador:', response)
        return standardResponse(res, 200, 'Peticion exitosa', response.data)
    } catch (error) {
        console.error("Error en el controlador:", error); // Log de lo que pasó
        return next(error); // Pasar al middleware de manejo de errores
    }
}


