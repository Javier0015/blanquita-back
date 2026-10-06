import pool from '../config/db.js'



import {

    obtenerDisponibilidad,

} from '../services/disponibilidadService.js'

import {
    crearTransporterSMTP,
} from '../services/correoService.js'





/* =========================================================

   DISPONIBILIDAD PÚBLICA

   GET /api/citas/disponibilidad

   ?fecha=2026-10-10&servicios=1,2

========================================================= */



export async function consultarDisponibilidad(req, res) {

    try {

        const {

            fecha,

            servicios,

        } = req.query



        if (!fecha) {

            return res.status(400).json({

                ok: false,

                mensaje: 'La fecha es obligatoria.',

            })

        }



        const idsServicios =

            convertirIdsServicios(servicios)



        if (idsServicios.length === 0) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'Debes seleccionar al menos un servicio.',

            })

        }



        const serviciosSeleccionados =

            await obtenerServiciosActivos(

                idsServicios,

            )



        if (

            serviciosSeleccionados.length !==

            idsServicios.length

        ) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'Uno o más servicios no existen o están inactivos.',

            })

        }



        const duracionTotal =

            serviciosSeleccionados.reduce(

                (total, servicio) =>

                    total +

                    Number(

                        servicio.duracion_minutos,

                    ),

                0,

            )



        const totalEstimado =

            serviciosSeleccionados.reduce(

                (total, servicio) =>

                    total +

                    Number(servicio.precio),

                0,

            )



        const disponibilidad =

            await obtenerDisponibilidad({

                fecha,

                duracionMinutos:

                    duracionTotal,

            })



        return res.json({

            ok: true,



            servicios:

                serviciosSeleccionados.map(

                    (servicio) => ({

                        id_servicio:

                            servicio.id_servicio,

                        nombre:

                            servicio.nombre,

                        precio:

                            Number(

                                servicio.precio,

                            ),

                        duracion_minutos:

                            servicio.duracion_minutos,

                    }),

                ),



            duracion_total:

                duracionTotal,



            total_estimado:

                totalEstimado,



            disponibilidad,

        })

    } catch (error) {

        console.error(

            'Error al consultar disponibilidad:',

            error,

        )



        return res.status(500).json({

            ok: false,

            mensaje:

                'No fue posible consultar la disponibilidad.',

        })

    }

}





/* =========================================================

   CREAR SOLICITUD PÚBLICA

   POST /api/citas/solicitudes

========================================================= */



