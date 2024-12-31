import Redis from "ioredis";

const redis = new Redis({
    host: process.env.REDIS_HOST,     // Endpoint de ElastiCache
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD, // Contraseña configurada en ElastiCache
    db: 0,
    maxRetriesPerRequest: null, // Asegúrate de que esta propiedad no esté configurada
    retryStrategy: (times) => {
        // Controla el comportamiento de reconexión
        if (times > 3) {
            return undefined; // Deja de intentar después de 3 fallos
        }
        return Math.min(times * 50, 2000); // Retorna un tiempo de reconexión incremental
    }
})

redis.on("connect", () => {
    console.log("Redis conectado exitosamente");
});

redis.on("error", (err) => {
    console.error("Error de Redis:", err);
});

export default redis;

