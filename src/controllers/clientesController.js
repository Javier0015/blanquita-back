import pool from '../config/db.js'


export async function listarClientes(
    req,
    res,
) {
    try {
        const resultado =
            await pool.query(`
                SELECT
                    cl.id_cliente,
                    cl.nombre,
                    cl.telefono,
                    cl.correo,
                    cl.cuenta_activa,
                    cl.activo,
                    cl.created_at,
                    cl.updated_at,

                    COUNT(c.id_cita)::INT
                        AS total_citas,

                    MAX(
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        )
                    ) AS ultima_cita

                FROM clientes cl

                LEFT JOIN citas c
                    ON c.id_cliente =
                       cl.id_cliente

                GROUP BY
                    cl.id_cliente

                ORDER BY
                    cl.activo DESC,
                    cl.nombre ASC
            `)

        return res.json({
            ok: true,

            total:
                resultado.rowCount,

            clientes:
                resultado.rows.map(
                    (
                        cliente,
                    ) => ({
                        ...cliente,

                        total_citas:
                            Number(
                                cliente.total_citas ||
                                0,
                            ),

                        ultima_cita:
                            formatearFechaBD(
                                cliente.ultima_cita,
                            ),
                    }),
                ),
        })
    } catch (error) {
        console.error(
            'Error al listar clientes:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible consultar los clientes.',
        })
    }
}


export async function obtenerCliente(
    req,
    res,
) {
    try {
        const idCliente =
            Number(
                req.params.id,
            )

        if (
            !Number.isInteger(
                idCliente,
            ) ||
            idCliente <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Identificador de cliente inválido.',
            })
        }

        const resultado =
            await pool.query(
                `
                    SELECT
                        cl.id_cliente,
                        cl.nombre,
                        cl.telefono,
                        cl.correo,
                        cl.cuenta_activa,
                        cl.activo,
                        cl.created_at,
                        cl.updated_at,

                        COUNT(c.id_cita)::INT
                            AS total_citas,

                        MAX(
                            COALESCE(
                                c.fecha_confirmada,
                                c.fecha_solicitada
                            )
                        ) AS ultima_cita

                    FROM clientes cl

                    LEFT JOIN citas c
                        ON c.id_cliente =
                           cl.id_cliente

                    WHERE
                        cl.id_cliente = $1

                    GROUP BY
                        cl.id_cliente

                    LIMIT 1
                `,
                [
                    idCliente,
                ],
            )

        if (
            resultado.rowCount === 0
        ) {
            return res.status(404).json({
                ok: false,
                mensaje:
                    'El cliente no existe.',
            })
        }

        const cliente =
            resultado.rows[0]

        return res.json({
            ok: true,

            cliente: {
                ...cliente,

                total_citas:
                    Number(
                        cliente.total_citas ||
                        0,
                    ),

                ultima_cita:
                    formatearFechaBD(
                        cliente.ultima_cita,
                    ),
            },
        })
    } catch (error) {
        console.error(
            'Error al obtener cliente:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible consultar el cliente.',
        })
    }
}


export async function crearCliente(
    req,
    res,
) {
    try {
        const {
            nombre,
            telefono,
            correo,
            cuenta_activa = false,
            activo = true,
        } = req.body


        if (
            !nombre ||
            !String(
                nombre,
            ).trim()
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'El nombre es obligatorio.',
            })
        }


        const telefonoLimpio =
            telefono
                ? String(
                    telefono,
                ).trim()
                : null


        const correoLimpio =
            correo
                ? String(
                    correo,
                )
                    .trim()
                    .toLowerCase()
                : null


        if (
            !telefonoLimpio &&
            !correoLimpio
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Proporciona teléfono o correo.',
            })
        }


        if (
            correoLimpio
        ) {
            const correoExiste =
                await pool.query(
                    `
                        SELECT
                            id_cliente
                        FROM clientes
                        WHERE
                            LOWER(correo) =
                            LOWER($1)
                        LIMIT 1
                    `,
                    [
                        correoLimpio,
                    ],
                )

            if (
                correoExiste.rowCount >
                0
            ) {
                return res.status(409).json({
                    ok: false,
                    mensaje:
                        'Ya existe un cliente con ese correo.',
                })
            }
        }


        if (
            telefonoLimpio
        ) {
            const telefonoExiste =
                await pool.query(
                    `
                        SELECT
                            id_cliente
                        FROM clientes
                        WHERE
                            telefono = $1
                        LIMIT 1
                    `,
                    [
                        telefonoLimpio,
                    ],
                )

            if (
                telefonoExiste.rowCount >
                0
            ) {
                return res.status(409).json({
                    ok: false,
                    mensaje:
                        'Ya existe un cliente con ese teléfono.',
                })
            }
        }


        const resultado =
            await pool.query(
                `
                    INSERT INTO clientes (
                        nombre,
                        telefono,
                        correo,
                        cuenta_activa,
                        activo
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5
                    )

                    RETURNING
                        id_cliente,
                        nombre,
                        telefono,
                        correo,
                        cuenta_activa,
                        activo,
                        created_at,
                        updated_at
                `,
                [
                    String(
                        nombre,
                    ).trim(),

                    telefonoLimpio,

                    correoLimpio,

                    Boolean(
                        cuenta_activa,
                    ),

                    Boolean(
                        activo,
                    ),
                ],
            )


        return res.status(201).json({
            ok: true,

            mensaje:
                'Cliente creado correctamente.',

            cliente:
                resultado.rows[0],
        })
    } catch (error) {
        console.error(
            'Error al crear cliente:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible crear el cliente.',
        })
    }
}


