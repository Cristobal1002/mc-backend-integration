import {hioposService, parametrizationService, siigoService} from "./index.js";
import {model} from "../models/index.js";
import {DateTime} from "luxon";
import {createSaleInvoice, setItemDataForInvoice} from "./siigo.service.js";

/*export const getHioposLote = async (type, filter) => {
    let lote
    try {
        //Crear el lote en la bd
        lote = await model.LoteModel.create({type, filter })
        console.log('ENCABEZADO LOTE', lote)
        // Llamar al servicio para sincronizar compras o ventas
        const getHioposData = await hioposService.getBridgeDataByType(type, filter);

        // Guardar todas las transacciones y luego sincronizar con Siigo
        await processLoteTransactions(type, getHioposData.data, lote.dataValues);

    } catch (error) {
        console.error(`Error processing Hiopos lote:`, error);
        await model.LoteModel.update({status: 'failed', error: error.data}, {where:{id: lote.id}})
        throw error; // Permite que el job sea reintentado
    }
}; */

export const getHioposLote = async (type, filter, isManual = false) => {
    let lote;
    try {
        // Crear el lote en la BD
        console.log('ISMANUAL', isManual)
        lote = await model.LoteModel.create({ type, filter, source: isManual ? 'manual' : 'automatic' });
        console.log(`[${isManual ? 'MANUAL' : 'CRON'}] LOTE CREADO:`, lote);

        // Obtener datos de Hiopos
        const getHioposData = await hioposService.getBridgeDataByType(type, filter);

        // Procesar transacciones
        const result = await processLoteTransactions(type, getHioposData.data, lote.dataValues);

        console.log(`[${isManual ? 'MANUAL' : 'CRON'}] LOTE PROCESADO:`, result);
        return {result}
    } catch (error) {
        console.error(`Error procesando lote:`, error);
        await model.LoteModel.update({ status: 'failed', error: error.data }, { where: { id: lote.id } });
        throw error;
    }
};

// Cambios para evitar duplicados
/* export const processLoteTransactions = async (type, lote, loteHeader) => {
    try {
        const loteId = loteHeader.id
        const savedTransactions = [];
        for (const invoice of lote) {
            try {
                if (
                    (type === 'purchases' && invoice.TipoDocumento === "Factura compra") ||
                    (type === 'sales' && invoice.TipoDocumento === "Factura venta electrónica")
                ) {
                    const coreData = type === 'purchases'
                        ? await siigoService.setSiigoPurchaseInvoiceData([invoice])
                        : await siigoService.setSiigoSalesInvoiceData([invoice]);

                    // Registra la transacción y almacénala
                    const transaction = await registerTransaction(type, invoice, coreData[0], loteId);
                    savedTransactions.push(transaction);
                }
            } catch (error) {
                console.error('[PROCESS TRANSACTION ERROR]', invoice, error);
                // Decide cómo manejar el error: continuar o abortar
                savedTransactions.push(null);
            }
        }

        console.log(`[PROCESS LOTE] Todas las transacciones guardadas: ${savedTransactions.filter(tx => tx).length}`);
        await model.LoteModel.update({transactions_count: savedTransactions.filter(tx => tx).length}, {where:{
            id: loteId
            }})
        // Sincronizar sólo si todas las transacciones se procesaron correctamente
        if (!savedTransactions.includes(null)) {
            console.log('[SINCRONIZANDO] Inicia proceso de sincronización con Siigo');
            await syncDataProcess();
        } else {
            console.warn('[PROCESS LOTE] Algunas transacciones fallaron. Revisa antes de sincronizar.');
        }
    } catch (error) {
        console.error('[PROCESS LOTE TRANSACTIONS] Error procesando lote:', error);
        throw error;
    }
}; */

