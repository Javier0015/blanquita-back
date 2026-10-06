import express from 'express'

import {
    obtenerDashboard,
} from '../controllers/dashboardController.js'

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
    obtenerDashboard,
)


export default router