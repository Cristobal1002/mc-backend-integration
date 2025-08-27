import axios from "axios";
import { CustomError, handleServiceError } from "../errors/index.js";
import { DateTime } from "luxon";
import { model } from "../models/index.js";

const SIIGO_BASE_URL = process.env.SIIGO_BASE_URL
const SIIGO_SERVICES_BASE_URL = 'https://services.siigo.com'
const SIIGO_USER = process.env.SIIGO_USER
const SIIGO_TOKEN = process.env.SIIGO_TOKEN
const PARTNER = process.env.SIIGO_PARTNER

// Obtener token desde cache en memoria o generar uno nuevo
let cachedSiigoToken = null;
let tokenExpirationTime = null;
let isFetchingToken = false; // Variable para manejar el bloqueo
let tokenPromise = null; // Promesa compartida durante la obtención del token

// ======= Caché con expiración para múltiples recursos =======

let taxCache = null;
let taxCacheExpiration = null;

let paymentsCache = {}; // por tipo
let paymentsCacheExpiration = {};

let documentCache = {}; // por tipo
let documentCacheExpiration = {};

let costCenterCache = null;
let costCenterCacheExpiration = null;

let inventoryGroupsCache = null;
let inventoryGroupsCacheExpiration = null;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

// ======= Helpers de caché =======

const getTaxesWithCache = async () => {
    const now = Date.now();
    if (!taxCache || !taxCacheExpiration || now > taxCacheExpiration) {
        taxCache = await getTaxes();
        taxCacheExpiration = now + CACHE_TTL_MS;
    }
    return taxCache;
};

const getPaymentMethodsWithCache = async (type) => {
    const now = Date.now();
    if (!paymentsCache[type] || now > (paymentsCacheExpiration[type] || 0)) {
        paymentsCache[type] = await getSiigoPaymentMethods(type);
        paymentsCacheExpiration[type] = now + CACHE_TTL_MS;
    }
    return paymentsCache[type];
};

const getDocumentTypesWithCache = async (type) => {
    //console.log('TIPO en consulta del doc:', type)
    //console.log('documentCache', documentCache)
    const now = Date.now();
    if (!documentCache[type] || now > (documentCacheExpiration[type] || 0)) {
        documentCache[type] = await getDocumentIdByType(type);
        documentCacheExpiration[type] = now + CACHE_TTL_MS;
    }
    return documentCache[type];
};

const getCostCentersWithCache = async () => {
    const now = Date.now();
    if (!costCenterCache || now > costCenterCacheExpiration) {
        costCenterCache = await getCostCenters();
        costCenterCacheExpiration = now + CACHE_TTL_MS;
    }
    return costCenterCache;
};

export const getInventoryGroupsWithCache = async () => {
    const now = Date.now();
    if (!inventoryGroupsCache || now > inventoryGroupsCacheExpiration) {
        //console.log('Cache de grupos de inventario expirada o no inicializada. Consultando a Siigo...');
        inventoryGroupsCache = await getInvetoryGroups();
        inventoryGroupsCacheExpiration = now + CACHE_TTL_MS;
    } else {
        //console.log('Usando cache de grupos de inventario');
    }
    return inventoryGroupsCache;
};

