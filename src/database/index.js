import {Sequelize} from "sequelize";
import * as dotenv from "dotenv";
dotenv.config()

let dbConfig = {
    database: process.env.DATABASE || process.env.PROD_DATABASE,
    host: process.env.HOST || process.env.PROD_HOST,
    password: process.env.DB_PASSWORD || process.env.PROD_DB_PASSWORD,
    port: 5432,
    username: process.env.DB_USER || process.env.PROD_DB_USER,
    pool: {
        acquire: Number(process.env.PG_POOL_ACQUIRE) || 60000,
        idle: Number(process.env.PG_POOL_IDLE) || 10000,
        max: Number(process.env.PG_POOL_MAX) || 400,
        min: Number(process.env.PG_POOL_MIN) || 0
    },
    dialect: 'postgres'
};

const instance = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    port: dbConfig.port,
    pool: {
        max: dbConfig.pool.max,
        min: dbConfig.pool.min,
        acquire: dbConfig.pool.acquire,
        idle: dbConfig.pool.idle
    },
    dialectOptions: {
        ssl: {
            require: false,
            rejectUnauthorized: false
        }
    }
});

export const sequelize = instance;
