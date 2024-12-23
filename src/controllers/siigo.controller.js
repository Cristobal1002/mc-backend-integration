import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {siigoService} from "../services/index.js";

export const getContactByIdentification = async (req, res, next) => {
    try {
        const { identification } = req.query
        const response = await siigoService.getContactsByIdentification(identification)
        standardResponse(res,200, '', response.data )
    } catch (error) {
        next(error)
    }
}

export const getItemByCode = async (req, res, next) => {
    try {
        const { code } = req.query
        const response = await siigoService.getItemByCode(code)
        standardResponse(res,200, '', response.data )
    } catch (error) {
        next(error)
    }
}

export const createSiigoInvoice = async (req, res, next) => {
    try {
        standardResponse(res, 200, '', req.body)
    } catch (error) {
        next(error)
    }
}