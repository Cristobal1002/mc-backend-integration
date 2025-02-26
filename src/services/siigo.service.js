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
let taxCache = []; //Cache para no consultar siempre los impuestos
let paymentsCache = null //Cache pa medios de pago de siigo
let documentCache = null
let costCenterCache = null
let inventoryGroupsCache = null

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
        //console.error('Error en getContactsByIdentification:', error);
        handleServiceError(error);
        return null; // Retornar null en caso de error
    }
};

// Función auxiliar para consultas individuales
const querySiigoContact = async (identification) => {
    try {
        const options = await getSiigoHeadersOptions();
        const url = `${SIIGO_BASE_URL}/v1/customers?identification=${identification}`;
        //console.log('Consultando URL:', url);
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
        console.log('HET ITEM BY CODE', code)
        const options = await   getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/products?code=${code}`
        const response = await axios.get(url,options)
        return response.data
    } catch (error) {
        console.error(error)
        handleServiceError(error)
    }
}


const parseProviderInvoice = (input) => {
    const match = input.match(/^([a-zA-Z]+)(\d+)$/);
    if (!match) {
        throw new Error('El formato del campo SudocProv no es válido');
    }

    return {
        prefix: match[1], // Captura las letras iniciales
        number: parseInt(match[2], 10) // Convierte los números en un entero
    };
};

export const setSiigoPurchaseInvoiceData = async (data) => {
    console.log('[FACTURAS DE COMPRA]', data);
    return data.map(invoice => {
        let providerInvoice
        try {
            providerInvoice = parseProviderInvoice(invoice.SudocProv); // Intenta parsear SudocProv
        } catch (error) {
            console.error(`Error procesando SudocProv: ${invoice.SudocProv}. Usando valores por defecto.`);
        }

        return {
            date: DateTime.now().toISODate(),
            document: {
                id: process.env.SIIGO_PURCHASE_ID
            },
            supplier: {
                identification: invoice.DetalleProveedor.Nif
            },
            cost_center: invoice.Almacen,
            provider_invoice: providerInvoice, // Asignar el objeto parseado
            observations: `Factura de origen hiopos # ${invoice.Serie}/${invoice.Numero}`,
            items: invoice.DetalleDocumento.map(item => ({
                code: item.RefArticulo,
                description: item.RefArticulo,
                quantity: item.Unidades,
                price: item.Precio,
                taxes: item.DetalleImpuesto.map(tax => ({
                    id: tax.NombreImpuesto
                }))
            })),
            payments: invoice.DetalleMediosdepago.map(payment => ({
                id: payment.MedioPago,
                value: payment.Importe
            }))
        };
    });
};

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
export const setItemCreationData = async (item) => {
    try {
        const taxes = await getTaxesByName(item.DetalleImpuesto || item.Impuestos); // Esperar el resultado
        // Obtener los grupos de cuentas
        let inventoryGroups
        if(inventoryGroupsCache === null){
            inventoryGroups = await getInvetoryGroups();
        }else{
            inventoryGroups = inventoryGroupsCache
        }

        //console.log('GRUPOS DE INVENTARIO', inventoryGroups)

        // Buscar el grupo de cuentas que coincide con el nombre
        // Convertir tanto el nombre de la familia de Hiopos como el de Siigo a minúsculas
        const itemFamilyLower = item.Familia.toLowerCase();
        // Buscar el grupo de cuentas que coincide con el nombre en minúsculas
        const accountGroup = inventoryGroups.find(group => group.name.toLowerCase() === itemFamilyLower);


        // Si se encuentra el grupo de cuentas, obtener su id
        const accountGroupId = accountGroup ? accountGroup.id : 'Producto';
        return  {
            code: item.RefArticulo,
            account_group: accountGroupId, //Revisarlo porque no se sabe de donde tomarlo
            name: item.Articulo,
            stock_control: false,
            active: true,
            unit_label: item.UnidadMedida,
            taxes,
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
        console.log('error armando la data del articulo')
        throw error
    }
}

export const setItemInvoiceData = async (item) => {
    try {
        const taxes = await getTaxesByName(item.DetalleImpuesto);

    } catch (error) {

    }
}
const getTaxesByName = async (hioposTaxes) => {
    // Cargar impuestos en caché si no están cargados
    if (taxCache.length === 0) {
        taxCache = await getTaxes(); // Consultar todos los impuestos una vez
    }

    // Procesar impuestos de Hiopos
    const mappedTaxes = hioposTaxes.map(hioposTax => {
        let taxName = (hioposTax.NombreImpuesto ?? hioposTax.Descripcion)?.trim(); // Elimina espacios extras
        const taxPercentage = hioposTax.PorcentajeImpuesto ?? hioposTax.Porcentaje;

        console.log('TAX NAME', taxName)
        if (!taxName) {
            return null; // Ignorar impuestos sin nombre o sin porcentaje
        }
        if(taxName === 'EXENTOS'){taxName = 'IVA 0%'}

        // Normalizar nombres a minúsculas para comparación
        const normalizedTaxName = taxName.toLowerCase();

        const matchedTax = taxCache.find(siigoTax => siigoTax.name.toLowerCase() === normalizedTaxName);

        return {
            name: taxName,
            percentage: parseFloat(taxPercentage),
            id: matchedTax ? matchedTax.id : null,
            status: matchedTax ? 'found' : 'not_found',
        };
    });

    // Filtrar valores nulos
    return mappedTaxes.filter(tax => tax);
};
const getTaxes = async () => {
    try {
        const options = await getSiigoHeadersOptions()
        const response = await axios.get(`${SIIGO_BASE_URL}/v1/taxes`, options)
        return response.data
    } catch (error) {
        console.log('Error en consulta de impuestos:', error)
        handleServiceError(error)
    }
}

export const createPurchaseInvoice = async (data) => {
    try {
        const options = await getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/purchases`
        const response = await axios.post(url, data, options)
        return response.data
    } catch (error) {
        handleServiceError(error)
    }
}

export const createSaleInvoice = async (data) => {
    try {
        const options = await getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/invoices`
        const response = await axios.post(url, data, options)
        return response.data
    } catch (error) {
        handleServiceError(error)
    }
}
export const createSiigoItem = async (item) => {
    try {
        const options = await getSiigoHeadersOptions();
        const data = await setItemCreationData(item);
        console.log('Data armada para crear Articulo:', data);

        const response = await axios.post(`${SIIGO_BASE_URL}/v1/products`, data, options);
        return response.data
    } catch (error) {
        // Si ocurre un error, devolver el estado 'error' y el mensaje de error
        //console.log('Error de creacion de item', error.response.data)
        handleServiceError(error); // Maneja el error si es necesario
    }
};

const getInvetoryGroups = async () => {
    try {
        const options = await getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/account-groups`
        const response = await axios.get(url,options)
        return response.data
    } catch (error) {
        handleServiceError(error)
    }
}

export const setCustomerContactData = (contact) => {

    const customer = contact[0]
    const isCompany = customer.TipoDocumento === "NIT";
    const person_type = customer.TipoDocumento === 'NIT' ? 'Company' : 'Person';
    const cleanedNif = customer.Nif.replace(/[.,-]/g, '');
    const identification = person_type === 'Company'? cleanedNif.slice(0, 9) : cleanedNif;

    return {
        type: 'Customer',
        person_type,
        id_type: isCompany ? "31" : "13",
        identification,
        name: formatSiigoName(isCompany ? "Company" : "Person", customer.Cliente),
        commercial_name:  customer.Cliente,
        phone: customer.Telefono,
        email: customer.Email,
        /*address: {
            address: supplier.Direccion,
            city: {
                code: supplier.Codigo_Postal.toString(),
                name: supplier.Poblacion_Ciudad || "Unknown"
            }
        },*/
        comments: customer.Observaciones || "",
    };


}

export const setVendorContactData = (contact) => {
    const supplier = contact[0]
    const isCompany = supplier.Tipo_Documento_Fiscal === "NIT";
    const person_type = supplier.Tipo_Documento_Fiscal === 'NIT' ? 'Company' : 'Person';
    const cleanedNif = supplier.Numero_De_Documento_Fiscal.replace(/[.,-]/g, '');
    const identification = person_type === 'Company'? cleanedNif.slice(0, 9) : cleanedNif;
    const vat_responsible = supplier.Regimenes_fiscales === "Responsables de IVA"


    return {
        type: 'Supplier',
        person_type,
        id_type: isCompany ? "31" : "13",
        identification,
        name: formatSiigoName(isCompany ? "Company" : "Person", supplier.Proveedor),
        commercial_name: supplier.Nombre_Comercial || supplier.Proveedor,
        vat_responsible,
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
        }else if (type === '/customers') {
            const data = setCustomerContactData(contact);
            const customer = await axios.post(url, data, options);
            return customer.data
        }
    } catch (error) {
        console.log('Error creando el contacto en siigo', error.data)
        handleServiceError(error)
    }
}

const getSiigoPaymentMethods = async (documentType) => {
    const options = await getSiigoHeadersOptions()
    const url = `${SIIGO_BASE_URL}/v1/payment-types?document_type=${documentType}`
    try {
        const response = await axios.get(url, options)
        return {type:documentType, payments:response.data}
    } catch (error) {
        handleServiceError(error)
    }
}

export const getPaymentsByName = async (type, hioposPayment) => {
    // Función para normalizar texto eliminando tildes y otros diacríticos
    const normalizeText = (text) =>
        text?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // Validar si la caché es nula o el tipo no coincide
    if (paymentsCache === null || type !== paymentsCache.type) {
        paymentsCache = await getSiigoPaymentMethods(type);
    }

    // Determinar las propiedades según el tipo
    const paymentProperty = type === 'FC' ? 'MedioPago' : 'MedioDePago';
    const valueProperty = type === 'FC' ? 'Importe' : 'Valor';

    // Normalizar los nombres para hacer la comparación
    const normalizedHioposPayment = normalizeText(hioposPayment[paymentProperty]);

    // Buscar el método de pago en la caché por nombre
    const matchedPayment = paymentsCache.payments.find(
        (siigoPayment) => normalizeText(siigoPayment.name) === normalizedHioposPayment
    );

    // Verificar si se encontró un pago correspondiente
    if (matchedPayment) {
        return {
            id: matchedPayment.id,
            name: matchedPayment.name,
            value: hioposPayment[valueProperty],
        };
    } else {
        return {
            name: hioposPayment[paymentProperty],
            message: `El método de pago "${hioposPayment[paymentProperty]}" no se encuentra registrado en Siigo.`,
        };
    }
};
const getDocumentIdByType = async (documentType) => {
    try {
        const options = await getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/document-types?type=${documentType}`
        const response = await axios.get(url, options)
        return {type:documentType, documents:response.data}
    } catch (error) {
        handleServiceError(error)
    }
}

export const matchDocumentTypeByName = async (type, hioposDocument) => {
    // Normaliza el texto eliminando tildes y otros diacríticos
    const normalizeText = (text) =>
        text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // Validar si la caché es nula o el tipo no coincide
    if (documentCache === null || type !== documentCache.type) {
        documentCache = await getDocumentIdByType(type);
    }

    // Normalizar los nombres para hacer la comparación
    const normalizedHioposDocument = normalizeText(hioposDocument);

    const matchedDocument = documentCache.documents.find(
        (siigoDocument) => normalizeText(siigoDocument.name) === normalizedHioposDocument
    );

    if (matchedDocument) {
        return {
            id: matchedDocument.id,
            name: matchedDocument.name,
            cost_center_default: matchedDocument.cost_center_default,
        };
    } else {
        return {
            name: hioposDocument,
            message: `El documento de compra "${hioposDocument}" no se encuentra registrado en Siigo.`,
        };
    }
};

const getCostCenters = async () => {
    try {
        const options = await getSiigoHeadersOptions();
        const url = `${SIIGO_BASE_URL}/v1/cost-centers`
        const response = await axios.get(url, options)
        return response.data
    }catch (error) {
        handleServiceError(error)
    }
}

export const matchCostCenter = async (hioposCostCenter) => {
    // Función para normalizar texto eliminando tildes y otros diacríticos
    const normalizeText = (text) =>
        text?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // Obtener la caché si no está cargada
    if (costCenterCache === null) {
        costCenterCache = await getCostCenters();
    }

    // Normalizar el centro de costo de Hiopos para la comparación
    const normalizedHioposCostCenter = normalizeText(hioposCostCenter);

    // Buscar el centro de costo en la caché
    const matchedCenter = costCenterCache.find(
        (siigoCenter) => normalizeText(siigoCenter.name) === normalizedHioposCostCenter
    );

    if (matchedCenter) {
        return {
            id: matchedCenter.id,
            name: matchedCenter.name,
        };
    } else {
        return {
            name: hioposCostCenter,
            message: `El centro de costo "${hioposCostCenter}" no se encuentra registrado en Siigo.`,
        };
    }
};

export const setItemDataForInvoice = async (item) => {
    try {
        const taxName = item.DetalleImpuesto ?? item.Impuestos; // Usa el primer valor definido
        const taxes = taxName ? await getTaxesByName(taxName) : []; // Asegura que siempre haya un array

        return {
            type: 'Product',
            code: item.RefArticulo,
            description: item.Articulo,
            quantity: item.Unidades,
            price: item.Base,
            discount: item.Descuento,
            taxes,
        };
    } catch (error) {
        handleServiceError(error);
        return null; // Retorna un valor manejable en caso de error
    }
};