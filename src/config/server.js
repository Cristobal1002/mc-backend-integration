import 'dotenv/config';
import express from 'express';
import { routes } from '../routes/index.js';
import { errorHandlerMiddleware } from '../middleware/index.js';
import cors from 'cors';
import { sequelize } from '../database/index.js';
import { syncDb } from '../models/index.js';
import { startCronJobs } from './cron.config.js';
import { seedPowerUser } from '../utils/seed-user.js';


export default async () => {
    const port = process.env.SERVER_PORT || 3000;

    const app = express();
    // CORS
    app.use(
        cors({
            methods: 'GET,POST,PUT,DELETE',
            allowedHeaders: ['Content-Type', 'Authorization', 'x-app-token'],
        })
    );

    app.use(express.json({ limit: '20mb' }));
    app.use(express.urlencoded({ extended: true, limit: '20mb' }));

    // Sincronizar base de datos (crear/actualizar tablas)
    //await syncDb().then(() => console.log('Tablas sincronizadas'));

    // Crear usuario power_user si no existe y actualizar existentes
    await seedPowerUser();

    // Inicializar servicio de email (verifica conexión)
    try {
        const { initializeEmailService } = await import('../services/email.service.js');
        initializeEmailService();
        console.log('📧 Servicio de email inicializado');
    } catch (error) {
        console.warn('⚠️  No se pudo inicializar el servicio de email:', error.message);
    }

    routes(app);
    app.use(errorHandlerMiddleware.errorHandler); // Manejador de errores

    app.listen(port, () => {
        console.log('server running in port:', port);
    });

    // Iniciar el cron
    startCronJobs(); // Iniciar tareas programadas

};