export const processLoteTransactions = async (type, lote, loteHeader) => {
    try {
        const loteId = loteHeader.id;
        let processedCount = 0;
        let omittedCount = 0;
        let hasErrors = false; // Flag para saber si hubo errores

        for (const invoice of lote) {
            try {
                const params = await parametrizationService.getParametrizationData()
                if (
                    (type === 'purchases' && invoice.TipoDocumento === "Factura compra") ||
                    (type === 'sales' && invoice.TipoDocumento === "Factura venta electrónica")
                ) {
                    const coreData = type === 'purchases'
                        ? await siigoService.setSiigoPurchaseInvoiceData([invoice], params)
                        : await siigoService.setSiigoSalesInvoiceData([invoice], params);

                    const transaction = await registerTransaction(type, invoice, coreData[0], loteId);

                    if (transaction) {
                        processedCount++;
                    } else {
                        omittedCount++;
                    }
                }
            } catch (error) {
                console.error('[PROCESS TRANSACTION ERROR]', invoice, error);
                hasErrors = true; // Si hay un error, marcamos la bandera
            }
        }

        console.log(`[PROCESS LOTE] Procesadas: ${processedCount}, Omitidas: ${omittedCount}`);

        // Actualizar la cantidad de transacciones en el lote
        await model.LoteModel.update(
            { transactions_count: processedCount, omitted_count: omittedCount },
            { where: { id: loteId } }
        );

        // Si todas las transacciones se procesaron sin errores, iniciar la sincronización con Siigo
        if (!hasErrors) {
            console.log('[SINCRONIZANDO] Inicia proceso de sincronización con Siigo');
            await syncDataProcess();
        } else {
            console.warn('[PROCESS LOTE] Algunas transacciones fallaron. Revisa antes de sincronizar.');
        }

        return { processed: processedCount, omitted: omittedCount };
    } catch (error) {
        console.error('[PROCESS LOTE TRANSACTIONS] Error procesando lote:', error);
        throw error;
    }
};
/* export const registerTransaction = async (type, hioposData, coreData, loteId) => {
    try {
        const documentNumber = hioposData.SerieNumero || hioposData['Serie/Numero'];
        const transaction = await model.TransactionModel.create({
            lote_id: loteId,
            type, // Tipo de transacción (purchases o sales)
            document_number: documentNumber, // Número del documento en Hiopos
            hiopos_data: hioposData, // Datos originales de Hiopos
            core_data: coreData, // Datos mapeados para Siigo
            siigo_response: null, // Vacío inicialmente
            status: 'validation' // Estado inicial
        });
        return transaction;
    } catch (error) {
        console.error('[REGISTER TRANSACTION] Error al registrar transacción:', error);
        throw error;
    }
}; */

export const registerTransaction = async (type, hioposData, coreData, loteId) => {
    try {
        const documentNumber = hioposData.SerieNumero || hioposData['Serie/Numero'];

        // Verificar si ya existe una transacción con este número de documento
        const existingTransaction = await model.TransactionModel.findOne({
            where: { document_number: documentNumber }
        });

        if (existingTransaction) {
            console.warn(`[REGISTER TRANSACTION] Documento duplicado omitido: ${documentNumber}`);
            return null; // Retorna null si es duplicado
        }

        // Crear nueva transacción
        const transaction = await model.TransactionModel.create({
            lote_id: loteId,
            type,
            document_number: documentNumber,
            hiopos_data: hioposData,
            core_data: coreData,
            siigo_response: null,
            status: 'validation',
            amount: coreData.amount

        });

        return transaction;
    } catch (error) {
        console.error('[REGISTER TRANSACTION] Error al registrar transacción:', error);
        throw error;
    }
};

export const syncDataProcess= async () => {
    try {
        await purchaseValidator();
        await purchaseInvoiceSync();
        await salesValidator();
        await saleInvoiceSync();
        await closeLote();
    } catch (error) {
        console.error('Error al sincronizar con Siigo:', error);
        throw error;
    }
};

export const getValidationRegisterData = async (type) => {
    try {
      return await model.TransactionModel.findAll({where: {
          status: 'validation',
              type
          }, raw: true})
    } catch (error) {
        console.error('Error al traer los datos de la BD', error);
        throw error;
    }
}

export const getInvoicesToCreation = async (type) => {
    try {
        return await model.TransactionModel.findAll({where: {
                status: 'to-invoice',
                type
            }, raw: true})
    } catch (error) {
        console.error('Error al traer los datos de la BD', error);
        throw error;
    }
}

