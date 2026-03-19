// server.js (Versión en la Nube: MongoDB + Cloudinary)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. CONFIGURACIÓN ---

// Configuración de Cloudinary usando el archivo .env
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Conexión a MongoDB Atlas
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ Conectado a MongoDB Atlas de forma exitosa'))
        .catch(err => console.error('❌ Error de conexión a MongoDB:', err.message));
} else {
    console.log('⚠️ ADVERTENCIA: No se encontró MONGODB_URI en el archivo .env');
}

// Modelo de Base de Datos (Mongoose)
const TrabajoSchema = new mongoose.Schema({
    nombre_alumno: String,
    grado: String,
    url_imagen: String,
    fecha: { type: Date, default: Date.now }
});
const Trabajo = mongoose.model('Trabajo', TrabajoSchema);

// Configuración de Multer (Almacenamiento Temporal en Memoria para enviar a Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// --- 2. RUTAS O ENDPOINTS ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/trabajos', async (req, res) => {
    try {
        const trabajos = await Trabajo.find().sort({ fecha: -1 }); // Los más recientes primero
        res.json(trabajos);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener trabajos' });
    }
});

app.post('/subir', upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, grado } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Falta la imagen' });
        }

        // Subimos el archivo a Cloudinary
        cloudinary.uploader.upload_stream(
            { folder: "colegio_entregas" }, 
            async (error, result) => {
                if (error) return res.status(500).json({ error: 'Error subiendo a Cloudinary' });
                
                // Guardamos en MongoDB
                const nuevoTrabajo = new Trabajo({
                    nombre_alumno: nombre,
                    grado: grado,
                    url_imagen: result.secure_url
                });
                
                await nuevoTrabajo.save();
                res.status(201).json({ mensaje: '¡Éxito!', trabajo: nuevoTrabajo });
            }
        ).end(req.file.buffer);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error general del servidor' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Servidor en la nube corriendo en http://localhost:${PORT}`);
    console.log(`=========================================\n`);
});