// Obtener token desde cache en memoria o generar uno nuevo
export const getSiigoToken = async () => {
    const now = Date.now();

    // Si ya existe un token válido en caché, devolverlo
    if (cachedSiigoToken && now < tokenExpirationTime) {
        //console.log('Token de Siigo obtenido desde cache');
        return cachedSiigoToken;
    }

    // Si ya hay otra solicitud generando el token, esperar su promesa
    if (isFetchingToken) {
        //console.log('Esperando a que se genere el token...');
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

            //console.log('Token de Siigo guardado en memoria');
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
        ////console.log('Consultando URL:', url);
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
        //console.log('HET ITEM BY CODE', code)
        const options = await getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/products?code=${code}`
        const response = await axios.get(url, options)
        //console.log('Get item by code', response.data )
        return response.data
    } catch (error) {
        console.error(error)
        handleServiceError(error)
    }
}


export const parseProviderInvoice = (input) => {
    // Intentamos dividir por cualquiera de los delimitadores
    const match = input.match(/^(.+)[\-\_\/\|](\d+)$/);

    if (match) {
        const prefix = match[1];
        const number = parseInt(match[2], 10);
        return { prefix, number };
    }

    // Fallback a la lógica alfanumérica compacta (ej. FA12345)
    const fallback = input.match(/^([a-zA-Z0-9]*?)(\d+)$/);

    if (fallback) {
        const prefix = fallback[1] || "FC";
        const number = parseInt(fallback[2], 10);
        return { prefix, number };
    }

    // Si no hay coincidencia, devolvemos todo como prefijo y número por defecto
    return { prefix: input, number: 1 };
};

export const setSiigoPurchaseInvoiceData = async (data, params) => {
    //console.log('[FACTURAS DE COMPRA]', data);

    // Obtener el objeto con type = 'purchases' de params
    const purchaseParam = params.data.find(param => param.type === 'purchases');
    const calculatePayment = purchaseParam ? purchaseParam.calculate_payment : false;
    const taxesInCalculation = purchaseParam ? purchaseParam.tax_included_in_calculation : false;

    return data.map(invoice => {
        let providerInvoice;
        try {
            providerInvoice = parseProviderInvoice(invoice.Su_doc_Prov); // Intenta parsear Su_doc_Prov
        } catch (error) {
            console.error(`Error procesando Su_doc_Prov: ${invoice.Su_doc_Prov}. Usando valores por defecto.`);
        }

        // Calcular amount dependiendo de la parametrización, redondeado a 2 decimales
        let amount
        if (calculatePayment && taxesInCalculation) {
            amount = invoice.Detalle_Documento.reduce((sum, item) => sum + (item.Precio * item.Unidades), 0).toFixed(2);
        } else {
            amount = invoice.Detalle_Documento.reduce((sum, item) => {
                const basePrice = item.Precio * item.Unidades; // Precio antes de impuestos
                const totalTax = item.Detalle_Impuesto.reduce((taxSum, tax) => {
                    return taxSum + (basePrice * (parseFloat(tax.Porcentaje_Impuesto) / 100));
                }, 0);
                return sum + basePrice + totalTax;
            }, 0).toFixed(2);
        }


        /*
        // Cálculo de amount incluyendo impuestos (comentado para uso futuro)
        if (calculatePayment) {
            amount = invoice.Detalle_Documento.reduce((sum, item) => {
                const basePrice = item.Precio * item.Unidades; // Precio antes de impuestos
                const totalTax = item.DetalleImpuesto.reduce((taxSum, tax) => {
                    return taxSum + (basePrice * (parseFloat(tax.PorcentajeImpuesto) / 100));
                }, 0);
                return sum + basePrice + totalTax;
            }, 0).toFixed(2);
        }
        */

        return {
            date: DateTime.now().toISODate(),
            document: {
                id: process.env.SIIGO_PURCHASE_ID
            },
            supplier: {
                identification: invoice.Detalle_Proveedor.Nif
            },
            cost_center: invoice.Almacen,
            provider_invoice: providerInvoice, // Asignar el objeto parseado
            observations: `Factura de origen hiopos # ${invoice.Serie}/${invoice.Numero}`,
            items: invoice.Detalle_Documento.map(item => ({
                code: item.Ref_Articulo,
                description: item.Ref_Articulo,
                quantity: item.Unidades,
                price: item.Precio,
                taxes: item.Detalle_Impuesto.map(tax => ({
                    id: tax.Nombre_Impuesto
                }))
            })),
            payments: invoice.Detalle_Medios_de_pago.map(payment => ({
                id: payment.Medio_Pago,
                value: payment.Importe
            })),
            amount
        };
    });
};

export const setSiigoSalesInvoiceData = async (data, params) => {
    return data.map(invoice => ({
        date: DateTime.now().toISODate(),
        document: {
            id: process.env.SIIGO_SALES_ID
        },
        customer: {
            identification: invoice.Datos_Cliente.Nif
        },
        items: invoice.Detalle_Documento.map(item => ({
            code: item.Ref_Articulo,
            quantity: item.Unidades,
            price: item.Precio,
            discount: item.Descuento
        })),
        payments: invoice.Medio_Pago.map(payment => ({
            id: payment.Medio_De_Pago,
            value: payment.Valor
        })),
        observations: `Integrado automaticamente, documento Hiopos: ${invoice.Serie}/${invoice.Numero}`
    }))
}
export const setItemCreationData = async (item) => {
    try {
        const taxes = await getTaxesByName(item.Detalle_Impuesto || item.Impuestos || []);

        const inventoryGroups = await getInventoryGroupsWithCache();
        const familyName = item.Familia || 'MODIFICADORES'; // fallback
        const itemFamilyLower = familyName.toLowerCase();

        const accountGroup = inventoryGroups.find(group =>
            group.name.toLowerCase() === itemFamilyLower
        );

        const fallbackGroup = inventoryGroups.find(group =>
            group.name.toLowerCase() === 'productos'
        );

        const accountGroupId = accountGroup?.id || fallbackGroup?.id || null;

        const precio = typeof item.Precio === 'number'
            ? item.Precio
            : parseFloat(item.Precio) || 0;

        const unidad = item.UnidadMedida || item.Unidad_medida || 'uds';

        return {
            code: item.Ref_Articulo || 'SIN-CODIGO',
            account_group: accountGroupId,
            name: item.Articulo || 'Artículo sin nombre',
            stock_control: false,
            active: true,
            unit_label: unidad,
            taxes,
            prices: [
                {
                    currency_code: 'COP',
                    price_list: [
                        {
                            position: 1,
                            value: Number(precio.toFixed(2))
                        }
                    ]
                }
            ]
        };
    } catch (error) {
        //console.log('❌ Error armando la data del artículo:', error.message);
        throw error;
    }
};


