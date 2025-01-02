import {Worker} from "bullmq";
import redisConfig from "../config/redis.config.js";
import {getBridgeDataByType} from "../services/hiopos.service.js";
import {dataProcessorService} from "../services/index.js";

export const hioposWorker = new Worker('hiopos', async (job) => {
    console.log(`Processing Hiopos Job: ${job.name}, Data:`, job.data);
    try {
        const { type, filter } = job.data;

        // Llamar al servicio para sincronizar compras o ventas
        const getHioposData = await getBridgeDataByType(type, filter);
        console.log(`Hiopos Job Processed: ${job.name}, Result:`, getHioposData);
        const setTransactionLog = await dataProcessorService.setTransaction(type, getHioposData.data)

    } catch (error) {
        console.error(`Error processing Hiopos Job ${job.id}:`, error);
        throw error; // Esto permite que el job sea reintentado
    }
}, {
    connection: redisConfig,
    concurrency: 1, // Procesa un job a la vez
});