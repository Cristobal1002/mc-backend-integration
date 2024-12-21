import { CustomError } from './custom.error.js';

export class RequestValidationError extends CustomError {
    constructor(errors) {
        super({ message: "Existen parámetros no válidos en la petición." });
        this.statusCode = 400;
        this.errors = errors;
    }

    serialize() {
        const firstErrorMessage =
            Array.isArray(this.errors) && this.errors.length > 0
                ? this.errors[0]?.msg
                : "Ocurrió un error en la validación de datos";

        return {
            code: this.statusCode,
            message: firstErrorMessage,
            error: this.errors.map(({ msg, path, location, value }) => ({
                message: msg,
                field: path,
                location,
                value,
            })),
        };
    }
}
