import {CustomError} from "./index.js"

export const handleServiceError = (error) => {
    console.error("Error en servicio:", error);

    if (error) {
        throw new CustomError({
            message:error.message || error.response.data?.message || "Error en el servidor",
            code:  error.response?.status || error.code || 500,
            data: error.data || error.response.data,
        });
    }

    throw new CustomError({
        message: error.message || "Error desconocido",
        code: 500,
    });
};