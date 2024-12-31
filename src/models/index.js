import TransactionModel from './transaction.model.js'
export const syncDb = async () => {
    await TransactionModel.sync({alter: true, force: true})
}
export const model = {
    TransactionModel
}