import express from 'express'

import {
    actualizarServicio,
    cambiarEstadoServicio,
    crearServicio,
    listarCategorias,
    listarServicios,
    obtenerServicio,
} from '../controllers/serviciosController.js'

import {
    verificarToken,
} from '../middleware/verificarToken.js'


const router =
    express.Router()


router.use(
    verificarToken,
)


router.get(
    '/',
    listarServicios,
)


router.get(
    '/categorias',
    listarCategorias,
)


router.get(
    '/:id',
    obtenerServicio,
)


router.post(
    '/',
    crearServicio,
)


router.put(
    '/:id',
    actualizarServicio,
)


router.patch(
    '/:id/estado',
    cambiarEstadoServicio,
)


export default router