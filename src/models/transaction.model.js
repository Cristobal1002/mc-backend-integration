import {Model, DataTypes} from "sequelize";
import {sequelize} from "../database/index.js";

class TransactionModel extends Model{}

TransactionModel.init({
    id:{
        type: DataTypes.UUID,
        primaryKey: true
    },
    type: {
        type: DataTypes.ENUM('purchase', 'sale'),
        allowNull: false
    },
    document_number: {
        type: DataTypes.STRING,
        allowNull: false
    },
    hiopos_data: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    core_data: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    siigo_response: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('success', 'failed', 'start', 'in-process')
    }
},{
    sequelize,
    modelName: 'TransactionModel',
    tableName: 'transactions',
    paranoid: true,
    timestamps: true
})

export default TransactionModel