export const purchaseValidator = async () => {
    try {
        const validationInfo = await getValidationRegisterData('purchases');
        const batchSize = 30; // Tamaño del paquete (lote)
        const rateLimitDelay = 100; // Delay entre peticiones (2 segundos)
        const batches = [];

        // Dividir las facturas en paquetes de tamaño fijo
        for (let i = 0; i < validationInfo.length; i += batchSize) {
            batches.push(validationInfo.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            for (const currentInvoice of batch) {
                const { identification } = currentInvoice.core_data.supplier;
                const { DetalleDocumento } = currentInvoice.hiopos_data;
                const { DetalleMediosdepago } = currentInvoice.hiopos_data;

                const invoiceData = {
                    date: DateTime.fromFormat(currentInvoice.hiopos_data.Fecha, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                    provider_invoice: currentInvoice.core_data.provider_invoice,
                    observations: currentInvoice.core_data.observations,
                    discount_type: 'Percentage',
                    tax_included: true
                };

                try {
                    // Validación de documentos
                    const siigoDocument = await siigoService.matchDocumentTypeByName('FC', currentInvoice.hiopos_data.Serie);
                    if (!siigoDocument || !siigoDocument.id) {
                        await model.TransactionModel.update({
                            document_validator_status: 'failed',
                            document_validator_details: siigoDocument,
                        }, { where: { id: currentInvoice.id } });
                    } else {
                        await model.TransactionModel.update({
                            document_validator_status: 'success',
                            document_validator_details: siigoDocument,
                        }, { where: { id: currentInvoice.id } });
                        invoiceData.document = siigoDocument;
                    }

                    // Validación de centro de costo
                    const coce = await siigoService.matchCostCenter(currentInvoice.hiopos_data.Almacen);
                    if (!coce || !coce.id) {
                        await model.TransactionModel.update({
                            cost_center_validator_status: 'failed',
                            cost_center_validator_details: coce,
                        }, { where: { id: currentInvoice.id } });
                    } else {
                        await model.TransactionModel.update({
                            cost_center_validator_status: 'success',
                            cost_center_validator_details: coce,
                        }, { where: { id: currentInvoice.id } });
                        invoiceData.cost_center = coce.id;
                    }

                    // Validación de proveedores
                    const siigoContact = await siigoService.getContactsByIdentification(identification);
                    if (!siigoContact || siigoContact.results.length === 0) {
                        const hioposContact = await hioposService.getContactByDocument('/vendors', identification);
                        const createdVendor = await siigoService.createContact('/vendors', hioposContact.Proveedores);

                        if (createdVendor) {
                            await model.TransactionModel.update({
                                contact_validator_status: 'success',
                                contact_validator_details: [{ message: 'Proveedor creado exitosamente', vendorId: createdVendor.id }],
                            }, { where: { id: currentInvoice.id } });
                            invoiceData.supplier = { id: createdVendor.id, identification: createdVendor.identification };
                        } else {
                            await model.TransactionModel.update({
                                contact_validator_status: 'failed',
                                contact_validator_details: [{ error: 'Error al crear el proveedor en Siigo' }],
                            }, { where: { id: currentInvoice.id } });
                            continue; // Pasar a la siguiente factura
                        }
                    } else {
                        await model.TransactionModel.update({
                            contact_validator_status: 'success',
                            contact_validator_details: [{ message: 'Proveedor encontrado', vendorId: siigoContact.results[0].id }],
                        }, { where: { id: currentInvoice.id } });
                        invoiceData.supplier = { id: siigoContact.results[0].id, identification: siigoContact.results[0].identification };
                    }

                    // Validación de artículos
                    const itemsValidationResults = [];

                    for (const item of DetalleDocumento) {
                        const siigoItem = await siigoService.getItemByCode(item.RefArticulo);

                        if (!siigoItem || siigoItem.results.length === 0) {
                            try {
                                const createdItem = await siigoService.createSiigoItem(item);
                                itemsValidationResults.push({ item: item.RefArticulo, status: 'success', details: createdItem });
                            } catch (error) {
                                itemsValidationResults.push({
                                    item: item.RefArticulo,
                                    status: 'failed',
                                    details: { error: error.data?.Errors || error.message },
                                });
                            }
                        } else {
                            itemsValidationResults.push({
                                item: item.RefArticulo,
                                status: 'success',
                                details: siigoItem.results[0],
                            });
                        }

                        // Esperar entre solicitudes para no superar el límite de peticiones
                        await delay(rateLimitDelay);
                    }

// Evaluar si hubo errores en la validación de artículos
                    const itemsStatus = itemsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';

// Guardar el estado de la validación de artículos en la base de datos
                    await model.TransactionModel.update({
                        items_validator_status: itemsStatus,
                        items_validator_details: itemsValidationResults,
                    }, { where: { id: currentInvoice.id } });

// **El proceso continúa, sin importar si hubo errores en artículos**

// Si los artículos son correctos, preparar los datos para la factura en Siigo
                    let siigoItem = [];
                    let taxValidationStatus = 'success';  // Inicializamos la validación como 'success'

                    if (itemsStatus === 'success') {
                        for (const item of DetalleDocumento) {
                            // Usamos el setSiigoInvoiceItem que ya tienes
                            const itemResult = await siigoService.setItemDataForInvoice(item, currentInvoice.type);

                            // Comprobamos si el impuesto no se encontró
                            if (itemResult.taxes.some(tax => tax.status === 'not_found')) {
                                taxValidationStatus = 'failed';  // Marcamos como fallido si no se encuentra algún impuesto
                                // Agregamos detalles del error de impuestos no encontrados
                                itemResult.taxes.forEach(tax => {
                                    if (tax.status === 'not_found') {
                                        tax.details = `Impuesto no encontrado: ${tax.name}`;
                                    }
                                });
                            }

                            // Guardamos el artículo procesado
                            siigoItem.push(itemResult);
                        }
                    }

// Aquí guardamos el JSON real en el campo, no un string
                    await model.TransactionModel.update({
                        items_validator_status: taxValidationStatus,  // 'failed' o 'success'
                        items_validator_details: siigoItem,  // Guardamos el objeto JSON directamente
                    }, { where: { id: currentInvoice.id } });


                    // Validación de métodos de pago
                    const paymentsValidationResults = [];
                    for (const payment of DetalleMediosdepago) {
                        try {
                            const siigoMethod = await siigoService.getPaymentsByName('FC', payment);

                            // Obtener la configuración desde params
                            const params = await parametrizationService.getParametrizationData();
                            const purchaseParam = params.data.find(param => param.type === 'purchases');
                            const calculatePayment = purchaseParam ? purchaseParam.calculate_payment : false;

                            if (!siigoMethod || !siigoMethod.id) {
                                paymentsValidationResults.push({
                                    id: null,
                                    name: payment.MedioPago,
                                    value: payment.Importe,
                                    status: 'failed',
                                    details: [`El método de pago "${payment.MedioPago}" no existe en Siigo`],
                                });
                            } else {
                                paymentsValidationResults.push({
                                    id: siigoMethod.id,
                                    name: siigoMethod.name,
                                    value: calculatePayment ? currentInvoice.amount : payment.Importe, // Usa currentInvoice.amount si calculatePayment es true
                                    status: 'success',
                                    details: [`Método de pago "${siigoMethod.name}" procesado correctamente.`],
                                });
                            }
                        } catch (error) {
                            paymentsValidationResults.push({
                                id: null,
                                name: payment.MedioPago,
                                value: payment.Importe,
                                status: 'failed',
                                details: [`Error procesando el método de pago "${payment.MedioPago}"`],
                            });
                        }
                        // Esperar entre peticiones de métodos de pago
                        await delay(rateLimitDelay);
                    }

                    const paymentsStatus = paymentsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';
                    await model.TransactionModel.update({
                        payments_validator_status: paymentsStatus,
                        payments_validator_details: paymentsValidationResults,
                    }, { where: { id: currentInvoice.id } });
                    invoiceData.payments = paymentsValidationResults;
                    invoiceData.items = siigoItem;

                    console.log('Datos preparados para la factura:', invoiceData);

                    // Actualiza el estado final
                    const endValidation = await model.TransactionModel.findByPk(currentInvoice.id);
                    const validationFields = [
                        'document_validator_status',
                        'cost_center_validator_status',
                        'contact_validator_status',
                        'items_validator_status',
                        'payments_validator_status'
                    ];

                    const allSuccess = validationFields.every(field => endValidation[field] === 'success');
                    endValidation.siigo_body = invoiceData;
                    endValidation.status = allSuccess ? 'to-invoice' : 'failed';

                    // Guarda los cambios
                    await endValidation.save();



                    // Esperar antes de procesar la siguiente factura
                    await delay(rateLimitDelay);

                } catch (validationError) {
                    console.error(`Error procesando factura de compra ID: ${currentInvoice.id}`, validationError);
                    await model.TransactionModel.update({
                        error: validationError.message,
                        status: 'failed',
                    }, { where: { id: currentInvoice.id } });
                }
            }
        }
    } catch (error) {
        console.error('Error general del validador:', error);
        throw error;
    }
};

const purchaseInvoiceSync = async () => {
    try {
        const invoices = await getInvoicesToCreation('purchases');
        const rateLimitDelay = 500; // Delay entre peticiones

        for (const invoice of invoices) {
            try {
                const creation = await siigoService.createPurchaseInvoice(invoice.siigo_body);
                if (creation) {
                    await model.TransactionModel.update({ status: 'success', siigo_response: creation }, { where: { id: invoice.id } });
                }
                // Esperar antes de procesar la siguiente factura
                await delay(rateLimitDelay);
            } catch (errorInvoice) {
                console.error('Error al crear la factura', errorInvoice);
                await model.TransactionModel.update({ status: 'failed', error: errorInvoice.data }, { where: { id: invoice.id } });
            }
        }
    } catch (error) {
        console.error('Error al sincronizar facturas de compra:', error);
    }
};
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const salesValidator = async () => {
    try {
        const validationInfo = await getValidationRegisterData('sales');
        const batchSize = 30; // Tamaño del paquete (lote)
        const rateLimitDelay = 300; // Delay en milisegundos entre peticiones
        const batches = [];

        // Dividir las facturas en paquetes de tamaño fijo
        for (let i = 0; i < validationInfo.length; i += batchSize) {
            batches.push(validationInfo.slice(i, i + batchSize));
        }

        // Procesar cada paquete secuencialmente
        for (const batch of batches) {
            for (const currentInvoice of batch) {
                const { identification } = currentInvoice.core_data.customer;
                const { DetalleDocumento } = currentInvoice.hiopos_data;
                const { MedioPago } = currentInvoice.hiopos_data

                const invoiceData = {
                    //todo: ver si el seller se deja aqui o en parametrizacion
                    date: currentInvoice.hiopos_data.Fecha,
                    observations: currentInvoice.core_data.observations,
                    discount_type: 'Percentage',
                    number: currentInvoice.hiopos_data.Numero,
                    seller: 936
                };

                try {
                    // Validación de documentos
                    const siigoDocument = await siigoService.matchDocumentTypeByName(
                        'FV',
                        currentInvoice.hiopos_data.Serie
                    );
                    if (!siigoDocument || !siigoDocument.id) {
                        await model.TransactionModel.update(
                            {
                                document_validator_status: 'failed',
                                document_validator_details: siigoDocument,
                            },
                            { where: { id: currentInvoice.id } }
                        );
                    } else {
                        await model.TransactionModel.update(
                            {
                                document_validator_status: 'success',
                                document_validator_details: siigoDocument,
                            },
                            { where: { id: currentInvoice.id } }
                        );
                        invoiceData.document = siigoDocument;
                    }

                    // Validación de centro de costo
                    let coce
                    const {cost_center_default } = invoiceData.document
                    //Se valida si viene por defecto
                    if(cost_center_default){
                        coce = cost_center_default
                        await model.TransactionModel.update({
                            cost_center_validator_status: 'default',
                            cost_center_validator_details: {name: 'Cost Center by defaul', id: coce},
                        }, { where: { id: currentInvoice.id } });
                        invoiceData.cost_center = coce;
                        delete invoiceData.document.cost_center_default

                    }else{
                      coce =   await siigoService.matchCostCenter(currentInvoice.hiopos_data.Almacen);
                        if (!coce || !coce.id) {
                            await model.TransactionModel.update({
                                cost_center_validator_status: 'failed',
                                cost_center_validator_details: coce,
                            }, { where: { id: currentInvoice.id } });
                        } else {
                            await model.TransactionModel.update({
                                cost_center_validator_status: 'success',
                                cost_center_validator_details: coce,
                            }, { where: { id: currentInvoice.id } });
                            invoiceData.cost_center = coce.id;
                            delete invoiceData.document.cost_center_default
                        }
                    }

                    // Validación de clientes
                    const siigoContact = await siigoService.getContactsByIdentification(identification);
                    if (!siigoContact || siigoContact.results.length === 0) {
                        const hioposContact = await hioposService.getContactByDocument('/customers', identification);
                        const createdCustomer = await siigoService.createContact('/customers', hioposContact);

                        if (createdCustomer) {
                            await model.TransactionModel.update(
                                {
                                    contact_validator_status: 'success',
                                    contact_validator_details: [
                                        { message: 'Cliente creado exitosamente', customerId: createdCustomer.id },
                                    ],
                                },
                                { where: { id: currentInvoice.id } }
                            );
                            invoiceData.customer = {
                                id: createdCustomer.id,
                                identification: createdCustomer.identification,
                                id_type: createdCustomer.id_type.code,
                                person_type: createdCustomer.person_type,
                                name: createdCustomer.name,
                                address: createdCustomer.address,
                                phones: createdCustomer.phones,
                                contact: createdCustomer.contact,

                            };
                        } else {
                            await model.TransactionModel.update(
                                {
                                    contact_validator_status: 'failed',
                                    contact_validator_details: [
                                        { error: 'Error al crear el Cliente en Siigo' },
                                    ],
                                },
                                { where: { id: currentInvoice.id } }
                            );
                            return; // Salir del proceso para esta factura y continuar con la siguiente
                        }
                    } else {
                        await model.TransactionModel.update(
                            {
                                contact_validator_status: 'success',
                                contact_validator_details: [
                                    { message: 'Cliente encontrado', CustomerId: siigoContact.results[0].id },
                                ],
                            },
                            { where: { id: currentInvoice.id } }
                        );
                        invoiceData.customer = {
                            id: siigoContact.results[0].id,
                            identification: siigoContact.results[0].identification,
                            id_type: siigoContact.results[0].id_type.code,
                            person_type: siigoContact.results[0].person_type,
                            name:  siigoContact.results[0].name,
                            address:  siigoContact.results[0].address,
                            phones:  siigoContact.results[0].phones || [{number: "6012770000"}],
                            contact: siigoContact.results[0].contact,
                        };
                    }

                    // Validación de artículos
                    const itemsValidationResults = [];
                    for (const item of DetalleDocumento) {
                        const siigoItem = await siigoService.getItemByCode(item.RefArticulo);
                        if (!siigoItem || siigoItem.results.length === 0) {
                            try {
                                const createdItem = await siigoService.createSiigoItem(item);
                                itemsValidationResults.push({
                                    item: item.RefArticulo,
                                    status: 'success',
                                    details: createdItem,
                                });
                            } catch (error) {
                                itemsValidationResults.push({
                                    item: item.RefArticulo,
                                    status: 'failed',
                                    details: { error: error.data?.Errors || error.message },
                                });
                            }
                        } else {
                            itemsValidationResults.push({
                                item: item.RefArticulo,
                                status: 'success',
                                details: siigoItem.results[0],
                            });
                        }

                        // Esperar para no superar el límite de solicitudes
                        await delay(rateLimitDelay);
                    }

                    const itemsStatus = itemsValidationResults.some((result) => result.status === 'failed') ? 'failed' : 'success';
                    await model.TransactionModel.update(
                        {
                            items_validator_status: itemsStatus,
                            items_validator_details: itemsValidationResults,
                        },
                        { where: { id: currentInvoice.id } }
                    );
                    // Actualizar si los artículos son correctos
                    let siigoItem = [];
                    if (itemsStatus === 'success') {
                        for (const item of DetalleDocumento) {
                            siigoItem.push(await siigoService.setItemDataForInvoice(item));
                        }
                    }

                    // Validación de métodos de pago
                    const paymentsValidationResults = [];
                    for (const payment of MedioPago) {
                        try {
                            const siigoMethod = await siigoService.getPaymentsByName('FV', payment);
                            if (!siigoMethod || !siigoMethod.id) {
                                paymentsValidationResults.push({
                                    id: null,
                                    name: payment.MedioDePago,
                                    value: payment.Valor,
                                    status: 'failed',
                                    details: [`El método de pago "${payment.MedioDePago}" no existe en Siigo`],
                                });
                            } else {
                                paymentsValidationResults.push({
                                    id: siigoMethod.id,
                                    name: siigoMethod.name,
                                    value: siigoMethod.value,
                                    //status: 'success',
                                    //details: [`Método de pago "${siigoMethod.name}" procesado correctamente.`],
                                });
                            }
                        } catch (error) {
                            paymentsValidationResults.push({
                                id: null,
                                name: payment.MedioDePago,
                                value: payment.Valor,
                                status: 'failed',
                                details: [`Error procesando el método de pago "${payment.MedioDePago}"`],
                            });
                        }

                        const paymentsStatus = paymentsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';
                        await model.TransactionModel.update({
                            payments_validator_status: paymentsStatus,
                            payments_validator_details: paymentsValidationResults,
                        }, { where: { id: currentInvoice.id } });
                        invoiceData.payments = paymentsValidationResults;
                        invoiceData.items = siigoItem;

                        console.log('Datos preparados para la factura:', invoiceData);

                        // Actualiza el estado final
                        const endValidation = await model.TransactionModel.findByPk(currentInvoice.id);
                        const validationFields = [
                            'document_validator_status',
                            'cost_center_validator_status',
                            'contact_validator_status',
                            'items_validator_status',
                            'payments_validator_status'
                        ];

// Verifica que todos los campos sean 'success' o 'default'
                        const allSuccessOrDefault = validationFields.every(field =>
                            endValidation[field] === 'success' || endValidation[field] === 'default'
                        );

                        endValidation.siigo_body = invoiceData;
                        endValidation.status = allSuccessOrDefault ? 'to-invoice' : 'failed';

// Guarda los cambios
                        await endValidation.save();
                        // Esperar entre peticiones de métodos de pago
                        await delay(rateLimitDelay);
                    }

                } catch (validationError) {
                    console.error(`Error procesando factura de venta ID: ${currentInvoice.id}`, validationError);
                    await model.TransactionModel.update(
                        {
                            error: validationError.message,
                            status: 'failed',
                        },
                        { where: { id: currentInvoice.id } }
                    );
                }

                // Delay entre cada factura para no sobrecargar el sistema
                await delay(rateLimitDelay);
            }
        }
    } catch (error) {
        console.error('Error general del validador de ventas:', error);
        throw error;
    }
};

const saleInvoiceSync = async () => {
    try {
        const invoices = await getInvoicesToCreation('sales');
        const rateLimitDelay = 500; // Delay entre peticiones

        for (const invoice of invoices) {
            try {
                const creation = await siigoService.createSaleInvoice(invoice.siigo_body);
                if (creation) {
                    await model.TransactionModel.update({ status: 'success', siigo_response: creation }, { where: { id: invoice.id } });
                }
                // Esperar antes de procesar la siguiente factura
                await delay(rateLimitDelay);
            } catch (errorInvoice) {
                console.error('Error al crear la factura', errorInvoice);
                await model.TransactionModel.update({ status: 'failed', error: errorInvoice.data }, { where: { id: invoice.id } });
            }
        }
    } catch (error) {
        console.error('Error al sincronizar facturas de venta:', error);
    }
};

const closeLote = async () => {
    try {
        // 1️⃣ Obtener todos los lotes abiertos (status: 'processing')
        const openLotes = await model.LoteModel.findAll({
            where: { status: 'processing' },
            raw: true
        });

        console.log('OPEN LOTES', openLotes);

        // 2️⃣ Iterar sobre cada lote para revisar las transacciones asociadas
        for (const lote of openLotes) {
            const transactions = await model.TransactionModel.findAll({
                where: { lote_id: lote.id },
                raw: true
            });

            // 3️⃣ Determinar el nuevo estado del lote
            const hasFailed = transactions.some(tx => tx.status === 'failed');
            const allSuccess = transactions.every(tx => tx.status === 'success');

            let newStatus = 'success'; // Por defecto, asumimos que todo está bien

            if (hasFailed) {
                newStatus = 'processed-with-errors';
            } else if (!allSuccess) {
                continue; // Si hay transacciones en otros estados, no cerramos el lote
            }

            // 4️⃣ Actualizar el lote con el nuevo estado
            await model.LoteModel.update(
                { status: newStatus },
                { where: { id: lote.id } }
            );

            console.log(`Lote ${lote.id} actualizado a: ${newStatus}`);
        }
    } catch (error) {
        console.error("Error en closeLote:", error);
    }
};