import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import xml2js from "xml2js";
import JSON5 from 'json5'


// Configuración inicial y constantes
const BASE_URL = process.env.HIOPOS_BASE_URL
const PURCHASE_EXPORTATION_ID = process.env.HIOPOS_PURCHASE_EXPORTATION_ID
const VENDOR_EXPORTATION_ID = process.env.HIOPOS_VENDOR_EXPORTATION_ID
const CUSTOMER_EXPORTATION_ID = process.env.HIOPOS_CUSTOMER_EXPORTATION_ID
const SALES_EXPORTATION_ID = process.env.HIOPOS_SALES_EXPORTATION_ID
const ITEMS_EXPORTATION_ID = process.env.HIOPOS_ITEMS_EXPORTATION_ID

// Utilidades generales

/**
 * Limpia un JSON inválido en formato string.
 */
const cleanInvalidJSON = (jsonString) => {
    try {
        return jsonString
            .replace(/:\s*,/g, ': "",') // Reemplaza valores vacíos ": ," por ": null"
            .replace(/,(\s*[}\]])/g, '$1') // Elimina comas sobrantes antes de un cierre
            .replace(/([{[])\s*,/g, '$1') // Elimina comas al inicio de objetos o arreglos
            .replace(/[\x00-\x1F\x80-\xFF]/g, '') // Eliminar caracteres no imprimibles
            .replace(/"(\w+)"\s*:\s*(-?\d{1,3}(?:,\d{3})*\.\d+)/g, (match, key, value) => {
                const cleanValue = value.replace(/,/g, '');
                return `"${key}": ${cleanValue}`;
            });
    } catch (error) {
        console.error('Error al limpiar JSON:', error.message);
        throw new Error('Error en la limpieza del JSON');
    }
};

/**
 * Decodifica una cadena Base64 y la convierte en JSON.
 */
const parseBase64Response = (base64Data) => {
    try {
        // Decodifica la data desde Base64
        const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');

        // Valida si contiene caracteres no válidos
        if (/\\uFFFD/.test(decodedData)) {
            console.warn('Advertencia: La respuesta contiene caracteres no válidos.');
        }

        const cleanedData = cleanInvalidJSON(decodedData);

        return JSON5.parse(cleanedData);

    } catch (error) {
        console.error('Error al procesar la respuesta Base64:', error.message);
        throw new CustomError({message:`Error al procesar la respuesta Base64, ${error.message}`,code: 500, data:{error}});
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
const getHioposToken = async () => {
    const email = process.env.HIOPOS_EMAIL;
    const password = process.env.HIOPOS_PASSWORD;

    try {
        const response = await axios.get(`${BASE_URL}?email=${email}&password=${password}&isoLanguage=ES`);

        // Convertimos XML a JSON
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const jsonResponse = await parser.parseStringPromise(response.data);

        if (jsonResponse.response.serverError) {
            console.log('JSON repsonse', jsonResponse.response)
            throw new CustomError({
                message:jsonResponse.response.serverError.message || null,
                code: 401,
                data: jsonResponse.response
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
        handleServiceError(error);
    }
};

/**
 * Obtiene las facturas de compra en base a un filtro.
 */

export const getBridgeDataByType = async (servicio, filter) => {
    try {
        let exportationId = ''
        const connectionData = await getHioposToken();
        const { authToken, address } = connectionData;
        const headers = getHeaders(authToken);
        const url = `https://${address}/ErpCloud/exportation/launch`;
        switch (servicio) {
            case '/purchases':
            case 'purchases':
                exportationId = PURCHASE_EXPORTATION_ID;
                break;
            case '/vendors':
                exportationId = VENDOR_EXPORTATION_ID;
                break;
            case '/customers':
                exportationId = CUSTOMER_EXPORTATION_ID;
                break;
            case '/sales':
            case 'sales':
                exportationId = SALES_EXPORTATION_ID;
                break;
            case '/items':
                exportationId = ITEMS_EXPORTATION_ID;
                break;
            default:
                throw new Error(`Servicio no reconocido: ${servicio}`);
        }
        filter.exportationId = exportationId
        console.log("DATA EN SERVICIO", filter)
        const response = await axios.post(url, filter, headers);
        console.log('Respuesta en servicio',response)
        const base64Data = response.data[0]?.exportedDocs[0]?.data;

        if (!base64Data) {
            return {data:[]}
        }

        const parsedData = parseBase64Response(base64Data);
        return {data: parsedData} ;

    } catch (error) {
        console.log("Error en servicio (getBridgeDataByType):", error);
        handleServiceError(error)
    }
}
