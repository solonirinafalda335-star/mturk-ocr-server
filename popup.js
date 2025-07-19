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

// Fonction pour ajouter bouton "Changer de code"
function addResetButton() {
  if (document.getElementById('resetCodeBtn')) return; // déjà présent

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
    document.getElementById('launchOCRBtn').style.display = 'none';
    document.getElementById('result').textContent = '🔒 Code requis pour activer les fonctions OCR.';
    resetBtn.remove();
  });

  const validateBtn = document.getElementById('validateBtn');
  validateBtn.insertAdjacentElement('afterend', resetBtn);
}

// Initialisation au chargement de la popup
document.addEventListener('DOMContentLoaded', () => {
  const resultEl = document.getElementById('result');
  const launchOCRBtn = document.getElementById('launchOCRBtn');
  const licenseInput = document.getElementById('licenseCode');
  const validateBtn = document.getElementById('validateBtn');

  chrome.storage.local.get(['activated', 'licenseCode', 'expires'], (data) => {
    if (data.activated && data.expires && !isExpired(data.expires)) {
      resultEl.textContent = `✅ Code déjà activé. Expire le ${data.expires}`;
      launchOCRBtn.style.display = 'block';
      licenseInput.value = data.licenseCode || '';
      licenseInput.disabled = true;
      validateBtn.disabled = true;
      addResetButton();
    } else {
      resultEl.textContent = '🔒 Code requis pour activer les fonctions OCR.';
      launchOCRBtn.style.display = 'none';
      licenseInput.disabled = false;
      validateBtn.disabled = false;
    }
  });

  validateBtn.addEventListener('click', () => {
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
            launchOCRBtn.style.display = 'block';
            licenseInput.disabled = true;
            validateBtn.disabled = true;
            addResetButton();
          } else if (data.status === "expired") {
            resultEl.textContent = "❌ Ce code est expiré.";
            chrome.storage.local.set({ activated: false });
            launchOCRBtn.style.display = 'none';
          } else if (data.status === "already_used" || data.status === "used_on_another_device") {
            resultEl.textContent = "🚫 Code déjà utilisé.";
            chrome.storage.local.set({ activated: false });
            launchOCRBtn.style.display = 'none';
          } else {
            resultEl.textContent = "🚫 Code invalide.";
            chrome.storage.local.set({ activated: false });
            launchOCRBtn.style.display = 'none';
          }
        })
        .catch(() => {
          resultEl.textContent = "Erreur de connexion au serveur.";
          chrome.storage.local.set({ activated: false });
          launchOCRBtn.style.display = 'none';
        });
    });
  });

  launchOCRBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'startOCR' }, () => {
      resultEl.textContent = "📸 OCR lancé pour la journée !";
    });
  });
});
