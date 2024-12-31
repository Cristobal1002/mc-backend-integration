import {Worker} from "bullmq";
import redis from "../config/redis.js";

export const worker = new Worker(
    'task-queue',
    async (job) => {
        console.log(`Procesando tarea: ${job.name}`, job.data);

        // Lógica para hacer el trabajo de la tarea
        try {
            // Aquí va la lógica para procesar el trabajo.
            // Simulamos un retraso con setTimeout para representar una tarea
            await new Promise((resolve) => setTimeout(resolve, 2000));

            console.log(`Tarea completada: ${job.name}`);

            // Retorna un resultado o lo que sea necesario
            return { success: true, jobId: job.id };

        } catch (error) {
            console.error("Error al procesar la tarea:", error);
            // Si ocurre un error, marcamos la tarea como fallida
            throw error;
        }
    },
    { connection: redis }
);

// Maneja la finalización de tareas y las errores
worker.on('completed', (job, result) => {
    console.log(`Tarea ${job.id} completada con éxito:`, result);
    // Aquí puedes hacer algo más, como guardar el resultado en una base de datos.
});

worker.on('failed', (job, err) => {
    console.error(`Tarea ${job.id} falló con error:`, err);
    // Maneja la lógica de fallos, como volver a intentar o enviar un aviso.
});
