import {Model, DataTypes} from "sequelize";
import {sequelize} from "../database/index.js";

class UserModel extends Model {}

UserModel.init({
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('admin', 'compras', 'ventas', 'power_user'),
        allowNull: false,
        defaultValue: 'compras'
    },
    first_login: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    password_reset_token: {
        type: DataTypes.STRING,
        allowNull: true
    },
    password_reset_expires: {
        type: DataTypes.DATE,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    }
}, {
    sequelize,
    modelName: 'UserModel',
    tableName: 'users',
    paranoid: true,
    timestamps: true
})

export default UserModel