export const getTaxesByName = async (hioposTaxes) => {
    const taxList = await getTaxesWithCache();

    return hioposTaxes.map(hioposTax => {
        const rawName = [hioposTax.Nombre_Impuesto, hioposTax.Descripcion, hioposTax.Retenciones_Articulo]
            .find(name => typeof name === 'string' && name.trim().length > 0);

        let taxName = rawName?.trim();
        const taxPercentage = hioposTax.Porcentaje_Impuesto ?? hioposTax.Porcentaje_Retencion;
        if (!taxName) return null;
        if (taxName === 'EXENTOS') taxName = 'IVA 0%';
        const normalizedTaxName = taxName.toLowerCase();
        const matchedTax = taxList.find(siigoTax => siigoTax.name.toLowerCase() === normalizedTaxName);

        return {
            name: taxName,
            percentage: parseFloat(taxPercentage),
            value: hioposTax.Valor_Cargo ?? null,
            id: matchedTax ? matchedTax.id : null,
            status: matchedTax ? 'found' : 'not_found',
        };
    }).filter(Boolean);
};
const getTaxes = async () => {
    try {
        const options = await getSiigoHeadersOptions()
        const response = await axios.get(`${SIIGO_BASE_URL}/v1/taxes`, options)
        return response.data
    } catch (error) {
        //console.log('Error en consulta de impuestos:', error)
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
    console.log("jorge data", JSON.stringify(data))
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
        //console.log('Data armada para crear Articulo:', JSON.stringify(data) );

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
        const response = await axios.get(url, options)
        return response.data
    } catch (error) {
        handleServiceError(error)
    }
}

/**
 * Limpia todo lo que no sea dígito.
 * @param {string} value
 * @returns {string} Solo dígitos
 */
const cleanDigits = (value) => (value ?? '').toString().replace(/\D/g, '');

/**
 * Construye el payload de contacto de cliente para Siigo.
 * - Company (NIT): identification = primeros 9 dígitos del NIT (sin DV)
 * - Person: identification = todos los dígitos del documento
 * @param {Array<Object>} contact
 * @returns {Object} payload para Siigo
 */
export const setCustomerContactData = (contact) => {
    if (!Array.isArray(contact) || contact.length === 0) {
        throw new Error('setCustomerContactData: el parámetro "contact" debe ser un arreglo no vacío.');
    }

    const customer = contact[0] ?? {};
    const tipoFiscal = (customer.Tipo_Documento_Fiscal ?? '').toString().trim().toUpperCase();
    const isCompany = tipoFiscal === 'NIT';
    const person_type = isCompany ? 'Company' : 'Person';

    // Limpia y normaliza el documento
    const rawNif = customer.Nif ?? '';
    const onlyDigits = cleanDigits(rawNif);

    // Si es empresa (NIT): solo los primeros 9 dígitos (sin DV)
    const identification = isCompany ? onlyDigits.substring(0, 9) : onlyDigits;

    // Opcional: validar que si es empresa, existan al menos 9 dígitos (puedes cambiar a "throw" si quieres ser estricto)
    if (isCompany && identification.length < 9) {
        console.warn('setCustomerContactData: NIT con menos de 9 dígitos base. Se enviará lo disponible.');
    }

    return {
        type: 'Customer',
        person_type,                     // 'Company' | 'Person'
        id_type: isCompany ? '31' : '13',// 31=NIT, 13=CC (común en Siigo)
        identification,                  // NIT base (9 dígitos) o documento completo
        name: formatSiigoName(person_type, customer.Cliente ?? ''), // Mantén tu helper
        commercial_name: (customer.Cliente ?? '').toString().trim(),
        phone: (customer.Telefono ?? '').toString().trim(),
        email: (customer.Email ?? '').toString().trim(),
        comments: "Cliente creado automáticamente por la interfaz",

        // Si luego deseas activar dirección, descomenta y ajusta:
        // address: {
        //   address: (customer.Direccion ?? '').toString().trim(),
        //   city: {
        //     code: (customer.Codigo_Postal ?? '').toString(),
        //     name: (customer.Poblacion_Ciudad ?? 'Unknown').toString().trim(),
        //   },
        // },
    };
};


