import TransactionModel from './transaction.model.js'
import LoteModel from "./lote.model.js";

LoteModel.hasMany(TransactionModel, {foreignKey: 'lote_id'})
TransactionModel.belongsTo(LoteModel,{foreignKey: 'lote_id'})
export const syncDb = async () => {
    await LoteModel.sync({alter: true, force: true})
    await TransactionModel.sync({alter: true, force: true})
}
export const model = {
    LoteModel,
    TransactionModel
}