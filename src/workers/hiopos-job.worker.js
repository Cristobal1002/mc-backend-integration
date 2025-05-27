// worker/hiopos-job-worker.js

import { Sequelize, DataTypes } from 'sequelize';
import { processJobFromQueue } from '../services/job-runner.service.js';
import {model} from "../models/index.js";

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false
});



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

        if (error.job) {
            await error.job.update({
                status: 'error',
                error: error.message,
                updated_at: new Date()
            });
        }
    }
};

setInterval(processNextJob, pollInterval);
