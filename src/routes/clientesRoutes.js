import express from 'express'

import {
    actualizarCliente,
    cambiarEstadoCliente,
    crearCliente,
    listarCitasCliente,
    listarClientes,
    obtenerCliente,
} from '../controllers/clientesController.js'

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
    listarClientes,
)


router.get(
    '/:id/citas',
    listarCitasCliente,
)


router.get(
    '/:id',
    obtenerCliente,
)


router.post(
    '/',
    crearCliente,
)


router.put(
    '/:id',
    actualizarCliente,
)


router.patch(
    '/:id/estado',
    cambiarEstadoCliente,
)


export default router