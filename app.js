const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;

// Middleware global
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'une_clé_secrète_très_longue_ici_à_remplacer',
  resave: false,
  saveUninitialized: false
}));

// 🔁 Forcer la session à false à chaque requête (utile pour test DEV)
app.use((req, res, next) => {
  req.session.loggedIn = false;
  next();
});

// Admin : username = admin, password = 123456
const adminUser = {
  username: 'admin',
  passwordHash: '$2b$10$7YVxboB7tMyb4IE08jX9duZdAbykK2HRqR6NsmAQrQ1Xr8IBDNDZ2' // hash de "123456"
};

// 🔐 Middleware de protection
function requireLogin(req, res, next) {
  console.log('Session login =', req.session.loggedIn); // journal de la session
  if (req.session.loggedIn === true) {
    next();
  } else {
    res.redirect('/login');
  }
}

// 📄 Formulaire de connexion
app.get('/login', (req, res) => {
  res.send(`
    <h2>Connexion admin</h2>
    <form method="POST" action="/login">
      <input type="text" name="username" placeholder="Nom d’utilisateur" required /><br/>
      <input type="password" name="password" placeholder="Mot de passe" required /><br/>
      <button type="submit">Connexion</button>
    </form>
  `);
});

// 🔐 Traitement de connexion
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (
    username === adminUser.username &&
    await bcrypt.compare(password, adminUser.passwordHash)
  ) {
    req.session.loggedIn = true;
    console.log('✅ Connexion réussie pour:', username);
    res.redirect('/admin');
  } else {
    console.log('❌ Connexion échouée pour:', username);
    res.send('❌ Identifiants invalides. <a href="/login">Réessayer</a>');
  }
});

// 🔒 Espace admin sécurisé
app.get('/admin', requireLogin, (req, res) => {
  res.send(`
    <h1>✅ Bienvenue dans l'espace admin sécurisé</h1>
    <p>(Session active)</p>
    <p><a href="/logout">Se déconnecter</a></p>
  `);
});

// 🔓 Déconnexion
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log('❌ Erreur de déconnexion :', err);
      res.send('Erreur lors de la déconnexion');
    } else {
      console.log('🔒 Déconnexion effectuée.');
      res.redirect('/login');
    }
  });
});

// 🚀 Lancement du serveur
app.get('/', (req, res) => {
  res.send(`<h2>👋 Bienvenue sur le serveur MTurk</h2><p><a href="/login">Se connecter</a></p>`);
});

app.listen(PORT, () => {
  console.log(`🔐 Panneau admin dispo sur http://localhost:${PORT}/admin`);
});
