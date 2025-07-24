import axios from "axios";
import { CustomError, handleServiceError } from "../errors/index.js";
import xml2js from "xml2js";
import JSON5 from "json5";

// Configuración inicial y constantes
const BASE_URL = process.env.HIOPOS_BASE_URL;
const PURCHASE_EXPORTATION_ID = process.env.HIOPOS_PURCHASE_EXPORTATION_ID;
const VENDOR_EXPORTATION_ID = process.env.HIOPOS_VENDOR_EXPORTATION_ID;
const CUSTOMER_EXPORTATION_ID = process.env.HIOPOS_CUSTOMER_EXPORTATION_ID;
const SALES_EXPORTATION_ID = process.env.HIOPOS_SALES_EXPORTATION_ID;
const ITEMS_EXPORTATION_ID = process.env.HIOPOS_ITEMS_EXPORTATION_ID;

// Caché local
let cachedHioposToken = null;
let cachedHioposAddress = null;
let hioposTokenExpiration = null;
let isFetchingHioposToken = false; // Variable para manejar el bloqueo
let hioposTokenPromise = null; // Promesa compartida durante la obtención del token

/**
 * Limpia un JSON inválido en formato string.
 */
const cleanInvalidJSON = (jsonString) => {
    try {
        return jsonString
            // 1. Valores vacíos tipo "key": , → null
            .replace(/:\s*,/g, ': null,')
            .replace(/:\s*([}\]])/g, ': null$1')

            // 2. Quita comas extra antes de cerrar objetos/arrays
            .replace(/,(\s*[}\]])/g, '$1')

            // 3. Quita comas al inicio de objetos/arrays
            .replace(/([{[])\s*,/g, '$1')

            // 4. Elimina caracteres de control no imprimibles
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')

            // 5. Limpia claves con espacios o símbolos como %
            .replace(/"([^"]+)"\s*:/g, (_, key) => {
                const cleanKey = key.replace(/[\s%]/g, '');
                return `"${cleanKey}":`;
            })

            // 6. Números europeos: -89.203,00 → -89203.00 (fuera de strings)
            .replace(/:\s*(-?\d{1,3}(?:\.\d{3})+,\d{2})(?=\s*[,\]}])/g, (_, value) => {
                return `: ${value.replace(/\./g, '').replace(',', '.')}`;
            })

            // 7. Números simples tipo 0,00 → 0.00
            .replace(/:\s*(-?\d+),(\d{2})(?=\s*[,\]}])/g, ': $1.$2')

            // 8. Números americanos: 3,022,360.00 → 3022360.00
            .replace(/:\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?=\s*[,\]}])/g, (_, value) => {
                return `: ${value.replace(/,/g, '')}`;
            });
    } catch (error) {
        console.error('Error al limpiar JSON:', error.message);
        throw new Error('Error en la limpieza del JSON');
    }
};

const cleanInvalidJSONSafe = (jsonString) => {
    try {
        return jsonString
            // 1. Reemplaza valores vacíos tipo `"key": ,` o `"key":}` por null
            .replace(/:\s*,/g, ': null,')
            .replace(/:\s*([}\]])/g, ': null$1')

            // 2. Elimina comas antes de cerrar objetos o arrays
            .replace(/,(\s*[}\]])/g, '$1')

            // 3. Elimina comas al inicio de objetos o arrays
            .replace(/([{[])\s*,/g, '$1')

            // 4. Elimina caracteres invisibles corruptos
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '')

            // 5. Corrige números europeos con puntos de miles y comas decimales (fuera de strings)
            .replace(/:\s*(-?\d{1,3}(?:\.\d{3})+,\d{2})(?=\s*[,\]}])/g, (_, value) =>
                `: ${value.replace(/\./g, '').replace(',', '.')}`
            )

            // 6. Corrige números simples tipo 0,00 → 0.00
            .replace(/:\s*(-?\d+),(\d{2})(?=\s*[,\]}])/g, ': $1.$2')

            // 7. Corrige números americanos tipo 3,000.00 → 3000.00
            .replace(/:\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)(?=\s*[,\]}])/g, (_, value) =>
                `: ${value.replace(/,/g, '')}`
            )

            // 8. Limpia espacios en blanco alrededor de claves: `" Almacen "` → `"Almacen"`
            .replace(/"(\s*[^"]*?\s*)"\s*:/g, (_, key) =>
                `"${key.trim()}":`
            );
    } catch (error) {
        console.error('Error al limpiar JSON:', error.message);
        throw new Error('Error en la limpieza del JSON');
    }
};

/**
 * Limpia caracteres especiales y tildes de todos los strings dentro de un objeto JSON.
 */
