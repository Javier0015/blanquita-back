import express from 'express'

import {
    login,
} from '../controllers/authController.js'

import {
    verificarToken,
} from '../middleware/verificarToken.js'

const router = express.Router()

router.post('/login', login)

router.get(
    '/me',
    verificarToken,
    (req, res) => {
        res.json({
            ok: true,
            usuario: req.usuario,
        })
    },
)

export default router