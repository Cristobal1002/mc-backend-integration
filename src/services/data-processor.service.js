import { hioposService, parametrizationService, siigoService } from "./index.js";
import { model } from "../models/index.js";
import { DateTime } from "luxon";
import { Op } from 'sequelize';
import { createSaleInvoice, getTaxesByName, setItemDataForInvoice } from "./siigo.service.js";

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

        //console.log(`[${isManual ? 'MANUAL' : 'CRON'}] LOTE CREADO:`, lote.id);

        // 2️⃣ Obtener datos desde Hiopos
        const getHioposData = await hioposService.getBridgeDataByType(type, filter);
        const hioposArray = getHioposData?.data || [];

        //console.log(`[${type.toUpperCase()}] Datos recibidos de Hiopos:`, hioposArray.length);
        //console.log(`[${type.toUpperCase()}] Primeros documentos:`, hioposArray.slice(0, 3).map(i => ({doc: i.Serie_Numero || i['Serie/Numero'],tipo: i.TipoDocumento})));

        // 3️⃣ Procesar transacciones (solo registro y deduplicación)
        const result = await processLoteTransactions(type, hioposArray, lote.dataValues);
        //console.log(`[${type.toUpperCase()}] Resultado del procesamiento de lote:`, result);

        // 4️⃣ Si es proceso manual con sincronización inmediata
        if (isManual && runSync) {
            //console.log('[SYNC MANUAL] Entrando a flujo de validación + sincronización...');

            // 🔄 REFRESCAR transacciones luego del registro
            const updatedTransactions = await model.TransactionModel.findAll({ where: { lote_id: lote.id } });
            //console.log('[SYNC MANUAL] Transacciones actualizadas del lote:', updatedTransactions.map(tx => tx.document_number));

            // 🧪 Filtrar las que están listas para validar
            const validatable = updatedTransactions.filter(tx => tx.type === type && tx.status === 'validation');
            //console.log('[SYNC MANUAL] Transacciones para validar:', validatable.map(tx => tx.document_number));

            if (type === 'purchases') {
                //console.log('[VALIDATOR] Iniciando validación de compras...');
                await purchaseValidator(validatable);

                const toInvoice = await model.TransactionModel.findAll({
                    where: { lote_id: lote.id, type: 'purchases', status: 'to-invoice' }
                });
                //console.log('[SYNC] Facturas de compra listas para sincronizar:', toInvoice.map(tx => tx.document_number));

                await purchaseInvoiceSync(toInvoice);
            } else if (type === 'sales') {
                //console.log('[VALIDATOR] Iniciando validación de ventas...');
                await salesValidator(validatable);

                const toInvoice = await model.TransactionModel.findAll({
                    where: { lote_id: lote.id, type: 'sales', status: 'to-invoice' }
                });
                //console.log('[SYNC] Facturas de venta listas para sincronizar:', toInvoice.map(tx => tx.document_number));

                await saleInvoiceSync(toInvoice);
            }

            //console.log('[SYNC] Cerrando lote...');
            await closeLote();
        }

        //console.log(`[FIN LOTE] Proceso completo para el lote ${lote.id}`);
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
    /* try {
         const loteId = loteHeader.id;
         let processedCount = 0;
         let omittedCount = 0;
         let hasErrors = false;
 
         for (const invoice of lote) {
             try {
                 const params = await parametrizationService.getParametrizationData();
 
                 const rawTipo = invoice.Tipo_Documento;
                 const tipoNormalizado = normalizeText(rawTipo);
 
                 //console.log(`[TX LOOP] Documento: ${invoice.Serie_Numero || invoice['Serie_Numero']} - Tipo: ${rawTipo} (normalizado: ${tipoNormalizado})`);
 
                 // Detección por fragmentos clave (tolerante a errores de escritura)
                 const isCompra = tipoNormalizado.includes('factura') &&
                     tipoNormalizado.includes('compra');
 
                 const isVenta = tipoNormalizado.includes('factura') &&
                     tipoNormalizado.includes('venta')
 
                 if (
                     (type === 'purchases' && isCompra) ||
                     (type === 'sales' && isVenta)
                 ) {
                     //console.log(`[TX LOOP] ✅ Tipo válido. Intentando registrar transacción...`);
 
                     const coreData = type === 'purchases'
                         ? await siigoService.setSiigoPurchaseInvoiceData([invoice], params)
                         : await siigoService.setSiigoSalesInvoiceData([invoice], params);
 
                     const transaction = await registerTransaction(type, invoice, coreData[0], loteId);
 
                     if (transaction) {
                         processedCount++;
                         //console.log(`[TX LOOP] ✅ Transacción registrada: ${transaction.document_number}`);
                     } else {
                         omittedCount++;
                         //console.log(`[TX LOOP] ⚠️ Transacción omitida (posible duplicado).`);
                     }
                 } else {
                     omittedCount++;
                     //console.log(`[TX LOOP] ❌ Tipo omitido. No coincide con '${type}'. Tipo normalizado: "${tipoNormalizado}"`);
                 }
             } catch (error) {
                 console.error('[PROCESS TRANSACTION ERROR]', invoice, error);
                 hasErrors = true;
             }
         }
 
         //console.log(`[PROCESS LOTE] ✔️ Procesadas: ${processedCount}, ❌ Omitidas: ${omittedCount}`);
 
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
     }*/

    try {
        const loteId = loteHeader.id;
        let processedCount = 0;
        let omittedCount = 0;
        let hasErrors = false;

        for (const invoice of lote) {
            try {
                const params = await parametrizationService.getParametrizationData();

                const rawTipo = invoice.Tipo_Documento;
                const tipoNormalizado = normalizeText(rawTipo); // ej: "factura venta simplificada"

                const isCompra = tipoNormalizado.includes('factura') && tipoNormalizado.includes('compra');
                const isVenta = tipoNormalizado.includes('factura') && tipoNormalizado.includes('venta');

                const isVentaSimplificada =
                    isVenta && /\bfactura\s+venta\s+simplificad[ao]\b/.test(tipoNormalizado);

                if (type === 'sales' && isVentaSimplificada) {
                    omittedCount++;
                    // console.log(`[TX LOOP] ❌ Venta simplificada omitida: ${invoice.Serie_Numero || invoice['Serie_Numero']}`);
                    continue; // no procesar ni registrar esta factura
                }

                if (
                    (type === 'purchases' && isCompra) ||
                    (type === 'sales' && isVenta)
                ) {
                    // console.log(`[TX LOOP] ✅ Tipo válido. Intentando registrar transacción...`);

                    const coreData = type === 'purchases'
                        ? await siigoService.setSiigoPurchaseInvoiceData([invoice], params)
                        : await siigoService.setSiigoSalesInvoiceData([invoice], params);

                    const transaction = await registerTransaction(type, invoice, coreData[0], loteId);

                    if (transaction) {
                        processedCount++;
                        // console.log(`[TX LOOP] ✅ Transacción registrada: ${transaction.document_number}`);
                    } else {
                        omittedCount++;
                        // console.log(`[TX LOOP] ⚠️ Transacción omitida (posible duplicado).`);
                    }
                } else {
                    omittedCount++;
                    // console.log(`[TX LOOP] ❌ Tipo omitido. No coincide con '${type}'. Tipo normalizado: "${tipoNormalizado}"`);
                }
            } catch (error) {
                console.error('[PROCESS TRANSACTION ERROR]', invoice, error);
                hasErrors = true;
            }
        }

        // console.log(`[PROCESS LOTE] ✔️ Procesadas: ${processedCount}, ❌ Omitidas: ${omittedCount}`);

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


/*export const registerTransaction = async (type, hioposData, coreData, loteId) => {
    try {
        const documentNumber = hioposData.Serie_Numero || hioposData['Serie/Numero'];
        const documentDate = hioposData.Fecha

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
            amount: coreData.amount,
            document_date: documentDate
        });

        return transaction;
    } catch (error) {
        console.error('[REGISTER TRANSACTION] Error al registrar transacción:', error);
        throw error;
    }
};*/

export const registerTransaction = async (type, hioposData, coreData, loteId) => {
    try {
        const documentNumber = hioposData.Serie_Numero || hioposData['Serie/Numero'];
        const rawDate = hioposData.Fecha;

        let parsedDate = null;

        if (typeof rawDate === 'string') {
            // Intenta parsear como "YYYY-MM-DD"
            parsedDate = DateTime.fromFormat(rawDate, 'yyyy-MM-dd', { zone: 'utc' });

            // Si falla, intenta como "DD/MM/YYYY"
            if (!parsedDate.isValid) {
                parsedDate = DateTime.fromFormat(rawDate, 'dd/MM/yyyy', { zone: 'utc' });
            }

            // Si sigue siendo inválido, se ignora
            if (!parsedDate.isValid) {
                console.warn(`[REGISTER TRANSACTION] Fecha inválida ignorada: ${rawDate}`);
                parsedDate = null;
            }
        }

        const existingTransaction = await model.TransactionModel.findOne({
            where: { document_number: documentNumber }
        });

        if (existingTransaction) {
            console.warn(`[REGISTER TRANSACTION] Documento duplicado omitido: ${documentNumber}`);
            return null;
        }

        const transaction = await model.TransactionModel.create({
            lote_id: loteId,
            type,
            document_number: documentNumber,
            hiopos_data: hioposData,
            core_data: coreData,
            siigo_response: null,
            status: 'validation',
            amount: coreData.amount,
            document_date: parsedDate ? parsedDate.toISODate() : null // formato YYYY-MM-DD
        });

        return transaction;
    } catch (error) {
        console.error('[REGISTER TRANSACTION] Error al registrar transacción:', error);
        throw error;
    }
};

export const syncDataProcess = async ({ purchaseTransactions = null, salesTransactions = null } = {}) => {
    try {

        const hasPurchases = Array.isArray(purchaseTransactions) && purchaseTransactions.length > 0;
        console.log('Validación compra:', hasPurchases);


        if (hasPurchases) {
            console.log('Entra a la compra');
            await purchaseValidator(purchaseTransactions);

            const refreshedPurchases = await model.TransactionModel.findAll({
                where: {
                    id: purchaseTransactions.map(tx => tx.id),
                    status: 'to-invoice'
                }
            });

            await purchaseInvoiceSync(refreshedPurchases);
        }

        // Validar y sincronizar ventas si hay transacciones válidas
        const hasSales = Array.isArray(salesTransactions) && salesTransactions.length > 0;
        console.log('Validación venta:', hasSales);

        if (hasSales) {
            await salesValidator(salesTransactions);

            const refreshedSales = await model.TransactionModel.findAll({
                where: {
                    id: salesTransactions.map(tx => tx.id),
                    status: 'to-invoice'
                }
            });

            await saleInvoiceSync(refreshedSales);
        }

        // Cerrar lote si todo salió bien
        await closeLote();

    } catch (error) {
        console.error('Error al sincronizar con Siigo:', error);
        throw error;
    }
};
export const getValidationRegisterData = async (type) => {
    try {
        return await model.TransactionModel.findAll({
            where: {
                status: 'validation',
                type
            }, raw: true
        })
    } catch (error) {
        console.error('Error al traer los datos de la BD', error);
        throw error;
    }
}

export const getInvoicesToCreation = async (type) => {
    try {
        return await model.TransactionModel.findAll({
            where: {
                status: 'to-invoice',
                type
            }, raw: true
        })
    } catch (error) {
        console.error('Error al traer los datos de la BD', error);
        throw error;
    }
}

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
        const rateLimitDelay = 1500;
        const batches = [];

        for (let i = 0; i < validationInfo.length; i += batchSize) {
            batches.push(validationInfo.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            for (const currentInvoice of batch) {
                const { identification } = currentInvoice.core_data.supplier;
                const { Detalle_Documento, Retenciones, Su_doc_Prov } = currentInvoice.hiopos_data;
                const { Detalle_Medios_de_pago } = currentInvoice.hiopos_data;
                const params = await parametrizationService.getParametrizationData();
                const purchaseParam = params.data.find(param => param.type === 'purchases');
                const docProvider = siigoService.parseProviderInvoice(Su_doc_Prov)
                const invoiceData = {
                    date: DateTime.fromFormat(currentInvoice.hiopos_data.Fecha, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                    provider_invoice: docProvider, //currentInvoice.core_data.provider_invoice,
                    observations: currentInvoice.core_data.observations,
                    discount_type: 'Percentage',
                    internal: currentInvoice.hiopos_data.Numero,
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
                    //console.log('RawAlmacen:', rawAlmacen, isCostCenterRequired)

                    if (isCostCenterRequired || rawAlmacen) {
                        const coce = await siigoService.matchCostCenter(rawAlmacen);
                        //console.log('Busqueda CECO:', coce)
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

                    for (const item of Detalle_Documento) {
                        const siigoItem = await siigoService.getItemByCode(item.Ref_Articulo);

                        if (!siigoItem || siigoItem.results.length === 0) {
                            try {
                                const createdItem = await siigoService.createSiigoItem(item);
                                itemsValidationResults.push({ item: item.Ref_Articulo, status: 'success', details: createdItem });
                            } catch (error) {
                                console.error('Error en creación de artículo:', item.Ref_Articulo, error);
                                itemsValidationResults.push({
                                    item: item.Ref_Articulo,
                                    status: 'failed',
                                    details: {
                                        error: error.data?.Errors || error.message
                                    },
                                });
                            }
                        } else {
                            itemsValidationResults.push({
                                item: item.Ref_Articulo,
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
                        for (const item of Detalle_Documento) {
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
                    for (const payment of Detalle_Medios_de_pago) {
                        try {
                            const siigoMethod = await siigoService.getPaymentsByName('FC', payment);
                            //console.log('Siigo Method:', siigoMethod)
                            const calculatePayment = purchaseParam ? purchaseParam.calculate_payment : false;

                            if (!siigoMethod || !siigoMethod.id) {
                                paymentsValidationResults.push({
                                    id: null,
                                    name: payment.Medio_Pago,
                                    value: payment.Importe,
                                    status: 'failed',
                                    details: [`El método de pago "${payment.Medio_Pago}" no existe en Siigo`],
                                });
                            } else {
                                paymentsValidationResults.push({
                                    id: siigoMethod.id,
                                    name: siigoMethod.name,
                                    value: calculatePayment ? currentInvoice.amount : payment.Importe,
                                    due_date: DateTime.fromFormat(payment.Fecha_Vencimiento, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                                    status: 'success',
                                    details: [`Método de pago "${siigoMethod.name}" procesado correctamente.`],
                                });
                            }
                        } catch (error) {
                            paymentsValidationResults.push({
                                id: null,
                                name: payment.Medio_Pago,
                                value: payment.Importe,
                                due_date: DateTime.fromFormat(payment.Fecha_Vencimiento, "dd/MM/yyyy").toFormat("yyyy-MM-dd"),
                                status: 'failed',
                                details: [`Error procesando el método de pago "${payment.Medio_Pago}"`],
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
                    const retencionesDocumento = currentInvoice.hiopos_data.Retenciones_Documento ?? [];
                    const retencionesFiltradas = retencionesDocumento.filter(ret => {
                        const nombre = ret.Nombre_Retencion?.toLowerCase() ?? '';
                        return !nombre.includes('fuente');
                    });

                    const retencionesSiigo = retencionesFiltradas.length > 0
                        ? await getTaxesByName(retencionesFiltradas.map(r => ({
                            Nombre_Impuesto: r.Nombre_Retencion,
                            Porcentaje_Impuesto: r.Porcentaje,
                        })))
                        : [];

                    invoiceData.retentions = retencionesSiigo.map((ret, idx) => ({
                        id: ret.id,
                        name: ret.name,
                        percentage: ret.percentage,
                        value: -Math.abs(retencionesFiltradas[idx].Importe_Retenido ?? 0),
                        status: ret.status,
                    }));

                    //console.log('Datos preparados para la factura:', invoiceData);

                    const endValidation = await model.TransactionModel.findByPk(currentInvoice.id);
                    const validationFields = [
                        'document_validator_status',
                        'cost_center_validator_status',
                        'contact_validator_status',
                        'items_validator_status',
                        'payments_validator_status'
                    ];

                    //console.log('>>> Factura armada con tax_included:', invoiceData.tax_included);

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

const purchaseInvoiceSync = async (data = null) => {
    try {
        //console.log('Data en sync purchase invoice:', data)
        const invoices = (data && data.length > 0)
            ? data
            : await getInvoicesToCreation('purchases');
        const rateLimitDelay = 500; // Delay entre peticiones

        for (const invoice of invoices) {
            //console.log('Factura para enviar de compras:', invoice.siigo_body)
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

        // ===== Helpers globales (evitan redefinir dentro de bucles) =====
        const delay = (ms) => new Promise(res => setTimeout(res, ms)); // por si no existiera en el scope
        const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
        // Recolecta TODOS los modificadores con precio > 0 en cualquier nivel (DFS)
        const collectPricedModifiers = (mods) => {
            console.log('[collectPricedModifiers] start. mods len:', mods?.length);
            const results = [];
            const stack = toArray(mods).filter(Boolean);
            while (stack.length) {
                const m = stack.pop();
                if (!m || typeof m !== 'object') continue;

                console.log('  visit:', m.Articulo, 'Precio:', m.Precio);

                // hijos
                if (m.Modificadores_Articulo) {
                    const hijos = toArray(m.Modificadores_Articulo);
                    console.log('   hijos:', hijos.length);
                    for (const h of hijos) stack.push(h);
                }

                const precio = Number(m.Precio || 0);
                if (Number.isFinite(precio) && precio > 0) {
                    console.log('  ✅ priced mod:', m.Articulo, 'Ref:', m.Referencia || m.Ref_Articulo || m.Cod_Barra || m.Cod_Articulo);
                    results.push(m);
                }
            }
            console.log('[collectPricedModifiers] done. found:', results.length);
            return results;
        };

        const batches = [];
        for (let i = 0; i < validationInfo.length; i += batchSize) {
            batches.push(validationInfo.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            for (const currentInvoice of batch) {
                const { identification } = currentInvoice.core_data.customer;
                const { Medio_Pago, Detalle_Documento, Detalle_Totales } = currentInvoice.hiopos_data;
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

                    // ====== VALIDACIÓN de existencia de ítems y modificadores con precio > 0 ======
                    for (const item of Detalle_Documento) {
                        const ref = item.Ref_Articulo;
                        const siigoItem = await siigoService.getItemByCode(ref);
                        if (!siigoItem || siigoItem.results.length === 0) {
                            try {
                                const createdItem = await siigoService.createSiigoItem(item);
                                itemsValidationResults.push({
                                    item: ref,
                                    status: 'success',
                                    details: createdItem
                                });
                            } catch (error) {
                                itemsValidationResults.push({
                                    item: ref,
                                    status: 'failed',
                                    details: { error: error.data?.Errors || error.message }
                                });
                            }
                        } else {
                            itemsValidationResults.push({
                                item: ref,
                                status: 'success',
                                details: siigoItem.results[0]
                            });
                        }

                        await delay(rateLimitDelay);

                        // —— Recoge y valida modificadores con precio > 0 en cualquier nivel (con logs) ——
                        if (Array.isArray(item.Modificadores_Articulo)) {
                            console.log('[Main-Validation] Recorriendo modificadores de item:', item.Articulo);
                            const pricedMods = collectPricedModifiers(item.Modificadores_Articulo);
                            console.log('[Main-Validation] pricedMods encontrados:', pricedMods.map(m => `${m.Articulo} (${m.Precio})`));

                            for (const mod of pricedMods) {
                                const modRef = mod.Referencia || mod.Ref_Articulo || mod.Cod_Barra || mod.Cod_Articulo;
                                console.log('  [Validation] Procesando mod:', mod.Articulo, 'Ref:', modRef, 'Precio:', mod.Precio);

                                if (!modRef) {
                                    console.warn('   ⚠️ Mod con precio > 0 pero sin referencia!');
                                    itemsValidationResults.push({
                                        item: '(sin_ref)',
                                        status: 'failed',
                                        details: { error: 'Modificador con precio > 0 sin referencia' }
                                    });
                                    continue;
                                }

                                const detalleImpuesto = Array.isArray(mod.Detalle_Impuesto) ? mod.Detalle_Impuesto
                                    : Array.isArray(mod.DetalleImpuesto) ? mod.DetalleImpuesto
                                        : [];

                                const dummyItem = {
                                    Ref_Articulo: modRef,
                                    Articulo: mod.Articulo,
                                    Precio: Number(mod.Precio || 0),
                                    Unidades: Number(mod.Unidades || 1),
                                    Detalle_Impuesto: detalleImpuesto,
                                    Retenciones_Articulo: [],
                                    Cargos: [],
                                    Descuento: 0
                                };

                                console.log('   [Validation] DummyItem listo:', dummyItem);

                                const siigoMod = await siigoService.getItemByCode(modRef);
                                if (!siigoMod || !siigoMod.results || siigoMod.results.length === 0) {
                                    try {
                                        console.log('   [Validation] No existe en Siigo, creando:', modRef);
                                        const createdMod = await siigoService.createSiigoItem(dummyItem);
                                        itemsValidationResults.push({
                                            item: modRef,
                                            status: 'success',
                                            details: createdMod
                                        });
                                    } catch (error) {
                                        console.error('   ❌ Error creando en Siigo:', error);
                                        itemsValidationResults.push({
                                            item: modRef,
                                            status: 'failed',
                                            details: { error: error.data?.Errors || error.message }
                                        });
                                    }
                                } else {
                                    console.log('   [Validation] Ya existe en Siigo:', siigoMod.results[0]);
                                    itemsValidationResults.push({
                                        item: modRef,
                                        status: 'success',
                                        details: siigoMod.results[0]
                                    });
                                }

                                await delay(rateLimitDelay);
                            }
                        }
                    }

                    // ⚠️ Aun si hay errores, se registran todos y se sigue
                    const itemsStatus = itemsValidationResults.some(r => r.status === 'failed') ? 'failed' : 'success';

                    await model.TransactionModel.update({
                        items_validator_status: itemsStatus,
                        items_validator_details: itemsValidationResults,
                    }, { where: { id: currentInvoice.id } });

                    // ====== ARMADO DE LÍNEAS PARA LA FACTURA ======
                    let siigoItem = [];

                    for (const item of Detalle_Documento) {
                        // ⚠️ Evitar doble conteo: al padre NO le pasamos los modificadores
                        const parentItem = { ...item };
                        delete parentItem.Modificadores_Articulo;

                        console.log('[Items] Padre:', parentItem.Articulo, 'Precio:', parentItem.Precio);

                        // Línea del padre (con sus propios impuestos)
                        const formattedItem = await siigoService.setItemDataForInvoice(parentItem, 'sales');
                        if (formattedItem) {
                            console.log('  + push padre:', formattedItem.code, formattedItem.description, formattedItem.taxed_price ?? formattedItem.price);
                            siigoItem.push(formattedItem);
                        } else {
                            console.log('  (padre sin línea: price 0 o inválido)');
                        }

                        // Líneas de modificadores con precio > 0 en cualquier nivel
                        if (Array.isArray(item.Modificadores_Articulo)) {
                            const pricedMods = collectPricedModifiers(item.Modificadores_Articulo);
                            console.log('[Items] pricedMods para', item.Articulo, ':', pricedMods.map(m => `${m.Articulo}(${m.Precio})`));

                            for (const mod of pricedMods) {
                                const modRef = mod.Referencia || mod.Ref_Articulo || mod.Cod_Barra || mod.Cod_Articulo;
                                const detalleImpuesto = Array.isArray(mod.Detalle_Impuesto) ? mod.Detalle_Impuesto
                                    : Array.isArray(mod.DetalleImpuesto) ? mod.DetalleImpuesto
                                        : [];

                                /*const adaptedMod = {
                                    Ref_Articulo: modRef,
                                    Articulo: mod.Articulo,
                                    Unidades: Number(mod.Unidades || 1),
                                    Precio: Number(mod.Precio || 0),
                                    Descuento: 0,
                                    // Soportamos ambas variantes de llave por si el normalizador cambia:
                                    Detalle_Impuesto: detalleImpuesto,
                                    DetalleImpuesto: detalleImpuesto,
                                    Retenciones_Articulo: [],
                                    RetencionesArticulo: [],
                                    Cargos: []
                                };*/
                                const getModDiscountPct = (m) => {
                                    const num = (v) => {
                                        const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
                                        return Number.isFinite(n) ? n : NaN;
                                    };

                                    // 1) Porcentaje explícito
                                    const pctKey = num(m.Porcentaje_Descuento);
                                    if (Number.isFinite(pctKey) && pctKey > 0 && pctKey <= 100) return +pctKey.toFixed(4);

                                    // 2) "Descuento" en rango 0–100 => % directo
                                    const descKey = num(m.Descuento);
                                    if (Number.isFinite(descKey) && descKey > 0 && descKey <= 100) return +descKey.toFixed(4);

                                    // 3) Importe_Descuentos → convertir a %
                                    const qty = num(m.Unidades) || 1;
                                    const price = num(m.Precio) || 0;
                                    const gross = qty * price;
                                    const amt = num(m.Importe_Descuentos);
                                    if (Number.isFinite(amt) && amt > 0 && gross > 0) {
                                        const pct = (amt / gross) * 100;
                                        return +Math.min(100, Math.max(0, pct)).toFixed(4);
                                    }

                                    // 4) Fallback A: si viene Neto (< Precio), inferir % desc desde Neto
                                    const neto = num(m.Neto);
                                    if (Number.isFinite(neto) && price > 0 && neto > 0 && neto < price) {
                                        const pct = (1 - (neto / price)) * 100;
                                        if (pct > 0.01) return +Math.min(100, Math.max(0, pct)).toFixed(4);
                                    }

                                    // 5) Fallback B: si viene Base y conocemos IVA, inferir base sin desc y comparar
                                    const base = num(m.Base);
                                    if (Number.isFinite(base) && base > 0 && price > 0) {
                                        // intenta sacar el IVA del arreglo de impuestos del mod
                                        const ivaPct = (() => {
                                            const det = Array.isArray(m.Detalle_Impuesto) ? m.Detalle_Impuesto
                                                : Array.isArray(m.DetalleImpuesto) ? m.DetalleImpuesto
                                                    : [];
                                            const iva = det.find(t =>
                                                String(t?.Nombre_Impuesto || '').toLowerCase().includes('iva') &&
                                                Number.isFinite(num(t.Porcentaje_Impuesto))
                                            );
                                            return num(iva?.Porcentaje_Impuesto);
                                        })();

                                        if (Number.isFinite(ivaPct) && ivaPct >= 0) {
                                            const baseTeorica = price / (1 + (ivaPct / 100)); // base sin descuento si no hubiera desc
                                            if (baseTeorica > 0 && base < baseTeorica) {
                                                const pct = (1 - (base / baseTeorica)) * 100;
                                                if (pct > 0.01) return +Math.min(100, Math.max(0, pct)).toFixed(4);
                                            }
                                        }
                                    }

                                    return 0; // no hay forma de inferir descuento
                                };

                                const modDiscPct = getModDiscountPct(mod);

                                const adaptedMod = {
                                    Ref_Articulo: modRef,
                                    Articulo: mod.Articulo,
                                    Unidades: Number(mod.Unidades || 1),
                                    Precio: Number(mod.Precio || 0),
                                    // 👇 solo enviamos descuento si existe (>0)
                                    ...(modDiscPct > 0 ? { Descuento: modDiscPct, Porcentaje_Descuento: modDiscPct } : {}),
                                    // Soportamos ambas variantes de llave por si el normalizador cambia:
                                    Detalle_Impuesto: detalleImpuesto,
                                    DetalleImpuesto: detalleImpuesto,
                                    Retenciones_Articulo: [],
                                    RetencionesArticulo: [],
                                    Cargos: []
                                };

                                console.log('  -> adapt mod:', adaptedMod.Ref_Articulo, adaptedMod.Articulo, adaptedMod.Precio);

                                const formattedMod = await siigoService.setItemDataForInvoice(adaptedMod, 'sales');
                                if (formattedMod) {
                                    console.log('     + push mod:', formattedMod.code, formattedMod.description, formattedMod.taxed_price ?? formattedMod.price);
                                    siigoItem.push(formattedMod);
                                } else {
                                    console.log('     (mod descartado: price 0 o inválido)');
                                }
                            }
                        }
                    }

                    invoiceData.items = siigoItem;

                    // 🚨 Validación final antes de guardar
                    if (!invoiceData.items || invoiceData.items.length === 0) {
                        throw new Error('No se encontraron ítems válidos para facturar');
                    }

                    // Propina
                    const propina = Detalle_Totales.Entrada_Propina;
                    if (propina && typeof propina.Valor_Propina === 'number' && !isNaN(propina.Valor_Propina)) {
                        siigoItem.push({
                            code: 'PROP01',
                            type: 'Service',
                            description: 'Propina',
                            quantity: 1,
                            taxed_price: propina.Valor_Propina
                        });
                    }

                    // ====== PAYMENTS ======
                    const paymentsValidationResults = [];
                    for (const payment of Medio_Pago) {
                        try {
                            const siigoMethod = await siigoService.getPaymentsByName('FV', payment);
                            if (!siigoMethod || !siigoMethod.id) {
                                paymentsValidationResults.push({
                                    id: null,
                                    name: payment.Medio_De_Pago,
                                    value: payment.Valor,
                                    status: 'failed',
                                    details: [`El método de pago "${payment.Medio_De_Pago}" no existe en Siigo`],
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
                                name: payment.Medio_De_Pago,
                                value: payment.Valor,
                                status: 'failed',
                                details: [`Error procesando el método de pago "${payment.Medio_De_Pago}"`],
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

                    //console.log('Datos preparados para la factura:', invoiceData);

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

        //console.log('OPEN LOTES', openLotes);

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

            //console.log(`Lote ${lote.id} actualizado a: ${newStatus}`);
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

export const deleteTransactions = async (ids) => {
    try {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new Error('Debes proporcionar un arreglo de IDs');
        }

        const result = await model.TransactionModel.destroy({
            where: {
                id: ids
            }
        });

        return { deletedCount: result };

    } catch (error) {
        throw error;
    }
}

export const updateTransaction = async (id, data) => {
    try {
        //console.log('Servicio de update', id, data);

        // Paso 1: Actualizar el siigo_body
        const [affectedCount] = await model.TransactionModel.update(
            { siigo_body: data },
            { where: { id } }
        );

        //console.log('Líneas afectadas:', affectedCount);

        if (affectedCount === 0) {
            throw new Error(`No se encontró ninguna transacción con id ${id}`);
        }

        // Paso 2: Consultar la transacción para obtener el tipo
        const transaction = await model.TransactionModel.findByPk(id);
        if (!transaction) {
            throw new Error(`Transacción no encontrada para id ${id}`);
        }

        const type = transaction.type;

        if (!type) {
            throw new Error(`Tipo de transacción no definido para id ${id}`);
        }

        // Paso 3: Llamar al servicio correspondiente
        let creation;

        try {
            if (type === 'sales') {
                creation = await siigoService.createSaleInvoice(data);
            } else if (type === 'purchases') {
                creation = await siigoService.createPurchaseInvoice(data);
            } else {
                throw new Error(`Tipo de transacción desconocido: ${type}`);
            }

            // Paso 4: Si todo va bien, actualizar status a success
            await model.TransactionModel.update(
                { status: 'success', siigo_response: creation },
                { where: { id } }
            );

            return creation;

        } catch (errorInvoice) {
            console.error('Error al crear la factura:', errorInvoice?.data || errorInvoice);

            await model.TransactionModel.update(
                { status: 'failed', error: errorInvoice?.data || errorInvoice },
                { where: { id } }
            );
        }

    } catch (error) {
        console.error('Error general en updateTransaction:', error);
        throw error;
    }
};

export const reprocessLote = async (loteId) => {
    try {
        if (!loteId) {
            throw new Error('Debe proporcionar un ID de lote válido.');
        }

        const transactions = await model.TransactionModel.findAll({
            where: {
                lote_id: loteId,
                status: 'validation'
            }
        });

        if (!transactions.length) {
            console.warn(`[REPROCESS LOTE] No hay transacciones en estado 'validation' para el lote ${loteId}.`);
            return;
        }

        const purchaseTransactions = transactions.filter(tx => tx.type === 'purchases');
        const salesTransactions = transactions.filter(tx => tx.type === 'sales');

        //console.log(`[REPROCESS LOTE ${loteId}] Compras: ${purchaseTransactions.length}, Ventas: ${salesTransactions.length}`);
        //console.log('compras en reproceso de lote', purchaseTransactions)
        //console.log('ventas en reproceso de lote', salesTransactions)
        await syncDataProcess({
            purchaseTransactions: purchaseTransactions.length > 0 ? purchaseTransactions : null,
            salesTransactions: salesTransactions.length > 0 ? salesTransactions : null
        });

        //console.log(`[REPROCESS LOTE ${loteId}] Finalizado correctamente.`);
    } catch (error) {
        console.error(`[REPROCESS LOTE] Error reprocesando el lote ${loteId}:`, error);
        throw error;
    }
};
