import {Queue} from "bullmq";
import redis from './redis.js'

export const taskQueue = new Queue('task-queue', {
    connection: redis,  // Usar la conexión de Redis
});

