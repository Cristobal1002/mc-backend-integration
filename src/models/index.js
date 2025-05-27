import TransactionModel from './transaction.model.js'
import LoteModel from "./lote.model.js";
import ParametrizationModel from "./parametrization.model.js";
import JobModel from "./job.model.js";

LoteModel.hasMany(TransactionModel, {foreignKey: 'lote_id'})
TransactionModel.belongsTo(LoteModel,{foreignKey: 'lote_id'})
LoteModel.belongsTo(JobModel, { foreignKey: 'job_id' });
JobModel.hasOne(LoteModel, { foreignKey: 'job_id' });

export const syncDb = async () => {
    await LoteModel.sync({alter: true })
    await TransactionModel.sync({alter: true})
    await ParametrizationModel.sync({alter:true})
    await JobModel.sync({alter:true})
}
export const model = {
    LoteModel,
    TransactionModel,
    ParametrizationModel,
    JobModel
}