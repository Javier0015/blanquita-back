import pool from '../config/db.js'


export async function listarServiciosPublicos(
    req,
    res,
) {
    try {
        const resultado =
            await pool.query(`
                SELECT
                    s.id_servicio,
                    s.nombre,
                    s.descripcion,
                    s.precio,
                    s.duracion_minutos,
                    s.imagen,

                    c.id_categoria,
                    c.nombre AS categoria

                FROM servicios s

                LEFT JOIN categorias_servicios c
                    ON c.id_categoria =
                       s.id_categoria

                WHERE
                    s.activo = TRUE

                    AND (
                        c.id_categoria IS NULL
                        OR c.activo = TRUE
                    )

                ORDER BY
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
                    }),
                ),
        })
    } catch (error) {
        console.error(
            'Error al listar servicios públicos:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje:
                'No fue posible consultar los servicios.',
        })
    }
}