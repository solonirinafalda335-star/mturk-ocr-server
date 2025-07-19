const bcrypt = require('bcrypt');

const password = 'admin2025';
const hash = '$2b$10$1H.XGEOuwYKeGnWlz8hrn.3AjzfqRkU8AxKcMms0aFyM7tbsKQhNS';

bcrypt.compare(password, hash, (err, result) => {
  if (result) {
    console.log('✅ Mot de passe correct');
  } else {
    console.log('❌ Mot de passe incorrect');
  }
});