/**
 * Construye el payload de contacto de proveedor para Siigo.
 * - Company (NIT): identification = primeros 9 dígitos del NIT (sin DV)
 * - Person: identification = todos los dígitos del documento
 * @param {Array<Object>} contact
 * @returns {Object} payload para Siigo
 */
export const setVendorContactData = (contact) => {
    if (!Array.isArray(contact) || contact.length === 0) {
        throw new Error('setVendorContactData: el parámetro "contact" debe ser un arreglo no vacío.');
    }

    const supplier = contact[0] ?? {};
    const tipoFiscal = (supplier.Tipo_Documento_Fiscal ?? '').toString().trim().toUpperCase();
    const isCompany = tipoFiscal === 'NIT';
    const person_type = isCompany ? 'Company' : 'Person';

    // Documento fiscal del proveedor
    const rawDoc = supplier.Numero_De_Documento_Fiscal ?? supplier.Nif ?? '';
    const digits = cleanDigits(rawDoc);
    const identification = isCompany ? digits.substring(0, 9) : digits;

    if (isCompany && identification.length < 9) {
        console.warn('setVendorContactData: NIT con menos de 9 dígitos base. Se enviará lo disponible.');
    }

    // Normaliza régimen fiscal para determinar si es responsable de IVA
    const regimen = (supplier.Regimenes_fiscales ?? '').toString().trim();
    const vat_responsible = /\bresponsables?\s+de\s+iva\b/i.test(regimen);

    return {
        type: 'Supplier',
        person_type,                         // 'Company' | 'Person'
        id_type: isCompany ? '31' : '13',    // 31=NIT, 13=CC (común en Siigo)
        identification,                      // NIT base (9 dígitos) o documento completo
        name: formatSiigoName(person_type, (supplier.Proveedor ?? '').toString().trim()),
        commercial_name: (supplier.Nombre_Comercial ?? supplier.Proveedor ?? '').toString().trim(),
        vat_responsible,                     // true si "Responsables de IVA"
        phone: (supplier.Telefono ?? '').toString().trim(),
        email: (supplier.Email ?? '').toString().trim(),

        // Si luego deseas activar dirección, descomenta y ajusta:
        // address: {
        //   address: (supplier.Direccion ?? '').toString().trim(),
        //   city: {
        //     code: (supplier.Codigo_Postal ?? '').toString(),
        //     name: (supplier.Poblacion_Ciudad ?? 'Unknown').toString().trim(),
        //   },
        // },

        comments: 'Proveedor creado automáticamente por la interfaz',
    };
};
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
        if (type === '/vendors') {
            const data = setVendorContactData(contact)
            const supplier = await axios.post(url, data, options)
            return supplier.data
        } else if (type === '/customers') {
            const data = setCustomerContactData(contact);
            const customer = await axios.post(url, data, options);
            return customer.data
        }
    } catch (error) {
        //console.log('Error creando el contacto en siigo', error.data)
        handleServiceError(error)
    }
}

const getSiigoPaymentMethods = async (documentType) => {
    const options = await getSiigoHeadersOptions()
    const url = `${SIIGO_BASE_URL}/v1/payment-types?document_type=${documentType}`
    try {
        const response = await axios.get(url, options)
        return { type: documentType, payments: response.data }
    } catch (error) {
        handleServiceError(error)
    }
}

