import crypto from 'node:crypto'

import pool from '../config/db.js'
import {
    probarConfiguracionSMTP,
} from '../services/correoService.js'


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


function cifrarTexto(texto) {
    if (!texto) {
        return null
    }

    const iv =
        crypto.randomBytes(12)

    const cipher =
        crypto.createCipheriv(
            ALGORITHM,
            obtenerClaveCifrado(),
            iv,
        )

    const encrypted =
        Buffer.concat([
            cipher.update(
                texto,
                'utf8',
            ),
            cipher.final(),
        ])

    const authTag =
        cipher.getAuthTag()

    return [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':')
}


function sanitizarConfiguracion(
    configuracion,
) {
    if (!configuracion) {
        return null
    }

    return {
        id_configuracion:
            configuracion.id_configuracion,

        nombre_estetica:
            configuracion.nombre_estetica,

        telefono:
            configuracion.telefono,

        correo_contacto:
            configuracion.correo_contacto,

        direccion:
            configuracion.direccion,

        correo_notificaciones:
            configuracion.correo_notificaciones,

        permitir_reservar_sin_cuenta:
            configuracion.permitir_reservar_sin_cuenta,

        confirmar_automaticamente:
            configuracion.confirmar_automaticamente,

        notificar_nueva_reservacion:
            configuracion.notificar_nueva_reservacion,

        notificar_cancelacion:
            configuracion.notificar_cancelacion,

        notificar_reprogramacion:
            configuracion.notificar_reprogramacion,

        smtp_host:
            configuracion.smtp_host,

        smtp_port:
            configuracion.smtp_port,

        smtp_secure:
            configuracion.smtp_secure,

        smtp_user:
            configuracion.smtp_user,

        smtp_from_name:
            configuracion.smtp_from_name,

        smtp_from_email:
            configuracion.smtp_from_email,

        smtp_activo:
            configuracion.smtp_activo,

        smtp_password_configurado:
            Boolean(
                configuracion.smtp_password,
            ),

        smtp_updated_at:
            configuracion.smtp_updated_at,

        created_at:
            configuracion.created_at,

        updated_at:
            configuracion.updated_at,
    }
}


export async function obtenerConfiguracion(
    req,
    res,
) {
    try {
        const resultado =
            await pool.query(`
                SELECT
                    id_configuracion,
                    nombre_estetica,
                    telefono,
                    correo_contacto,
                    direccion,
                    correo_notificaciones,

                    permitir_reservar_sin_cuenta,
                    confirmar_automaticamente,

                    notificar_nueva_reservacion,
                    notificar_cancelacion,
                    notificar_reprogramacion,

                    smtp_host,
                    smtp_port,
                    smtp_secure,
                    smtp_user,
                    smtp_password,
                    smtp_from_name,
                    smtp_from_email,
                    smtp_activo,
                    smtp_updated_at,

                    created_at,
                    updated_at

                FROM configuracion_negocio

                ORDER BY id_configuracion

                LIMIT 1
            `)


        if (
            resultado.rowCount ===
            0
        ) {
            const insercion =
                await pool.query(`
                    INSERT INTO configuracion_negocio (
                        nombre_estetica
                    )
                    VALUES (
                        'Estética'
                    )

                    RETURNING *
                `)


            return res.json({
                ok: true,

                configuracion:
                    sanitizarConfiguracion(
                        insercion.rows[0],
                    ),
            })
        }


        return res.json({
            ok: true,

            configuracion:
                sanitizarConfiguracion(
                    resultado.rows[0],
                ),
        })
    } catch (error) {
        console.error(
            'Error al obtener configuración:',
            error,
        )

        return res.status(500).json({
            ok: false,

            mensaje:
                'No fue posible obtener la configuración.',
        })
    }
}


