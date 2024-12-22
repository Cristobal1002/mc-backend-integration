import {CustomError} from "./index.js"

export const handleServiceError = (error) => {
    console.error("Error en servicio:", error.message);

    if (error.response) {
        throw new CustomError({
            message: error.response.data?.message || "Error en el servidor",
            code: error.response.status || 500,
            data: error.response.data,
        });
    }

    throw new CustomError({
        message: error.message || "Error desconocido",
        code: 500,
    });
};