export const getPaymentsByName = async (type, hioposPayment) => {
    const normalizeText = (text) =>
        text?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const paymentData = await getPaymentMethodsWithCache(type);

    const paymentProperty = type === 'FC' ? 'Medio_Pago' : 'Medio_De_Pago';
    const valueProperty = type === 'FC' ? 'Importe' : 'Valor';
    const normalizedHioposPayment = normalizeText(hioposPayment[paymentProperty]);


    const matchedPayment = paymentData.payments.find(
        (siigoPayment) =>
            normalizeText(siigoPayment.name) === normalizedHioposPayment
    );

    //console.log('Matched Payment:', matchedPayment)

    return matchedPayment ? {
        id: matchedPayment.id,
        name: matchedPayment.name,
        value: hioposPayment[valueProperty],
    } : {
        name: hioposPayment[paymentProperty],
        message: `El método de pago "${hioposPayment[paymentProperty]}" no se encuentra registrado en Siigo.`,
    };
};
const getDocumentIdByType = async (documentType) => {
    try {
        const options = await getSiigoHeadersOptions()
        const url = `${SIIGO_BASE_URL}/v1/document-types?type=${documentType}`
        const response = await axios.get(url, options)
        return { type: documentType, documents: response.data }
    } catch (error) {
        handleServiceError(error)
    }
}

export const matchDocumentTypeByName = async (type, hioposDocument) => {
    const normalizeText = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const documentData = await getDocumentTypesWithCache(type);
    const normalizedHioposDocument = normalizeText(hioposDocument);

    const matchedDocument = documentData.documents.find(
        (siigoDocument) => normalizeText(siigoDocument.name) === normalizedHioposDocument
    );

    return matchedDocument ? {
        id: matchedDocument.id,
        name: matchedDocument.name,
        cost_center_mandatory: matchedDocument.cost_center_mandatory,
        cost_center_default: matchedDocument.cost_center_default,
    } : {
        name: hioposDocument,
        message: `El documento de compra "${hioposDocument}" no se encuentra registrado en Siigo.`,
    };
};

const getCostCenters = async () => {
    try {
        const options = await getSiigoHeadersOptions();
        const url = `${SIIGO_BASE_URL}/v1/cost-centers`
        const response = await axios.get(url, options)
        return response.data
    } catch (error) {
        handleServiceError(error)
    }
}

export const matchCostCenter = async (hioposCostCenter) => {
    const normalizeText = (text) => text?.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const costCenters = await getCostCentersWithCache();
    const normalizedHioposCostCenter = normalizeText(hioposCostCenter);

    const matchedCenter = costCenters.find(
        (siigoCenter) => normalizeText(siigoCenter.name) === normalizedHioposCostCenter
    );

    return matchedCenter ? {
        id: matchedCenter.id,
        name: matchedCenter.name,
    } : {
        name: hioposCostCenter,
        message: `El centro de costo "${hioposCostCenter}" no se encuentra registrado en Siigo.`,
    };
};

/*export const setItemDataForInvoice = async (item, type) => {
    try {
        const taxName = item.DetalleImpuesto ?? item.Impuestos;
        const taxes = taxName ? await getTaxesByName(taxName) : [];
        const price = type === 'sales' ? item.Base_unitaria : item.Precio;

        // Si es venta, busca configuración
        let taxed_price = undefined;
        if (type === 'sales') {
            if (price === 0) {
                return null;
            }

            const [salesParam] = await model.ParametrizationModel.findAll({
                where: { type: 'sales' },
                limit: 1
            });

            taxed_price = salesParam?.tax_included ?? false; // o usa tax_included_in_calculation si aplica
        }

        return {
            type: 'Product',
            code: item.Ref_Articulo,
            description: item.Articulo,
            quantity: item.Unidades,
            price,
            taxed_price, // solo se incluye si es 'sales'
            discount: item.Descuento,
            taxes,
        };
    } catch (error) {
        handleServiceError(error);
        return null;
    }
};*/

export const setItemDataForInvoice = async (item, type) => {
    try {
        const taxArray = item.DetalleImpuesto ?? item.Impuestos ?? [];

        const cargosAdaptados = (item.Cargos ?? []).map(cargo => ({
            NombreImpuesto: cargo.NombreCargo,
            PorcentajeImpuesto: cargo.PorcentajeCargo ?? 0,
        }));

        const impuestosCombinados = [...taxArray, ...cargosAdaptados];

        const taxes = impuestosCombinados.length > 0 ? await getTaxesByName(impuestosCombinados) : [];

        const price = item.Precio;

        let taxed_price;
        if (type === 'sales') {
            if (price === 0) return null;

            const [salesParam] = await model.ParametrizationModel.findAll({
                where: { type: 'sales' },
                limit: 1
            });

            taxed_price = salesParam?.tax_included ?? false;
        }

        return {
            type: 'Product',
            code: item.Ref_Articulo,
            description: item.Articulo,
            quantity: item.Unidades,
            discount: item.Descuento,
            taxes,
            ...(type === 'sales' ? { taxed_price } : { price }),
        };
    } catch (error) {
        handleServiceError(error);
        return null;
    }
};
