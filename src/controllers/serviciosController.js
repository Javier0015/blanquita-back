import pool from '../config/db.js'


export async function listarServicios(
    req,
    res,
) {
    try {
        const resultado =
            await pool.query(`
                SELECT
                    s.id_servicio,
                    s.id_categoria,
                    s.nombre,
                    s.descripcion,
                    s.precio,
                    s.duracion_minutos,
                    s.imagen,
                    s.activo,
                    s.created_at,
                    s.updated_at,

                    c.nombre AS categoria

                FROM servicios s

                LEFT JOIN categorias_servicios c
                    ON c.id_categoria =
                       s.id_categoria

                ORDER BY
                    s.activo DESC,
                    c.nombre NULLS LAST,
                    s.nombre
            `)

        return res.json({
            ok: true,
            total:
                resultado.rowCount,
            servicios:
                resultado.rows.map(
                    (servicio) => ({
                        ...servicio,
                        precio:
                            Number(
                                servicio.precio,
                            ),
                        duracion_minutos:
                            Number(
                                servicio.duracion_minutos,
                            ),
                    }),
                ),
        })
    } catch (error) {
        console.error(
            'Error al listar servicios:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible consultar los servicios.',
        })
    }
}


export async function obtenerServicio(
    req,
    res,
) {
    try {
        const idServicio =
            Number(
                req.params.id,
            )

        if (
            !Number.isInteger(
                idServicio,
            ) ||
            idServicio <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Identificador de servicio inválido.',
            })
        }

        const resultado =
            await pool.query(
                `
                    SELECT
                        s.id_servicio,
                        s.id_categoria,
                        s.nombre,
                        s.descripcion,
                        s.precio,
                        s.duracion_minutos,
                        s.imagen,
                        s.activo,
                        s.created_at,
                        s.updated_at,

                        c.nombre AS categoria

                    FROM servicios s

                    LEFT JOIN categorias_servicios c
                        ON c.id_categoria =
                           s.id_categoria

                    WHERE
                        s.id_servicio = $1

                    LIMIT 1
                `,
                [
                    idServicio,
                ],
            )

        if (
            resultado.rowCount === 0
        ) {
            return res.status(404).json({
                ok: false,
                mensaje:
                    'El servicio no existe.',
            })
        }

        const servicio =
            resultado.rows[0]

        return res.json({
            ok: true,
            servicio: {
                ...servicio,
                precio:
                    Number(
                        servicio.precio,
                    ),
                duracion_minutos:
                    Number(
                        servicio.duracion_minutos,
                    ),
            },
        })
    } catch (error) {
        console.error(
            'Error al obtener servicio:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible consultar el servicio.',
        })
    }
}


export async function crearServicio(
    req,
    res,
) {
    try {
        const {
            id_categoria,
            nombre,
            descripcion,
            precio,
            duracion_minutos,
            imagen,
            activo = true,
        } = req.body

        if (
            !nombre ||
            !String(nombre).trim()
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'El nombre del servicio es obligatorio.',
            })
        }

        const precioNumero =
            Number(precio)

        if (
            Number.isNaN(
                precioNumero,
            ) ||
            precioNumero < 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'El precio debe ser un número válido mayor o igual a cero.',
            })
        }

        const duracionNumero =
            Number(
                duracion_minutos,
            )

        if (
            !Number.isInteger(
                duracionNumero,
            ) ||
            duracionNumero <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'La duración debe ser un número entero mayor a cero.',
            })
        }

        let categoriaId =
            null

        if (
            id_categoria !== null &&
            id_categoria !== undefined &&
            id_categoria !== ''
        ) {
            categoriaId =
                Number(
                    id_categoria,
                )

            if (
                !Number.isInteger(
                    categoriaId,
                ) ||
                categoriaId <= 0
            ) {
                return res.status(400).json({
                    ok: false,
                    mensaje:
                        'La categoría seleccionada no es válida.',
                })
            }

            const categoriaExiste =
                await pool.query(
                    `
                        SELECT
                            id_categoria
                        FROM categorias_servicios
                        WHERE
                            id_categoria = $1
                        LIMIT 1
                    `,
                    [
                        categoriaId,
                    ],
                )

            if (
                categoriaExiste.rowCount ===
                0
            ) {
                return res.status(400).json({
                    ok: false,
                    mensaje:
                        'La categoría seleccionada no existe.',
                })
            }
        }

        const resultado =
            await pool.query(
                `
                    INSERT INTO servicios (
                        id_categoria,
                        nombre,
                        descripcion,
                        precio,
                        duracion_minutos,
                        imagen,
                        activo
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7
                    )
                    RETURNING
                        id_servicio,
                        id_categoria,
                        nombre,
                        descripcion,
                        precio,
                        duracion_minutos,
                        imagen,
                        activo,
                        created_at,
                        updated_at
                `,
                [
                    categoriaId,
                    String(
                        nombre,
                    ).trim(),
                    descripcion
                        ? String(
                            descripcion,
                        ).trim()
                        : null,
                    precioNumero,
                    duracionNumero,
                    imagen
                        ? String(
                            imagen,
                        ).trim()
                        : null,
                    Boolean(
                        activo,
                    ),
                ],
            )

        const servicio =
            resultado.rows[0]

        return res.status(201).json({
            ok: true,
            mensaje:
                'Servicio creado correctamente.',
            servicio: {
                ...servicio,
                precio:
                    Number(
                        servicio.precio,
                    ),
                duracion_minutos:
                    Number(
                        servicio.duracion_minutos,
                    ),
            },
        })
    } catch (error) {
        console.error(
            'Error al crear servicio:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible crear el servicio.',
        })
    }
}


