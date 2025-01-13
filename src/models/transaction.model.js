import {Model, DataTypes} from "sequelize";
import {sequelize} from "../database/index.js";

class TransactionModel extends Model{}

TransactionModel.init({
    id:{
        type: DataTypes.UUID, // Tipo UUID
        defaultValue: DataTypes.UUIDV4, // Genera automáticamente un UUID v4
        primaryKey: true
    },
    type: {
        type: DataTypes.ENUM('purchases', 'sales'),
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
    vendor_validator: {
        type: DataTypes.ENUM('created', 'exist', 'error', 'validation'),
        allowNull: false,
        defaultValue: 'validation'
    },
    items_validator: {
        type: DataTypes.JSONB,
        allowNull: true,
        default: []
    },
    siigo_response: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    error: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('success', 'failed', 'validation', 'validated')
    }
},{
    sequelize,
    modelName: 'TransactionModel',
    tableName: 'transactions',
    paranoid: true,
    timestamps: true
})

export default TransactionModel