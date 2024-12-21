import axios from "axios";
import { CustomError } from "../errors/index.js";
import xml2js from "xml2js";  // Importamos la librería para convertir XML a JSON

export const getHioposToken = async () => {
    const baseUrl = 'https://cloudlicense.icg.eu/services/cloud/getCustomerWithAuthToken';
    const email = process.env.HIOPOS_EMAIL;
    const password = process.env.HIOPOS_PASSWORD;

    try {
        const response = await axios.get(`${baseUrl}?email=${email}&password=${password}&isoLanguage=ES`);

        // Convertimos la respuesta XML a JSON
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const jsonResponse = await parser.parseStringPromise(response.data);
        console.log('JSON response:', jsonResponse);

        // Verificamos si la respuesta contiene un error
        if (jsonResponse.response.serverError) {
            const error = jsonResponse.response.serverError;
            return {error: error}
        }

        return {data: jsonResponse.response.customerWithAuthTokenResponse};  // Si no hay error, retornamos la respuesta convertida a JSON
    } catch (error) {
        console.error("Error en servicio (getHioposToken):", error);  // Log del error

        // Si el error tiene una respuesta (error de Axios) y es un error de servidor
        if (error.response) {
            const errorData = error.response.data;
            throw new CustomError({
                message: errorData?.message || "Error de comunicación con el servidor",
                code: error.response.status || 500,
                data: errorData,
            });
        }

        // Si el error no tiene respuesta, manejamos un error genérico
        throw new CustomError({
            message: error.message || "Ocurrió un error desconocido",
            code: 500,
            data: error,
        });
    }
};

const  getHeaders = (authToken) => {
        if(authToken){
            return {headers: {'x-auth-token': authToken}}
        }
}

const cleanInvalidJSON = (jsonString) => {
    return jsonString
        // Reemplazar valores vacíos ": ," por ": null"
        .replace(/:\s*,/g, ': null,')
        // Eliminar comas sobrantes antes de un cierre de objeto/arreglo
        .replace(/,(\s*[}\]])/g, '$1')
        // Eliminar comas al inicio de objetos o arreglos
        .replace(/([{[])\s*,/g, '$1')
        // Reemplazar comas en los números
        .replace(/"(\w+)"\s*:\s*([\d,]+\.\d+)/g, (match, key, value) => {
            const cleanValue = value.replace(/,/g, ''); // Eliminar comas en números
            return `"${key}": ${cleanValue}`;
        });
};

const parseBase64Response = (base64Data) => {
    try {
        // Decodificar Base64 a texto
        const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
        console.log('Texto decodificado:', decodedData);

        // Limpiar el JSON de comas en los números
        const cleanedData = cleanInvalidJSON(decodedData);
        console.log('Texto limpio:', cleanedData);

        // Intentar parsear el JSON limpio
        return JSON.parse(cleanedData);
    } catch (error) {
        console.error('Error al decodificar o parsear respuesta:', error.message);
        throw new Error('Respuesta inválida: no se pudo procesar');
    }
};



export const getPurchaseInvoices = async (filter) => {
    try {
        const connectionData = await  getHioposToken()
        const {authToken, customerId, address} = connectionData.data
        const headers = getHeaders(authToken)
        const exportationId = '5f99f429-ac34-11ef-8dd7-00505608b026'
        const url = `https://${address}/ErpCloud/exportation/launch`
        const data = {startDate: filter.startDate, endDate: filter.endDate, exportationId }

        const response = await axios.post(url, data, headers)
        //console.log('Respuesta:', response)
        const base = response.data[0].exportedDocs[0].data
        console.log('Base:', base)
        const parse = parseBase64Response(base)
        console.log('Parse', parse)
        return {data: parse}

    } catch (error) {
        // Si el error no tiene respuesta, manejamos un error genérico
        throw new CustomError({
            message: error.message || "Ocurrió un error desconocido",
            code: 500,
            data: error,
        });
    }
}