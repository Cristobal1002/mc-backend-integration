export class CustomError extends Error {
    constructor({ message, code, data }) {
        super(message);
        this.message = message;
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