const sanitizeStringsDeep = (obj) => {
    if (Array.isArray(obj)) {
        return obj.map(sanitizeStringsDeep);
    } else if (obj && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, sanitizeStringsDeep(value)])
        );
    } else if (typeof obj === 'string') {
        return obj
            .normalize("NFD")                             // separa tildes
            .replace(/[\u0300-\u036f]/g, '')              // elimina tildes
            .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')    // elimina caracteres corruptos como �
            .trim();
    }
    return obj;
};

/**
 * Decodifica una cadena Base64 y la convierte en JSON limpio.
 */
const parseBase64Response = (base64Data) => {
    try {
        const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
        const cleanedData = cleanInvalidJSONSafe(decodedData);
        const parsed = JSON5.parse(cleanedData);
        return sanitizeStringsDeep(parsed); // ← limpieza profunda
    } catch (error) {
        console.error('Error al procesar la respuesta Base64:', error.message);
        throw new CustomError({
            message: `Error al procesar la respuesta Base64, ${error.message}`,
            code: 500
        });
    }
};

/**
 * Obtiene el token de Hiopos, usando caché si es válido.
 */
const getHioposToken = async () => {
    const now = Date.now();

    // Si el token en caché es válido, devolverlo
    if (cachedHioposToken && hioposTokenExpiration && hioposTokenExpiration > now) {
        //console.log("Usando token de Hiopos desde caché");
        return { authToken: cachedHioposToken, address: cachedHioposAddress };
    }

    // Si ya hay otra solicitud generando el token, esperar su resultado
    if (isFetchingHioposToken) {
        //console.log("Esperando a que se genere el token de Hiopos...");
        return hioposTokenPromise;
    }

    // Iniciar la obtención del token
    isFetchingHioposToken = true;

    hioposTokenPromise = new Promise(async (resolve, reject) => {
        try {
            //console.log("Solicitando nuevo token de Hiopos...");
            const email = process.env.HIOPOS_EMAIL;
            const password = process.env.HIOPOS_PASSWORD;

            const response = await axios.get(
                `${BASE_URL}?email=${email}&password=${password}&isoLanguage=ES`
            );

            const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
            const jsonResponse = await parser.parseStringPromise(response.data);

            if (jsonResponse.response.serverError) {
                throw new CustomError({
                    message: jsonResponse.response.serverError.message || 'Error en el servidor',
                    code: 401,
                    data: jsonResponse.response,
                });
            }

            const { authToken, address } = jsonResponse.response.customerWithAuthTokenResponse;

            if (!authToken) {
                throw new CustomError({
                    message: "La respuesta no contiene un token de autenticación",
                    code: 500,
                });
            }

            // Actualizar caché
            cachedHioposToken = authToken;
            cachedHioposAddress = address;
            hioposTokenExpiration = now + 60 * 60 * 1000; // Expira en 1 hora

            //console.log("Token de Hiopos guardado en caché");
            resolve({ authToken, address });
        } catch (error) {
            console.error("Error en servicio (getHioposToken):", error);
            reject(error);
        } finally {
            isFetchingHioposToken = false;
            hioposTokenPromise = null; // Restablecer la promesa
        }
    });

    return hioposTokenPromise;
};

/**
 * Obtiene las facturas de compra en base a un filtro.
 */
export const getBridgeDataByType = async (servicio, filter) => {
    try {
        const connectionData = await getHioposToken()
        let exportationId = '';
        const { authToken, address } = connectionData;
        const headers = { headers: { 'x-auth-token': authToken } };
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

        filter.exportationId = exportationId;

        const response = await axios.post(url, filter, headers);
        const base64Data = response.data[0]?.exportedDocs[0]?.data;

        if (!base64Data) {
            return { data: [] };
        }

        return { data: parseBase64Response(base64Data) };
    } catch (error) {
        console.error("Error en servicio (getBridgeDataByType):", error);
        handleServiceError(error);
    }
};

export const getContactByDocument = async(type, contact) => {
    let filters = [];

    switch (type) {
        case '/customers':
            filters.push({
                attributeId: 146,
                arithmeticOperator: "EQUAL",
                type: "String",
                value: contact
            });
            break;
        case '/vendors' :
        case '/purchases':
            filters.push({
                attributeId: 151,
                arithmeticOperator: "LIKE_CONTAINS",
                type: "String",
                value: contact
            });
            break;
        default:
            throw new Error(`Unknown type: ${type}`);
    }
    try {
        //console.log('getContactByDocument',type, {filters})
        const hioposContact = await getBridgeDataByType(type, {filters})
        return hioposContact.data
    } catch (error) {
        //console.log(error)
    }
}