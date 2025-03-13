import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import {model} from "../models/index.js";

export const getParametrizationData = async () => {
    try {
        const paramData = await model.ParametrizationModel.findAll()
        return {data: paramData}
    } catch (error) {
        console.error("Error obteniendo la parametrizacion:", error);
        handleServiceError(error)
    }
}

export const updateParametrizationData = async (data) => {
    try {
        const { type, key, value } = data;
        if (!type || !key || value === undefined) {
            throw new CustomError({
                message: 'Faltan parametros requeridos',
                code: 401,
                data: null,
            });
        }
        const param = await model.ParametrizationModel.findOne({
            where: {type}
        })
        param.set(key,value)
        await param.save()
        return {data: param}

    } catch (error) {
        console.error("Error actualizando la parametrizacion:", error);
        handleServiceError(error)
    }
}