import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {dataProcessorService} from "../services/index.js";

export const testLote = async (req, res, next) => {
    console.log('BODY EN TEST', req.body)
    const {service, filters, endDate, startDate} = req.body
    const data = {
        endDate,
        startDate,
        filters
    }
    try {
        const response = await dataProcessorService.getHioposLote(service, data)
        standardResponse(res,200, '', response )
    } catch (error) {
        next(error)
    }
}