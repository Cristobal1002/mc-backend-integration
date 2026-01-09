import {standardResponse, standardErrorResponse, validationErrorResponse, unauthorizedResponse} from "../utils/response-formatter.utils.js";
import {reportsService} from "../services/index.js";

/**
 * Helper para obtener el tipo de transacción permitido según el rol
 */
const getAllowedTransactionType = (userRole) => {
    if (userRole === 'compras') return 'purchases';
    if (userRole === 'ventas') return 'sales';
    // admin y power_user pueden ver todo
    return null;
};

export const getDailyStats = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const userRole = req.user.role;
        const allowedType = getAllowedTransactionType(userRole);

        const response = await reportsService.getDailyStats({ startDate, endDate, type: allowedType });

        standardResponse(res, 200, '', response.data);
    } catch (error) {
        return next(error);
    }
};

export const getPaginatedTransactions = async (req, res, next) => {
    try {
        let {page, limit, startDate, endDate, batchId, status, type} = req.query;
        const userRole = req.user.role;
        const allowedType = getAllowedTransactionType(userRole);

        // Si el usuario tiene restricción de tipo, forzar ese tipo
        if (allowedType) {
            type = allowedType;
        }

        const response = await reportsService.getPaginatedTransactions({page, limit, startDate, endDate, batchId, status, type});
        standardResponse(res,200, '', response.data )
    } catch (error) {
        return next(error)
    }
}

export const getPaginatedLotes = async (req, res, next) =>{

    try {
        let {startDate, endDate, source, page, limit, type} = req.query;
        const userRole = req.user.role;
        const allowedType = getAllowedTransactionType(userRole);

        // Si el usuario tiene restricción de tipo, forzar ese tipo
        if (allowedType) {
            type = allowedType;
        }

        const response = await reportsService.getProcessedLotes({startDate, endDate, source, page, limit, type});
        standardResponse(res,200, '', response.data )
    } catch (error) {
        return next(error)
    }
}