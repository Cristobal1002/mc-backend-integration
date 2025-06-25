import {hioposService, parametrizationService, siigoService} from "./index.js";
import {model} from "../models/index.js";
import {DateTime} from "luxon";
import { Op } from 'sequelize';
import {createSaleInvoice, getTaxesByName, setItemDataForInvoice} from "./siigo.service.js";


/*export const getHioposLote = async (type, filter, isManual = false) => {
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
};*/

export const getHioposLote = async (type, filter, isManual = false, runSync = false, jobId = null) => {
    let lote;
    try {
        // 1️⃣ Crear el lote
        lote = await model.LoteModel.create({
            type,
            filter,
            source: isManual ? 'manual' : 'automatic',
            job_id: jobId
        });

        console.log(`[${isManual ? 'MANUAL' : 'CRON'}] LOTE CREADO:`, lote.id);

        // 2️⃣ Obtener datos desde Hiopos
        const getHioposData = await hioposService.getBridgeDataByType(type, filter);
        const hioposArray = getHioposData?.data || [];

        console.log(`[${type.toUpperCase()}] Datos recibidos de Hiopos:`, hioposArray.length);
        console.log(`[${type.toUpperCase()}] Primeros documentos:`, hioposArray.slice(0, 3).map(i => ({
            doc: i.SerieNumero || i['Serie/Numero'],
            tipo: i.TipoDocumento
        })));

        // 3️⃣ Procesar transacciones (solo registro y deduplicación)
        const result = await processLoteTransactions(type, hioposArray, lote.dataValues);
        console.log(`[${type.toUpperCase()}] Resultado del procesamiento de lote:`, result);

        // 4️⃣ Si es proceso manual con sincronización inmediata
        if (isManual && runSync) {
            console.log('[SYNC MANUAL] Entrando a flujo de validación + sincronización...');

            // 🔄 REFRESCAR transacciones luego del registro
            const updatedTransactions = await model.TransactionModel.findAll({ where: { lote_id: lote.id } });
            console.log('[SYNC MANUAL] Transacciones actualizadas del lote:', updatedTransactions.map(tx => tx.document_number));

            // 🧪 Filtrar las que están listas para validar
            const validatable = updatedTransactions.filter(tx => tx.type === type && tx.status === 'validation');
            console.log('[SYNC MANUAL] Transacciones para validar:', validatable.map(tx => tx.document_number));

            if (type === 'purchases') {
                console.log('[VALIDATOR] Iniciando validación de compras...');
                await purchaseValidator(validatable);

                const toInvoice = await model.TransactionModel.findAll({
                    where: { lote_id: lote.id, type: 'purchases', status: 'to-invoice' }
                });
                console.log('[SYNC] Facturas de compra listas para sincronizar:', toInvoice.map(tx => tx.document_number));

                await purchaseInvoiceSync(toInvoice);
            } else if (type === 'sales') {
                console.log('[VALIDATOR] Iniciando validación de ventas...');
                await salesValidator(validatable);

                const toInvoice = await model.TransactionModel.findAll({
                    where: { lote_id: lote.id, type: 'sales', status: 'to-invoice' }
                });
                console.log('[SYNC] Facturas de venta listas para sincronizar:', toInvoice.map(tx => tx.document_number));

                await saleInvoiceSync(toInvoice);
            }

            console.log('[SYNC] Cerrando lote...');
            await closeLote();
        }

        console.log(`[FIN LOTE] Proceso completo para el lote ${lote.id}`);
        return { result, loteId: lote.id };
    } catch (error) {
        console.error('Error procesando lote:', error);
        if (lote) {
            await model.LoteModel.update(
                { status: 'failed', error: error.data || error.message },
                { where: { id: lote.id } }
            );
        }
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

// Función de utilidad para normalizar texto y limpiar caracteres corruptos
const normalizeText = (text) => {
    return text
        ?.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")               // elimina tildes
        .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "")     // elimina caracteres corruptos como �
        .replace(/\s+/g, " ")                          // normaliza espacios múltiples
        .trim();
};

export const processLoteTransactions = async (type, lote, loteHeader) => {
    try {
        const loteId = loteHeader.id;
        let processedCount = 0;
        let omittedCount = 0;
        let hasErrors = false;

        for (const invoice of lote) {
            try {
                const params = await parametrizationService.getParametrizationData();

                const rawTipo = invoice.TipoDocumento;
                const tipoNormalizado = normalizeText(rawTipo);

                console.log(`[TX LOOP] Documento: ${invoice.SerieNumero || invoice['Serie/Numero']} - Tipo: ${rawTipo} (normalizado: ${tipoNormalizado})`);

                // Detección por fragmentos clave (tolerante a errores de escritura)
                const isCompra = tipoNormalizado.includes('factura') &&
                    tipoNormalizado.includes('compra');

                const isVenta = tipoNormalizado.includes('factura') &&
                    tipoNormalizado.includes('venta') &&
                    tipoNormalizado.includes('electr');

                if (
                    (type === 'purchases' && isCompra) ||
                    (type === 'sales' && isVenta)
                ) {
                    console.log(`[TX LOOP] ✅ Tipo válido. Intentando registrar transacción...`);

                    const coreData = type === 'purchases'
                        ? await siigoService.setSiigoPurchaseInvoiceData([invoice], params)
                        : await siigoService.setSiigoSalesInvoiceData([invoice], params);

                    const transaction = await registerTransaction(type, invoice, coreData[0], loteId);

                    if (transaction) {
                        processedCount++;
                        console.log(`[TX LOOP] ✅ Transacción registrada: ${transaction.document_number}`);
                    } else {
                        omittedCount++;
                        console.log(`[TX LOOP] ⚠️ Transacción omitida (posible duplicado).`);
                    }
                } else {
                    omittedCount++;
                    console.log(`[TX LOOP] ❌ Tipo omitido. No coincide con '${type}'. Tipo normalizado: "${tipoNormalizado}"`);
                }
            } catch (error) {
                console.error('[PROCESS TRANSACTION ERROR]', invoice, error);
                hasErrors = true;
            }
        }

        console.log(`[PROCESS LOTE] ✔️ Procesadas: ${processedCount}, ❌ Omitidas: ${omittedCount}`);

        await model.LoteModel.update(
            { transactions_count: processedCount, omitted_count: omittedCount },
            { where: { id: loteId } }
        );

        if (hasErrors) {
            console.warn('[PROCESS LOTE] ⚠️ Algunas transacciones fallaron durante el registro.');
        }

        return { processed: processedCount, omitted: omittedCount };
    } catch (error) {
        console.error('[PROCESS LOTE TRANSACTIONS] 💥 Error procesando lote:', error);
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

export const syncDataProcess = async ({ purchaseTransactions = null, salesTransactions = null } = {}) => {
    try {
        if (purchaseTransactions !== null) {
            await purchaseValidator(purchaseTransactions);
            await purchaseInvoiceSync(purchaseTransactions);
        }

        if (salesTransactions !== null) {
            await salesValidator(salesTransactions);
            await saleInvoiceSync(salesTransactions);
        }

        await closeLote(); // Se puede dejar o condicionar también

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

/*export const purchaseValidator = async (data = null) => {
    try {
        const validationInfo =
            Array.isArray(data) && data.length > 0
                ? data
                : await getValidationRegisterData('purchases');

        if (!validationInfo.length) {
            console.warn('[PURCHASE VALIDATOR] No hay transacciones para procesar.');
            return;
        }

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
                const { DetalleDocumento, Retenciones } = currentInvoice.hiopos_data;
                const { DetalleMediosdepago } = currentInvoice.hiopos_data;
                const params = await parametrizationService.getParametrizationData();
                const purchaseParam = params.data.find(param => param.type === 'purchases');


                const invoiceData = {
                    date: DateTime.fromFormat(currentInvoice.hiopos_data.Fecha, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                    provider_invoice: currentInvoice.core_data.provider_invoice,
                    observations: currentInvoice.core_data.observations,
                    discount_type: 'Percentage',
                    tax_included: purchaseParam.tax_included
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
                                console.error('Error en creación de artículo:', item.RefArticulo, error);
                                itemsValidationResults.push({
                                    item: item.RefArticulo,
                                    status: 'failed',
                                    details: {
                                        error: error.data?.Errors || error.message
                                    },
                                });
                            }
                        } else {
                            itemsValidationResults.push({
                                item: item.RefArticulo,
                                status: 'success',
                                details: siigoItem.results[0],
                            });
                        }

                        await delay(rateLimitDelay);
                    }

// Evaluar si hubo errores en la validación de artículos
                    const itemsStatus = itemsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';

// Guardar el estado de la validación de artículos
                    await model.TransactionModel.update({
                        items_validator_status: itemsStatus,
                        items_validator_details: itemsValidationResults,
                    }, { where: { id: currentInvoice.id } });

                    // Preparar items solo si no hubo errores
                    let siigoItem = [];
                    let taxValidationStatus = 'success';

                    if (itemsStatus === 'success') {
                        for (const item of DetalleDocumento) {
                            const itemResult = await siigoService.setItemDataForInvoice(item, currentInvoice.type);
                            if (!itemResult) continue;

                            if (itemResult.taxes.some(tax => tax.status === 'not_found')) {
                                taxValidationStatus = 'failed';
                                itemResult.taxes.forEach(tax => {
                                    if (tax.status === 'not_found') {
                                        tax.details = `Impuesto no encontrado: ${tax.name}`;
                                    }
                                });
                            }

                            siigoItem.push(itemResult);
                        }

                        // Actualiza solo los detalles del impuesto si se procesaron los ítems
                        await model.TransactionModel.update({
                            items_validator_status: taxValidationStatus,
                            items_validator_details: siigoItem,
                        }, { where: { id: currentInvoice.id } });
                    } else {
                        // Si fallaron artículos, no se prepara siigoItem
                        console.warn(`[Factura ${currentInvoice.id}] Se omitió el procesamiento de impuestos porque hay artículos fallidos.`);
                    }



                    // Validación de métodos de pago
                    const paymentsValidationResults = [];
                    for (const payment of DetalleMediosdepago) {
                        try {
                            const siigoMethod = await siigoService.getPaymentsByName('FC', payment);

                            // Obtener la configuración desde params
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
                                    due_date: DateTime.fromFormat(payment.FechaVencimiento, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                                    status: 'success',
                                    details: [`Método de pago "${siigoMethod.name}" procesado correctamente.`],
                                });
                            }
                        } catch (error) {
                            paymentsValidationResults.push({
                                id: null,
                                name: payment.MedioPago,
                                value: payment.Importe,
                                due_date: DateTime.fromFormat(payment.FechaVencimiento, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
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

                    //invoiceData.retentions  = await getTaxesByName(Retenciones)

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
};*/

export const purchaseValidator = async (data = null) => {
    try {
        const validationInfo =
            Array.isArray(data) && data.length > 0
                ? data
                : await getValidationRegisterData('sales');

        if (!validationInfo.length) {
            console.warn('[SALES VALIDATOR] No hay transacciones para procesar.');
            return;
        }

        // 🔄 Resetear estado de transacciones antes de validarlas
        const ids = validationInfo.map(tx => tx.id).filter(Boolean);
        await resetTransactionState(ids);

        const batchSize = 25;
        const rateLimitDelay = 900;
        const batches = [];

        for (let i = 0; i < validationInfo.length; i += batchSize) {
            batches.push(validationInfo.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            for (const currentInvoice of batch) {
                const { identification } = currentInvoice.core_data.supplier;
                const { DetalleDocumento, Retenciones } = currentInvoice.hiopos_data;
                const { DetalleMediosdepago } = currentInvoice.hiopos_data;
                const params = await parametrizationService.getParametrizationData();
                const purchaseParam = params.data.find(param => param.type === 'purchases');

                const invoiceData = {
                    date: DateTime.fromFormat(currentInvoice.hiopos_data.Fecha, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                    provider_invoice: currentInvoice.core_data.provider_invoice,
                    observations: currentInvoice.core_data.observations,
                    discount_type: 'Percentage',
                    tax_included: purchaseParam.tax_included
                };

                try {
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

                    // 🧠 Validar centro de costos solo si es mandatorio o si Almacen está presente
                    const isCostCenterRequired = siigoDocument?.cost_center_mandatory ?? false;
                    const rawAlmacen = currentInvoice.hiopos_data.Almacen?.trim();

                    if (isCostCenterRequired || rawAlmacen) {
                        const coce = await siigoService.matchCostCenter(rawAlmacen);

                        if (!coce || !coce.id) {
                            if (isCostCenterRequired) {
                                await model.TransactionModel.update({
                                    cost_center_validator_status: 'failed',
                                    cost_center_validator_details: [{
                                        message: `Centro de costo obligatorio pero no encontrado para "${rawAlmacen}".`
                                    }],
                                }, { where: { id: currentInvoice.id } });
                            } else {
                                await model.TransactionModel.update({
                                    cost_center_validator_status: 'success',
                                    cost_center_validator_details: [{
                                        message: `Centro de costo no obligatorio y no encontrado para "${rawAlmacen}".`
                                    }],
                                }, { where: { id: currentInvoice.id } });
                            }
                        } else {
                            await model.TransactionModel.update({
                                cost_center_validator_status: 'success',
                                cost_center_validator_details: coce,
                            }, { where: { id: currentInvoice.id } });
                            invoiceData.cost_center = coce.id;
                        }
                    } else {
                        await model.TransactionModel.update({
                            cost_center_validator_status: 'success',
                            cost_center_validator_details: [{
                                message: 'Centro de costo no requerido y no especificado.',
                            }],
                        }, { where: { id: currentInvoice.id } });
                    }

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
                            continue;
                        }
                    } else {
                        await model.TransactionModel.update({
                            contact_validator_status: 'success',
                            contact_validator_details: [{ message: 'Proveedor encontrado', vendorId: siigoContact.results[0].id }],
                        }, { where: { id: currentInvoice.id } });
                        invoiceData.supplier = { id: siigoContact.results[0].id, identification: siigoContact.results[0].identification };
                    }

                    const itemsValidationResults = [];

                    for (const item of DetalleDocumento) {
                        const siigoItem = await siigoService.getItemByCode(item.RefArticulo);

                        if (!siigoItem || siigoItem.results.length === 0) {
                            try {
                                const createdItem = await siigoService.createSiigoItem(item);
                                itemsValidationResults.push({ item: item.RefArticulo, status: 'success', details: createdItem });
                            } catch (error) {
                                console.error('Error en creación de artículo:', item.RefArticulo, error);
                                itemsValidationResults.push({
                                    item: item.RefArticulo,
                                    status: 'failed',
                                    details: {
                                        error: error.data?.Errors || error.message
                                    },
                                });
                            }
                        } else {
                            itemsValidationResults.push({
                                item: item.RefArticulo,
                                status: 'success',
                                details: siigoItem.results[0],
                            });
                        }

                        await delay(rateLimitDelay);
                    }

                    const itemsStatus = itemsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';

                    await model.TransactionModel.update({
                        items_validator_status: itemsStatus,
                        items_validator_details: itemsValidationResults,
                    }, { where: { id: currentInvoice.id } });

                    let siigoItem = [];
                    let taxValidationStatus = 'success';

                    if (itemsStatus === 'success') {
                        for (const item of DetalleDocumento) {
                            const itemResult = await siigoService.setItemDataForInvoice(item, currentInvoice.type);
                            if (!itemResult) continue;

                            if (itemResult.taxes.some(tax => tax.status === 'not_found')) {
                                taxValidationStatus = 'failed';
                                itemResult.taxes.forEach(tax => {
                                    if (tax.status === 'not_found') {
                                        tax.details = `Impuesto no encontrado: ${tax.name}`;
                                    }
                                });
                            }

                            siigoItem.push(itemResult);
                        }

                        await model.TransactionModel.update({
                            items_validator_status: taxValidationStatus,
                            items_validator_details: siigoItem,
                        }, { where: { id: currentInvoice.id } });
                    } else {
                        console.warn(`[Factura ${currentInvoice.id}] Se omitió el procesamiento de impuestos porque hay artículos fallidos.`);
                    }

                    const paymentsValidationResults = [];
                    for (const payment of DetalleMediosdepago) {
                        try {
                            const siigoMethod = await siigoService.getPaymentsByName('FC', payment);
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
                                    value: calculatePayment ? currentInvoice.amount : payment.Importe,
                                    due_date: DateTime.fromFormat(payment.FechaVencimiento, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                                    status: 'success',
                                    details: [`Método de pago "${siigoMethod.name}" procesado correctamente.`],
                                });
                            }
                        } catch (error) {
                            paymentsValidationResults.push({
                                id: null,
                                name: payment.MedioPago,
                                value: payment.Importe,
                                due_date: DateTime.fromFormat(payment.FechaVencimiento, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                                status: 'failed',
                                details: [`Error procesando el método de pago "${payment.MedioPago}"`],
                            });
                        }
                        await delay(rateLimitDelay);
                    }

                    const paymentsStatus = paymentsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';
                    await model.TransactionModel.update({
                        payments_validator_status: paymentsStatus,
                        payments_validator_details: paymentsValidationResults,
                    }, { where: { id: currentInvoice.id } });

                    invoiceData.payments = paymentsValidationResults;
                    invoiceData.items = siigoItem;

                    // 🆕 Añadir retenciones globales (reteICA, reteIVA)
                    const retencionesDocumento = currentInvoice.hiopos_data.RetencionesDocumento ?? [];
                    const retencionesFiltradas = retencionesDocumento.filter(ret => {
                        const nombre = ret.NombreRetencion?.toLowerCase() ?? '';
                        return !nombre.includes('fuente');
                    });

                    const retencionesSiigo = retencionesFiltradas.length > 0
                        ? await getTaxesByName(retencionesFiltradas.map(r => ({
                            NombreImpuesto: r.NombreRetencion,
                            PorcentajeImpuesto: r.Porcentaje,
                        })))
                        : [];

                    invoiceData.retentions = retencionesSiigo.map((ret, idx) => ({
                        id: ret.id,
                        name: ret.name,
                        percentage: ret.percentage,
                        value: -Math.abs(retencionesFiltradas[idx].ImporteRetenido ?? 0),
                        status: ret.status,
                    }));

                    console.log('Datos preparados para la factura:', invoiceData);

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
                    await endValidation.save();

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

const purchaseInvoiceSync = async (data  = null) => {
    try {
        console.log('Data en sync purchase invoice:', data)
        const invoices = (data && data.length > 0)
            ? data
            : await getInvoicesToCreation('purchases');
        const rateLimitDelay = 500; // Delay entre peticiones

        for (const invoice of invoices) {
            console.log('Factura para enviar de compras:', invoice.siigo_body)
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

export const salesValidator = async (data = null) => {
    try {
        const validationInfo =
            Array.isArray(data) && data.length > 0
                ? data
                : await getValidationRegisterData('sales');

        if (!validationInfo.length) {
            console.warn('[SALES VALIDATOR] No hay transacciones para procesar.');
            return;
        }

        // 🔄 Resetear estado de transacciones antes de validarlas
        const ids = validationInfo.map(tx => tx.id).filter(Boolean);
        await resetTransactionState(ids);

        const batchSize = 25;
        const rateLimitDelay = 900;
        const batches = [];

        for (let i = 0; i < validationInfo.length; i += batchSize) {
            batches.push(validationInfo.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            for (const currentInvoice of batch) {
                const { identification } = currentInvoice.core_data.customer;
                const { DetalleDocumento } = currentInvoice.hiopos_data;
                const { MedioPago } = currentInvoice.hiopos_data;
                const invoiceDate = DateTime.fromISO(currentInvoice.hiopos_data.Fecha);
                const dueDate = invoiceDate.plus({ days: 30 }).toISODate();

                const invoiceData = {
                    date: currentInvoice.hiopos_data.Fecha,
                    observations: currentInvoice.core_data.observations,
                    discount_type: 'Percentage',
                    number: currentInvoice.hiopos_data.Numero,
                    seller: 936
                };

                try {
                    const siigoDocument = await siigoService.matchDocumentTypeByName('FV', currentInvoice.hiopos_data.Serie);
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

                    let coce;
                    const { cost_center_default } = invoiceData.document;
                    if (cost_center_default) {
                        coce = cost_center_default;
                        await model.TransactionModel.update({
                            cost_center_validator_status: 'default',
                            cost_center_validator_details: { name: 'Cost Center by defaul', id: coce },
                        }, { where: { id: currentInvoice.id } });
                        invoiceData.cost_center = coce;
                        delete invoiceData.document.cost_center_default;
                    } else {
                        coce = await siigoService.matchCostCenter(currentInvoice.hiopos_data.Almacen);
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
                            delete invoiceData.document.cost_center_default;
                        }
                    }

                    const siigoContact = await siigoService.getContactsByIdentification(identification);
                    if (!siigoContact || siigoContact.results.length === 0) {
                        const hioposContact = await hioposService.getContactByDocument('/customers', identification);
                        const createdCustomer = await siigoService.createContact('/customers', hioposContact);

                        if (createdCustomer) {
                            await model.TransactionModel.update({
                                contact_validator_status: 'success',
                                contact_validator_details: [
                                    { message: 'Cliente creado exitosamente', customerId: createdCustomer.id },
                                ],
                            }, { where: { id: currentInvoice.id } });

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
                            await model.TransactionModel.update({
                                contact_validator_status: 'failed',
                                contact_validator_details: [
                                    { error: 'Error al crear el Cliente en Siigo' },
                                ],
                            }, { where: { id: currentInvoice.id } });
                            return;
                        }
                    } else {
                        await model.TransactionModel.update({
                            contact_validator_status: 'success',
                            contact_validator_details: [
                                { message: 'Cliente encontrado', CustomerId: siigoContact.results[0].id },
                            ],
                        }, { where: { id: currentInvoice.id } });

                        invoiceData.customer = {
                            id: siigoContact.results[0].id,
                            identification: siigoContact.results[0].identification,
                            id_type: siigoContact.results[0].id_type.code,
                            person_type: siigoContact.results[0].person_type,
                            name: siigoContact.results[0].name,
                            address: siigoContact.results[0].address,
                            phones: siigoContact.results[0].phones || [{ number: "6012770000" }],
                            contact: siigoContact.results[0].contact,
                        };
                    }

                    const itemsValidationResults = [];
                    for (const item of DetalleDocumento) {
                        const siigoItem = await siigoService.getItemByCode(item.RefArticulo);
                        if (!siigoItem || siigoItem.results.length === 0) {
                            try {
                                const createdItem = await siigoService.createSiigoItem(item);
                                itemsValidationResults.push({ item: item.RefArticulo, status: 'success', details: createdItem });
                            } catch (error) {
                                itemsValidationResults.push({ item: item.RefArticulo, status: 'failed', details: { error: error.data?.Errors || error.message } });
                            }
                        } else {
                            itemsValidationResults.push({ item: item.RefArticulo, status: 'success', details: siigoItem.results[0] });
                        }
                        await delay(rateLimitDelay);
                    }

                    const itemsStatus = itemsValidationResults.some(r => r.status === 'failed') ? 'failed' : 'success';
                    await model.TransactionModel.update({
                        items_validator_status: itemsStatus,
                        items_validator_details: itemsValidationResults,
                    }, { where: { id: currentInvoice.id } });

                    let siigoItem = [];
                    if (itemsStatus === 'success') {
                        for (const item of DetalleDocumento) {
                            const formattedItem = await siigoService.setItemDataForInvoice(item, 'sales');
                            if (formattedItem) siigoItem.push(formattedItem);
                        }
                    }

                    const propina = MedioPago.find(p => p.Tipo && p.Tipo.toLowerCase() === 'propina');
                    if (propina) {
                        siigoItem.push({
                            code: 'PROP01',
                            type: 'Service',
                            description: 'Propina',
                            quantity: 1,
                            taxed_price: propina.Valor
                        });
                    }


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
                                    value: payment.Valor,
                                    due_date: dueDate,
                                    status: 'success',
                                    details: [`Método de pago "${siigoMethod.name}" procesado correctamente.`],
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
                        await delay(rateLimitDelay);
                    }

                    const paymentsStatus = paymentsValidationResults.some(p => p.status === 'failed') ? 'failed' : 'success';
                    await model.TransactionModel.update({
                        payments_validator_status: paymentsStatus,
                        payments_validator_details: paymentsValidationResults,
                    }, { where: { id: currentInvoice.id } });

                    const groupedPayments = Object.values(
                        paymentsValidationResults
                            .filter(p => p.status !== 'failed')
                            .reduce((acc, curr) => {
                                if (!acc[curr.id]) {
                                    acc[curr.id] = {
                                        id: curr.id,
                                        name: curr.name,
                                        value: 0,
                                        due_date: curr.due_date
                                    };
                                }
                                acc[curr.id].value += curr.value;
                                return acc;
                            }, {})
                    );

                    invoiceData.payments = groupedPayments;
                    invoiceData.items = siigoItem;

                    console.log('Datos preparados para la factura:', invoiceData);

                    const endValidation = await model.TransactionModel.findByPk(currentInvoice.id);
                    const validationFields = [
                        'document_validator_status',
                        'cost_center_validator_status',
                        'contact_validator_status',
                        'items_validator_status',
                        'payments_validator_status'
                    ];

                    const allSuccessOrDefault = validationFields.every(field =>
                        endValidation[field] === 'success' || endValidation[field] === 'default'
                    );

                    endValidation.siigo_body = invoiceData;
                    endValidation.status = allSuccessOrDefault ? 'to-invoice' : 'failed';

                    await endValidation.save();
                    await delay(rateLimitDelay);

                } catch (validationError) {
                    console.error(`Error procesando factura de venta ID: ${currentInvoice.id}`, validationError);
                    await model.TransactionModel.update({
                        error: validationError.message,
                        status: 'failed',
                    }, { where: { id: currentInvoice.id } });
                }

                await delay(rateLimitDelay);
            }
        }
    } catch (error) {
        console.error('Error general del validador de ventas:', error);
        throw error;
    }
};


const saleInvoiceSync = async (data = null) => {
    try {
        const invoices = data || await getInvoicesToCreation('sales');
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

//Solo para pruebas

export const getTransactionById = async (id) => {
    try {
        const tran = await model.TransactionModel.findByPk(id)
        return [tran]
    } catch (error) {
        console.error('[GET TRANSACTION] Error obteniendo la transaccion', error);
        throw error;
    }
}

export const resetTransactionState = async (ids = []) => {
    if (!Array.isArray(ids) || ids.length === 0) return;

    await model.TransactionModel.update({
        document_validator_status: 'validation',
        document_validator_details: null,
        cost_center_validator_status: 'validation',
        cost_center_validator_details: null,
        contact_validator_status: 'validation',
        contact_validator_details: null,
        items_validator_status: 'validation',
        items_validator_details: [],
        payments_validator_status: 'validation',
        payments_validator_details: [],
        status: 'validation',
        siigo_body: null,
        error: null,
    }, {
        where: { id: { [Op.in]: ids } }
    });
};