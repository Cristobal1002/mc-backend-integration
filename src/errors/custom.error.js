export class CustomError extends Error {
    constructor({ message, code, data, source = null }) {
        super(message);
        this.name = this.constructor.name; // Asignar el nombre de la clase
        this.code = code || 500;
        this.data = data || null;
        this.source = source || data?.source || null;
    }

    serialize() {
        return {
            message: this.message,
            code: this.code,
            source: this.source,
            data: this.data,
        };
    }
}
