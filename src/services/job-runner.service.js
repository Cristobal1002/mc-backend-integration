// services/job-runner.service.js

import {dataProcessorService} from "./index.js";

/**
 * Procesa un job de la tabla `jobs`, usando los datos del job como filtro para HIOPOS.
 * @param {object} job - Instancia del JobModel.
 */
export const processJobFromQueue = async (job) => {
    try {
        console.log(`[JOB WORKER] Iniciando procesamiento del job ${job.id}`);

        const filter = {
            start: job.start_time,
            end: job.end_time
        };

        const result = await dataProcessorService.getHioposLote(
            job.type,
            filter,
            true,     // isManual
            false,    // runSync (se puede activar si lo deseas)
            job.id    // Puedes pasar esto si modificas getHioposLote para recibirlo
        );

        console.log(`[JOB WORKER] Job ${job.id} completado con éxito.`);
        return result;
    } catch (error) {
        console.error(`[JOB WORKER] Error procesando job ${job.id}:`, error.message);
        throw error;
    }
};
