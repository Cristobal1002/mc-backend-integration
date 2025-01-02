import cron from 'node-cron';
import { syncHioposData } from '../jobs/index.js';

// Función auxiliar para calcular el rango de la hora anterior
const getPreviousHourRange = () => {
    const now = new Date();
    const previousHour = new Date(now.getTime() - 60 * 60 * 1000); // Una hora antes
    const startDate = previousHour.toISOString().split('T')[0];
    const startHour = previousHour.getHours();
    return { startDate, startHour };
};

// Procesa cada servicio de forma secuencial
const processService = async (service, filters) => {

    try {
        console.log(`Procesando servicio: ${service}`);
        await syncHioposData.addDataJob(service, filters);
        console.log(`Datos encolados para ${service}`);
    } catch (error) {
        console.error(`Error al procesar el servicio ${service}:`, error);
    }
};

// Función principal de la tarea
const executeCronTask = async () => {
    console.log('Ejecutando tarea para obtener data de la hora anterior');

    const {startDate, startHour} = getPreviousHourRange()
    const services = [
        { name: 'purchases', filter: { attributeId: 1077 } },
        { name: 'sales', filter: { attributeId: 1077 } },
    ];

    for (const service of services) {
        const filters = [
            {
                attributeId: service.filter.attributeId,
                arithmeticOperator: 'BETWEEN', // Siempre debe ser BETWEEN según Hiopos
                type: 'Integer',
                value: startHour.toString(),
                value2: startHour.toString(), // Incluso si son iguales, enviar ambos
            },
        ];
        const dataFilter = {startDate, endDate:startDate,  filters: filters}
        await processService(service.name, dataFilter);
    }
};

// Configurar el cron
export const startCronJobs = () => {
    // Programar la tarea cada hora
    cron.schedule('0 * * * *', async () => {
        try {
            await executeCronTask(); // Manejo explícito de la promesa
        } catch (error) {
            console.error('Error al ejecutar la tarea del cron:', error);
        }
    });

    // Ejecutar inmediatamente al iniciar
    executeCronTask().catch((error) =>
        console.error('Error al ejecutar la tarea inicial del cron:', error)
    );

    console.log('Cron Jobs Scheduled');
};