export async function actualizarServicio(
    req,
    res,
) {
    try {
        const idServicio =
            Number(
                req.params.id,
            )

        if (
            !Number.isInteger(
                idServicio,
            ) ||
            idServicio <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Identificador de servicio inválido.',
            })
        }

        const {
            id_categoria,
            nombre,
            descripcion,
            precio,
            duracion_minutos,
            imagen,
            activo,
        } = req.body

        if (
            !nombre ||
            !String(nombre).trim()
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'El nombre del servicio es obligatorio.',
            })
        }

        const precioNumero =
            Number(precio)

        if (
            Number.isNaN(
                precioNumero,
            ) ||
            precioNumero < 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'El precio debe ser un número válido mayor o igual a cero.',
            })
        }

        const duracionNumero =
            Number(
                duracion_minutos,
            )

        if (
            !Number.isInteger(
                duracionNumero,
            ) ||
            duracionNumero <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'La duración debe ser un número entero mayor a cero.',
            })
        }

        let categoriaId =
            null

        if (
            id_categoria !== null &&
            id_categoria !== undefined &&
            id_categoria !== ''
        ) {
            categoriaId =
                Number(
                    id_categoria,
                )

            if (
                !Number.isInteger(
                    categoriaId,
                ) ||
                categoriaId <= 0
            ) {
                return res.status(400).json({
                    ok: false,
                    mensaje:
                        'La categoría seleccionada no es válida.',
                })
            }

            const categoriaExiste =
                await pool.query(
                    `
                        SELECT
                            id_categoria
                        FROM categorias_servicios
                        WHERE
                            id_categoria = $1
                        LIMIT 1
                    `,
                    [
                        categoriaId,
                    ],
                )

            if (
                categoriaExiste.rowCount ===
                0
            ) {
                return res.status(400).json({
                    ok: false,
                    mensaje:
                        'La categoría seleccionada no existe.',
                })
            }
        }

        const resultado =
            await pool.query(
                `
                    UPDATE servicios
                    SET
                        id_categoria = $1,
                        nombre = $2,
                        descripcion = $3,
                        precio = $4,
                        duracion_minutos = $5,
                        imagen = $6,
                        activo = COALESCE(
                            $7,
                            activo
                        ),
                        updated_at = NOW()

                    WHERE
                        id_servicio = $8

                    RETURNING
                        id_servicio,
                        id_categoria,
                        nombre,
                        descripcion,
                        precio,
                        duracion_minutos,
                        imagen,
                        activo,
                        created_at,
                        updated_at
                `,
                [
                    categoriaId,
                    String(
                        nombre,
                    ).trim(),
                    descripcion
                        ? String(
                            descripcion,
                        ).trim()
                        : null,
                    precioNumero,
                    duracionNumero,
                    imagen
                        ? String(
                            imagen,
                        ).trim()
                        : null,
                    typeof activo ===
                    'boolean'
                        ? activo
                        : null,
                    idServicio,
                ],
            )

        if (
            resultado.rowCount === 0
        ) {
            return res.status(404).json({
                ok: false,
                mensaje:
                    'El servicio no existe.',
            })
        }

        const servicio =
            resultado.rows[0]

        return res.json({
            ok: true,
            mensaje:
                'Servicio actualizado correctamente.',
            servicio: {
                ...servicio,
                precio:
                    Number(
                        servicio.precio,
                    ),
                duracion_minutos:
                    Number(
                        servicio.duracion_minutos,
                    ),
            },
        })
    } catch (error) {
        console.error(
            'Error al actualizar servicio:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible actualizar el servicio.',
        })
    }
}


export async function cambiarEstadoServicio(
    req,
    res,
) {
    try {
        const idServicio =
            Number(
                req.params.id,
            )

        if (
            !Number.isInteger(
                idServicio,
            ) ||
            idServicio <= 0
        ) {
            return res.status(400).json({
                ok: false,
                mensaje:
                    'Identificador de servicio inválido.',
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
                    UPDATE servicios
                    SET
                        activo = $1,
                        updated_at = NOW()

                    WHERE
                        id_servicio = $2

                    RETURNING
                        id_servicio,
                        nombre,
                        activo,
                        updated_at
                `,
                [
                    activo,
                    idServicio,
                ],
            )

        if (
            resultado.rowCount === 0
        ) {
            return res.status(404).json({
                ok: false,
                mensaje:
                    'El servicio no existe.',
            })
        }

        return res.json({
            ok: true,
            mensaje:
                activo
                    ? 'Servicio activado correctamente.'
                    : 'Servicio desactivado correctamente.',
            servicio:
                resultado.rows[0],
        })
    } catch (error) {
        console.error(
            'Error al cambiar estado del servicio:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible cambiar el estado del servicio.',
        })
    }
}


export async function listarCategorias(
    req,
    res,
) {
    try {
        const resultado =
            await pool.query(`
                SELECT
                    id_categoria,
                    nombre,
                    descripcion,
                    activo,
                    created_at
                FROM categorias_servicios
                ORDER BY
                    activo DESC,
                    nombre
            `)

        return res.json({
            ok: true,
            categorias:
                resultado.rows,
        })
    } catch (error) {
        console.error(
            'Error al listar categorías:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible consultar las categorías.',
        })
    }
}