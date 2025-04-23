import cron from 'node-cron';
import {dataProcessorService} from "../services/index.js";
import {parametrizationService} from "../services/index.js";
import {model} from "../models/index.js";

// Función auxiliar para calcular el rango de la hora anterior
const getPreviousHourRange = () => {
    const now = new Date();
    const previousHour = new Date(now.getTime() - 60 * 60 * 16000); // Una hora antes
    const startDate = previousHour.toISOString().split('T')[0];
    const startHour = previousHour.getHours();
    return { startDate, startHour };
};

// Procesa cada servicio de forma secuencial
const processService = async (service, filters) => {
    try {
        console.log(`Procesando servicio: ${service}`);
        await dataProcessorService.getHioposLote(service, filters, false, true);
        console.log(`Creando lote para servicio de: ${service}`);
    } catch (error) {
        console.error(`Error al procesar el servicio ${service}:`, error.message || error);
    }
};

// Función principal de la tarea
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