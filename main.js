import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Obtener el directorio actual en ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Cargar variables de entorno desde el archivo .env en la raíz del proyecto
const result = dotenv.config({ path: join(__dirname, '.env') })

if (result.error) {
    console.warn('⚠️  No se pudo cargar el archivo .env:', result.error.message)
} else {
    console.log('✅ Variables de entorno cargadas desde .env')
    // Verificar que JWT_SECRET esté cargado (sin mostrar el valor)
    if (process.env.JWT_SECRET) {
        console.log('✅ JWT_SECRET cargado correctamente (longitud:', process.env.JWT_SECRET.length, 'caracteres)')
    } else {
        console.warn('⚠️  JWT_SECRET no encontrado en .env')
    }
}

import startServer from './src/config/server.js'

startServer().then()