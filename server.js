require('dotenv').config(); // Charger les variables d'environnement

const express = require('express');
const app = express(); // DOIT être avant tout app.use()

const { Pool } = require('pg');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');

// 🔐 CORS sécurisé
const allowedOrigins = [
  'https://d1398z09um24hh.cloudfront.net', // Ton vrai domaine CloudFront
  'chrome-extension://',                  // Pour autoriser depuis une extension
  'http://localhost:3000'                 // Pour les tests locaux
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // important sur Render
});

const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'une_clef_secrete_longue',
  resave: false,
  saveUninitialized: false,
  cookie: {}
}));

// ✅ Utilisateur admin
const adminUser = {
  username: 'admin',
  passwordHash: '$2b$10$xZKwwLzsUUDre.kYnFH04uEW3JuBZKSIXFHBTuOZeq.y9I87l1qXK' // hash de 'admin2025'
};

// ✅ Middleware session admin
function requireLogin(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/login');
}

// ✅ Interface login
app.get('/login', (req, res) => {
  res.send(`
    <h2>Connexion Admin</h2>
    <form method="POST" action="/login">
      <input name="username" placeholder="Nom d'utilisateur" required /><br/>
      <input type="password" name="password" placeholder="Mot de passe" required /><br/>
      <button>Se connecter</button>
    </form>
  `);
});

// ✅ Traitement login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === adminUser.username && await bcrypt.compare(password, adminUser.passwordHash)) {
    req.session.loggedIn = true;
    res.redirect('/admin');
  } else {
    res.send('❌ Identifiants invalides. <a href="/login">Réessayer</a>');
  }
});

// ✅ Interface admin
app.get('/admin', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ✅ Déconnexion
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// === Gestion des licences avec PostgreSQL ===

// Pour stocker les licences, crée une table SQL comme :
// CREATE TABLE licenses (
//   code VARCHAR(6) PRIMARY KEY,
//   valid BOOLEAN NOT NULL,
//   expires DATE NOT NULL,
//   deviceid VARCHAR(255),
//   used BOOLEAN NOT NULL
// );

// ✅ Liste des licences
app.get('/api/licenses', requireLogin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM licenses ORDER BY expires');
    res.json(result.rows.reduce((acc, row) => {
      acc[row.code] = {
        valid: row.valid,
        expires: row.expires.toISOString().split('T')[0],
        deviceId: row.deviceid,
        used: row.used
      };
      return acc;
    }, {}));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Création d'une licence
app.post('/api/licenses', requireLogin, async (req, res) => {
  const { duration } = req.body;
  if (![7, 30].includes(duration)) return res.status(400).json({ error: 'Durée invalide' });

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  let newCode = generateCode();

  try {
    // Vérifie si le code existe déjà
    let exists = true;
    while (exists) {
      const { rowCount } = await pool.query('SELECT 1 FROM licenses WHERE code = $1', [newCode]);
      if (rowCount === 0) exists = false;
      else newCode = generateCode();
    }

    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + duration);
    const expires = expireDate.toISOString().split('T')[0];

    await pool.query(
      'INSERT INTO licenses (code, valid, expires, deviceid, used) VALUES ($1, $2, $3, $4, $5)',
      [newCode, true, expires, null, false]
    );

    res.json({ code: newCode, expires });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Suppression d'une licence
app.delete('/api/licenses/:code', requireLogin, async (req, res) => {
  const code = req.params.code;

  try {
    const result = await pool.query('DELETE FROM licenses WHERE code = $1', [code]);
    if (result.rowCount > 0) {
      res.json({ status: 'deleted', code });
    } else {
      res.status(404).json({ error: 'Code non trouvé' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ Validation publique
app.get('/api/validate', async (req, res) => {
  const code = req.query.code;
  const device = req.query.device;

  if (!code || !device) {
    return res.status(400).json({ status: 'invalid', message: 'Code ou device manquant' });
  }

  try {
    const result = await pool.query('SELECT * FROM licenses WHERE code = $1', [code]);
    if (result.rowCount === 0) return res.json({ status: 'invalid' });

    const license = result.rows[0];
    const today = new Date().toISOString().split('T')[0];

    if (!license.valid) return res.json({ status: 'invalid' });
    if (license.expires.toISOString().split('T')[0] < today) return res.json({ status: 'expired' });
    if (license.used && license.deviceid !== device) return res.json({ status: 'used_on_another_device' });
    if (license.used && license.deviceid === device) return res.json({ status: 'valid', expires: license.expires.toISOString().split('T')[0] });

    if (!license.used) {
      await pool.query('UPDATE licenses SET used = $1, deviceid = $2 WHERE code = $3', [true, device, code]);
      return res.json({ status: 'valid', expires: license.expires.toISOString().split('T')[0] });
    }

    return res.json({ status: 'invalid' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ✅ 🔧 Route pour améliorer le texte (appel IA)
app.post('/api/ameliorer', (req, res) => {
  const texte = req.body.texte || '';
  const texteCorrige = texte
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9.,€$ \n]/g, '')
    .trim();

  res.json({ texteCorrige });
});

// ✅ Page d’accueil
app.get('/', (req, res) => {
  res.send('Bienvenue sur le serveur MTurk OCR. Utilisez /login pour vous connecter.');
});

// ✅ Lancer le serveur
app.listen(PORT, () => {
  console.log(`🔐 Serveur démarré sur http://localhost:${PORT}`);
});
