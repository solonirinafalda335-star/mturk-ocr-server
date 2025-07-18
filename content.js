let ocrWorker = null;
let ocrDejaLance = false; // Pour éviter de lancer plusieurs fois

// 🔧 Corrige certaines erreurs OCR courantes
function correctCommonErrors(text) {
  return text
    .replace(/[^\w\s\.\-]/g, '') // supprime caractères bizarres
    .replace(/0/g, 'O')          // 0 → O
    .replace(/1/g, 'I')          // 1 → I
    .replace(/\s{2,}/g, ' ')     // espaces multiples → simple
    .trim();
}

// ✅ Vérifie si c’est un vrai montant
function estMontantValide(valeur) {
  const nombre = parseFloat(valeur.replace(',', '.'));
  return !isNaN(nombre) && nombre > 0;
}

// 📋 Copie texte dans presse-papier
function copierDansPressePapier(texte) {
  navigator.clipboard.writeText(texte).then(() => {
    console.log('📋 Texte OCR copié.');
  }).catch(err => {
    console.warn('❌ Erreur copie clipboard :', err);
  });
}

// ⚙️ Init worker multilingue
async function initWorker() {
  if (!ocrWorker) {
    ocrWorker = Tesseract.createWorker({
      workerPath: chrome.runtime.getURL('worker.min.js'),
      corePath: chrome.runtime.getURL('tesseract-core.wasm'),
      logger: m => console.log('🧠 OCR:', m.status, Math.round(m.progress * 100) + '%')
    });

    await ocrWorker.load();
    await ocrWorker.loadLanguage('eng+fra');
    await ocrWorker.initialize('eng+fra');
  }
}

// 📐 Redimensionne image pour l’OCR
function resizeImage(img, maxWidth = 1000) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/png'));
  });
}

// 🚀 OCR automatique
async function launchOCR() {
  if (ocrDejaLance) return;
  const img = document.querySelector('img');
  if (!img) return;

  ocrDejaLance = true; // 🔐 Ne lance qu'une fois
  console.log('🧠 Image détectée, OCR en cours...');

  await initWorker();

  const resizedImage = await resizeImage(img);
  const { data: { text } } = await ocrWorker.recognize(resizedImage);
  console.log('📄 Texte OCR brut :\n', text);

  const cleanedText = correctCommonErrors(text);
  console.log('🧹 Texte corrigé :\n', cleanedText);

  copierDansPressePapier(cleanedText);
  remplirFormulaire(cleanedText);
}

// ✍️ Remplit les champs
function remplirFormulaire(text) {
  const lignes = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.match(/total|subtotal|tax|change|tps|tvq/i));

  let ligneIndex = 1;
  lignes.forEach(ligne => {
    const parts = ligne.split(/\s+/);
    if (parts.length < 2) return;

    const montant = parts.pop();
    const description = parts.join(' ');

    if (!estMontantValide(montant)) return;

    const champDescription = document.querySelector(`input[name="item_desc_${ligneIndex}"]`);
    const champMontant = document.querySelector(`input[name="item_price_${ligneIndex}"]`);

    if (champDescription) champDescription.value = description;
    if (champMontant) champMontant.value = montant;

    console.log(`✅ Ligne ${ligneIndex} remplie : "${description}" - ${montant}`);
    ligneIndex++;
  });
}

// 👁️‍🗨️ Active l’OCR quand une image arrive
const observer = new MutationObserver(() => {
  const img = document.querySelector('img');
  if (img && !ocrDejaLance) {
    launchOCR(); // Lancer automatiquement
  }
});

// Démarrage de l'observateur
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 🎯 Support pour le bouton manuel aussi
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'startOCR') {
    launchOCR();
    sendResponse({ status: 'OCR lancé avec succès' });
    afficherNotification('✅ OCR terminé. Formulaire rempli !');
  }
  function afficherNotification(message, couleur = '#4CAF50') {
  const notif = document.createElement('div');
  notif.textContent = message;
  notif.style.position = 'fixed';
  notif.style.top = '10px';
  notif.style.left = '50%';
  notif.style.transform = 'translateX(-50%)';
  notif.style.background = couleur;
  notif.style.color = 'white';
  notif.style.padding = '10px 20px';
  notif.style.borderRadius = '8px';
  notif.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
  notif.style.zIndex = '9999';
  notif.style.fontSize = '16px';
  notif.style.opacity = '0.95';
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.remove();
  }, 4000);
}
});
