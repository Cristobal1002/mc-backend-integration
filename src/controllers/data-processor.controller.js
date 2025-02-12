import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {dataProcessorService} from "../services/index.js";

export const manualProcessingLote = async (req, res, next) => {
    console.log('BODY EN PROCESO MANUAL', req.body)
    const {service, filters, endDate, startDate} = req.body
    const data = {
        endDate,
        startDate,
        filters
    }
    try {
        const response = await dataProcessorService.getHioposLote(service, data, true)
        console.log('RESPUESTA DEL MANUAL', response)
        standardResponse(res,200, 'Lote procesado satisfactoriamente', response)
    } catch (error) {
        next(error)
    }
}