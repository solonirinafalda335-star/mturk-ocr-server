const bcrypt = require('bcrypt');
const password = 'admin2025';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Erreur lors du hash:', err);
    return;
  }
  console.log('Mot de passe:', password);
  console.log('Hash bcrypt généré:', hash);
});
