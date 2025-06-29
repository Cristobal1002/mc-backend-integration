import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import {model} from "../models/index.js";
import {literal, Op} from "sequelize";
import {dateRange} from "../utils/index.js";

export const getDailyStats = async ({ startDate, endDate } = {}) => {
    const { start, end } = dateRange.getLocalDateRange(startDate, endDate, 5); // UTC-5 (Colombia)

    try {
        const lotesProcesados = await model.LoteModel.count({
            where: {
                processed_at: {
                    [Op.between]: [start, end]
                }
            }
        });

        const totalTransacciones = await model.TransactionModel.count({
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                }
            }
        });

        const transaccionesExitosas = await model.TransactionModel.count({
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                },
                status: "success"
            }
        });

        const transaccionesFallidas = await model.TransactionModel.count({
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                },
                status: "failed"
            }
        });

        return {
            data: {
                lotesProcesados,
                totalTransacciones,
                transaccionesExitosas,
                transaccionesFallidas
            }
        };
    } catch (error) {
        console.error("Error obteniendo estadísticas:", error);
        handleServiceError(error);
    }
};
export async function getPaginatedTransactions({ page = 1, limit = 10, startDate, endDate, batchId, status, type }) {
    try {
        const whereCondition = {};

        if (batchId) whereCondition.lote_id = batchId;
        if (status) whereCondition.status = status;
        if (type) whereCondition.type = type;

        // Siempre aplicar filtro de fecha si viene startDate o endDate
        const timeZoneOffset = 5 * 60 * 60 * 1000; // UTC-5 en milisegundos

        if (startDate || endDate) {
            const start = startDate ? new Date(new Date(`${startDate}T00:00:00.000Z`).getTime() + timeZoneOffset) : new Date();
            const end = endDate ? new Date(new Date(`${endDate}T23:59:59.999Z`).getTime() + timeZoneOffset) : new Date();

            whereCondition.createdAt = {
                [Op.between]: [start, end]
            };
        }

        const offset = (page - 1) * limit;

        const { rows: data, count: total } = await model.TransactionModel.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [["createdAt", "DESC"]],
            raw: true // Retorna los datos como objetos planos
        });

        // Agregar siigo_document con el name de siigo_response si existe
        const transactions = data.map(transaction => ({
            ...transaction,
            siigo_document: transaction.siigo_response ? transaction.siigo_response.name || null : null
        }));

        return {
            data: {
                transactions,
                total,
                pages: Math.ceil(total / limit),
                currentPage: page
            }
        };

    } catch (error) {
        console.error("Error obteniendo transacciones paginadas:", error);
        throw new Error("Error obteniendo transacciones");
    }
}
export const getProcessedLotes = async ({ startDate, endDate, source = null, page = 1, limit = 10 }) => {
    const { start, end } = dateRange.getLocalDateRange(startDate, endDate);

    const filters = {
        processed_at: { [Op.between]: [start, end] }
    };
    if (source) filters.source = source;

    const { count, rows } = await model.LoteModel.findAndCountAll({
        where: filters,
        attributes: [
            "id", "type", "source", "filter", "status", "error", "processed_at", "transactions_count",
            [literal(`"filter"->>'startDate'`), "processed_date"],
            [literal(`(
        SELECT jsonb_path_query_first("filter"::jsonb, '$.filters[*].value') #>> '{}'
      )`), "processed_time"],
            [literal(`(
        SELECT COUNT(*) FROM transactions WHERE transactions.lote_id = "LoteModel".id AND transactions.status = 'success'
      )`), "successful_transactions"],
            [literal(`(
        SELECT COUNT(*) FROM transactions WHERE transactions.lote_id = "LoteModel".id AND transactions.status = 'failed'
      )`), "failed_transactions"]
        ],
        limit,
        offset: (page - 1) * limit,
        order: [["processed_at", "DESC"]]
    });

    return {
        data: {
            lotes: rows,
            total: count,
            pages: Math.ceil(count / limit),
            currentPage: page
        }
    };
};