export async function crearSolicitud(req, res) {

    const client =

        await pool.connect()



    try {

        const {

            nombre,

            telefono,

            correo,

            servicios,

            fecha,

            hora_inicio,

            observaciones,

        } = req.body



        if (

            !nombre ||

            !String(nombre).trim()

        ) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'El nombre es obligatorio.',

            })

        }



        if (

            !telefono &&

            !correo

        ) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'Debes proporcionar teléfono o correo.',

            })

        }



        if (!fecha) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'La fecha es obligatoria.',

            })

        }



        if (!hora_inicio) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'El horario es obligatorio.',

            })

        }



        const idsServicios =

            convertirIdsServicios(servicios)



        if (

            idsServicios.length === 0

        ) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'Selecciona al menos un servicio.',

            })

        }



        const serviciosSeleccionados =

            await obtenerServiciosActivos(

                idsServicios,

            )



        if (

            serviciosSeleccionados.length !==

            idsServicios.length

        ) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'Uno o más servicios no existen o están inactivos.',

            })

        }



        const duracionTotal =

            serviciosSeleccionados.reduce(

                (total, servicio) =>

                    total +

                    Number(

                        servicio.duracion_minutos,

                    ),

                0,

            )



        const totalEstimado =

            serviciosSeleccionados.reduce(

                (total, servicio) =>

                    total +

                    Number(servicio.precio),

                0,

            )



        const disponibilidad =

            await obtenerDisponibilidad({

                fecha,

                duracionMinutos:

                    duracionTotal,

            })



        const horarioEncontrado =

            disponibilidad.horarios?.find(

                (horario) =>

                    horario.hora_inicio ===

                    normalizarHora(

                        hora_inicio,

                    ),

            )



        if (!horarioEncontrado) {

            return res.status(409).json({

                ok: false,

                mensaje:

                    'El horario seleccionado ya no se encuentra disponible.',

            })

        }



        await client.query('BEGIN')



        /*

         * Evita que dos solicitudes para el mismo día

         * se registren al mismo tiempo.

         */

        await client.query(

            `

                SELECT pg_advisory_xact_lock(

                    hashtext($1)

                )

            `,

            [

                `CITAS-${fecha}`,

            ],

        )



        /*

         * Volvemos a comprobar el horario dentro

         * de la transacción.

         */

        const conflicto =

            await existeConflictoHorario({

                client,

                fecha,

                horaInicio:

                    horarioEncontrado.hora_inicio,

                horaFin:

                    horarioEncontrado.hora_fin,

            })



        if (conflicto) {

            await client.query(

                'ROLLBACK',

            )



            return res.status(409).json({

                ok: false,

                mensaje:

                    'El horario acaba de ser ocupado. Selecciona otro horario.',

            })

        }



        const cliente =

            await obtenerOCrearCliente({

                client,

                nombre:

                    String(nombre).trim(),

                telefono:

                    telefono

                        ? String(

                            telefono,

                        ).trim()

                        : null,

                correo:

                    correo

                        ? String(

                            correo,

                        ).trim().toLowerCase()

                        : null,

            })



        /*

         * Tomamos el siguiente ID antes del INSERT

         * para generar un folio único.

         */

        const secuencia =

            await client.query(`

                SELECT nextval(

                    pg_get_serial_sequence(

                        'citas',

                        'id_cita'

                    )

                ) AS id_cita

            `)



        const idCita =

            Number(

                secuencia.rows[0]

                    .id_cita,

            )



        const folio =

            generarFolio(

                fecha,

                idCita,

            )



        const citaInsertada =

            await client.query(

                `

                    INSERT INTO citas (

                        id_cita,

                        folio,

                        id_cliente,

                        fecha_solicitada,

                        hora_inicio_solicitada,

                        hora_fin_solicitada,

                        estado,

                        observaciones_cliente,

                        total_estimado,

                        origen

                    )

                    VALUES (

                        $1,

                        $2,

                        $3,

                        $4,

                        $5,

                        $6,

                        'PENDIENTE',

                        $7,

                        $8,

                        'WEB'

                    )

                    RETURNING *

                `,

                [

                    idCita,

                    folio,

                    cliente.id_cliente,

                    fecha,

                    horarioEncontrado.hora_inicio,

                    horarioEncontrado.hora_fin,

                    observaciones?.trim() ||

                        null,

                    totalEstimado,

                ],

            )



        for (

            const servicio

            of serviciosSeleccionados

        ) {

            await client.query(

                `

                    INSERT INTO cita_servicios (

                        id_cita,

                        id_servicio,

                        nombre_servicio,

                        precio,

                        duracion_minutos

                    )

                    VALUES (

                        $1,

                        $2,

                        $3,

                        $4,

                        $5

                    )

                `,

                [

                    idCita,

                    servicio.id_servicio,

                    servicio.nombre,

                    servicio.precio,

                    servicio.duracion_minutos,

                ],

            )

        }



        await client.query(

            `

                INSERT INTO cita_historial (

                    id_cita,

                    estado_anterior,

                    estado_nuevo,

                    comentario

                )

                VALUES (

                    $1,

                    NULL,

                    'PENDIENTE',

                    'Solicitud de reservación creada'

                )

            `,

            [

                idCita,

            ],

        )



        await client.query(

            'COMMIT',

        )


await notificarNuevaReservacion({
    idCita,
})




        return res.status(201).json({

            ok: true,



            mensaje:

                'Tu solicitud de reservación fue registrada correctamente.',



            cita: {

                id_cita:

                    citaInsertada

                        .rows[0]

                        .id_cita,



                folio,



                fecha,



                hora_inicio:

                    horarioEncontrado.hora_inicio,



                hora_fin:

                    horarioEncontrado.hora_fin,



                estado:

                    'PENDIENTE',



                duracion_total:

                    duracionTotal,



                total_estimado:

                    totalEstimado,

            },

        })

    } catch (error) {

        try {

            await client.query(

                'ROLLBACK',

            )

        } catch {

            // La transacción pudo no haberse iniciado.

        }



        console.error(

            'Error al crear solicitud de cita:',

            error,

        )



        return res.status(500).json({

            ok: false,

            mensaje:

                'No fue posible registrar la reservación.',

        })

    } finally {

        client.release()

    }

}





/* =========================================================

   LISTAR CITAS ADMIN

   GET /api/citas/admin

   ?fecha=2026-10-06

   ?estado=PENDIENTE

========================================================= */



