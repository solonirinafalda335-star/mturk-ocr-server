require('dotenv').config(); // Charger les variables d'environnement

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS dynamique pour extensions Chrome et Render
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || origin.startsWith('chrome-extension://') || origin === 'https://mturk-ocr-server.onrender.com') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

// ✅ Middleware global CORS pour éviter certaines erreurs
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // tu peux mettre spécifique si besoin
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.json());
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

// ✅ Chargement ou initialisation des licences
const LICENSES_FILE = './licenses.json';
let licenses = {};
if (fs.existsSync(LICENSES_FILE)) {
  licenses = JSON.parse(fs.readFileSync(LICENSES_FILE, 'utf8'));
} else {
  licenses = {
    "ABC123": { valid: true, expires: "2025-08-15", deviceId: null, used: false },
  };
}
function saveLicenses() {
  fs.writeFileSync(LICENSES_FILE, JSON.stringify(licenses, null, 2));
}

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

// ✅ Liste des licences
app.get('/api/licenses', requireLogin, (req, res) => {
  res.json(licenses);
});

// ✅ Création d'une licence
app.post('/api/licenses', requireLogin, (req, res) => {
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
  while (licenses[newCode]) newCode = generateCode();

  const expireDate = new Date();
  expireDate.setDate(expireDate.getDate() + duration);

  licenses[newCode] = {
    valid: true,
    expires: expireDate.toISOString().split('T')[0],
    deviceId: null,
    used: false
  };
  saveLicenses();

  res.json({ code: newCode, expires: licenses[newCode].expires });
});

// ✅ Suppression d'une licence
app.delete('/api/licenses/:code', requireLogin, (req, res) => {
  const code = req.params.code;
  if (licenses[code]) {
    delete licenses[code];
    saveLicenses();
    return res.json({ status: 'deleted', code });
  } else {
    return res.status(404).json({ error: 'Code non trouvé' });
  }
});

// ✅ Validation publique
app.get('/api/validate', (req, res) => {
  const code = req.query.code;
  const device = req.query.device;

  if (!code || !device) {
    return res.status(400).json({ status: 'invalid', message: 'Code ou device manquant' });
  }

  const license = licenses[code];

  if (!license || !license.valid) {
    return res.json({ status: 'invalid' });
  }

  const today = new Date().toISOString().split('T')[0];

  if (license.expires < today) {
    return res.json({ status: 'expired' });
  }

  if (license.used && license.deviceId !== device) {
    return res.json({ status: 'used_on_another_device' });
  }

  if (license.used && license.deviceId === device) {
    return res.json({ status: 'valid', expires: license.expires });
  }

  if (!license.used) {
    license.deviceId = device;
    license.used = true;
    saveLicenses();
    return res.json({ status: 'valid', expires: license.expires });
  }

  return res.json({ status: 'invalid' });
});

// ✅ 🔧 Route pour améliorer le texte (appel IA)
app.post('/api/ameliorer', (req, res) => {
  const texte = req.body.texte || '';
  const texteCorrige = texte
    .replace(/\s+/g, ' ')         // supprime trop d'espaces
    .replace(/[^a-zA-Z0-9.,€$ \n]/g, '') // nettoie caractères spéciaux
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
