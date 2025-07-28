// --- Ajout : fonction pour vérifier si l’onglet actif est bien worker.mturk.com ---
function verifierOngletMTurk(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      callback(false);
      return;
    }
    const url = tabs[0].url || '';
    if (url.startsWith('https://worker.mturk.com/')) {
      callback(true);
    } else {
      callback(false);
    }
  });
}

// --- Ajout : avant DOMContentLoaded on peut définir cette fonction, sinon garder ici ---

// Ajout du bouton OCR intelligent et traitement automatique
function lancerOCRIntelligent() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
        if (!window.Tesseract) {
          alert("Tesseract.js n’est pas chargé !");
          return;
        }

        const receiptImage = document.querySelector('img');
        if (!receiptImage) {
          alert("Aucune image trouvée !");
          return;
        }

        Tesseract.recognize(receiptImage.src, 'eng').then(result => {
          const lignes = result.data.text.split('\n').filter(l => l.trim().length > 0);

          const items = [];
          let total_detected = null;
          let store = null;
          let date = null;

          lignes.forEach(line => {
            const matchItem = line.match(/(.+)\s+(\d+[\.,]\d{2})/);
            if (matchItem) {
              items.push({ name: matchItem[1].trim(), price: parseFloat(matchItem[2].replace(',', '.')) });
            }

            if (!total_detected && /total/i.test(line)) {
              const matchTotal = line.match(/(\d+[\.,]\d{2})/);
              if (matchTotal) total_detected = parseFloat(matchTotal[1].replace(',', '.'));
            }

            if (!store && /walmart|target|costco|loblaws|superstore|metro|iga/i.test(line)) {
              store = line.trim();
            }

            if (!date && /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/.test(line)) {
              date = line.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/)[1];
            }
          });

          const total_calculated = items.reduce((sum, item) => sum + item.price, 0);
          const resume = `Magasin : ${store || 'Inconnu'}\nDate : ${date || 'Non détectée'}\n\nArticles :\n` +
            items.map(i => `- ${i.name}: ${i.price.toFixed(2)} €`).join('\n') +
            `\n\nTotal détecté : ${total_detected ?? '—'} €\nTotal calculé : ${total_calculated.toFixed(2)} €` +
            ((total_detected && Math.abs(total_detected - total_calculated) > 0.05)
              ? '\n⚠️ Attention : incohérence de total !'
              : '\n✅ Totaux cohérents.');

          chrome.runtime.sendMessage({ type: "OCR_RESULT", resume, items, total_detected, total_calculated });
        });
      }
    });
  });
}

// Écoute du message OCR_RESULT
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OCR_RESULT") {
    const resultEl = document.getElementById('result');
    resultEl.textContent = msg.resume;
    if (msg.items.length > 0) {
      envoyerMessageContentScript({ action: 'showCopyPasteButtons' });
    }
  }
});

// Le reste de ton code d’activation (inchangé)

function getOrCreateDeviceId(callback) {
  chrome.storage.local.get('deviceId', (result) => {
    if (result.deviceId) {
      callback(result.deviceId);
    } else {
      const newId = crypto.randomUUID();
      chrome.storage.local.set({ deviceId: newId }, () => {
        callback(newId);
      });
    }
  });
}

function isExpired(dateString) {
  const today = new Date().toISOString().split('T')[0];
  return dateString < today;
}

function addResetButton() {
  if (document.getElementById('resetCodeBtn')) return;

  const resetBtn = document.createElement('button');
  resetBtn.id = 'resetCodeBtn';
  resetBtn.textContent = '🔄 Changer de code';
  resetBtn.style.backgroundColor = '#d32f2f';
  resetBtn.style.color = 'white';
  resetBtn.style.border = 'none';
  resetBtn.style.borderRadius = '6px';
  resetBtn.style.padding = '10px';
  resetBtn.style.cursor = 'pointer';
  resetBtn.style.width = '100%';
  resetBtn.style.marginTop = '5px';

  resetBtn.addEventListener('click', () => {
    chrome.storage.local.set({ activated: false, licenseCode: '', expires: '' });
    document.getElementById('licenseCode').value = '';
    document.getElementById('licenseCode').disabled = false;
    document.getElementById('validateBtn').disabled = false;

    const ocrBtn = document.getElementById('launchOCRBtn');
    if (ocrBtn) ocrBtn.style.display = 'none';

    document.getElementById('result').textContent = '🔒 Code requis pour activer les fonctions OCR.';
    resetBtn.remove();

    envoyerMessageContentScript({ action: 'hideCopyPasteButtons' });
  });

  const validateBtn = document.getElementById('validateBtn');
  validateBtn.insertAdjacentElement('afterend', resetBtn);
}

