import dotenv from 'dotenv'
import app from './src/app.js'

dotenv.config()

const PORT = Number(
    process.env.PORT || 3000,
)

app.listen(PORT, () => {
    console.log(
        `Servidor ejecutándose en puerto ${PORT}`,
    )
})