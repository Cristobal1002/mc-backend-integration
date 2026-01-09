import { model } from '../models/index.js';
import { hashPassword } from '../services/auth.service.js';

/**
 * Crea el usuario power_user inicial (Cristobal Sosa)
 * Solo se ejecuta si no existe
 */
export const seedPowerUser = async () => {
    try {
        // Verificar si ya existe un usuario power_user
        const existingPowerUser = await model.UserModel.findOne({
            where: { role: 'power_user' }
        });

        if (existingPowerUser) {
            // Asegurar que power_user no requiera cambio de contraseña y tenga username
            const updates = {};
            if (existingPowerUser.first_login) {
                updates.first_login = false;
            }
            if (!existingPowerUser.username) {
                updates.username = 'Cristobal Sosa';
            }
            if (Object.keys(updates).length > 0) {
                await existingPowerUser.update(updates);
                console.log('✅ Usuario power_user actualizado:', updates);
            } else {
                console.log('✅ Usuario power_user ya existe y está configurado correctamente');
            }
            return;
        }

        // Email del usuario power_user (Cristobal Sosa)
        // IMPORTANTE: El usuario debe configurar este email en .env o cambiarlo después
        const powerUserEmail = process.env.POWER_USER_EMAIL || 'cristobal@miryamcamhi.com';
        const powerUserPassword = process.env.POWER_USER_PASSWORD || 'DiosEsFiel2025@';

        // Verificar si el email ya existe
        const existingUser = await model.UserModel.findOne({
            where: { email: powerUserEmail.toLowerCase() }
        });

        if (existingUser) {
            console.log('⚠️  El email del power_user ya está registrado. Actualizando rol...');
            await existingUser.update({ 
                role: 'power_user',
                first_login: false, // Power user no requiere cambio de contraseña
                username: existingUser.username || 'Cristobal Sosa' // Asegurar que tenga username
            });
            console.log('✅ Usuario actualizado a power_user');
            return;
        }

        // Crear usuario power_user
        const hashedPassword = await hashPassword(powerUserPassword);

        await model.UserModel.create({
            username: 'Cristobal Sosa',
            email: powerUserEmail.toLowerCase(),
            password: hashedPassword,
            role: 'power_user',
            first_login: false, // Power user no requiere cambio de contraseña
            is_active: true,
            created_by: null // Creado por el sistema
        });

        console.log('✅ Usuario power_user creado exitosamente');
        console.log(`   Email: ${powerUserEmail}`);
        console.log(`   Password: ${powerUserPassword}`);
    } catch (error) {
        console.error('❌ Error creando usuario power_user:', error.message);
    }
};