export async function actualizarConfiguracion(
    req,
    res,
) {
    try {
        const {
            nombre_estetica,
            telefono,
            correo_contacto,
            direccion,
            correo_notificaciones,

            permitir_reservar_sin_cuenta,
            confirmar_automaticamente,

            notificar_nueva_reservacion,
            notificar_cancelacion,
            notificar_reprogramacion,

            smtp_host,
            smtp_port,
            smtp_secure,
            smtp_user,
            smtp_password,
            smtp_from_name,
            smtp_from_email,
            smtp_activo,
        } = req.body


        if (
            !nombre_estetica ||
            !String(
                nombre_estetica,
            ).trim()
        ) {
            return res.status(400).json({
                ok: false,

                mensaje:
                    'El nombre de la estética es obligatorio.',
            })
        }


        const puertoSMTP =
            smtp_port === null ||
            smtp_port === undefined ||
            smtp_port === ''
                ? 587
                : Number(
                    smtp_port,
                )


        if (
            !Number.isInteger(
                puertoSMTP,
            ) ||
            puertoSMTP <= 0 ||
            puertoSMTP > 65535
        ) {
            return res.status(400).json({
                ok: false,

                mensaje:
                    'El puerto SMTP no es válido.',
            })
        }


        const configuracionActual =
            await pool.query(`
                SELECT
                    id_configuracion,
                    smtp_password

                FROM configuracion_negocio

                ORDER BY id_configuracion

                LIMIT 1
            `)


        let passwordGuardado =
            configuracionActual
                .rows[0]
                ?.smtp_password ||
            null


        if (
            smtp_password &&
            String(
                smtp_password,
            ).trim()
        ) {
            passwordGuardado =
                cifrarTexto(
                    String(
                        smtp_password,
                    ).trim(),
                )
        }


        let resultado


        if (
            configuracionActual.rowCount ===
            0
        ) {
            resultado =
                await pool.query(
                    `
                        INSERT INTO configuracion_negocio (
                            nombre_estetica,
                            telefono,
                            correo_contacto,
                            direccion,
                            correo_notificaciones,

                            permitir_reservar_sin_cuenta,
                            confirmar_automaticamente,

                            notificar_nueva_reservacion,
                            notificar_cancelacion,
                            notificar_reprogramacion,

                            smtp_host,
                            smtp_port,
                            smtp_secure,
                            smtp_user,
                            smtp_password,
                            smtp_from_name,
                            smtp_from_email,
                            smtp_activo,
                            smtp_updated_at
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            $7,
                            $8,
                            $9,
                            $10,
                            $11,
                            $12,
                            $13,
                            $14,
                            $15,
                            $16,
                            $17,
                            $18,
                            NOW()
                        )

                        RETURNING *
                    `,
                    [
                        String(
                            nombre_estetica,
                        ).trim(),

                        telefono?.trim() ||
                        null,

                        correo_contacto?.trim() ||
                        null,

                        direccion?.trim() ||
                        null,

                        correo_notificaciones?.trim() ||
                        null,

                        Boolean(
                            permitir_reservar_sin_cuenta,
                        ),

                        Boolean(
                            confirmar_automaticamente,
                        ),

                        Boolean(
                            notificar_nueva_reservacion,
                        ),

                        Boolean(
                            notificar_cancelacion,
                        ),

                        Boolean(
                            notificar_reprogramacion,
                        ),

                        smtp_host?.trim() ||
                        null,

                        puertoSMTP,

                        Boolean(
                            smtp_secure,
                        ),

                        smtp_user?.trim() ||
                        null,

                        passwordGuardado,

                        smtp_from_name?.trim() ||
                        null,

                        smtp_from_email?.trim() ||
                        null,

                        Boolean(
                            smtp_activo,
                        ),
                    ],
                )
        } else {
            const idConfiguracion =
                configuracionActual
                    .rows[0]
                    .id_configuracion


            resultado =
                await pool.query(
                    `
                        UPDATE configuracion_negocio

                        SET
                            nombre_estetica = $1,
                            telefono = $2,
                            correo_contacto = $3,
                            direccion = $4,
                            correo_notificaciones = $5,

                            permitir_reservar_sin_cuenta = $6,
                            confirmar_automaticamente = $7,

                            notificar_nueva_reservacion = $8,
                            notificar_cancelacion = $9,
                            notificar_reprogramacion = $10,

                            smtp_host = $11,
                            smtp_port = $12,
                            smtp_secure = $13,
                            smtp_user = $14,
                            smtp_password = $15,
                            smtp_from_name = $16,
                            smtp_from_email = $17,
                            smtp_activo = $18,

                            smtp_updated_at = NOW(),
                            updated_at = NOW()

                        WHERE
                            id_configuracion = $19

                        RETURNING *
                    `,
                    [
                        String(
                            nombre_estetica,
                        ).trim(),

                        telefono?.trim() ||
                        null,

                        correo_contacto?.trim() ||
                        null,

                        direccion?.trim() ||
                        null,

                        correo_notificaciones?.trim() ||
                        null,

                        Boolean(
                            permitir_reservar_sin_cuenta,
                        ),

                        Boolean(
                            confirmar_automaticamente,
                        ),

                        Boolean(
                            notificar_nueva_reservacion,
                        ),

                        Boolean(
                            notificar_cancelacion,
                        ),

                        Boolean(
                            notificar_reprogramacion,
                        ),

                        smtp_host?.trim() ||
                        null,

                        puertoSMTP,

                        Boolean(
                            smtp_secure,
                        ),

                        smtp_user?.trim() ||
                        null,

                        passwordGuardado,

                        smtp_from_name?.trim() ||
                        null,

                        smtp_from_email?.trim() ||
                        null,

                        Boolean(
                            smtp_activo,
                        ),

                        idConfiguracion,
                    ],
                )
        }


        return res.json({
            ok: true,

            mensaje:
                'Configuración actualizada correctamente.',

            configuracion:
                sanitizarConfiguracion(
                    resultado.rows[0],
                ),
        })
    } catch (error) {
        console.error(
            'Error al actualizar configuración:',
            error,
        )

        return res.status(500).json({
            ok: false,

            mensaje:
                'No fue posible actualizar la configuración.',
        })
    }
}

export async function probarCorreo(
    req,
    res,
) {
    try {
        const {
            correo,
        } = req.body


        const resultado =
            await probarConfiguracionSMTP({
                destinatario:
                    correo?.trim() ||
                    undefined,
            })


        return res.json({
            ok: true,

            mensaje:
                `Correo de prueba enviado correctamente a ${resultado.destinatario}.`,

            destinatario:
                resultado.destinatario,
        })
    } catch (error) {
        console.error(
            'Error al probar SMTP:',
            error,
        )


        let mensaje =
            error.message ||
            'No fue posible enviar el correo de prueba.'


        if (
            error.code ===
            'EAUTH'
        ) {
            mensaje =
                'Gmail rechazó las credenciales SMTP. Verifica el usuario y la contraseña de aplicación.'
        }


        if (
            error.code ===
            'ECONNECTION' ||
            error.code ===
            'ETIMEDOUT'
        ) {
            mensaje =
                'No fue posible conectar con el servidor SMTP. Verifica host, puerto y conexión segura.'
        }


        return res.status(500).json({
            ok: false,
            mensaje,
        })
    }
}