import axios from "axios";
import {CustomError, handleServiceError} from "../errors/index.js";
import {DateTime} from "luxon";

const SIIGO_BASE_URL = process.env.SIIGO_BASE_URL
const SIIGO_SERVICES_BASE_URL= 'https://services.siigo.com'
const SIIGO_USER = process.env.SIIGO_USER
const SIIGO_TOKEN = process.env.SIIGO_TOKEN
const PARTNER = process.env.SIIGO_PARTNER

// Obtener token desde cache en memoria o generar uno nuevo
let cachedSiigoToken = null;
let tokenExpirationTime = null;
let isFetchingToken = false; // Variable para manejar el bloqueo
let tokenPromise = null; // Promesa compartida durante la obtención del token

// Obtener token desde cache en memoria o generar uno nuevo
export const getSiigoToken = async () => {
    const now = Date.now();

    // Si ya existe un token válido en caché, devolverlo
    if (cachedSiigoToken && now < tokenExpirationTime) {
        console.log('Token de Siigo obtenido desde cache');
        return cachedSiigoToken;
    }

    // Si ya hay otra solicitud generando el token, esperar su promesa
    if (isFetchingToken) {
        console.log('Esperando a que se genere el token...');
        return tokenPromise;
    }

    // Si no hay un token válido ni se está generando, iniciar la generación
    isFetchingToken = true;

    tokenPromise = new Promise(async (resolve, reject) => {
        try {
            const url = `${SIIGO_BASE_URL}/auth`;
            const response = await axios.post(url, { username: SIIGO_USER, access_key: SIIGO_TOKEN });

            if (!response.data.access_token) {
                throw new CustomError({ message: 'Acceso denegado a la API de Siigo', code: 401 });
            }

            // Almacenar el token y su tiempo de expiración (1 hora)
            cachedSiigoToken = response.data.access_token;
            tokenExpirationTime = now + 60 * 60 * 1000;

            console.log('Token de Siigo guardado en memoria');
            resolve(cachedSiigoToken);
        } catch (error) {
            console.error('Error obteniendo el token de Siigo:', error.message);
            reject(error);
        } finally {
            isFetchingToken = false;
            tokenPromise = null; // Restablecer la promesa
        }
    });

    return tokenPromise;
};

export const getSiigoHeadersOptions = async () => {
    try {
        const token = await getSiigoToken();
        return {
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${token}`,
                'Partner-Id': PARTNER,
            },
        };
    } catch (error) {
        console.error('Error al obtener encabezados de Siigo:', error.message);
        throw new Error('Error armando los encabezados');
    }
};


//"identification": "1000019555"
export const getContactsByIdentification = async (identification) => {
    try {
        // Limpiar caracteres no numéricos
        const cleanIdentification = identification.replace(/[.,-]/g, '');

        // Detectar si es "consumidor final"
        const countTwos = (cleanIdentification.match(/2/g) || []).length;
        if (countTwos > 5) {
            return await querySiigoContact('222222222222'); // Consumidor final
        }

        // Intentar la consulta con 10 y 9 dígitos
        const contact10Digits = await querySiigoContact(cleanIdentification);
        if (contact10Digits) return contact10Digits;

        // Si no hay resultados con 10 dígitos, probar con 9 dígitos
        const contact9Digits = await querySiigoContact(cleanIdentification.slice(0, -1));
        return contact9Digits || null; // Retornar null si no hay resultados
    } catch (error) {
        console.error('Error en getContactsByIdentification:', error);
        handleServiceError(error);
        return null; // Retornar null en caso de error
    }
};

// Función auxiliar para consultas individuales
const querySiigoContact = async (identification) => {
    try {
        const options = await getSiigoHeadersOptions();
        const url = `${SIIGO_BASE_URL}/v1/customers?identification=${identification}`;
        console.log('Consultando URL:', url);
        const response = await axios.get(url, options);
        return response.data.results.length > 0 ? response.data : null;
    } catch (error) {
        if (error.response?.status === 404) {
            return null; // Retornar null si no se encuentra el recurso
        }
        throw error; // Relanzar otros errores
    }
};
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

export const setSiigoPurchaseInvoiceData = async (data) => {
console.log('[FACTURAS DE COMPRA]', data)
    return data.map(invoice => ({
        date: DateTime.now().toISODate(),
        document: {
            id: process.env.SIIGO_PURCHASE_ID
        },
        supplier: {
            identification: invoice.DetalleProveedor.Nif
        },
        cost_center: invoice.Almacen,
        provider_invoice: {
            prefix: '',
            number: invoice.SudocProv
        },
        observations: `Factura de oringen hiopos # ${data.Serie}/${data.Numero}`,
        items: invoice.DetalleDocumento.map(item => ({
            code: item.RefArticulo,
            description: item.RefArticulo,
            quantity: item.Unidades,
            price: item.Precio,
            taxes: item.DetalleImpuesto.map(tax => ({
                id: tax.NombreImpuesto
            })),
            payments: invoice.DetalleMediosdepago.map(payment => ({
                id: payment.MedioPago,
                value:payment.Importe
            }))
        }))
    }))

}

