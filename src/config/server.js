import 'dotenv/config';
import express from 'express';
import { routes } from '../routes/index.js';
import { errorHandlerMiddleware } from '../middleware/index.js';
import cors from 'cors';
import { sequelize } from '../database/index.js';
import { syncDb } from '../models/index.js';
import { startCronJobs } from './cron.config.js';


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

    //await syncDb().then(() => console.log('Tablas sincronizadas'));

    routes(app);
    app.use(errorHandlerMiddleware.errorHandler); // Manejador de errores

    app.listen(port, () => {
        console.log('server running in port:', port);
    });

    // Iniciar el cron
    //startCronJobs(); // Iniciar tareas programadas

};