export async function listarCitasAdmin(req, res) {

    try {

        const {

            fecha,

            estado,

        } = req.query



        const parametros = []



        const filtros = []



        if (fecha) {

            parametros.push(fecha)



            filtros.push(`

                COALESCE(

                    c.fecha_confirmada,

                    c.fecha_solicitada

                ) = $${parametros.length}

            `)

        }



        if (estado) {

            parametros.push(

                estado.toUpperCase(),

            )



            filtros.push(`

                c.estado =

                $${parametros.length}

            `)

        }



        const where =

            filtros.length > 0

                ? `WHERE ${filtros.join(

                    ' AND ',

                )}`

                : ''



        const resultado =

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



                        c.observaciones_cliente,

                        c.observaciones_admin,



                        c.created_at,

                        c.updated_at,



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



                    ${where}



                    GROUP BY

                        c.id_cita,

                        cl.id_cliente



                    ORDER BY

                        COALESCE(

                            c.fecha_confirmada,

                            c.fecha_solicitada

                        ) ASC,



                        COALESCE(

                            c.hora_inicio_confirmada,

                            c.hora_inicio_solicitada

                        ) ASC

                `,

                parametros,

            )



        return res.json({

            ok: true,

            total:

                resultado.rowCount,

            citas:

                resultado.rows,

        })

    } catch (error) {

        console.error(

            'Error al listar citas:',

            error,

        )



        return res.status(500).json({

            ok: false,

            mensaje:

                'No fue posible consultar las citas.',

        })

    }

}





/* =========================================================

   DETALLE ADMIN

   GET /api/citas/admin/:id

========================================================= */



export async function obtenerCitaAdmin(req, res) {

    try {

        const idCita =

            Number(req.params.id)



        if (!idCita) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'Identificador de cita inválido.',

            })

        }



        const resultado =

            await pool.query(

                `

                    SELECT

                        c.*,



                        cl.nombre

                            AS cliente_nombre,



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



                    WHERE c.id_cita = $1



                    GROUP BY

                        c.id_cita,

                        cl.id_cliente

                `,

                [

                    idCita,

                ],

            )



        if (

            resultado.rowCount === 0

        ) {

            return res.status(404).json({

                ok: false,

                mensaje:

                    'La cita no existe.',

            })

        }



        const historial =

            await pool.query(

                `

                    SELECT

                        h.id_historial,

                        h.estado_anterior,

                        h.estado_nuevo,

                        h.comentario,

                        h.created_at,



                        u.nombre

                            AS usuario_nombre



                    FROM cita_historial h



                    LEFT JOIN usuarios u

                        ON u.id_usuario =

                           h.id_usuario



                    WHERE h.id_cita = $1



                    ORDER BY

                        h.created_at ASC

                `,

                [

                    idCita,

                ],

            )



        return res.json({

            ok: true,



            cita:

                resultado.rows[0],



            historial:

                historial.rows,

        })

    } catch (error) {

        console.error(

            'Error al consultar cita:',

            error,

        )



        return res.status(500).json({

            ok: false,

            mensaje:

                'No fue posible consultar la cita.',

        })

    }

}





/* =========================================================

   CONFIRMAR CITA

   PATCH /api/citas/admin/:id/confirmar

========================================================= */



export async function confirmarCita(req, res) {

    const client =

        await pool.connect()



    try {

        const idCita =

            Number(req.params.id)



        await client.query('BEGIN')



        const resultado =

            await client.query(

                `

                    SELECT *

                    FROM citas

                    WHERE id_cita = $1

                    FOR UPDATE

                `,

                [

                    idCita,

                ],

            )



        if (

            resultado.rowCount === 0

        ) {

            await client.query(

                'ROLLBACK',

            )



            return res.status(404).json({

                ok: false,

                mensaje:

                    'La cita no existe.',

            })

        }



        const cita =

            resultado.rows[0]



        if (

            [

                'RECHAZADA',

                'CANCELADA_CLIENTE',

                'CANCELADA_ADMIN',

                'FINALIZADA',

                'NO_ASISTIO',

            ].includes(cita.estado)

        ) {

            await client.query(

                'ROLLBACK',

            )



            return res.status(400).json({

                ok: false,

                mensaje:

                    'La cita no puede confirmarse en su estado actual.',

            })

        }



        const fecha =

            cita.fecha_confirmada ||

            cita.fecha_solicitada



        const horaInicio =

            cita.hora_inicio_confirmada ||

            cita.hora_inicio_solicitada



        const horaFin =

            cita.hora_fin_confirmada ||

            cita.hora_fin_solicitada



        await client.query(

            `

                SELECT pg_advisory_xact_lock(

                    hashtext($1)

                )

            `,

            [

                `CITAS-${formatearFechaBD(

                    fecha,

                )}`,

            ],

        )



        const conflicto =

            await existeConflictoHorario({

                client,

                fecha:

                    formatearFechaBD(

                        fecha,

                    ),

                horaInicio,

                horaFin,

                excluirIdCita:

                    idCita,

            })



        if (conflicto) {

            await client.query(

                'ROLLBACK',

            )



            return res.status(409).json({

                ok: false,

                mensaje:

                    'El horario tiene conflicto con otra cita.',

            })

        }



        const actualizado =

            await client.query(

                `

                    UPDATE citas

                    SET

                        fecha_confirmada =

                            COALESCE(

                                fecha_confirmada,

                                fecha_solicitada

                            ),



                        hora_inicio_confirmada =

                            COALESCE(

                                hora_inicio_confirmada,

                                hora_inicio_solicitada

                            ),



                        hora_fin_confirmada =

                            COALESCE(

                                hora_fin_confirmada,

                                hora_fin_solicitada

                            ),



                        estado = 'CONFIRMADA',



                        updated_at = NOW()



                    WHERE id_cita = $1



                    RETURNING *

                `,

                [

                    idCita,

                ],

            )



        await agregarHistorial({

            client,

            idCita,

            estadoAnterior:

                cita.estado,

            estadoNuevo:

                'CONFIRMADA',

            comentario:

                'Reservación confirmada por administración.',

            idUsuario:

                req.usuario?.sub,

        })



        await client.query(

            'COMMIT',

        )


await notificarCitaConfirmada({
    idCita,
})




        return res.json({

            ok: true,

            mensaje:

                'Cita confirmada correctamente.',

            cita:

                actualizado.rows[0],

        })

    } catch (error) {

        await rollbackSeguro(client)



        console.error(

            'Error al confirmar cita:',

            error,

        )



        return res.status(500).json({

            ok: false,

            mensaje:

                'No fue posible confirmar la cita.',

        })

    } finally {

        client.release()

    }

}





/* =========================================================

   RECHAZAR CITA

   PATCH /api/citas/admin/:id/rechazar

========================================================= */



export async function rechazarCita(req, res) {

    const client =

        await pool.connect()



    try {

        const idCita =

            Number(req.params.id)



        const {

            motivo,

        } = req.body



        await client.query('BEGIN')



        const resultado =

            await client.query(

                `

                    SELECT *

                    FROM citas

                    WHERE id_cita = $1

                    FOR UPDATE

                `,

                [

                    idCita,

                ],

            )



        if (

            resultado.rowCount === 0

        ) {

            await client.query(

                'ROLLBACK',

            )



            return res.status(404).json({

                ok: false,

                mensaje:

                    'La cita no existe.',

            })

        }



        const cita =

            resultado.rows[0]



        const actualizado =

            await client.query(

                `

                    UPDATE citas

                    SET

                        estado = 'RECHAZADA',



                        observaciones_admin =

                            COALESCE(

                                $1,

                                observaciones_admin

                            ),



                        updated_at = NOW()



                    WHERE id_cita = $2



                    RETURNING *

                `,

                [

                    motivo?.trim() ||

                        null,



                    idCita,

                ],

            )



        await agregarHistorial({

            client,

            idCita,

            estadoAnterior:

                cita.estado,

            estadoNuevo:

                'RECHAZADA',

            comentario:

                motivo?.trim() ||

                'Reservación rechazada por administración.',

            idUsuario:

                req.usuario?.sub,

        })



        await client.query(

            'COMMIT',

        )


await notificarCitaRechazada({
    idCita,
    motivo:
        motivo?.trim() ||
        null,
})




        return res.json({

            ok: true,

            mensaje:

                'Cita rechazada correctamente.',

            cita:

                actualizado.rows[0],

        })

    } catch (error) {

        await rollbackSeguro(client)



        console.error(

            'Error al rechazar cita:',

            error,

        )



        return res.status(500).json({

            ok: false,

            mensaje:

                'No fue posible rechazar la cita.',

        })

    } finally {

        client.release()

    }

}





/* =========================================================

   REPROGRAMAR CITA

   PATCH /api/citas/admin/:id/reprogramar

========================================================= */



export async function reprogramarCita(req, res) {

    const client =

        await pool.connect()



    try {

        const idCita =

            Number(req.params.id)



        const {

            fecha,

            hora_inicio,

            comentario,

        } = req.body



        if (

            !fecha ||

            !hora_inicio

        ) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'Fecha y hora son obligatorias.',

            })

        }



        const servicios =

            await pool.query(

                `

                    SELECT

                        duracion_minutos

                    FROM cita_servicios

                    WHERE id_cita = $1

                `,

                [

                    idCita,

                ],

            )



        if (

            servicios.rowCount === 0

        ) {

            return res.status(400).json({

                ok: false,

                mensaje:

                    'La cita no tiene servicios registrados.',

            })

        }



        const duracionTotal =

            servicios.rows.reduce(

                (total, servicio) =>

                    total +

                    Number(

                        servicio.duracion_minutos,

                    ),

                0,

            )



        const disponibilidad =

            await obtenerDisponibilidad({

                fecha,

                duracionMinutos:

                    duracionTotal,

            })



        const horario =

            disponibilidad.horarios?.find(

                (item) =>

                    item.hora_inicio ===

                    normalizarHora(

                        hora_inicio,

                    ),

            )



        if (!horario) {

            return res.status(409).json({

                ok: false,

                mensaje:

                    'El nuevo horario no está disponible.',

            })

        }



        await client.query('BEGIN')



        await client.query(

            `

                SELECT pg_advisory_xact_lock(

                    hashtext($1)

                )

            `,

            [

                `CITAS-${fecha}`,

            ],

        )



        const resultado =

            await client.query(

                `

                    SELECT *

                    FROM citas

                    WHERE id_cita = $1

                    FOR UPDATE

                `,

                [

                    idCita,

                ],

            )



        if (

            resultado.rowCount === 0

        ) {

            await client.query(

                'ROLLBACK',

            )



            return res.status(404).json({

                ok: false,

                mensaje:

                    'La cita no existe.',

            })

        }



        const cita =

            resultado.rows[0]



        const conflicto =

            await existeConflictoHorario({

                client,

                fecha,

                horaInicio:

                    horario.hora_inicio,

                horaFin:

                    horario.hora_fin,

                excluirIdCita:

                    idCita,

            })



        if (conflicto) {

            await client.query(

                'ROLLBACK',

            )



            return res.status(409).json({

                ok: false,

                mensaje:

                    'El horario acaba de ser ocupado.',

            })

        }



        const actualizado =

            await client.query(

                `

                    UPDATE citas

                    SET

                        fecha_confirmada = $1,



                        hora_inicio_confirmada =

                            $2,



                        hora_fin_confirmada =

                            $3,



                        estado =

                            'REPROGRAMACION_PENDIENTE',



                        observaciones_admin =

                            COALESCE(

                                $4,

                                observaciones_admin

                            ),



                        updated_at = NOW()



                    WHERE id_cita = $5



                    RETURNING *

                `,

                [

                    fecha,

                    horario.hora_inicio,

                    horario.hora_fin,

                    comentario?.trim() ||

                        null,

                    idCita,

                ],

            )



        await agregarHistorial({

            client,

            idCita,

            estadoAnterior:

                cita.estado,

            estadoNuevo:

                'REPROGRAMACION_PENDIENTE',

            comentario:

                comentario?.trim() ||

                'Administración propuso un nuevo horario.',

            idUsuario:

                req.usuario?.sub,

        })



        await client.query(

            'COMMIT',

        )


await notificarCitaReprogramada({
    idCita,
})




        return res.json({

            ok: true,



            mensaje:

                'La cita fue reprogramada. Queda pendiente de confirmación.',



            cita:

                actualizado.rows[0],

        })

    } catch (error) {

        await rollbackSeguro(client)



        console.error(

            'Error al reprogramar cita:',

            error,

        )



        return res.status(500).json({

            ok: false,

            mensaje:

                'No fue posible reprogramar la cita.',

        })

    } finally {

        client.release()

    }

}






/* =========================================================
   NOTIFICACIONES POR CORREO
========================================================= */

async function notificarNuevaReservacion({
    idCita,
}) {
    try {
        const datos =
            await obtenerDatosCorreoCita(
                idCita,
            )

        if (!datos) {
            return
        }

        const {
            cita,
            cliente,
            servicios,
            configuracion,
        } = datos

        if (
            !configuracion
                ?.notificar_nueva_reservacion
        ) {
            return
        }

        const destinatario =
            configuracion
                .correo_notificaciones

        if (!destinatario) {
            return
        }

        await enviarCorreoSistema({
            para:
                destinatario,

            asunto:
                `Nueva reservación ${cita.folio}`,

            html:
                construirPlantillaBase({
                    titulo:
                        'Nueva reservación',

                    saludo:
                        'Se recibió una nueva solicitud de cita.',

                    contenido: `
                        ${filaCorreo(
                            'Folio',
                            cita.folio,
                        )}

                        ${filaCorreo(
                            'Cliente',
                            cliente.nombre,
                        )}

                        ${filaCorreo(
                            'Teléfono',
                            cliente.telefono ||
                            'No proporcionado',
                        )}

                        ${filaCorreo(
                            'Correo',
                            cliente.correo ||
                            'No proporcionado',
                        )}

                        ${filaCorreo(
                            'Fecha',
                            formatearFechaCorreo(
                                cita.fecha,
                            ),
                        )}

                        ${filaCorreo(
                            'Horario',
                            `${formatearHoraCorreo(
                                cita.hora_inicio,
                            )} - ${formatearHoraCorreo(
                                cita.hora_fin,
                            )}`,
                        )}

                        ${filaCorreo(
                            'Servicios',
                            obtenerTextoServicios(
                                servicios,
                            ),
                        )}

                        ${filaCorreo(
                            'Total estimado',
                            formatearMonedaCorreo(
                                cita.total_estimado,
                            ),
                        )}
                    `,

                    nombreEstetica:
                        configuracion
                            .nombre_estetica,
                }),

            texto:
                `Nueva reservación ${cita.folio} de ${cliente.nombre}.`,
        })
    } catch (error) {
        console.error(
            'Error al enviar notificación de nueva reservación:',
            error,
        )
    }
}


async function notificarCitaConfirmada({
    idCita,
}) {
    try {
        const datos =
            await obtenerDatosCorreoCita(
                idCita,
            )

        if (!datos?.cliente?.correo) {
            return
        }

        const {
            cita,
            cliente,
            servicios,
            configuracion,
        } = datos

        await enviarCorreoSistema({
            para:
                cliente.correo,

            asunto:
                `Cita confirmada - ${cita.folio}`,

            html:
                construirPlantillaBase({
                    titulo:
                        'Tu cita fue confirmada',

                    saludo:
                        `Hola ${escaparHtml(
                            cliente.nombre,
                        )}, tu cita ha sido confirmada.`,

                    contenido: `
                        ${filaCorreo(
                            'Folio',
                            cita.folio,
                        )}

                        ${filaCorreo(
                            'Fecha',
                            formatearFechaCorreo(
                                cita.fecha,
                            ),
                        )}

                        ${filaCorreo(
                            'Horario',
                            `${formatearHoraCorreo(
                                cita.hora_inicio,
                            )} - ${formatearHoraCorreo(
                                cita.hora_fin,
                            )}`,
                        )}

                        ${filaCorreo(
                            'Servicios',
                            obtenerTextoServicios(
                                servicios,
                            ),
                        )}

                        ${filaCorreo(
                            'Total estimado',
                            formatearMonedaCorreo(
                                cita.total_estimado,
                            ),
                        )}
                    `,

                    nombreEstetica:
                        configuracion
                            ?.nombre_estetica,
                }),

            texto:
                `Tu cita ${cita.folio} ha sido confirmada.`,
        })
    } catch (error) {
        console.error(
            'Error al enviar correo de confirmación:',
            error,
        )
    }
}


async function notificarCitaRechazada({
    idCita,
    motivo,
}) {
    try {
        const datos =
            await obtenerDatosCorreoCita(
                idCita,
            )

        if (!datos?.cliente?.correo) {
            return
        }

        const {
            cita,
            cliente,
            configuracion,
        } = datos

        const motivoTexto =
            motivo ||
            'No fue posible confirmar la solicitud.'

        await enviarCorreoSistema({
            para:
                cliente.correo,

            asunto:
                `Actualización de cita - ${cita.folio}`,

            html:
                construirPlantillaBase({
                    titulo:
                        'Actualización de tu cita',

                    saludo:
                        `Hola ${escaparHtml(
                            cliente.nombre,
                        )}, tu solicitud no pudo ser confirmada.`,

                    contenido: `
                        ${filaCorreo(
                            'Folio',
                            cita.folio,
                        )}

                        ${filaCorreo(
                            'Motivo',
                            motivoTexto,
                        )}
                    `,

                    nombreEstetica:
                        configuracion
                            ?.nombre_estetica,
                }),

            texto:
                `La cita ${cita.folio} no pudo ser confirmada. Motivo: ${motivoTexto}`,
        })
    } catch (error) {
        console.error(
            'Error al enviar correo de rechazo:',
            error,
        )
    }
}


async function notificarCitaReprogramada({
    idCita,
}) {
    try {
        const datos =
            await obtenerDatosCorreoCita(
                idCita,
            )

        if (!datos?.cliente?.correo) {
            return
        }

        const {
            cita,
            cliente,
            servicios,
            configuracion,
        } = datos

        if (
            configuracion
                ?.notificar_reprogramacion ===
            false
        ) {
            return
        }

        await enviarCorreoSistema({
            para:
                cliente.correo,

            asunto:
                `Cita reprogramada - ${cita.folio}`,

            html:
                construirPlantillaBase({
                    titulo:
                        'Tu cita fue reprogramada',

                    saludo:
                        `Hola ${escaparHtml(
                            cliente.nombre,
                        )}, se propuso un nuevo horario para tu cita.`,

                    contenido: `
                        ${filaCorreo(
                            'Folio',
                            cita.folio,
                        )}

                        ${filaCorreo(
                            'Nueva fecha',
                            formatearFechaCorreo(
                                cita.fecha,
                            ),
                        )}

                        ${filaCorreo(
                            'Nuevo horario',
                            `${formatearHoraCorreo(
                                cita.hora_inicio,
                            )} - ${formatearHoraCorreo(
                                cita.hora_fin,
                            )}`,
                        )}

                        ${filaCorreo(
                            'Servicios',
                            obtenerTextoServicios(
                                servicios,
                            ),
                        )}
                    `,

                    nombreEstetica:
                        configuracion
                            ?.nombre_estetica,
                }),

            texto:
                `La cita ${cita.folio} fue reprogramada.`,
        })
    } catch (error) {
        console.error(
            'Error al enviar correo de reprogramación:',
            error,
        )
    }
}


async function enviarCorreoSistema({
    para,
    asunto,
    html,
    texto,
}) {
    if (!para) {
        return
    }

    try {
        const {
            transporter,
            config,
        } =
            await crearTransporterSMTP()

        const fromEmail =
            config.smtp_from_email ||
            config.smtp_user

        const fromName =
            config.smtp_from_name ||
            config.nombre_estetica ||
            'Estética'

        await transporter.sendMail({
            from:
                `"${fromName}" <${fromEmail}>`,

            to:
                para,

            subject:
                asunto,

            text:
                texto,

            html,
        })
    } catch (error) {
        console.error(
            `No fue posible enviar correo a ${para}:`,
            error.message,
        )
    }
}


async function obtenerDatosCorreoCita(
    idCita,
) {
    const resultado =
        await pool.query(
            `
                SELECT
                    c.id_cita,
                    c.folio,
                    c.estado,
                    c.total_estimado,

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
                    c.id_cita = $1

                GROUP BY
                    c.id_cita,
                    cl.id_cliente

                LIMIT 1
            `,
            [
                idCita,
            ],
        )

    if (
        resultado.rowCount ===
        0
    ) {
        return null
    }

    const fila =
        resultado.rows[0]

    const configuracionResultado =
        await pool.query(`
            SELECT
                nombre_estetica,
                correo_notificaciones,
                notificar_nueva_reservacion,
                notificar_cancelacion,
                notificar_reprogramacion
            FROM configuracion_negocio
            ORDER BY id_configuracion
            LIMIT 1
        `)

    return {
        cita: {
            id_cita:
                fila.id_cita,

            folio:
                fila.folio,

            estado:
                fila.estado,

            fecha:
                formatearFechaBD(
                    fila.fecha,
                ),

            hora_inicio:
                normalizarHora(
                    fila.hora_inicio,
                ),

            hora_fin:
                normalizarHora(
                    fila.hora_fin,
                ),

            total_estimado:
                Number(
                    fila.total_estimado ||
                    0,
                ),
        },

        cliente: {
            id_cliente:
                fila.id_cliente,

            nombre:
                fila.cliente_nombre,

            telefono:
                fila.telefono,

            correo:
                fila.correo,
        },

        servicios:
            Array.isArray(
                fila.servicios,
            )
                ? fila.servicios
                : [],

        configuracion:
            configuracionResultado
                .rows[0] ||
            {},
    }
}


function construirPlantillaBase({
    titulo,
    saludo,
    contenido,
    nombreEstetica,
}) {
    return `
        <!doctype html>
        <html>
            <body style="
                margin: 0;
                padding: 24px;
                background: #fff7fb;
                font-family: Arial, Helvetica, sans-serif;
                color: #44403c;
            ">
                <div style="
                    max-width: 620px;
                    margin: 0 auto;
                    background: #ffffff;
                    border: 1px solid #fce7f3;
                    border-radius: 20px;
                    overflow: hidden;
                ">
                    <div style="
                        padding: 24px;
                        background: #f472b6;
                        color: #ffffff;
                    ">
                        <div style="
                            font-size: 12px;
                            opacity: 0.9;
                            margin-bottom: 6px;
                        ">
                            ${escaparHtml(
                                nombreEstetica ||
                                'Estética',
                            )}
                        </div>

                        <h2 style="
                            margin: 0;
                            font-size: 22px;
                        ">
                            ${escaparHtml(
                                titulo,
                            )}
                        </h2>
                    </div>

                    <div style="
                        padding: 24px;
                    ">
                        <p style="
                            margin-top: 0;
                            color: #57534e;
                            line-height: 1.6;
                        ">
                            ${saludo}
                        </p>

                        <div style="
                            margin-top: 20px;
                        ">
                            ${contenido}
                        </div>

                        <p style="
                            margin-top: 28px;
                            margin-bottom: 0;
                            color: #a8a29e;
                            font-size: 12px;
                        ">
                            ${escaparHtml(
                                nombreEstetica ||
                                'Estética',
                            )}
                        </p>
                    </div>
                </div>
            </body>
        </html>
    `
}


function filaCorreo(
    titulo,
    valor,
) {
    return `
        <div style="
            padding: 11px 0;
            border-bottom: 1px solid #fce7f3;
        ">
            <div style="
                font-size: 11px;
                color: #a8a29e;
                margin-bottom: 3px;
            ">
                ${escaparHtml(
                    titulo,
                )}
            </div>

            <div style="
                font-size: 14px;
                font-weight: 600;
                color: #44403c;
            ">
                ${escaparHtml(
                    valor ?? '',
                )}
            </div>
        </div>
    `
}


function obtenerTextoServicios(
    servicios,
) {
    if (
        !Array.isArray(
            servicios,
        ) ||
        servicios.length ===
        0
    ) {
        return 'Sin servicios'
    }

    return servicios
        .map(
            (
                servicio,
            ) =>
                servicio.nombre ||
                servicio.nombre_servicio ||
                'Servicio',
        )
        .join(', ')
}


function formatearHoraCorreo(
    hora,
) {
    if (!hora) {
        return ''
    }

    const [
        horasTexto,
        minutosTexto,
    ] =
        String(
            hora,
        )
            .substring(
                0,
                5,
            )
            .split(':')

    const horas =
        Number(
            horasTexto,
        )

    const periodo =
        horas >= 12
            ? 'PM'
            : 'AM'

    const hora12 =
        horas % 12 ||
        12

    return `${hora12}:${minutosTexto} ${periodo}`
}


function formatearFechaCorreo(
    fecha,
) {
    if (!fecha) {
        return ''
    }

    const [
        anio,
        mes,
        dia,
    ] =
        String(
            fecha,
        )
            .substring(
                0,
                10,
            )
            .split('-')

    const fechaLocal =
        new Date(
            Number(anio),
            Number(mes) - 1,
            Number(dia),
        )

    return fechaLocal
        .toLocaleDateString(
            'es-MX',
            {
                weekday:
                    'long',

                day:
                    'numeric',

                month:
                    'long',

                year:
                    'numeric',
            },
        )
}


function formatearMonedaCorreo(
    cantidad,
) {
    return Number(
        cantidad ||
        0,
    ).toLocaleString(
        'es-MX',
        {
            style:
                'currency',

            currency:
                'MXN',
        },
    )
}


function escaparHtml(
    valor,
) {
    return String(
        valor ?? '',
    )
        .replaceAll(
            '&',
            '&amp;',
        )
        .replaceAll(
            '<',
            '&lt;',
        )
        .replaceAll(
            '>',
            '&gt;',
        )
        .replaceAll(
            '"',
            '&quot;',
        )
        .replaceAll(
            "'",
            '&#039;',
        )
}



/* =========================================================

   HELPERS

========================================================= */



function convertirIdsServicios(

    servicios,

) {

    let valores = []



    if (

        Array.isArray(servicios)

    ) {

        valores = servicios

    } else if (

        typeof servicios === 'string'

    ) {

        valores =

            servicios.split(',')

    }



    return [

        ...new Set(

            valores

                .map(Number)

                .filter(

                    (id) =>

                        Number.isInteger(id) &&

                        id > 0,

                ),

        ),

    ]

}





async function obtenerServiciosActivos(

    idsServicios,

) {

    if (

        idsServicios.length === 0

    ) {

        return []

    }



    const resultado =

        await pool.query(

            `

                SELECT

                    id_servicio,

                    nombre,

                    precio,

                    duracion_minutos

                FROM servicios

                WHERE id_servicio =

                    ANY($1::int[])

                  AND activo = TRUE

                ORDER BY id_servicio

            `,

            [

                idsServicios,

            ],

        )



    return resultado.rows

}





async function obtenerOCrearCliente({

    client,

    nombre,

    telefono,

    correo,

}) {

    let existente = null



    if (correo) {

        const resultado =

            await client.query(

                `

                    SELECT *

                    FROM clientes

                    WHERE LOWER(correo) =

                          LOWER($1)

                    LIMIT 1

                `,

                [

                    correo,

                ],

            )



        existente =

            resultado.rows[0] ||

            null

    }



    if (

        !existente &&

        telefono

    ) {

        const resultado =

            await client.query(

                `

                    SELECT *

                    FROM clientes

                    WHERE telefono = $1

                    LIMIT 1

                `,

                [

                    telefono,

                ],

            )



        existente =

            resultado.rows[0] ||

            null

    }



    if (existente) {

        const actualizado =

            await client.query(

                `

                    UPDATE clientes

                    SET

                        nombre = $1,



                        telefono =

                            COALESCE(

                                $2,

                                telefono

                            ),



                        correo =

                            COALESCE(

                                $3,

                                correo

                            ),



                        updated_at =

                            NOW()



                    WHERE id_cliente = $4



                    RETURNING *

                `,

                [

                    nombre,

                    telefono,

                    correo,

                    existente.id_cliente,

                ],

            )



        return actualizado.rows[0]

    }



    const nuevo =

        await client.query(

            `

                INSERT INTO clientes (

                    nombre,

                    telefono,

                    correo

                )

                VALUES (

                    $1,

                    $2,

                    $3

                )

                RETURNING *

            `,

            [

                nombre,

                telefono,

                correo,

            ],

        )



    return nuevo.rows[0]

}





async function existeConflictoHorario({

    client,

    fecha,

    horaInicio,

    horaFin,

    excluirIdCita = null,

}) {

    const resultado =

        await client.query(

            `

                SELECT

                    id_cita



                FROM citas



                WHERE

                    COALESCE(

                        fecha_confirmada,

                        fecha_solicitada

                    ) = $1



                    AND estado NOT IN (

                        'RECHAZADA',

                        'CANCELADA_CLIENTE',

                        'CANCELADA_ADMIN',

                        'NO_ASISTIO'

                    )



                    AND (

                        $4::INTEGER IS NULL

                        OR id_cita <> $4

                    )



                    AND

                    COALESCE(

                        hora_inicio_confirmada,

                        hora_inicio_solicitada

                    ) < $3::TIME



                    AND

                    COALESCE(

                        hora_fin_confirmada,

                        hora_fin_solicitada

                    ) > $2::TIME



                LIMIT 1

            `,

            [

                fecha,

                horaInicio,

                horaFin,

                excluirIdCita,

            ],

        )



    return (

        resultado.rowCount > 0

    )

}





async function agregarHistorial({

    client,

    idCita,

    estadoAnterior,

    estadoNuevo,

    comentario,

    idUsuario,

}) {

    await client.query(

        `

            INSERT INTO cita_historial (

                id_cita,

                estado_anterior,

                estado_nuevo,

                comentario,

                id_usuario

            )

            VALUES (

                $1,

                $2,

                $3,

                $4,

                $5

            )

        `,

        [

            idCita,

            estadoAnterior ||

                null,

            estadoNuevo,

            comentario ||

                null,

            idUsuario ||

                null,

        ],

    )

}





function generarFolio(

    fecha,

    idCita,

) {

    const fechaLimpia =

        String(fecha)

            .replaceAll('-', '')



    return (

        `CITA-${fechaLimpia}-` +

        String(idCita)

            .padStart(

                6,

                '0',

            )

    )

}





function normalizarHora(

    hora,

) {

    if (!hora) {

        return ''

    }



    return String(hora)

        .substring(0, 5)

}





function formatearFechaBD(

    fecha,

) {

    if (!fecha) {

        return null

    }



    if (

        typeof fecha === 'string'

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

            fecha.getMonth() + 1,

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





async function rollbackSeguro(

    client,

) {

    try {

        await client.query(

            'ROLLBACK',

        )

    } catch {

        // Ignorar error de rollback.

    }

}