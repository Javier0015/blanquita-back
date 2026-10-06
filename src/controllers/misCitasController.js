import pool from '../config/db.js'


/* =========================================================
   CONSULTAR CITAS PÚBLICAS POR CORREO O TELÉFONO

   POST /api/citas/mis-citas

   BODY:
   {
       "contacto": "7711234567"
   }

   O:
   {
       "contacto": "cliente@gmail.com"
   }
========================================================= */

export async function consultarMisCitas(
    req,
    res,
) {
    try {
        const contacto =
            String(
                req.body?.contacto ||
                '',
            ).trim()


        if (!contacto) {
            return res
                .status(400)
                .json({
                    ok: false,

                    mensaje:
                        'Escribe tu correo o número de teléfono.',
                })
        }


        const esCorreo =
            contacto.includes('@')


        let resultado


        if (esCorreo) {
            resultado =
                await buscarPorCorreo(
                    contacto,
                )
        } else {
            const telefono =
                normalizarTelefono(
                    contacto,
                )


            if (
                telefono.length <
                10
            ) {
                return res
                    .status(400)
                    .json({
                        ok: false,

                        mensaje:
                            'Escribe un número de teléfono válido.',
                    })
            }


            resultado =
                await buscarPorTelefono(
                    telefono,
                )
        }


        /*
         * No devolvemos 404.
         *
         * Para una consulta pública es mejor responder
         * correctamente con un arreglo vacío.
         */
        if (
            resultado.rows.length ===
            0
        ) {
            return res.json({
                ok: true,

                encontrado:
                    false,

                mensaje:
                    'No encontramos citas relacionadas con esos datos.',

                citas:
                    [],
            })
        }


        const citas =
            resultado.rows.map(
                normalizarCita,
            )


        return res.json({
            ok: true,

            encontrado:
                true,

            total:
                citas.length,

            cliente: {
                nombre:
                    resultado.rows[0]
                        .cliente_nombre,
            },

            citas,
        })
    } catch (error) {
        console.error(
            'Error al consultar citas públicas:',
            error,
        )


        return res
            .status(500)
            .json({
                ok: false,

                mensaje:
                    'No fue posible consultar tus citas.',
            })
    }
}


/* =========================================================
   BUSCAR POR CORREO
========================================================= */

async function buscarPorCorreo(
    correo,
) {
    return pool.query(
        `
            SELECT
                c.id_cita,
                c.folio,
                c.estado,

                c.fecha_solicitada,
                c.hora_inicio_solicitada,
                c.hora_fin_solicitada,

                c.fecha_confirmada,
                c.hora_inicio_confirmada,
                c.hora_fin_confirmada,

                c.total_estimado,

                c.observaciones_cliente,
                c.observaciones_admin,

                c.created_at,
                c.updated_at,

                cl.nombre
                    AS cliente_nombre,

                COALESCE(
                    json_agg(
                        json_build_object(
                            'id_servicio',
                            cs.id_servicio,

                            'nombre',
                            cs.nombre_servicio,

                            'precio',
                            cs.precio,

                            'duracion_minutos',
                            cs.duracion_minutos
                        )
                        ORDER BY
                            cs.id_cita_servicio
                    )
                    FILTER (
                        WHERE
                            cs.id_cita_servicio
                            IS NOT NULL
                    ),
                    '[]'::json
                ) AS servicios

            FROM citas c

            JOIN clientes cl
                ON cl.id_cliente =
                   c.id_cliente

            LEFT JOIN cita_servicios cs
                ON cs.id_cita =
                   c.id_cita

            WHERE
                LOWER(
                    TRIM(
                        COALESCE(
                            cl.correo,
                            ''
                        )
                    )
                ) =
                LOWER(
                    TRIM($1)
                )

            GROUP BY
                c.id_cita,
                cl.id_cliente

            ORDER BY

                CASE
                    WHEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) >= CURRENT_DATE
                    THEN 0

                    ELSE 1
                END ASC,

                CASE
                    WHEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) >= CURRENT_DATE
                    THEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        )
                END ASC,

                CASE
                    WHEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) < CURRENT_DATE
                    THEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        )
                END DESC,

                COALESCE(
                    c.hora_inicio_confirmada,
                    c.hora_inicio_solicitada
                ) ASC
        `,
        [
            correo,
        ],
    )
}


/* =========================================================
   BUSCAR POR TELÉFONO

   PostgreSQL elimina:
   espacios
   guiones
   paréntesis
   cualquier carácter que no sea número
========================================================= */

