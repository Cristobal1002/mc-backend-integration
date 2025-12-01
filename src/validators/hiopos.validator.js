import {body, check} from "express-validator";

export const purchaseBody = [
    body('startDate')
        .exists({ checkFalsy: true }).withMessage('startDate es obligatorio')
        .isString().withMessage('startDate debe ser un string'),
    body('endDate')
        .exists({ checkFalsy: true }).withMessage('endDate es obligatorio')
        .isString().withMessage('endDate debe ser un string'),
]


// Validador para el body
export const vendorBody = [
    body('filters')
        .isArray({ min: 1 })
        .withMessage('filters debe ser un array y no puede estar vacío')
        .custom((filters) => {
            // Validación de cada elemento dentro del array de filters
            filters.forEach((filter) => {
                // Verifica que cada filtro tenga las propiedades requeridas
                if (!filter.attributeId || !filter.arithmeticOperator || !filter.type || !filter.value) {
                    throw new Error('Cada objeto en filters debe contener attributeId, arithmeticOperator, type y value');
                }

                // Validaciones específicas para cada campo dentro del filtro
                if (typeof filter.attributeId !== 'number') {
                    throw new Error('attributeId debe ser un número');
                }

                const validOperators = ['LIKE_CONTAINS', 'EQUALS', 'NOT_EQUALS']; // Añadir operadores si es necesario
                if (!validOperators.includes(filter.arithmeticOperator)) {
                    throw new Error('arithmeticOperator debe ser uno de los valores: LIKE_CONTAINS, EQUALS, NOT_EQUALS');
                }

                if (filter.type !== 'String') {
                    throw new Error('type debe ser "String"');
                }

                if (typeof filter.value !== 'string') {
                    throw new Error('value debe ser una cadena de texto');
                }
            });
            return true;
        })
];

// Validador para borrado físico de lotes por rango de fechas
export const deleteLotesByDateRange = [
    body('startDate')
        .exists({ checkFalsy: true }).withMessage('startDate es obligatorio')
        .isString().withMessage('startDate debe ser un string')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('startDate debe tener el formato YYYY-MM-DD'),
    body('endDate')
        .exists({ checkFalsy: true }).withMessage('endDate es obligatorio')
        .isString().withMessage('endDate debe ser un string')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('endDate debe tener el formato YYYY-MM-DD')
        .custom((endDate, { req }) => {
            if (req.body.startDate && endDate < req.body.startDate) {
                throw new Error('endDate debe ser mayor o igual a startDate');
            }
            return true;
        })
];
