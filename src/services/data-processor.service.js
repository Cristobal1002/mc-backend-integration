import {hioposService, siigoService} from "./index.js";
import {model} from "../models/index.js";
import {setItemDataForInvoice} from "./siigo.service.js";

export const getHioposLote = async (type, filter) => {
    try {
        // Llamar al servicio para sincronizar compras o ventas
        const getHioposData = await hioposService.getBridgeDataByType(type, filter);

        // Guardar todas las transacciones y luego sincronizar con Siigo
        await processLoteTransactions(type, getHioposData.data);

    } catch (error) {
        console.error(`Error processing Hiopos lote:`, error);
        throw error; // Permite que el job sea reintentado
    }
};

export const processLoteTransactions = async (type, lote) => {
    try {
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
                    const transaction = await registerTransaction(type, invoice, coreData[0]);
                    savedTransactions.push(transaction);
                }
            } catch (error) {
                console.error('[PROCESS TRANSACTION ERROR]', invoice, error);
                // Decide cómo manejar el error: continuar o abortar
                savedTransactions.push(null);
            }
        }

        console.log(`[PROCESS LOTE] Todas las transacciones guardadas: ${savedTransactions.filter(tx => tx).length}`);

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
};


export const registerTransaction = async (type, hioposData, coreData) => {
    try {
        const documentNumber = hioposData.SerieNumero || hioposData['Serie/Numero'];
        const transaction = await model.TransactionModel.create({
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
};

export const syncDataProcess= async () => {
    try {
        await purchaseValidator();
        await purchaseInvoiceSync();

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

        for (const currentInvoice of validationInfo) {
            const { identification } = currentInvoice.core_data.supplier;
            const { DetalleDocumento } = currentInvoice.hiopos_data;
            const { DetalleMediosdepago } = currentInvoice.hiopos_data;

            const invoiceData = {
                date: currentInvoice.core_data.date,
                provider_invoice: currentInvoice.core_data.provider_invoice,
                observations: currentInvoice.core_data.observations,
                discount_type: 'Percentage',
                tax_included: false
            }; // Para la creación de la factura final

            try {

                //Validación de documentos

                const siigoDocument = await siigoService.matchDocumentTypeByName('FC', currentInvoice.hiopos_data.Serie);
                if(!siigoDocument || !siigoDocument.id){
                    await model.TransactionModel.update({
                        document_validator_status: 'failed',
                        document_validator_details: siigoDocument,
                    }, { where: { id: currentInvoice.id } });
                }else{
                    await model.TransactionModel.update({
                        document_validator_status: 'success',
                        document_validator_details: siigoDocument,
                    }, { where: { id: currentInvoice.id } });
                    invoiceData.document = siigoDocument
                }

                //Validacion de centro de costo
                const coce = await siigoService.matchCostCenter(currentInvoice.hiopos_data.Almacen);
                if(!coce || !coce.id){
                    await model.TransactionModel.update({
                        cost_center_validator_status: 'failed',
                        cost_center_validator_details: coce,
                    }, { where: { id: currentInvoice.id } });
                }else{
                    await model.TransactionModel.update({
                        cost_center_validator_status: 'success',
                        cost_center_validator_details: coce,
                    }, { where: { id: currentInvoice.id } });
                    invoiceData.cost_center = coce.id
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
                }


                const itemsStatus = itemsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';
                await model.TransactionModel.update({
                    items_validator_status: itemsStatus,
                    items_validator_details: itemsValidationResults,
                }, { where: { id: currentInvoice.id } });
                //invoiceData.items = itemsValidationResults;

                //Fijar los articulos como se debe
                let siigoItem = []
                if(itemsStatus === 'success'){
                    for (const item of DetalleDocumento) {
                        siigoItem.push( await siigoService.setItemDataForInvoice(item))
                    }
                }

                // Validación de métodos de pago
                const paymentsValidationResults = [];
                for (const payment of DetalleMediosdepago) {
                    try {
                        const siigoMethod = await siigoService.getPaymentsByName('FC', payment);
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
                                value: payment.Importe,
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
                }

                const paymentsStatus = paymentsValidationResults.some(result => result.status === 'failed') ? 'failed' : 'success';
                await model.TransactionModel.update({
                    payments_validator_status: paymentsStatus,
                    payments_validator_details: paymentsValidationResults,
                }, { where: { id: currentInvoice.id } });
                invoiceData.payments = paymentsValidationResults;
                invoiceData.items = siigoItem


                console.log('Datos preparados para la factura:', invoiceData);

                //Actualiza status final y arma le body para enviar a siigo
                const endValidation = await model.TransactionModel.findByPk(currentInvoice.id);
                // Lista de los campos de validación
                const validationFields = [
                    'document_validator_status',
                    'cost_center_validator_status',
                    'contact_validator_status',
                    'items_validator_status',
                    'payments_validator_status'
                ];

                // Verifica si todos los campos están en 'success'
                const allSuccess = validationFields.every(
                    (field) => endValidation[field] === 'success'
                );

                endValidation.siigo_body = invoiceData
                // Actualiza el estado general
                endValidation.status = allSuccess ? 'to-invoice' : 'failed';

                // Guarda los cambios en la base de datos
                await endValidation.save();


            } catch (validationError) {
                console.error(`Error procesando factura ID: ${currentInvoice.id}`, validationError);
                await model.TransactionModel.update({
                    error: validationError.message,
                    status: 'failed',
                }, { where: { id: currentInvoice.id } });
            }
        }
    } catch (error) {
        console.error('Error general del validador:', error);
        throw error;
    }
};

const purchaseInvoiceSync = async () => {
    try {
        const invoices = await getInvoicesToCreation('purchases')
        for (const invoice of invoices) {
            try {
                const creation = await siigoService.createPurchaseInvoice(invoice.siigo_body);
                if(creation){
                    await model.TransactionModel.update({status: 'success', siigo_response:  creation}, {where: {id: invoice.id}})
                }
            } catch (errorInvoice) {
                console.error('Error al crear la factura', errorInvoice)
                await model.TransactionModel.update({status: 'failed', error:  errorInvoice.data}, {where: {id: invoice.id}})
            }
        }
    } catch (error) {
        console.error('Error al crear la factura')
        throw error
    }
}