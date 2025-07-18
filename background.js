chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startOCR') {
    console.log("🔁 OCR reçu en background !");
    // ici tu peux lancer un script, ouvrir une fenêtre, etc.
    sendResponse({ status: 'OK' });
  }

  return true; // permet les réponses async si besoin
});
