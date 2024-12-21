import axios from "axios";
import { CustomError } from "../errors/index.js";
import xml2js from "xml2js";


// Configuración inicial y constantes
const BASE_URL = 'https://cloudlicense.icg.eu/services/cloud/getCustomerWithAuthToken';
const PURCHASE_EXPORTATION_ID = '5f99f429-ac34-11ef-8dd7-00505608b026';

// Utilidades generales

/**
 * Limpia un JSON inválido en formato string.
 */
const cleanInvalidJSON = (jsonString) => {
    return jsonString
        .replace(/:\s*,/g, ': null,') // Reemplaza valores vacíos ": ," por ": null"
        .replace(/,(\s*[}\]])/g, '$1') // Elimina comas sobrantes antes de un cierre
        .replace(/([{[])\s*,/g, '$1') // Elimina comas al inicio de objetos o arreglos
        .replace(/"(\w+)"\s*:\s*([\d,]+\.\d+)/g, (match, key, value) => {
            const cleanValue = value.replace(/,/g, ''); // Limpia comas en números
            return `"${key}": ${cleanValue}`;
        });
};

/**
 * Decodifica una cadena Base64 y la convierte en JSON.
 */
const parseBase64Response = (base64Data) => {
    try {
        const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
        const cleanedData = cleanInvalidJSON(decodedData);
        return JSON.parse(cleanedData);
    } catch (error) {
        console.error('Error al decodificar o parsear respuesta:', error.message);
        throw new Error('Respuesta inválida: no se pudo procesar');
    }
};

/**
 * Crea un objeto de headers con el token de autenticación.
 */
const getHeaders = (authToken) => ({
    headers: { 'x-auth-token': authToken },
});

// Servicios

/**
 * Obtiene el token de Hiopos usando credenciales de ambiente.
 * También devuelve la dirección base proporcionada por el servicio.
 */
export const getHioposToken = async () => {
    const email = process.env.HIOPOS_EMAIL;
    const password = process.env.HIOPOS_PASSWORD;

    try {
        const response = await axios.get(`${BASE_URL}?email=${email}&password=${password}&isoLanguage=ES`);

        // Convertimos XML a JSON
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const jsonResponse = await parser.parseStringPromise(response.data);

        if (jsonResponse.response.serverError) {
            throw new CustomError({
                message: jsonResponse.response.serverError,
                code: 500,
            });
        }

        const { customerWithAuthTokenResponse } = jsonResponse.response;
        const { address } = customerWithAuthTokenResponse;

        if (!address) {
            throw new CustomError({
                message: "La respuesta no contiene la dirección base del servicio",
                code: 500,
            });
        }

        return customerWithAuthTokenResponse;
    } catch (error) {
        console.error("Error en servicio (getHioposToken):", error);

        if (error.response) {
            throw new CustomError({
                message: error.response.data?.message || "Error de comunicación con el servidor",
                code: error.response.status || 500,
                data: error.response.data,
            });
        }

        throw new CustomError({
            message: error.message || "Ocurrió un error desconocido",
            code: 500,
            data: error,
        });
    }
};

/**
 * Obtiene las facturas de compra en base a un filtro.
 */
export const getPurchaseInvoices = async (filter) => {
    try {
        const connectionData = await getHioposToken();
        const { authToken, address } = connectionData;
        const headers = getHeaders(authToken);
        const url = `https://${address}/ErpCloud/exportation/launch`;
        const requestData = { startDate: filter.startDate, endDate: filter.endDate, exportationId: PURCHASE_EXPORTATION_ID };

        const response = await axios.post(url, requestData, headers);
        const base64Data = response.data[0]?.exportedDocs[0]?.data;

        if (!base64Data) {
            throw new CustomError({
                message: "No se encontró información en la respuesta",
                code: 404,
            });
        }

        const parsedData = parseBase64Response(base64Data);
        return { data: parsedData };
    } catch (error) {
        console.error("Error en servicio (getPurchaseInvoices):", error);

        if (error.response) {
            throw new CustomError({
                message: error.response.data?.message || "Error al obtener facturas de compra",
                code: error.response.status || 500,
                data: error.response.data,
            });
        }

        throw new CustomError({
            message: error.message || "Ocurrió un error desconocido",
            code: 500,
            data: error,
        });
    }
};