export async function actualizarCliente(
    req,
    res,
) {
    try {
        const idCliente =
            Number(
                req.params.id,
            )


        if (
            !Number.isInteger(
                idCliente,
            ) ||
            idCliente <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Identificador de cliente inválido.',
            })
        }


        const {
            nombre,
            telefono,
            correo,
            cuenta_activa,
            activo,
        } = req.body


        if (
            !nombre ||
            !String(
                nombre,
            ).trim()
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'El nombre es obligatorio.',
            })
        }


        const telefonoLimpio =
            telefono
                ? String(
                    telefono,
                ).trim()
                : null


        const correoLimpio =
            correo
                ? String(
                    correo,
                )
                    .trim()
                    .toLowerCase()
                : null


        if (
            !telefonoLimpio &&
            !correoLimpio
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Proporciona teléfono o correo.',
            })
        }


        if (
            correoLimpio
        ) {
            const correoExiste =
                await pool.query(
                    `
                        SELECT
                            id_cliente
                        FROM clientes
                        WHERE
                            LOWER(correo) =
                            LOWER($1)
                            AND id_cliente <> $2
                        LIMIT 1
                    `,
                    [
                        correoLimpio,
                        idCliente,
                    ],
                )

            if (
                correoExiste.rowCount >
                0
            ) {
                return res.status(409).json({
                    ok: false,
                    mensaje:
                        'Ya existe otro cliente con ese correo.',
                })
            }
        }


        if (
            telefonoLimpio
        ) {
            const telefonoExiste =
                await pool.query(
                    `
                        SELECT
                            id_cliente
                        FROM clientes
                        WHERE
                            telefono = $1
                            AND id_cliente <> $2
                        LIMIT 1
                    `,
                    [
                        telefonoLimpio,
                        idCliente,
                    ],
                )

            if (
                telefonoExiste.rowCount >
                0
            ) {
                return res.status(409).json({
                    ok: false,
                    mensaje:
                        'Ya existe otro cliente con ese teléfono.',
                })
            }
        }


        const resultado =
            await pool.query(
                `
                    UPDATE clientes
                    SET
                        nombre = $1,
                        telefono = $2,
                        correo = $3,

                        cuenta_activa =
                            COALESCE(
                                $4,
                                cuenta_activa
                            ),

                        activo =
                            COALESCE(
                                $5,
                                activo
                            ),

                        updated_at =
                            NOW()

                    WHERE
                        id_cliente = $6

                    RETURNING
                        id_cliente,
                        nombre,
                        telefono,
                        correo,
                        cuenta_activa,
                        activo,
                        created_at,
                        updated_at
                `,
                [
                    String(
                        nombre,
                    ).trim(),

                    telefonoLimpio,

                    correoLimpio,

                    typeof cuenta_activa ===
                    'boolean'
                        ? cuenta_activa
                        : null,

                    typeof activo ===
                    'boolean'
                        ? activo
                        : null,

                    idCliente,
                ],
            )


        if (
            resultado.rowCount === 0
        ) {
            return res.status(404).json({
                ok: false,
                mensaje:
                    'El cliente no existe.',
            })
        }


        return res.json({
            ok: true,

            mensaje:
                'Cliente actualizado correctamente.',

            cliente:
                resultado.rows[0],
        })
    } catch (error) {
        console.error(
            'Error al actualizar cliente:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible actualizar el cliente.',
        })
    }
}


