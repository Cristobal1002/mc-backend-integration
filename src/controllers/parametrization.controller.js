import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {parametrizationService} from "../services/index.js";

export const getParametrization = async (req, res, next) => {
    try {
        const response = await parametrizationService.getParametrizationData()
        standardResponse(res,200, '', response.data )
    } catch (error) {
        return next(error)
    }
}

export const updateParametrization = async (req, res, next) => {
    try {
        const response = await parametrizationService.updateParametrizationData(req.body)
        standardResponse(res,200, '', response.data )
    } catch (error) {
        return next(error)
    }
}