import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../config/db.js'

export async function login(req, res) {
    try {
        const {
            correo,
            password,
        } = req.body

        if (!correo || !password) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Correo y contraseña son obligatorios',
            })
        }

        const resultado = await pool.query(
            `
                SELECT
                    id_usuario,
                    nombre,
                    correo,
                    password_hash,
                    rol,
                    activo
                FROM usuarios
                WHERE LOWER(correo) = LOWER($1)
                LIMIT 1
            `,
            [correo.trim()],
        )

        if (resultado.rowCount === 0) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Credenciales incorrectas',
            })
        }

        const usuario = resultado.rows[0]

        if (!usuario.activo) {
            return res.status(403).json({
                ok: false,
                mensaje: 'Usuario inactivo',
            })
        }

        const passwordValido = await bcrypt.compare(
            password,
            usuario.password_hash,
        )

        if (!passwordValido) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Credenciales incorrectas',
            })
        }

        const token = jwt.sign(
            {
                sub: usuario.id_usuario,
                nombre: usuario.nombre,
                correo: usuario.correo,
                rol: usuario.rol,
            },
            process.env.JWT_SECRET,
            {
                expiresIn:
                    process.env.JWT_EXPIRES_IN || '8h',
            },
        )

        return res.json({
            ok: true,
            token,
            usuario: {
                id_usuario: usuario.id_usuario,
                nombre: usuario.nombre,
                correo: usuario.correo,
                rol: usuario.rol,
            },
        })
    } catch (error) {
        console.error('Error login:', error)

        return res.status(500).json({
            ok: false,
            mensaje: 'Error interno del servidor',
        })
    }
}