export async function cambiarEstadoCliente(
    req,
    res,
) {
    try {
        const idCliente =
            Number(
                req.params.id,
            )


        if (
            !Number.isInteger(
                idCliente,
            ) ||
            idCliente <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Identificador de cliente inválido.',
            })
        }


        const {
            activo,
        } = req.body


        if (
            typeof activo !==
            'boolean'
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'El estado activo es obligatorio.',
            })
        }


        const resultado =
            await pool.query(
                `
                    UPDATE clientes
                    SET
                        activo = $1,
                        updated_at = NOW()

                    WHERE
                        id_cliente = $2

                    RETURNING
                        id_cliente,
                        nombre,
                        activo,
                        updated_at
                `,
                [
                    activo,
                    idCliente,
                ],
            )


        if (
            resultado.rowCount === 0
        ) {
            return res.status(404).json({
                ok: false,
                mensaje:
                    'El cliente no existe.',
            })
        }


        return res.json({
            ok: true,

            mensaje:
                activo
                    ? 'Cliente activado correctamente.'
                    : 'Cliente desactivado correctamente.',

            cliente:
                resultado.rows[0],
        })
    } catch (error) {
        console.error(
            'Error al cambiar estado del cliente:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible cambiar el estado del cliente.',
        })
    }
}


export async function listarCitasCliente(
    req,
    res,
) {
    try {
        const idCliente =
            Number(
                req.params.id,
            )


        if (
            !Number.isInteger(
                idCliente,
            ) ||
            idCliente <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Identificador de cliente inválido.',
            })
        }


        const clienteResultado =
            await pool.query(
                `
                    SELECT
                        id_cliente,
                        nombre,
                        telefono,
                        correo,
                        cuenta_activa,
                        activo
                    FROM clientes
                    WHERE
                        id_cliente = $1
                    LIMIT 1
                `,
                [
                    idCliente,
                ],
            )


        if (
            clienteResultado.rowCount ===
            0
        ) {
            return res.status(404).json({
                ok: false,
                mensaje:
                    'El cliente no existe.',
            })
        }


        const citasResultado =
            await pool.query(
                `
                    SELECT
                        c.id_cita,
                        c.folio,

                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) AS fecha,

                        COALESCE(
                            c.hora_inicio_confirmada,
                            c.hora_inicio_solicitada
                        ) AS hora_inicio,

                        COALESCE(
                            c.hora_fin_confirmada,
                            c.hora_fin_solicitada
                        ) AS hora_fin,

                        c.estado,
                        c.total_estimado,
                        c.origen,
                        c.observaciones_cliente,
                        c.observaciones_admin,

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

                    LEFT JOIN cita_servicios cs
                        ON cs.id_cita =
                           c.id_cita

                    WHERE
                        c.id_cliente = $1

                    GROUP BY
                        c.id_cita

                    ORDER BY
                        COALESCE(
                            c.fecha_confirmada,
                            c.fecha_solicitada
                        ) DESC,

                        COALESCE(
                            c.hora_inicio_confirmada,
                            c.hora_inicio_solicitada
                        ) DESC
                `,
                [
                    idCliente,
                ],
            )


        return res.json({
            ok: true,

            cliente:
                clienteResultado.rows[0],

            citas:
                citasResultado.rows.map(
                    (
                        cita,
                    ) => ({
                        ...cita,

                        fecha:
                            formatearFechaBD(
                                cita.fecha,
                            ),

                        hora_inicio:
                            normalizarHora(
                                cita.hora_inicio,
                            ),

                        hora_fin:
                            normalizarHora(
                                cita.hora_fin,
                            ),

                        total_estimado:
                            Number(
                                cita.total_estimado ||
                                0,
                            ),

                        servicios:
                            Array.isArray(
                                cita.servicios,
                            )
                                ? cita.servicios.map(
                                    (
                                        servicio,
                                    ) => ({
                                        ...servicio,

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
                    }),
                ),
        })
    } catch (error) {
        console.error(
            'Error al consultar citas del cliente:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible consultar el historial del cliente.',
        })
    }
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