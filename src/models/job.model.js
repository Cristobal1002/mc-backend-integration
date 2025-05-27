import {Model, DataTypes} from "sequelize";
import {sequelize} from "../database/index.js";

class JobModel extends Model {}

JobModel.init({
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
    },
    start_time: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    end_time: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    source: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['hiopos']] }
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['pending', 'processing', 'done', 'error']] },
        defaultValue: 'pending',
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [['auto', 'manual']] },
    },
    triggered_by: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    error: {
        type: DataTypes.TEXT,
    }
}, {
    sequelize,
    tableName: 'jobs',
    timestamps: true, // createdAt y updatedAt
})
export default JobModel