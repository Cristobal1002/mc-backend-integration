import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import {model} from "../models/index.js";
import {Op} from "sequelize";

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

export async function getPaginatedTransactions(page = 1, limit = 10, startDate, endDate) {
    try {
        // Si no se pasan fechas, se usa el rango de hoy
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const start = startDate ? new Date(startDate) : todayStart;
        const end = endDate ? new Date(endDate) : todayEnd;

        const offset = (page - 1) * limit;

        // Obtener transacciones paginadas dentro del rango de fechas
        const { rows: data, count: total } = await model.TransactionModel.findAndCountAll({
            where: {
                createdAt: {
                    [Op.between]: [start, end]
                }
            },
            limit,
            offset,
            order: [["createdAt", "DESC"]], // Ordenar por fecha de creación descendente
        });

        return {data:{
                transactions:data,
                total,
                pages: Math.ceil(total / limit),
                currentPage: page,
                startDate: start.toISOString(),
                endDate: end.toISOString()
            }};

    } catch (error) {
        console.error("Error obteniendo transacciones paginadas:", error);
        throw new Error("Error obteniendo transacciones");
    }
}