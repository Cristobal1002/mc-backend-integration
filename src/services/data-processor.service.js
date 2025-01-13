import {hioposService, siigoService} from "./index.js";
import {model} from "../models/index.js";
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
        await purchaseValidator()
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

export const purchaseValidator = async () => {
    try {
        const validationInfo = await getValidationRegisterData('purchases');
        for (const invoice of validationInfo) {
            const { identification } = invoice.core_data.supplier
            const {DetalleDocumento} = invoice.hiopos_data

            //Se valida el proveedor o se crea
            const getSiigoContact = await siigoService.getContactsByIdentification(identification)
            console.log('Siigo contact:',getSiigoContact)
            if (!getSiigoContact || getSiigoContact.results.length === 0){
                const getHioposContact = await hioposService.getContactByDocument('/vendors', identification)
                console.log('Hiopos Vendor Contact', getHioposContact)
                const creteVendorResponse = await siigoService.createContact('/vendors', getHioposContact.Proveedores)
                if(creteVendorResponse){
                    await model.TransactionModel.update({ vendor_validator: 'created' }, { where: { id: invoice.id } });

                } else {
                    await model.TransactionModel.update({ vendor_validator: 'error' }, { where: { id: invoice.id } });
                }
            } else {
                await model.TransactionModel.update({ vendor_validator: 'exist' }, { where: { id: invoice.id } });
                console.log("Se encontró al proveedor:", getSiigoContact);
            }

            // Se validan los articulos o se crean
            const itemsValidator = []; // Arreglo para almacenar el estado de cada artículo

            // Se validan los articulos o se crean
            const itemsValidationResults = []; // Arreglo para almacenar los resultados de los artículos
            for (const item of DetalleDocumento) {
                const getSiigoItem = await siigoService.getItemByCode(item.RefArticulo);
                let validationResult = {
                    item: item.RefArticulo,
                    status: '',
                    details: []
                };

                if (!getSiigoItem || getSiigoItem.results.length === 0) {
                    console.log('No existe el articulo:', item);

                    try {
                        const createItem = await siigoService.createSiigoItem(item);
                        validationResult.status = 'created';
                        validationResult.details.push(createItem.details); // Guarda la respuesta de creación
                    } catch (createError) {
                        console.error('Error al crear artículo:', createError);
                        validationResult.status = 'error';
                        validationResult.details.push({ error: createError.data.Errors || createError.message });
                    }
                } else {
                    console.log('Articulo encontrado:', getSiigoItem.results);
                    validationResult.status = 'exist';
                    validationResult.details.push(getSiigoItem.results[0].id); // Almacena el artículo encontrado
                }

                itemsValidationResults.push(validationResult); // Agrega el resultado al arreglo
            }

            // Actualiza el campo items_validator con el arreglo de resultados
            await model.TransactionModel.update({
                items_validator: itemsValidationResults // Aquí pasamos el arreglo directamente
            }, {
                where: { id: invoice.id }
            });
        }
    } catch (error) {
        throw error
    }
}
