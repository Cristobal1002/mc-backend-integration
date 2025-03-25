import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {reportsService} from "../services/index.js";

export const getDailyStats = async (req, res, next) => {
    try {
        const response = await reportsService.getDailyStats();
        standardResponse(res,200, '', response.data )
    } catch (error) {
        return next(error)
    }
}

export const getPaginatedTransactions = async (req, res, next) => {
    try {
        const {page, limit, startDate, endDate, batchId, status, type} = req.query
        const response = await reportsService.getPaginatedTransactions({page, limit, startDate, endDate, batchId, status, type});
        standardResponse(res,200, '', response.data )
    } catch (error) {
        return next(error)
    }
}

export const getPaginatedLotes = async (req, res, next) =>{

    try {
        const {startDate, endDate, source, page, limit} = req.query
        const response = await reportsService.getProcessedLotes({startDate, endDate, source,page,limit});
        standardResponse(res,200, '', response.data )
    } catch (error) {
        return next(error)
    }
}