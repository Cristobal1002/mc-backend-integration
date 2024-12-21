import {body} from "express-validator";

export const purchaseBody = [
    body('startDate').notEmpty().isString().withMessage('startDate es un campo requerido'),
    body('endDate').notEmpty().isString().withMessage('endDate es un campo requerido'),
]