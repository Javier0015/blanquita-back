import crypto from 'node:crypto'

import nodemailer from 'nodemailer'

import pool from '../config/db.js'


const ALGORITHM = 'aes-256-gcm'


function obtenerClaveCifrado() {
    const clave =
        process.env.SMTP_ENCRYPTION_KEY

    if (!clave) {
        throw new Error(
            'No está configurada SMTP_ENCRYPTION_KEY.',
        )
    }

    return crypto
        .createHash('sha256')
        .update(clave)
        .digest()
}


export function descifrarTexto(
    textoCifrado,
) {
    if (!textoCifrado) {
        return ''
    }

    const partes =
        String(
            textoCifrado,
        ).split(':')

    if (
        partes.length !== 3
    ) {
        throw new Error(
            'La contraseña SMTP guardada no tiene un formato válido.',
        )
    }

    const [
        ivBase64,
        authTagBase64,
        encryptedBase64,
    ] = partes

    const iv =
        Buffer.from(
            ivBase64,
            'base64',
        )

    const authTag =
        Buffer.from(
            authTagBase64,
            'base64',
        )

    const encrypted =
        Buffer.from(
            encryptedBase64,
            'base64',
        )

    const decipher =
        crypto.createDecipheriv(
            ALGORITHM,
            obtenerClaveCifrado(),
            iv,
        )

    decipher.setAuthTag(
        authTag,
    )

    const decrypted =
        Buffer.concat([
            decipher.update(
                encrypted,
            ),
            decipher.final(),
        ])

    return decrypted.toString(
        'utf8',
    )
}


export async function obtenerConfiguracionSMTP() {
    const resultado =
        await pool.query(`
            SELECT
                id_configuracion,
                nombre_estetica,

                correo_notificaciones,

                smtp_host,
                smtp_port,
                smtp_secure,
                smtp_user,
                smtp_password,
                smtp_from_name,
                smtp_from_email,
                smtp_activo

            FROM configuracion_negocio

            ORDER BY id_configuracion

            LIMIT 1
        `)


    if (
        resultado.rowCount === 0
    ) {
        throw new Error(
            'No existe configuración del negocio.',
        )
    }


    const config =
        resultado.rows[0]


    return {
        ...config,

        smtp_password_descifrado:
            config.smtp_password
                ? descifrarTexto(
                    config.smtp_password,
                )
                : '',
    }
}


export async function crearTransporterSMTP() {
    const config =
        await obtenerConfiguracionSMTP()


    if (
        !config.smtp_activo
    ) {
        throw new Error(
            'El envío de correos SMTP está desactivado.',
        )
    }


    if (
        !config.smtp_host
    ) {
        throw new Error(
            'No se ha configurado el servidor SMTP.',
        )
    }


    if (
        !config.smtp_user
    ) {
        throw new Error(
            'No se ha configurado el usuario SMTP.',
        )
    }


    if (
        !config.smtp_password_descifrado
    ) {
        throw new Error(
            'No se ha configurado la contraseña SMTP.',
        )
    }


    const transporter =
        nodemailer.createTransport({
            host:
                config.smtp_host,

            port:
                Number(
                    config.smtp_port ||
                    587,
                ),

            secure:
                Boolean(
                    config.smtp_secure,
                ),

            auth: {
                user:
                    config.smtp_user,

                pass:
                    config.smtp_password_descifrado,
            },

            requireTLS:
                !Boolean(
                    config.smtp_secure,
                ),
        })


    return {
        transporter,
        config,
    }
}


export async function probarConfiguracionSMTP({
    destinatario,
}) {
    const {
        transporter,
        config,
    } =
        await crearTransporterSMTP()


    await transporter.verify()


    const para =
        destinatario ||
        config.correo_notificaciones ||
        config.smtp_from_email ||
        config.smtp_user


    if (!para) {
        throw new Error(
            'No hay un correo destinatario para realizar la prueba.',
        )
    }


    const fromEmail =
        config.smtp_from_email ||
        config.smtp_user


    const fromName =
        config.smtp_from_name ||
        config.nombre_estetica ||
        'Estética'


    const info =
        await transporter.sendMail({
            from:
                `"${fromName}" <${fromEmail}>`,

            to:
                para,

            subject:
                'Prueba de correo SMTP',

            text:
                'La configuración SMTP del sistema de citas funciona correctamente.',

            html:
                `
                    <div
                        style="
                            font-family:
                                Arial,
                                sans-serif;

                            max-width:
                                600px;

                            margin:
                                0 auto;

                            color:
                                #444;
                        "
                    >
                        <div
                            style="
                                background:
                                    #f472b6;

                                color:
                                    white;

                                padding:
                                    24px;

                                border-radius:
                                    18px 18px 0 0;
                            "
                        >
                            <h2
                                style="
                                    margin:
                                        0;
                                "
                            >
                                Correo de prueba
                            </h2>
                        </div>

                        <div
                            style="
                                padding:
                                    24px;

                                border:
                                    1px solid #fce7f3;

                                border-top:
                                    0;

                                border-radius:
                                    0 0 18px 18px;
                            "
                        >
                            <p>
                                La configuración SMTP funciona correctamente.
                            </p>

                            <p>
                                El sistema ya puede enviar notificaciones por correo.
                            </p>

                            <p
                                style="
                                    margin-top:
                                        24px;

                                    color:
                                        #999;

                                    font-size:
                                        12px;
                                "
                            >
                                ${fromName}
                            </p>
                        </div>
                    </div>
                `,
        })


    return {
        destinatario:
            para,

        messageId:
            info.messageId,
    }
}