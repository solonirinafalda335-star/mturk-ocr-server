// 📌 Version complète de content.js avec OCR + IA + remplissage MTurk

function getImagesVisibles() {
  return [...document.images].filter(img => {
    const rect = img.getBoundingClientRect();
    return rect.width > 50 && rect.height > 50 && rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
}

function resetZoomSurToutesLesImages() {
  document.querySelectorAll('img').forEach(img => {
    img.style.transform = "";
  });
}

function creerInterfaceOCR() {
  const texteOCR = document.createElement("textarea");
  texteOCR.style.position = "fixed";
  texteOCR.style.bottom = "100px";
  texteOCR.style.left = "10px";
  texteOCR.style.width = "300px";
  texteOCR.style.height = "150px";
  texteOCR.style.zIndex = 9999;
  texteOCR.style.fontSize = "12px";

  const boutonColler = document.createElement("button");
  boutonColler.textContent = "📋 Coller vers MTurk";
  boutonColler.disabled = true;
  boutonColler.style.position = "fixed";
  boutonColler.style.bottom = "40px";
  boutonColler.style.left = "10px";
  boutonColler.style.padding = "10px";
  boutonColler.style.zIndex = 9999;

  document.body.appendChild(texteOCR);
  document.body.appendChild(boutonColler);

  return { texteOCR, boutonColler };
}

function remplirFormulaireMTurk(texte) {
  const champ = document.querySelector("textarea") || document.querySelector("input");
  if (champ) champ.value = texte;
  alert("✅ Texte OCR collé dans le champ");
}

// 🧠 Fonction principale : scroll, zoom, OCR et remplissage

async function scrollEtZoomEtOCR() {
  const images = getImagesVisibles();
  if (!images.length) return console.warn("⚠️ Aucune image visible");

  const { texteOCR, boutonColler } = creerInterfaceOCR();

  const worker = await Tesseract.createWorker({
    logger: m => console.log("📥 Progression OCR:", m)
  });
  await worker.loadLanguage('eng');
  await worker.initialize('eng');

  let texteComplet = "";

  for (let img of images) {
    resetZoomSurToutesLesImages();

    const rect = img.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top - window.innerHeight / 4;
    window.scrollTo({ top: scrollTop, behavior: "smooth" });

    await new Promise(r => setTimeout(r, 800));

    img.style.transition = "transform 0.5s ease";
    img.style.transform = "scale(1.4)";
    img.style.transformOrigin = "top center";

    await new Promise(r => setTimeout(r, 1200));

    let lastY = 0;
    let scrollDone = false;
    while (!scrollDone) {
      window.scrollBy(0, 100);
      await new Promise(r => setTimeout(r, 600));
      const currentY = window.scrollY;
      if (Math.abs(currentY - lastY) < 20) scrollDone = true;
      lastY = currentY;
    }

    try {
      const { data: { text } } = await worker.recognize(img);
      texteComplet += `\n\n------ Image suivante ------\n\n` + text;
    } catch (e) {
      console.error("❌ Erreur OCR image:", e);
    }

    img.style.transform = "";
  }

  await worker.terminate();

  texteOCR.textContent = texteComplet;
  boutonColler.disabled = false;
  boutonColler.style.cursor = "pointer";

  // 🤖 Envoi à l’IA pour correction texte simple (pas encore JSON structuré)
try {
  const response = await fetch("https://mturk-ocr-server.onrender.com/api/ameliorer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texte: texteComplet })
  });

  if (!response.ok) throw new Error("Réponse IA invalide");

  const donneesIA = await response.json();

  if (!donneesIA.texteCorrige) throw new Error("Pas de texte corrigé reçu");

  // remplirFormulaireMTurkIA(donneesIA); // commente pour l’instant

  remplirFormulaireMTurk(donneesIA.texteCorrige);

  console.log("✅ Texte corrigé reçu et collé dans le formulaire");
} catch (err) {
  console.error("❌ Erreur IA :", err);
  alert("❌ Erreur IA – Le formulaire sera rempli avec le texte brut OCR");

  boutonColler.onclick = () => remplirFormulaireMTurk(texteOCR.value);
}};

// ✏️ Nouveau : Remplissage avec les données JSON de l’IA
function remplirFormulaireMTurkIA(data) {
  const setValueIfFound = (selector, value) => {
    const el = document.querySelector(selector);
    if (el && value) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  setValueIfFound("#storeName", data.store || "");
  setValueIfFound("#phone", data.phone || "");
  setValueIfFound("#address", data.address || "");
  setValueIfFound("#purchaseDate", data.date || "");
  setValueIfFound("#total", data.total || "");

  (data.items || []).forEach((item, i) => {
    setValueIfFound(`#itemDescription${i + 1}`, item.description);
    setValueIfFound(`#itemPrice${i + 1}`, item.price);
  });

  alert("✅ Formulaire MTurk rempli avec les données IA !");
}

// Lance l’action automatiquement
scrollEtZoomEtOCR();
