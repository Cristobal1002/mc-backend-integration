import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import {model} from "../models/index.js";
import { sequelize } from '../database/index.js';
import { Op, where, col, cast, literal } from 'sequelize';
import {dateRange} from "../utils/index.js";

export const getDailyStats = async ({ startDate, endDate } = {}) => {
    try {
        const start = startDate || endDate;
        const end = endDate || startDate;

        const lotesProcesados = await model.LoteModel.count({
            where: literal(`CAST("LoteModel"."filter"->>'startDate' AS DATE) BETWEEN '${start}' AND '${end}'`)
        });

        const totalTransacciones = await model.TransactionModel.count({
            where: {
                document_date: {
                    [Op.between]: [start, end]
                }
            }
        });

        const transaccionesExitosas = await model.TransactionModel.count({
            where: {
                document_date: {
                    [Op.between]: [start, end]
                },
                status: 'success'
            }
        });

        const transaccionesFallidas = await model.TransactionModel.count({
            where: {
                document_date: {
                    [Op.between]: [start, end]
                },
                status: 'failed'
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
        console.error('Error obteniendo estadísticas:', error);
        handleServiceError(error);
    }
};export async function getPaginatedTransactions({ page = 1, limit = 10, startDate, endDate, batchId, status, type }) {
    try {
        const whereCondition = {};

        if (batchId) whereCondition.lote_id = batchId;
        if (status) whereCondition.status = status;
        if (type) whereCondition.type = type;

        if (startDate || endDate) {
            const start = startDate || endDate;
            const end = endDate || startDate;
            whereCondition.document_date = { [Op.between]: [start, end] };
        }

        const offset = (page - 1) * limit;

        const { rows: data, count: total } = await model.TransactionModel.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [["document_date", "DESC"]],
            raw: true
        });

        const transactions = data.map(transaction => ({
            ...transaction,
            siigo_document: transaction.siigo_response?.name || null
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
    const filters = [];

    if (source) filters.push(`l."source" = '${source}'`);
    if (startDate || endDate) {
        const start = startDate || endDate;
        const end = endDate || startDate;
        filters.push(`(l."filter"->>'startDate')::date BETWEEN '${start}' AND '${end}'`);
    }

    const whereClause = filters.length
        ? `WHERE ${filters.join(' AND ')} AND l."deletedAt" IS NULL`
        : `WHERE l."deletedAt" IS NULL`;

    // Consulta principal
    const [results] = await sequelize.query(`
        SELECT
            l.id, l.type, l.source, l.filter, l.status, l.error, l.processed_at, l.transactions_count,
            l.filter->>'startDate' AS processed_date,
            (
                SELECT jsonb_path_query_first(l.filter::jsonb, '$.filters[*].value') #>> '{}'
            ) AS processed_time,
            (
                SELECT COUNT(*) FROM transactions t WHERE t.lote_id = l.id AND t.status = 'success'
            ) AS successful_transactions,
            (
                SELECT COUNT(*) FROM transactions t WHERE t.lote_id = l.id AND t.status = 'failed'
            ) AS failed_transactions
        FROM lotes l
            ${whereClause}
        ORDER BY l.processed_at DESC
        LIMIT ${limit}
            OFFSET ${(page - 1) * limit}
    `);

    // Conteo total
    const countWhere = filters.length ? `WHERE ${filters.join(' AND ')} AND "deletedAt" IS NULL` : `WHERE "deletedAt" IS NULL`;
    const [[{ count }]] = await sequelize.query(`
        SELECT COUNT(*)::int FROM lotes l ${countWhere}
    `);

    return {
        data: {
            lotes: results,
            total: count,
            pages: Math.ceil(count / limit),
            currentPage: page
        }
    };
};