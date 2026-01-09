import nodemailer from 'nodemailer';
import { CustomError } from '../errors/index.js';

// Configuración del transporter de email
let transporter = null;

export const initializeEmailService = () => {
    if (transporter) return transporter;

    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    const emailFrom = process.env.EMAIL_FROM || emailUser;
    const emailSecure = process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_SECURE === '1';

    // Si no hay configuración de email, retornar null (modo sin email)
    if (!emailHost || !emailUser || !emailPassword) {
        console.warn('⚠️  Email service no configurado. Las funciones de recuperación de contraseña no estarán disponibles.');
        return null;
    }

    // Configuración para Outlook corporativo / Office 365
    const isOutlook = emailHost.includes('outlook') || emailHost.includes('office365') || emailHost.includes('microsoft');

    const transportConfig = {
        host: emailHost,
        port: parseInt(emailPort) || (isOutlook ? 587 : 587),
        secure: emailSecure || parseInt(emailPort) === 465,
        auth: {
            user: emailUser,
            pass: emailPassword
        }
    };

    // Configuración adicional para Outlook/Office 365
    if (isOutlook) {
        transportConfig.requireTLS = true;
        transportConfig.tls = {
            ciphers: 'TLSv1.2',
            minVersion: 'TLSv1.2'
        };
    }

    transporter = nodemailer.createTransport(transportConfig);

    // Verificar la conexión
    transporter.verify((error, success) => {
        if (error) {
            console.error('❌ Error verificando conexión de email:', error.message);
        } else {
            console.log('✅ Servidor de email configurado correctamente');
        }
    });

    return transporter;
};

/**
 * Envía email de recuperación de contraseña
 */
export const sendPasswordResetEmail = async (email, resetToken, resetUrl) => {
    const emailTransporter = initializeEmailService();

    if (!emailTransporter) {
        throw new CustomError({
            message: 'Servicio de email no configurado',
            code: 500,
            data: null
        });
    }

    const resetLink = resetUrl || `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password?token=${resetToken}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Recuperación de contraseña',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #5D87FF;">Recuperación de contraseña</h2>
                <p>Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
                <p style="margin: 20px 0;">
                    <a href="${resetLink}" 
                       style="background-color: #5D87FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Restablecer contraseña
                    </a>
                </p>
                <p>O copia y pega este enlace en tu navegador:</p>
                <p style="color: #666; word-break: break-all;">${resetLink}</p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">
                    Este enlace expirará en 1 hora. Si no solicitaste este cambio, ignora este email.
                </p>
            </div>
        `
    };

    try {
        await emailTransporter.sendMail(mailOptions);
        return { success: true, message: 'Email enviado correctamente' };
    } catch (error) {
        console.error('Error enviando email:', error);
        throw new CustomError({
            message: 'Error al enviar el email de recuperación',
            code: 500,
            data: null
        });
    }
};

/**
 * Envía email con credenciales temporales (cuando admin crea usuario)
 */
export const sendTemporaryCredentialsEmail = async (email, temporaryPassword) => {
    const emailTransporter = initializeEmailService();

    if (!emailTransporter) {
        // Si no hay email configurado, no lanzar error, solo log
        console.log(`⚠️  Email no configurado. Credenciales temporales para ${email}: ${temporaryPassword}`);
        return { success: false, message: 'Email no configurado' };
    }

    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/login`;

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Credenciales de acceso',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #5D87FF;">Bienvenido</h2>
                <p>Se ha creado tu cuenta. Tus credenciales temporales son:</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Contraseña temporal:</strong> <code style="background-color: #fff; padding: 2px 6px; border-radius: 3px;">${temporaryPassword}</code></p>
                </div>
                <p><strong>Importante:</strong> Deberás cambiar tu contraseña al iniciar sesión por primera vez.</p>
                <p style="margin: 20px 0;">
                    <a href="${loginUrl}" 
                       style="background-color: #5D87FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Iniciar sesión
                    </a>
                </p>
            </div>
        `
    };

    try {
        await emailTransporter.sendMail(mailOptions);
        return { success: true, message: 'Email enviado correctamente' };
    } catch (error) {
        console.error('Error enviando email:', error);
        // No lanzar error, solo log (las credenciales ya se retornaron al admin)
        return { success: false, message: 'Error al enviar email, pero las credenciales fueron creadas' };
    }
};

