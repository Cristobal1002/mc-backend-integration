import { CustomError } from './custom.error.js';

export class RequestValidationError extends CustomError {
    constructor(errors) {
        super({
            message: 'Existen parámetros no válidos en la petición.',
            code: 400,
            data: errors,
        });

        this.errors = errors;

        Object.setPrototypeOf(this, RequestValidationError.prototype);
    }

    serialize() {
        const message =
            Array.isArray(this.errors) && this.errors.length > 0
                ? this.errors[0]?.msg
                : 'Ocurrió un error en la validación de datos';

        return {
            code: this.code,
            message,
            error: this.errors.map((x) => ({
                message: x.msg || 'Error de validación en el campo',
                field: x.param, // Cambié de 'path' a 'param'
                location: x.location,
                value: x.value || 'No proporcionado', // Valor proporcionado por el usuario
            })),
        };
    }
}
