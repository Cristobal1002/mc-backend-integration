import TransactionModel from './transaction.model.js'
import LoteModel from "./lote.model.js";
import ParametrizationModel from "./parametrization.model.js";
import JobModel from "./job.model.js";
import UserModel from "./user.model.js";

LoteModel.hasMany(TransactionModel, {foreignKey: 'lote_id'})
TransactionModel.belongsTo(LoteModel,{foreignKey: 'lote_id'})
LoteModel.belongsTo(JobModel, { foreignKey: 'job_id' });
JobModel.hasOne(LoteModel, { foreignKey: 'job_id' });

// Relaciones de User
UserModel.hasMany(UserModel, {foreignKey: 'created_by', as: 'createdUsers'})
UserModel.belongsTo(UserModel, {foreignKey: 'created_by', as: 'creator'})

export const syncDb = async () => {
    await UserModel.sync({alter: true })
    await LoteModel.sync({alter: true })
    await TransactionModel.sync({alter: true})
    await ParametrizationModel.sync({alter:true})
    await JobModel.sync({alter:true})
}
export const model = {
    UserModel,
    LoteModel,
    TransactionModel,
    ParametrizationModel,
    JobModel
}