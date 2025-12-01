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
        const response = await dataProcessorService.getHioposLote(service, data, true, true)
        console.log('RESPUESTA DEL MANUAL', response)
        standardResponse(res,200, 'Lote procesado satisfactoriamente', response)
    } catch (error) {
        next(error)
    }
}

export const dataReprocessing = async (req, res, next) => {
    try {
        const response = await dataProcessorService.syncDataProcess(req.body)
        standardResponse(res,200, 'transacciones procesadas satisfactoriamente', response)
    } catch (error) {
        next(error)
    }
}

//SOLO PARA PRUEBA
export const getTransactionById = async (req, res, next) => {
    const { id } = req.query
    try {
        const response = await dataProcessorService.getTransactionById(id)
        standardResponse(res,200, 'transacciones procesadas satisfactoriamente', response)
    } catch (error) {
        next(error)
    }
}

export const deleteTransactionsById = async (req, res, next) => {
    const { ids } = req.body
    try {
        const response = await dataProcessorService.deleteTransactions(ids)
        standardResponse(res,200, 'transacciones eliminadas satisfactoriamente', response)
    } catch (error) {
        next(error)
    }
}

export const updateTransactionById = async (req, res, next) => {
    const {id} = req.params;
    const data = req.body

    try {
        const response = await  dataProcessorService.updateTransaction(id, data)
        standardResponse(res,200, 'transaccion actualizada satisfactoriamente', response)
    } catch (error) {
        next(error)
    }
}

export const reprocessLote = async (req, res, next) => {
    const {lote} = req.body
    try {
        const response = await dataProcessorService.reprocessLote(lote)
        standardResponse(res,200, 'Lote reprocesado satisfactoriamente', response)
    } catch (error) {
        next(error)
    }
}

export const deleteLotesByDateRange = async (req, res, next) => {
    const { startDate, endDate } = req.body;
    try {
        const response = await dataProcessorService.deleteLotesByDateRange(startDate, endDate);
        standardResponse(res, 200, response.message || 'Lotes y transacciones eliminados satisfactoriamente', response);
    } catch (error) {
        next(error);
    }
}