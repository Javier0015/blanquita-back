import jwt from 'jsonwebtoken'

export function verificarToken(req, res, next) {
    const authorization =
        req.headers.authorization

    if (
        !authorization ||
        !authorization.startsWith('Bearer ')
    ) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Token requerido',
        })
    }

    const token =
        authorization.substring(7)

    try {
        const payload = jwt.verify(
            token,
            process.env.JWT_SECRET,
        )

        req.usuario = payload

        next()
    } catch {
        return res.status(401).json({
            ok: false,
            mensaje: 'Token inválido o expirado',
        })
    }
}