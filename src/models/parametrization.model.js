import {Model, DataTypes} from "sequelize";
import {sequelize} from "../database/index.js";

class ParametrizationModel extends Model {}

ParametrizationModel.init({
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4, // Genera automáticamente un UUID v4
        primaryKey: true
    },
    type:{
        type: DataTypes.ENUM('purchases','sales'),
        allowNull: false
    },
    calculate_payment: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    tax_included_in_calculation: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
},{
    sequelize,
        modelName: 'ParametrizationModel',
        tableName: 'parametrization',
        paranoid: true,
        timestamps: true
})

export default ParametrizationModel