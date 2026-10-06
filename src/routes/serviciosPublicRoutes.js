import express from 'express'

import {
    listarServiciosPublicos,
} from '../controllers/serviciosPublicController.js'


const router =
    express.Router()


router.get(
    '/',
    listarServiciosPublicos,
)


export default router