export const setSiigoSalesInvoiceData = async (data) => {
    return data.map(invoice => ({
        date: DateTime.now().toISODate(),
        document: {
            id: process.env.SIIGO_SALES_ID
        },
        customer: {
            identification: invoice.DatosCliente.Nif
        },
        items: invoice.DetalleDocumento.map(item => ({
            code: item.RefArticulo,
            quantity: item.Unidades,
            price: item.Precio,
            discount: item. Descuento
        })),
        payments: invoice.MedioPago.map(payment => ({
            id: payment.MedioDePago,
            value: payment.Valor
        })),
        observations: `Integrado automaticamente, documento Hiopos: ${invoice.Serie}/${invoice.Numero}`
    }))
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
            unit_label: UnidadMedida,
            taxes:[],
            prices: [
                {
                    currency_code: 'COP',
                    price_list: [
                        {
                            "position": 1,
                            "value": item.Precio
                        }
                    ]
                }
            ]


        }
    } catch (error) {
        
    }
}

export const setCustomerContactData = (type, contact) => {

    const siigoType = 'Customer'
    const person_type = contact[0].TipoDocumentoFiscal === 'NIT' ? 'Company' : 'Person';
    const id_type = person_type === 'Person'? 13 : 31;
    const cleanedNif = contact[0].Nif.replace(/[.,-]/g, '');
    const identification = personType === 'Company'? cleanedNif.slice(0, 9) : cleanedNif;



}

export const setVendorContactData = (contact) => {
    const supplier = contact[0]
    const isCompany = supplier.Tipo_Documento_Fiscal === "NIT";
    const person_type = supplier.Tipo_Documento_Fiscal === 'NIT' ? 'Company' : 'Person';
    const cleanedNif = supplier.Numero_De_Documento_Fiscal.replace(/[.,-]/g, '');
    const identification = person_type === 'Company'? cleanedNif.slice(0, 9) : cleanedNif;

    return {
        type: 'Supplier',
        person_type,
        id_type: isCompany ? "31" : "13",
        identification,
        name: formatSiigoName(isCompany ? "Company" : "Person", supplier.Proveedor),
        commercial_name: supplier.Nombre_Comercial || supplier.Proveedor,
        phone: supplier.Telefono,
        email: supplier.Email,
        /*address: {
            address: supplier.Direccion,
            city: {
                code: supplier.Codigo_Postal.toString(),
                name: supplier.Poblacion_Ciudad || "Unknown"
            }
        },*/
        comments: supplier.Observaciones || "",
    };
}

const formatSiigoName = (type, fullName) => {
    if (type === "Company") {
        // Empresas: solo enviamos el nombre completo como un solo elemento en el array
        return [fullName];
    }

    if (type === "Person") {
        // Dividimos el nombre completo en palabras
        const nameParts = fullName.trim().split(/\s+/);

        // Evaluamos casos según la cantidad de palabras
        switch (nameParts.length) {
            case 1: // Solo un nombre
                return [nameParts[0], "Apellido_No_Asignado"];
            case 2: // Un nombre y un apellido
                return [nameParts[0], nameParts[1]];
            case 3: // Dos nombres y un apellido, o un nombre y dos apellidos
                return [nameParts[0], `${nameParts[1]} ${nameParts[2]}`];
            case 4: // Dos nombres y dos apellidos
            default:
                return [`${nameParts[0]} ${nameParts[1]}`, `${nameParts[2]} ${nameParts[3]}`];
        }
    }

    throw new Error("Tipo desconocido para el campo name");
};

export const createContact = async (type, contact) => {
    const options = await getSiigoHeadersOptions()
    const url = `${SIIGO_BASE_URL}/v1/customers`
    try {
        if (type === '/vendors'){
            const data = setVendorContactData(contact)
            const supplier = await axios.post(url, data, options)
            return supplier.data
        }
    } catch (error) {
        console.log('Error creando el proveedor en siigo', error.response.data)
        handleServiceError(error)
    }
}