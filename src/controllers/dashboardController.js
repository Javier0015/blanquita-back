import pool from '../config/db.js'


export async function obtenerDashboard(
    req,
    res,
) {
    try {
        const fecha =
            obtenerFechaActual()

        const resumenResultado =
            await pool.query(
                `
                    SELECT
                        COUNT(*)::INT AS total,

                        COUNT(*) FILTER (
                            WHERE estado = 'CONFIRMADA'
                        )::INT AS confirmadas,

                        COUNT(*) FILTER (
                            WHERE estado = 'PENDIENTE'
                        )::INT AS pendientes,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN estado IN (
                                        'CONFIRMADA',
                                        'FINALIZADA'
                                    )
                                    THEN total_estimado
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS total_estimado

                    FROM citas

                    WHERE
                        COALESCE(
                            fecha_confirmada,
                            fecha_solicitada
                        ) = $1
                `,
                [
                    fecha,
                ],
            )


        const citasResultado =
            await pool.query(
                `
                    SELECT
                        c.id_cita,
                        c.folio,

                        c.fecha_solicitada,
                        c.hora_inicio_solicitada,
                        c.hora_fin_solicitada,

                        c.fecha_confirmada,
                        c.hora_inicio_confirmada,
                        c.hora_fin_confirmada,

                        c.estado,
                        c.total_estimado,
                        c.origen,

                        cl.id_cliente,
                        cl.nombre AS cliente_nombre,
                        cl.telefono,
                        cl.correo,

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
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) = $1

                    GROUP BY
                        c.id_cita,
                        cl.id_cliente

                    ORDER BY
                        COALESCE(
                            c.hora_inicio_confirmada,
                            c.hora_inicio_solicitada
                        ) ASC
                `,
                [
                    fecha,
                ],
            )


        const ahora =
            obtenerHoraActualMinutos()

        let proximaCita =
            null


        for (
            const cita
            of citasResultado.rows
        ) {
            if (
                [
                    'RECHAZADA',
                    'CANCELADA_CLIENTE',
                    'CANCELADA_ADMIN',
                    'NO_ASISTIO',
                    'FINALIZADA',
                ].includes(
                    cita.estado,
                )
            ) {
                continue
            }

            const horaInicio =
                cita.hora_inicio_confirmada ||
                cita.hora_inicio_solicitada

            const minutosInicio =
                horaAMinutos(
                    horaInicio,
                )

            if (
                minutosInicio >=
                ahora
            ) {
                proximaCita =
                    normalizarCita(
                        cita,
                    )

                break
            }
        }


        return res.json({
            ok: true,

            fecha,

            resumen: {
                total:
                    resumenResultado
                        .rows[0]
                        .total,

                confirmadas:
                    resumenResultado
                        .rows[0]
                        .confirmadas,

                pendientes:
                    resumenResultado
                        .rows[0]
                        .pendientes,

                total_estimado:
                    Number(
                        resumenResultado
                            .rows[0]
                            .total_estimado ||
                        0,
                    ),
            },

            proxima_cita:
                proximaCita,

            citas:
                citasResultado
                    .rows
                    .map(
                        (
                            cita,
                        ) =>
                            normalizarCita(
                                cita,
                            ),
                    ),
        })
    } catch (error) {
        console.error(
            'Error al obtener dashboard:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible cargar el dashboard.',
        })
    }
}


function normalizarCita(
    cita,
) {
    return {
        id_cita:
            cita.id_cita,

        folio:
            cita.folio,

        fecha:
            formatearFechaBD(
                cita.fecha_confirmada ||
                cita.fecha_solicitada,
            ),

        hora_inicio:
            normalizarHora(
                cita.hora_inicio_confirmada ||
                cita.hora_inicio_solicitada,
            ),

        hora_fin:
            normalizarHora(
                cita.hora_fin_confirmada ||
                cita.hora_fin_solicitada,
            ),

        estado:
            cita.estado,

        total_estimado:
            Number(
                cita.total_estimado ||
                0,
            ),

        origen:
            cita.origen,

        cliente: {
            id_cliente:
                cita.id_cliente,

            nombre:
                cita.cliente_nombre,

            telefono:
                cita.telefono,

            correo:
                cita.correo,
        },

        servicios:
            Array.isArray(
                cita.servicios,
            )
                ? cita.servicios.map(
                    (
                        servicio,
                    ) => ({
                        id_servicio:
                            servicio.id_servicio,

                        nombre:
                            servicio.nombre,

                        precio:
                            Number(
                                servicio.precio ||
                                0,
                            ),

                        duracion_minutos:
                            Number(
                                servicio.duracion_minutos ||
                                0,
                            ),
                    }),
                )
                : [],
    }
}


function obtenerFechaActual() {
    const ahora =
        new Date()

    const anio =
        ahora.getFullYear()

    const mes =
        String(
            ahora.getMonth() +
            1,
        ).padStart(
            2,
            '0',
        )

    const dia =
        String(
            ahora.getDate(),
        ).padStart(
            2,
            '0',
        )

    return `${anio}-${mes}-${dia}`
}


function obtenerHoraActualMinutos() {
    const ahora =
        new Date()

    return (
        ahora.getHours() *
            60 +
        ahora.getMinutes()
    )
}


function horaAMinutos(
    hora,
) {
    if (!hora) {
        return 0
    }

    const [
        horas,
        minutos,
    ] =
        String(hora)
            .substring(
                0,
                5,
            )
            .split(':')
            .map(Number)

    return (
        horas *
            60 +
        minutos
    )
}


function normalizarHora(
    hora,
) {
    if (!hora) {
        return null
    }

    return String(
        hora,
    ).substring(
        0,
        5,
    )
}


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