import {siigoService} from "./index.js";

export const setTransaction = async (type, lote) => {
    if (type === 'purchases'){
        const purchaseInvoices = lote.filter(invoice => invoice.TipoDocumento === "Factura compra");
        const setData = siigoService.setSiigoPurchaseInvoiceData(purchaseInvoices)
        console.log('Data de Siigo seteada', JSON.stringify(setData, null, 2))
    }
}