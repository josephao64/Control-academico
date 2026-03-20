// server.js (Versión en la Nube: MongoDB + Cloudinary + AuthJWT)
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_super_seguro_123';

// --- 1. CONFIGURACIÓN ---
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            console.log('✅ Conectado a MongoDB Atlas de forma exitosa');
            inicializarProfesor();
        })
        .catch(err => console.error('❌ Error de conexión a MongoDB:', err.message));
} else {
    console.log('⚠️ ADVERTENCIA: No se encontró MONGODB_URI en el archivo .env');
}

// --- 2. MODELOS DE BASE DE DATOS (Mongoose) ---
const ProfesorSchema = new mongoose.Schema({
    usuario: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const Profesor = mongoose.model('Profesor', ProfesorSchema);

const GradoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    fecha: { type: Date, default: Date.now }
});
const Grado = mongoose.model('Grado', GradoSchema);

const CursoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    grado: { type: String, required: true },
    url_imagen: { type: String, required: true },
    fecha: { type: Date, default: Date.now }
});
const Curso = mongoose.model('Curso', CursoSchema);

const AsignacionSchema = new mongoose.Schema({
    titulo: String,
    grado: String,
    curso: String,
    fecha_creacion: { type: Date, default: Date.now },
    fecha_vencimiento: Date
});
const Asignacion = mongoose.model('Asignacion', AsignacionSchema);

const TrabajoSchema = new mongoose.Schema({
    nombre_alumno: String,
    grado: String,
    url_imagen: String,
    asignacion_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Asignacion' },
    estado: { type: String, default: 'Pendiente' }, // Pendiente, Calificada
    calificacion: { type: Number, default: 0 },
    comentarios_maestro: { type: String, default: '' },
    fecha: { type: Date, default: Date.now }
});
const Trabajo = mongoose.model('Trabajo', TrabajoSchema);

// Función para inicializar el profesor por defecto si no existe
async function inicializarProfesor() {
    try {
        const existe = await Profesor.findOne({ usuario: 'profesor' });
        if (!existe) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123', salt);
            await Profesor.create({ usuario: 'profesor', password: hashedPassword });
            console.log('✅ Profesor por defecto creado (usuario: profesor, pass: 123)');
        }
    } catch (error) {
        console.error('Error inicializando profesor', error);
    }
}

const upload = multer({ storage: multer.memoryStorage() });

// Middleware Autenticación
const verificarToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: 'Acceso denegado' });
    try {
        const verificado = jwt.verify(token.replace('Bearer ', ''), JWT_SECRET);
        req.profesor = verificado;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Token inválido' });
    }
};

// --- 3. RUTAS / ENDPOINTS ---
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));

// --- AUTH ---
app.post('/api/auth/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const profe = await Profesor.findOne({ usuario });
        if (!profe) return res.status(400).json({ error: 'Usuario incorrecto' });

        const passValida = await bcrypt.compare(password, profe.password);
        if (!passValida) return res.status(400).json({ error: 'Contraseña incorrecta' });

        const token = jwt.sign({ _id: profe._id }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, mensaje: 'Login exitoso' });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// --- GRADOS ---
app.get('/api/grados', async (req, res) => {
    try {
        const grados = await Grado.find().sort({ fecha: 1 });
        res.json(grados);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener grados' });
    }
});

app.post('/api/grados', verificarToken, async (req, res) => {
    try {
        const nueva = new Grado({ nombre: req.body.nombre });
        await nueva.save();
        res.status(201).json({ mensaje: 'Grado creado', grado: nueva });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear grado' });
    }
});

app.delete('/api/grados/:id', verificarToken, async (req, res) => {
    try {
        await Grado.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Grado eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// --- CURSOS / CLASES ---
app.get('/api/cursos', async (req, res) => {
    try {
        const cursos = await Curso.find().sort({ fecha: -1 });
        res.json(cursos);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener cursos' });
    }
});

app.post('/api/cursos', verificarToken, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, grado } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Falta la imagen de portada' });

        cloudinary.uploader.upload_stream({ folder: "colegio_cursos" }, async (error, result) => {
            if (error) return res.status(500).json({ error: 'Error subiendo imagen' });
            
            const nuevo = new Curso({ nombre, grado, url_imagen: result.secure_url });
            await nuevo.save();
            res.status(201).json({ mensaje: 'Curso creado', curso: nuevo });
        }).end(req.file.buffer);

    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.delete('/api/cursos/:id', verificarToken, async (req, res) => {
    try {
        await Curso.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Curso eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// --- ASIGNACIONES ---
app.get('/api/asignaciones', async (req, res) => {
    try {
        const asignaciones = await Asignacion.find().sort({ fecha_creacion: -1 });
        const entregasCount = await Trabajo.aggregate([
            { $group: { _id: "$asignacion_id", count: { $sum: 1 } } }
        ]);

        const asignacionesConEntregas = asignaciones.map(asig => {
            const match = entregasCount.find(e => e._id && e._id.toString() === asig._id.toString());
            return { ...asig.toObject(), entregasCount: match ? match.count : 0 };
        });
        
        res.json(asignacionesConEntregas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener asignaciones' });
    }
});

app.post('/api/asignaciones', verificarToken, async (req, res) => {
    const { titulo, grado, curso, fecha_vencimiento } = req.body;
    try {
        const nueva = new Asignacion({ titulo, grado, curso, fecha_vencimiento });
        await nueva.save();
        res.json({ mensaje: 'Asignación creada', asignacion: nueva });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear' });
    }
});

app.delete('/api/asignaciones/:id', verificarToken, async (req, res) => {
    try {
        await Asignacion.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Asignación eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// --- TRABAJOS / ENTREGAS ---
app.get('/api/trabajos', async (req, res) => {
    try {
        const trabajos = await Trabajo.find().sort({ fecha: -1 }).populate('asignacion_id', 'titulo');
        res.json(trabajos);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener trabajos' });
    }
});

app.post('/api/subir', upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, grado, asignacion_id } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Falta la imagen' });

        cloudinary.uploader.upload_stream({ folder: "colegio_entregas" }, async (error, result) => {
            if (error) return res.status(500).json({ error: 'Error subiendo a Cloudinary' });
            
            const nuevoTrabajo = new Trabajo({
                nombre_alumno: nombre,
                grado,
                asignacion_id: asignacion_id || null,
                url_imagen: result.secure_url
            });
            await nuevoTrabajo.save();
            res.status(201).json({ mensaje: '¡Éxito!', trabajo: nuevoTrabajo });
        }).end(req.file.buffer);

    } catch (error) {
        res.status(500).json({ error: 'Error general' });
    }
});

app.put('/api/trabajos/:id/calificar', verificarToken, async (req, res) => {
    try {
        const { calificacion, comentarios_maestro } = req.body;
        const trabajo = await Trabajo.findByIdAndUpdate(req.params.id, {
            calificacion,
            comentarios_maestro,
            estado: 'Calificada'
        }, { new: true });
        res.json({ mensaje: 'Calificación guardada', trabajo });
    } catch (error) {
        res.status(500).json({ error: 'Error al calificar' });
    }
});

app.delete('/api/trabajos/:id', verificarToken, async (req, res) => {
    try {
        await Trabajo.findByIdAndDelete(req.params.id);
        res.json({ mensaje: 'Entrega eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Servidor en la nube corriendo en http://localhost:${PORT}`);
    console.log(`=========================================\n`);
});
