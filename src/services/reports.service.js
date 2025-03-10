import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import {model} from "../models/index.js";
import {literal, Op} from "sequelize";

export const getDailyStats = async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    try {
        // Número de lotes procesados hoy
        const lotesProcesados = await model.LoteModel.count({
            where: {
                processed_at: {
                    [Op.between]: [todayStart, todayEnd]
                }
            }
        });

        // Número total de transacciones hoy
        const totalTransacciones = await model.TransactionModel.count({
            where: {
                createdAt: {
                    [Op.between]: [todayStart, todayEnd]
                }
            }
        });

        // Número de transacciones exitosas
        const transaccionesExitosas = await model.TransactionModel.count({
            where: {
                createdAt: {
                    [Op.between]: [todayStart, todayEnd]
                },
                status: "success"
            }
        });

        // Número de transacciones fallidas
        const transaccionesFallidas = await model.TransactionModel.count({
            where: {
                createdAt: {
                    [Op.between]: [todayStart, todayEnd]
                },
                status: "failed"
            }
        });

        return {
           data: {
               lotesProcesados,
               totalTransacciones,
               transaccionesExitosas,
               transaccionesFallidas}
        };

    } catch (error) {
        console.error("Error obteniendo estadísticas:", error);
        handleServiceError(error)
    }
}

    export async function getPaginatedTransactions({page = 1, limit = 10, startDate, endDate, batchId}) {
    try {
        const whereCondition = {};

        if (batchId) {
            // Si batchId está presente, solo filtrar por batchId y omitir fechas
            whereCondition.lote_id = batchId;
        } else {
            // Si no hay batchId, aplicar filtro por fechas
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const start = startDate && !isNaN(new Date(startDate)) ? new Date(startDate) : todayStart;
            const end = endDate && !isNaN(new Date(endDate)) ? new Date(endDate) : todayEnd;

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
        });

        return {
            data: {
                transactions: data,
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


export const getProcessedLotes = async ({
                                            startDate = null,
                                            endDate = null,
                                            source = null, // "automatic" o "manual"
                                            page = 1,
                                            limit = 10
                                        }) => {
    // Si no se pasan fechas, toma el día actual por defecto
    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0);

    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const filters = {
        processed_at: { [Op.between]: [start, end] }
    };

    if (source) {
        filters.source = source;
    }

    const { count, rows } = await model.LoteModel.findAndCountAll({
        where: filters,
        attributes: [
            "id",
            "type",
            "source",
            "filter",
            "status",
            "error",
            "processed_at",
            "transactions_count",
            [literal(`"filter"->>'startDate'`), "processed_date"],
            [literal(`(
                SELECT jsonb_path_query_first("filter"::jsonb, '$.filters[*].value') #>> '{}'
            )`), "processed_time"],
            [literal(`(
                SELECT COUNT(*) 
                FROM transactions 
                WHERE transactions.lote_id = "LoteModel".id 
                AND transactions.status = 'success'
            )`), "successful_transactions"],
            [literal(`(
                SELECT COUNT(*) 
                FROM transactions 
                WHERE transactions.lote_id = "LoteModel".id 
                AND transactions.status = 'failed'
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