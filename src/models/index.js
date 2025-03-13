import TransactionModel from './transaction.model.js'
import LoteModel from "./lote.model.js";
import ParametrizationModel from "./parametrization.model.js";

LoteModel.hasMany(TransactionModel, {foreignKey: 'lote_id'})
TransactionModel.belongsTo(LoteModel,{foreignKey: 'lote_id'})
export const syncDb = async () => {
    await LoteModel.sync({alter: true })
    await TransactionModel.sync({alter: true})
    await ParametrizationModel.sync({alter:true, force:true})
}
export const model = {
    LoteModel,
    TransactionModel,
    ParametrizationModel
}