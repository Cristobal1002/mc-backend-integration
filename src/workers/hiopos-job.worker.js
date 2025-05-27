// worker/hiopos-job-worker.js

import { processJobFromQueue } from '../services/job-runner.service.js';
import { model } from "../models/index.js";
import { sequelize } from "../database/index.js"; // ✅ conexión ya configurada

const pollInterval = 15 * 1000; // cada 15 segundos

const processNextJob = async () => {
    const transaction = await sequelize.transaction();

    try {
        const job = await model.JobModel.findOne({
            where: { status: 'pending' },
            order: [['start_time', 'ASC']],
            lock: true,
            skipLocked: true,
            transaction
        });

        if (!job) {
            await transaction.commit();
            return console.log('[JOB WORKER] No hay jobs pendientes.');
        }

        await job.update({ status: 'processing' }, { transaction });
        await transaction.commit();

        await processJobFromQueue(job);
        await job.update({ status: 'done', updated_at: new Date() });
    } catch (error) {
        console.error('[JOB WORKER] Error general:', error);
        await transaction.rollback();

        if (job) {
            await job.update({
                status: 'error',
                error: error.message,
                updated_at: new Date()
            });
        }
    }
};

setInterval(processNextJob, pollInterval);
