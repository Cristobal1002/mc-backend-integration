/*
* Los jobs definen las tareas que realizaran los workers
* */

import {hioposQueue} from "../config/bullmq.config.js";

export const addPurchasesJob = async (filter) => {
    await hioposQueue.add('sync-purchases', { type: 'purchases', filter }, {
        attempts: 3, // Reintentar hasta 3 veces en caso de error
        backoff: { type: 'exponential', delay: 5000 },
    });
    console.log('Job added for purchases sync:', filter);
};

// Agregar un job para sincronizar ventas
export const addSalesJob = async (filter) => {
    await hioposQueue.add('sync-sales', { type: 'sales', filter }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
    });
    console.log('Job added for sales sync:', filter);
};


export const addDataJob = async (type, filter) => {
    console.log('data en el job', type, filter)
    await hioposQueue.add(`sync-hiopos-${type}`, { type, filter }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
    });
    console.log(`Job added for ${type} sync:`, filter);
};
