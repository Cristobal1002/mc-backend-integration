import {Model, DataTypes} from "sequelize";
import {sequelize} from "../database/index.js";

class LoteModel extends Model {}

LoteModel.init({
    id: {
        type: DataTypes.UUID, // Tipo UUID
        defaultValue: DataTypes.UUIDV4, // Genera automáticamente un UUID v4
        primaryKey: true
    },
    type: {
        type: DataTypes.ENUM("purchases", "sales"), // Tipo de proceso: compras o ventas
        allowNull: false,
    },
    filter: {
        type: DataTypes.JSONB, // Detalles del filtro
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM("processing", "success", "failed", 'processed-with-errors'), // Estado del proceso
        allowNull: false,
        defaultValue: "processing",
    },
    error: {
        type: DataTypes.JSONB, // Detalles del error si falla
        allowNull: true,
    },
    processed_at: {
        type: DataTypes.DATE, // Fecha de ejecución
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    transactions_count: {
        type: DataTypes.INTEGER, // Número total de transacciones procesadas
        allowNull: true,
        defaultValue: 0,
    },
},{
    sequelize,
    modelName: 'LoteModel',
    tableName: 'lotes',
    paranoid: true,
    timestamps: true
})

export default LoteModel