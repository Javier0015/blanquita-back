import express from 'express'
import cors from 'cors'

import pool from './config/db.js'
import authRoutes from './routes/authRoutes.js'
import configuracionRoutes from './routes/configuracionRoutes.js'
import citasRoutes from './routes/citasRoutes.js'
import serviciosPublicRoutes from './routes/serviciosPublicRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import serviciosRoutes from './routes/serviciosRoutes.js'
import clientesRoutes from './routes/clientesRoutes.js'

const app = express()

// Middlewares
app.use(
    cors({
        origin: 'http://localhost:5173',
        credentials: true,
    }),
)

app.use(express.json())

app.use(
    express.urlencoded({
        extended: true,
    }),
)

app.use(
    '/api/servicios',
    serviciosPublicRoutes,
)

// Rutas
app.use('/api/auth', authRoutes)

app.use(
    '/api/admin/configuracion',
    configuracionRoutes,
)

app.use(
    '/api/citas',
    citasRoutes,
)

app.use(
    '/api/admin/dashboard',
    dashboardRoutes,
)

app.use(
    '/api/admin/servicios',
    serviciosRoutes,
)

app.use(
    '/api/admin/clientes',
    clientesRoutes,
)

// Ruta principal de prueba
app.get('/api', (req, res) => {
    res.json({
        ok: true,
        mensaje: 'API Estética funcionando correctamente',
    })
})

// Prueba de conexión con PostgreSQL
app.get('/api/test-db', async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                NOW() AS fecha_servidor,
                current_database() AS base_datos
        `)

        return res.json({
            ok: true,
            mensaje: 'Conexión con PostgreSQL correcta',
            datos: resultado.rows[0],
        })
    } catch (error) {
        console.error(
            'Error al conectar con PostgreSQL:',
            error,
        )

        return res.status(500).json({
            ok: false,
            mensaje: 'Error al conectar con PostgreSQL',
            error: error.message,
        })
    }
})

// Ruta no encontrada
app.use((req, res) => {
    return res.status(404).json({
        ok: false,
        mensaje: 'Ruta no encontrada',
    })
})

// Manejador general de errores
app.use((error, req, res, next) => {
    console.error(
        'Error no controlado:',
        error,
    )

    return res.status(500).json({
        ok: false,
        mensaje: 'Error interno del servidor',
    })
})

export default app