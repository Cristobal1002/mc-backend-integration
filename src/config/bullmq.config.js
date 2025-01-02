import {Queue} from "bullmq";
import redisConfig from './redis.config.js'

export const taskQueue = new Queue('task-queue', {
    connection: redisConfig,  // Usar la conexión de Redis
});
export const hioposQueue = new Queue('hiopos', {
    connection: redisConfig,
})

export const siigoQueue = new Queue('siigo',{
    connection: redisConfig
})

