import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import xml2js from "xml2js";


// Configuración inicial y constantes
const BASE_URL = 'https://cloudlicense.icg.eu/services/cloud/getCustomerWithAuthToken';
const PURCHASE_EXPORTATION_ID = '5f99f429-ac34-11ef-8dd7-00505608b026';
const VENDOR_EXPORTATION_ID = '30df5e30-bd78-11ef-8dd7-00505608b026';
const CUSTOMER_EXPORTATION_ID = '8c922a40-d777-11ee-93dc-0050561d75a2';
const SALES_EXPORTATION_ID = 'd9e187fe-dfe8-11ee-954d-0050561429ba'

// Utilidades generales

/**
 * Limpia un JSON inválido en formato string.
 */
const cleanInvalidJSON = (jsonString) => {
    try {
        return jsonString
            .replace(/:\s*,/g, ': null,') // Reemplaza valores vacíos ": ," por ": null"
            .replace(/,(\s*[}\]])/g, '$1') // Elimina comas sobrantes antes de un cierre
            .replace(/([{[])\s*,/g, '$1') // Elimina comas al inicio de objetos o arreglos
            .replace(/"(\w+)"\s*:\s*([\d,]+\.\d+)/g, (match, key, value) => {
                const cleanValue = value.replace(/,/g, ''); // Limpia comas en números
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

        // Limpia y convierte la cadena a JSON
        const cleanedData = cleanInvalidJSON(decodedData);
        return JSON.parse(cleanedData);
    } catch (error) {
        console.error('Error al procesar la respuesta Base64:', error.message);
        throw new Error('Respuesta inválida: no se pudo procesar.');
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
        handleServiceError(error);
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
        return {  data: {json:parsedData, base:base64Data} };
    } catch (error) {
        console.error("Error en servicio (getPurchaseInvoices):", error);
        handleServiceError(error)
    }
};

export const getBridgeDataByType = async (servicio, filter) => {
    try {
        let exportationId = ''
        const connectionData = await getHioposToken();
        const { authToken, address } = connectionData;
        const headers = getHeaders(authToken);
        const url = `https://${address}/ErpCloud/exportation/launch`;
        switch (servicio) {
            case '/purchases': exportationId = PURCHASE_EXPORTATION_ID
                break;
            case '/vendors': exportationId = VENDOR_EXPORTATION_ID
                break;
            case '/customers': exportationId = CUSTOMER_EXPORTATION_ID
                break;
            case '/sales': exportationId = SALES_EXPORTATION_ID
                break;
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
        return { data:parsedData };

    } catch (error) {
        console.error("Error en servicio (getPurchaseInvoices):", error);
        handleServiceError(error)
    }
}
