/**
 * Formatea las respuestas exitosas de la API.
 * @param {object} res - El objeto de respuesta de Express.
 * @param {number} statusCode - El código de estado HTTP.
 * @param {string} message - El mensaje a devolver en la respuesta.
 * @param {object | null} data - Los datos a devolver (opcional).
 */
export const standardResponse = (res, statusCode, message, data) => {
    const isSuccess = statusCode >= 200 && statusCode < 300;

    return res.status(statusCode).json({
        status: isSuccess ? 'success' : 'error',  // 'success' para códigos 2xx, 'error' para otros códigos.
        message: message || 'Peticion Exitosa',
        data: data || null
    });
};

/**
 * Formatea las respuestas de error de la API.
 * @param {object} res - El objeto de respuesta de Express.
 * @param {Error} error - El error que contiene detalles de la respuesta.
 */
export const standardErrorResponse = (res, error) => {
    // Si el error no tiene un código, asignamos el 500
    const statusCode = error.code || 500;
    return res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Ocurrió un error inesperado',
        error: error.data || null
    });
};

/**
 * Formatea la respuesta para un error de validación (parámetros incorrectos).
 * @param {object} res - El objeto de respuesta de Express.
 * @param {Array} errors - La lista de errores de validación.
 */
export const validationErrorResponse = (res, errors) => {
    return res.status(400).json({
        status: 'error',
        message: 'Existen parámetros no válidos en la petición.',
        error: errors.map((e) => ({
            field: e.param,   // Campo de la validación
            message: e.msg,   // Mensaje de la validación
            location: e.location, // Lugar donde ocurrió el error (puede ser 'body', 'query', etc.)
            value: e.value     // Valor recibido que generó el error
        }))
    });
};

/**
 * Formatea la respuesta cuando el recurso solicitado no se encuentra.
 * @param {object} res - El objeto de respuesta de Express.
 * @param {string} message - Mensaje que indica que no se encontró el recurso.
 */
export const notFoundResponse = (res, message) => {
    return res.status(404).json({
        status: 'error',
        message: message || 'Recurso no encontrado',
        data: null
    });
};

/**
 * Formatea la respuesta cuando el recurso solicitado ya existe.
 * @param {object} res - El objeto de respuesta de Express.
 * @param {string} message - Mensaje indicando que el recurso ya existe.
 */
export const conflictResponse = (res, message) => {
    return res.status(409).json({
        status: 'error',
        message: message || 'El recurso ya existe',
        data: null
    });
};

/**
 * Respuesta estándar para una solicitud no autorizada.
 * @param {object} res - El objeto de respuesta de Express.
 * @param {string} message - Mensaje indicando que no está autorizado.
 * @param {object | null} data - Los datos a devolver (opcional).
 */
export const unauthorizedResponse = (res, message, data) => {
    return res.status(401).json({
        status: 'error',
        message: message || 'No autorizado',
        error: data || null
    });
};
