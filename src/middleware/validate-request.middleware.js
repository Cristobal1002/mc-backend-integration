import { validationResult } from 'express-validator';
import { RequestValidationError } from "../errors/index.js";

export const validateRequest = (req, _, next) => {
    //console.log("[VALIDATION] Validando la solicitud...");

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map((e) => {
            if (e.nestedErrors) {
                return e.nestedErrors.map((nestedError) => ({
                    msg: nestedError.msg,
                    path: nestedError.param,
                    location: nestedError.location,
                    value: nestedError.value,
                }));
            } else {
                return {
                    msg: e.msg,
                    path: e.param,
                    location: e.location,
                    value: e.value,
                };
            }
        }).flat();  // Aplana los errores anidados, si existen

       console.log("[VALIDATION] Errores detectados:", formattedErrors);

        // Lanza un error de validación personalizado
        return next(new RequestValidationError(formattedErrors));  // Lanza la instancia directamente
    }

    next();  // Si no hay errores, pasa al siguiente middleware
};