async function buscarPorTelefono(
    telefono,
) {
    return pool.query(
        `
            SELECT
                c.id_cita,
                c.folio,
                c.estado,

                c.fecha_solicitada,
                c.hora_inicio_solicitada,
                c.hora_fin_solicitada,

                c.fecha_confirmada,
                c.hora_inicio_confirmada,
                c.hora_fin_confirmada,

                c.total_estimado,

                c.observaciones_cliente,
                c.observaciones_admin,

                c.created_at,
                c.updated_at,

                cl.nombre
                    AS cliente_nombre,

                COALESCE(
                    json_agg(
                        json_build_object(
                            'id_servicio',
                            cs.id_servicio,

                            'nombre',
                            cs.nombre_servicio,

                            'precio',
                            cs.precio,

                            'duracion_minutos',
                            cs.duracion_minutos
                        )
                        ORDER BY
                            cs.id_cita_servicio
                    )
                    FILTER (
                        WHERE
                            cs.id_cita_servicio
                            IS NOT NULL
                    ),
                    '[]'::json
                ) AS servicios

            FROM citas c

            JOIN clientes cl
                ON cl.id_cliente =
                   c.id_cliente

            LEFT JOIN cita_servicios cs
                ON cs.id_cita =
                   c.id_cita

            WHERE
                REGEXP_REPLACE(
                    COALESCE(
                        cl.telefono,
                        ''
                    ),
                    '[^0-9]',
                    '',
                    'g'
                ) = $1

            GROUP BY
                c.id_cita,
                cl.id_cliente

            ORDER BY

                CASE
                    WHEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) >= CURRENT_DATE
                    THEN 0

                    ELSE 1
                END ASC,

                CASE
                    WHEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) >= CURRENT_DATE
                    THEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        )
                END ASC,

                CASE
                    WHEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) < CURRENT_DATE
                    THEN
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        )
                END DESC,

                COALESCE(
                    c.hora_inicio_confirmada,
                    c.hora_inicio_solicitada
                ) ASC
        `,
        [
            telefono,
        ],
    )
}


/* =========================================================
   NORMALIZAR RESPUESTA
========================================================= */

function normalizarCita(
    fila,
) {
    const fecha =
        fila.fecha_confirmada ||
        fila.fecha_solicitada


    const horaInicio =
        fila.hora_inicio_confirmada ||
        fila.hora_inicio_solicitada


    const horaFin =
        fila.hora_fin_confirmada ||
        fila.hora_fin_solicitada


    return {
        id_cita:
            fila.id_cita,

        /*
         * Podemos devolver el folio aunque el cliente
         * no necesite escribirlo.
         */
        folio:
            fila.folio,

        estado:
            fila.estado,

        estado_texto:
            obtenerTextoEstado(
                fila.estado,
            ),

        fecha:
            formatearFechaBD(
                fecha,
            ),

        hora_inicio:
            normalizarHora(
                horaInicio,
            ),

        hora_fin:
            normalizarHora(
                horaFin,
            ),

        total_estimado:
            Number(
                fila.total_estimado ||
                0,
            ),

        servicios:
            Array.isArray(
                fila.servicios,
            )
                ? fila.servicios.map(
                    (
                        servicio,
                    ) => ({
                        id_servicio:
                            servicio
                                .id_servicio,

                        nombre:
                            servicio
                                .nombre,

                        precio:
                            Number(
                                servicio
                                    .precio ||
                                0,
                            ),

                        duracion_minutos:
                            Number(
                                servicio
                                    .duracion_minutos ||
                                0,
                            ),
                    }),
                )
                : [],

        observaciones_cliente:
            fila
                .observaciones_cliente ||
            null,

        /*
         * Por el momento no exponemos
         * observaciones_admin.
         *
         * Algunas notas administrativas
         * podrían no ser apropiadas para
         * mostrarse al público.
         */

        creada_en:
            fila.created_at,

        actualizada_en:
            fila.updated_at,
    }
}


/* =========================================================
   ESTADOS
========================================================= */

function obtenerTextoEstado(
    estado,
) {
    const estados = {
        PENDIENTE:
            'Pendiente de confirmación',

        CONFIRMADA:
            'Confirmada',

        REPROGRAMACION_PENDIENTE:
            'Nuevo horario propuesto',

        RECHAZADA:
            'No confirmada',

        CANCELADA_CLIENTE:
            'Cancelada',

        CANCELADA_ADMIN:
            'Cancelada por la estética',

        FINALIZADA:
            'Finalizada',

        NO_ASISTIO:
            'No asistió',
    }


    return (
        estados[estado] ||
        estado ||
        'Sin estado'
    )
}


/* =========================================================
   TELÉFONO
========================================================= */

function normalizarTelefono(
    telefono,
) {
    return String(
        telefono ||
        '',
    ).replace(
        /\D/g,
        '',
    )
}


/* =========================================================
   HORA
========================================================= */

function normalizarHora(
    hora,
) {
    if (!hora) {
        return ''
    }


    return String(
        hora,
    ).substring(
        0,
        5,
    )
}


/* =========================================================
   FECHA
========================================================= */

function formatearFechaBD(
    fecha,
) {
    if (!fecha) {
        return null
    }


    if (
        typeof fecha ===
        'string'
    ) {
        return fecha.substring(
            0,
            10,
        )
    }


    const anio =
        fecha.getFullYear()


    const mes =
        String(
            fecha.getMonth() +
            1,
        ).padStart(
            2,
            '0',
        )


    const dia =
        String(
            fecha.getDate(),
        ).padStart(
            2,
            '0',
        )


    return `${anio}-${mes}-${dia}`
}