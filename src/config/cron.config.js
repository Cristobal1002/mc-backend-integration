import cron from 'node-cron';
import {dataProcessorService} from "../services/index.js";
import {parametrizationService} from "../services/index.js";
import {model} from "../models/index.js";
import { DateTime } from 'luxon';
import {Op} from "sequelize";

// Función auxiliar para calcular el rango de la hora anterior
const getPreviousHourRange = () => {
    // Hora actual en Colombia
    const now = DateTime.now().setZone('America/Bogota');
    const previousHour = now.minus({ hours: 1 });
    const startDate = previousHour.toISODate(); // yyyy-MM-dd
    const startHour = previousHour.hour; // hora 0-23
    return { startDate, startHour };
};

// Procesa cada servicio de forma secuencial
const processService = async (service, filters) => {
    try {
        console.log(`Procesando servicio: ${service}`);
        const { loteId } = await dataProcessorService.getHioposLote(service, filters, false, false); // runSync = false

        // 🔄 Buscar transacciones creadas en ese lote
        const transactions = await model.TransactionModel.findAll({
            where: { lote_id: loteId, type: service }
        });

        if (transactions.length === 0) {
            console.log(`[${service}] No se encontraron transacciones para validar.`);
            return;
        }

        // ✅ Ejecutar validación + sincronización SOLO sobre transacciones del lote
        const options = (service === 'purchases') ? { purchaseTransactions: transactions } : { salesTransactions: transactions };
        await dataProcessorService.syncDataProcess(options);

        console.log(`[${service}] Proceso completo (validación + sync)`);
    } catch (error) {
        console.error(`Error al procesar el servicio ${service}:`, error.message || error);
    }
};
const executeCronTask = async () => {

    try {
        console.log('Ejecutando tarea para obtener datos de la hora anterior');
        const { startDate, startHour } = getPreviousHourRange();

        const activeServices = await model.ParametrizationModel.findAll({
            where: { is_active: true },
        });

        const services = [
            { name: 'purchases', filter: { attributeId: 1077 } },
            { name: 'sales', filter: { attributeId: 1077 } },
        ];

        for (const service of activeServices) {
            const filters = [
                {
                    attributeId: 1077,
                    arithmeticOperator: 'BETWEEN',
                    type: 'Integer',
                    value: startHour.toString(),
                    value2: startHour.toString(),
                },
            ];

            const dataFilter = { startDate, endDate: startDate, filters };
            await processService(service.type, dataFilter);
        }

        console.log('Tarea completada exitosamente');
    } catch (error) {
        console.error('Error durante la ejecución de la tarea:', error.message || error);
    }
};

// Configurar el cron
export const startCronJobs = () => {
    console.log('Iniciando cron jobs...');

    // Programar la tarea para ejecutarse cada hora
    cron.schedule('0 * * * *', async () => {
        await executeCronTask();
    });

    // Ejecutar inmediatamente al iniciar
    executeCronTask().catch((error) =>
        console.error('Error al ejecutar la tarea inicial del cron:', error.message || error)
    );

    console.log('Cron jobs configurados');
};