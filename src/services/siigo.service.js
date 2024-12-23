import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import {DateTime} from "luxon";

const SIIGO_BASE_URL = process.env.SIIGO_BASE_URL
const SIIGO_SERVICES_BASE_URL= 'https://services.siigo.com'
const SIIGO_USER = process.env.SIIGO_USER
const SIIGO_TOKEN = process.env.SIIGO_TOKEN
const PARTNER = process.env.SIIGO_PARTNER
const getSiigoToken = async() => {
    try {
        const url = `${SIIGO_BASE_URL}/auth`
        const response = await axios.post(url, {username: SIIGO_USER, access_key: SIIGO_TOKEN})
        if (!response.data.access_token) {
            throw new CustomError({message:'Acceso denegado a la API de Siigo',code: 401})
        }
        return response.data.access_token;
    } catch (error) {
        console.error(error)
        handleServiceError(error)
    }
}

const getSiigoHeadersOptions = async() => {
    try {
        const token = await getSiigoToken();
        return  {
            headers: {
                'content-type': 'application/json',
                Authorization: token,
                'Partner-Id': PARTNER,
            },
        }
    } catch (error) {
        console.error('Error al limpiar JSON:', error.message);
        throw new Error('Error armando los encabezados');
    }
}

//"identification": "1000019555"
export const getContactsByIdentification = async (identification) => {
    try {
        const options = await   getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/customers?identification=${identification}`
        const response = await axios.get(url,options)
        console.log('Respuesta en contactos:', response.data)
        return {data: response.data.results}
    } catch (error) {
        console.error(error)
        handleServiceError(error)
    }
}

//"code": "MPP13"
export const getItemByCode = async (code) => {
    try {
        const options = await   getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/products?code=${code}`
        const response = await axios.get(url,options)
        console.log('Respuesta en contactos:', response.data)
        return {data: response.data.results}
    } catch (error) {
        console.error(error)
        handleServiceError(error)
    }
}

const setSiigoPurchaseInvoiceData = async (data) => {
    try {
        const items = await setSiigoPurchaseItems(data.DetalleDocumento)
        return {
            document: {
                id: process.env.SIIGO_PURCHASE_ID
            },
            date: DateTime.now().toISODate(),
            supplier: {
                identification: data.DetalleProveedor.Nif
            },
            cost_center: data.CodAlmacen,
            provider_invoice: {
                prefix: '',
                number: data.SudocProv
            },
            observations: `Factura de oringen hiopos # ${data.Serie}/${data.Numero}`,
            items:[
                {

                }
            ],
            payments:[]

        }
    } catch (error) {

    }
}

const setSiigoPurchaseItems = async (data) => {
    try {
        // Extraer identificadores únicos (CodArticulo)
        const itemCode = data.map(item => item.RefArticulo);

        // Verificar cuáles artículos existen en Siigo
        const existingItems = await getItemByCode(itemCode);

        // Determinar los artículos que faltan
        const missingItems = data.filter(item =>
            !existingItems.some(existing => existing.RefArticulo === item.RefArticulo)
        );

        // Crear los artículos faltantes en Siigo
        const createdItems = await createMissingItems(missingItems);

        // Consolidar los resultados
        const result = [...existingItems, ...createdItems];
        return result;
    } catch (error) {

    }
}

export const createPurchaseInvoice = async (data) => {
    try {
        const response = await setSiigoPurchaseInvoiceData(data)
    } catch (error) {

    }
}

export const createSiigoItem = async (item) => {
    try {
        const item = {
            code: item.RefArticulo,
            account_group: 763, //Revisarlo porque no se sabe de donde tomarlo
            name: item.Articulo,
            stock_control: false,
            active: true,

        }
    } catch (error) {
        
    }
}