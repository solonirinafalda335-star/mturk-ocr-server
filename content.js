let ocrWorker = null;
let ocrDejaLance = false;

// ✅ Corrige les erreurs fréquentes des tickets (0 → O, 1 → I, caractères spéciaux)
function correctCommonErrors(text) {
  return text
    .replace(/[^\w\s\.\,\-€$]/g, '')
    .replace(/0(?=\D)/g, 'O') // évite 0 à la place de O
    .replace(/1(?=[a-zA-Z])/g, 'I')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ✅ Vérifie si un montant semble valide
function estMontantValide(valeur) {
  const propre = valeur.replace(',', '.').replace(/[^\d.]/g, '');
  const nombre = parseFloat(propre);
  return !isNaN(nombre) && nombre > 0;
}

// ✅ Essaie d'extraire montant et description d'une ligne
function analyserLigneTicket(ligne) {
  const match = ligne.match(/^(.+?)\s+([0-9]+[,.][0-9]{2})$/);
  if (match) {
    return { description: match[1].trim(), montant: match[2].replace(',', '.') };
  }
  return null;
}

// 📋 Copie texte dans presse-papier
function copierDansPressePapier(texte) {
  navigator.clipboard.writeText(texte).then(() => {
    console.log('📋 Texte OCR copié.');
    afficherNotification('📋 Texte copié avec succès');
  }).catch(err => {
    console.warn('❌ Erreur copie clipboard :', err);
  });
}

// 💾 Sauvegarde texte OCR dans un fichier .txt
function sauvegarderTexteDansFichier(texte) {
  const maintenant = new Date();
  const timestamp = maintenant.toISOString().replace(/[:]/g, '-').split('.')[0];
  const nomFichier = `ocr_${timestamp}.txt`;
  const blob = new Blob([texte], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
  console.log(`💾 Fichier "${nomFichier}" téléchargé automatiquement.`);
}

// ⚙️ Initialise Tesseract avec PSM 6 (ligne de texte)
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
    await ocrWorker.setParameters({ tessedit_pageseg_mode: '6' });
  }
}

// 📐 Redimensionne et convertit en noir et blanc pour plus de clarté
function resizeImage(img, maxWidth = 1000) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i+1] + data[i+2]) / 3;
      const bw = avg > 128 ? 255 : 0;
      data[i] = data[i+1] = data[i+2] = bw;
    }
    ctx.putImageData(imageData, 0, 0);
    resolve(canvas.toDataURL('image/png'));
  });
}

// 🤖 Envoie du texte à l’IA pour amélioration (Render)
async function envoyerTexteAI(texte) {
  try {
    const response = await fetch('https://mturk-ocr-server.onrender.com/api/ameliorer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ texte })
    });

    if (!response.ok) throw new Error('Erreur serveur IA');
    const data = await response.json();
    return data.texteCorrige || texte;
  } catch (err) {
    console.warn('❌ Échec amélioration IA :', err);
    return texte;
  }
}

// 🚀 Lancement OCR automatique
async function launchOCR() {
  if (ocrDejaLance) return;
  const img = document.querySelector('img');
  if (!img) return;

  ocrDejaLance = true;
  console.log('🧠 Image détectée, OCR en cours...');

  await initWorker();
  const resizedImage = await resizeImage(img);
  const { data: { text } } = await ocrWorker.recognize(resizedImage);
  console.log('📄 Texte OCR brut :\n', text);

  const cleanedText = correctCommonErrors(text);
  console.log('🧹 Texte corrigé :\n', cleanedText);

  const texteAmeliore = await envoyerTexteAI(cleanedText);
  console.log('🧠 Texte amélioré par IA :\n', texteAmeliore);

  copierDansPressePapier(texteAmeliore);
  sauvegarderTexteDansFichier(texteAmeliore);

  const lignesAmeliorees = texteAmeliore
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => correctCommonErrors(l))
    .join('\n');

  remplirFormulaire(lignesAmeliorees);
  afficherNotification('🎉 Traitement complet terminé');
}

// ✍️ Remplit automatiquement tous les champs
function remplirFormulaire(text) {
  const lignes = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.match(/total|subtotal|tax|change|tps|tvq/i));

  let ligneIndex = 1;
  let lignesRemplies = 0;

  lignes.forEach(ligne => {
    const analyse = analyserLigneTicket(ligne);
    if (!analyse || !estMontantValide(analyse.montant)) return;

    const champDescription = document.querySelector(`input[name="item_desc_${ligneIndex}"]`);
    const champMontant = document.querySelector(`input[name="item_price_${ligneIndex}"]`);

    if (champDescription && champMontant) {
      champDescription.value = analyse.description;
      champMontant.value = analyse.montant;
      lignesRemplies++;
      console.log(`✅ Ligne ${ligneIndex} remplie : "${analyse.description}" - ${analyse.montant}`);
    }

    ligneIndex++;
  });

  if (lignesRemplies > 0) {
    afficherNotification(`✅ ${lignesRemplies} lignes collées automatiquement`);
  } else {
    afficherNotification(`⚠️ Aucun champ rempli`, '#FFA500');
  }
}

// 👁️ Détecte automatiquement image et lance OCR
const observer = new MutationObserver(() => {
  const img = document.querySelector('img');
  if (img && !ocrDejaLance) {
    launchOCR();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 🔔 Affiche notifications visuelles
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
  setTimeout(() => notif.remove(), 4000);
}

// 🎯 Permet le déclenchement manuel par bouton
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'startOCR') {
    launchOCR();
    sendResponse({ status: 'OCR lancé avec succès' });
  }
});

// 📷 Bouton OCR flottant
function creerBoutonOCR() {
  const bouton = document.createElement('button');
  bouton.textContent = '📷 OCR';
  bouton.style.position = 'fixed';
  bouton.style.bottom = '20px';
  bouton.style.right = '20px';
  bouton.style.zIndex = '10000';
  bouton.style.padding = '10px 14px';
  bouton.style.border = 'none';
  bouton.style.borderRadius = '20px';
  bouton.style.backgroundColor = '#6200EE';
  bouton.style.color = 'white';
  bouton.style.fontSize = '14px';
  bouton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
  bouton.style.cursor = 'pointer';
  bouton.style.opacity = '0.9';
  bouton.style.transition = 'opacity 0.3s ease';

  bouton.onmouseenter = () => bouton.style.opacity = '1';
  bouton.onmouseleave = () => bouton.style.opacity = '0.9';
  bouton.addEventListener('click', () => {
    ocrDejaLance = false;
    launchOCR();
  });

  document.body.appendChild(bouton);
}

window.addEventListener('load', () => {
  creerBoutonOCR();
});
