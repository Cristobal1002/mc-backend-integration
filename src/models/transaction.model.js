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
    document_validator_status: {
        type:  DataTypes.ENUM('success', 'failed', 'validation'),
        defaultValue: 'validation'
    },
    document_validator_details: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    cost_center_validator_status: {
        type:  DataTypes.ENUM('success', 'failed', 'validation'),
        defaultValue: 'validation'
    },
    cost_center_validator_details: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    contact_validator_status: {
        type:  DataTypes.ENUM('success', 'failed', 'validation'),
        defaultValue: 'validation'
    },
    contact_validator_details: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    items_validator_status:{
        type:  DataTypes.ENUM('success', 'failed', 'validation'),
        defaultValue: 'validation'
    },
    items_validator_details: {
        type: DataTypes.JSONB,
        allowNull: true,
        default: []
    },
    payments_validator_status:{
        type:  DataTypes.ENUM('success', 'failed', 'validation'),
        defaultValue: 'validation'
    },
    payments_validator_details: {
        type: DataTypes.JSONB,
        allowNull: true,
        default: []
    },
    siigo_body:{
        type: DataTypes.JSONB,
        allowNull: true,
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
        type: DataTypes.ENUM('success', 'failed', 'validation')
    }
},{
    sequelize,
    modelName: 'TransactionModel',
    tableName: 'transactions',
    paranoid: true,
    timestamps: true
})

export default TransactionModel