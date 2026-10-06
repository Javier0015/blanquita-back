import express from 'express'

import {
    actualizarConfiguracion,
    obtenerConfiguracion,
    probarCorreo,
} from '../controllers/configuracionController.js'

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
    obtenerConfiguracion,
)


router.put(
    '/',
    actualizarConfiguracion,
)


router.post(
    '/probar-correo',
    probarCorreo,
)


export default router