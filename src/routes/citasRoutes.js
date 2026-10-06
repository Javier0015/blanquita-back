import express from 'express'

import {
    consultarDisponibilidad,
    crearSolicitud,
    listarCitasAdmin,
    obtenerCitaAdmin,
    confirmarCita,
    rechazarCita,
    reprogramarCita,
} from '../controllers/citasController.js'

import {
    verificarToken,
} from '../middleware/verificarToken.js'

import {
    consultarMisCitas,
} from '../controllers/misCitasController.js'

const router =
    express.Router()


/* =========================================================
   RUTAS PÚBLICAS
========================================================= */

router.get(
    '/disponibilidad',
    consultarDisponibilidad,
)

router.post(
    '/solicitudes',
    crearSolicitud,
)


/* =========================================================
   RUTAS ADMINISTRATIVAS
========================================================= */

router.get(
    '/admin',
    verificarToken,
    listarCitasAdmin,
)

router.get(
    '/admin/:id',
    verificarToken,
    obtenerCitaAdmin,
)

router.patch(
    '/admin/:id/confirmar',
    verificarToken,
    confirmarCita,
)

router.patch(
    '/admin/:id/rechazar',
    verificarToken,
    rechazarCita,
)

router.patch(
    '/admin/:id/reprogramar',
    verificarToken,
    reprogramarCita,
)

router.post(
    '/mis-citas',
    consultarMisCitas,
)

export default router