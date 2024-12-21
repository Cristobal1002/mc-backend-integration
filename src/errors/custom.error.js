export class CustomError extends Error {
    constructor({ message, code, data }) {
        super(message);
        this.name = this.constructor.name; // Asignar el nombre de la clase
        this.code = code || 500;
        this.data = data || null;
    }

    serialize() {
        return {
            message: this.message,
            code: this.code,
            data: this.data,
        };
    }
}