function envoyerMessageContentScript(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs.length === 0) return;

    chrome.tabs.sendMessage(tabs[0].id, message, response => {
      if (chrome.runtime.lastError) {
        console.warn('⚠️ Aucun content script actif dans l’onglet courant.');
        return;
      }
      console.log('📩 Message envoyé au content script :', response);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const resultEl = document.getElementById('result');
  const licenseInput = document.getElementById('licenseCode');
  const validateBtn = document.getElementById('validateBtn');

  // --- AJOUT : on vérifie d'abord que l'onglet actif est une page MTurk ---
  verifierOngletMTurk((estMTurk) => {
    if (!estMTurk) {
      resultEl.textContent = "❌ Veuillez ouvrir une page MTurk (worker.mturk.com) pour utiliser cette extension.";
      licenseInput.disabled = true;
      validateBtn.disabled = true;
      return;
    }

    // Si ok, on continue comme avant
    chrome.storage.local.get(['activated', 'licenseCode', 'expires'], (data) => {
      if (data.activated && data.expires && !isExpired(data.expires)) {
        resultEl.textContent = `✅ Code déjà activé. Expire le ${data.expires}`;
        licenseInput.value = data.licenseCode || '';
        licenseInput.disabled = true;
        validateBtn.disabled = true;
        addResetButton();
        envoyerMessageContentScript({ action: 'showCopyPasteButtons' });
      } else {
        resultEl.textContent = '🔒 Code requis pour activer les fonctions OCR.';
        const ocrBtn = document.getElementById('launchOCRBtn');
        if (ocrBtn) ocrBtn.style.display = 'none';

        licenseInput.disabled = false;
        validateBtn.disabled = false;
      }
    });
  });

  validateBtn.addEventListener('click', () => {
    verifierOngletMTurk((estMTurk) => {
      if (!estMTurk) {
        resultEl.textContent = "❌ Veuillez ouvrir une page MTurk pour valider le code.";
        return;
      }

      const code = licenseInput.value.trim();
      if (!code) {
        resultEl.textContent = "Merci d’entrer un code valide.";
        return;
      }

      getOrCreateDeviceId((deviceId) => {
        fetch(`https://mturk-ocr-server.onrender.com/api/validate?code=${encodeURIComponent(code)}&device=${encodeURIComponent(deviceId)}`)
          .then(response => response.json())
          .then(data => {
            if (data.status === "valid") {
              resultEl.textContent = `✅ Code valide jusqu’au ${data.expires}`;
              chrome.storage.local.set({
                activated: true,
                licenseCode: code,
                expires: data.expires
              });
              licenseInput.disabled = true;
              validateBtn.disabled = true;
              addResetButton();
              envoyerMessageContentScript({ action: 'showCopyPasteButtons' });
            } else if (data.status === "expired") {
              resultEl.textContent = "❌ Ce code est expiré.";
              chrome.storage.local.set({ activated: false });
            } else if (data.status === "already_used" || data.status === "used_on_another_device") {
              resultEl.textContent = "🚫 Code déjà utilisé.";
              chrome.storage.local.set({ activated: false });
            } else {
              resultEl.textContent = "🚫 Code invalide.";
              chrome.storage.local.set({ activated: false });
            }
          })
          .catch(() => {
            resultEl.textContent = "Erreur de connexion au serveur.";
            chrome.storage.local.set({ activated: false });
          });
      });
    });
  });
});
