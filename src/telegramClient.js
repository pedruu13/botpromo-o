const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export async function sendPhotoMessage({ imageUrl, caption }) {
  // Tenta enviar por URL primeiro
  const res = await fetch(`${BASE_URL}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      photo: imageUrl,
      caption,
      parse_mode: "HTML",
    }),
  });

  const data = await res.json();

  if (!data.ok) {
    console.warn(`Falha ao enviar foto por URL (${data.description}). Tentando baixar e enviar como anexo...`);
    try {
      const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const arrayBuffer = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("photo", new Blob([buffer]), "image.jpg");
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");

      const uploadRes = await fetch(`${BASE_URL}/sendPhoto`, {
        method: "POST",
        body: formData
      });
      const uploadData = await uploadRes.json();
      
      if (uploadData.ok) {
        return uploadData;
      } else {
        console.error("Falha ao enviar foto baixada, tentando texto:", uploadData.description);
      }
    } catch (e) {
      console.error("Erro ao baixar foto:", e.message);
    }
    
    // Fallback final: mensagem de texto com link preview
    return sendTextMessage({ text: caption });
  }

  return data;
}

export async function sendTextMessage({ text, chat_id = TELEGRAM_CHAT_ID }) {
  const res = await fetch(`${BASE_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Erro no Telegram: ${data.description}`);
  }
  return data;
}

// Escuta as mensagens (Long Polling)
export async function startListening(onMessage) {
  let lastUpdateId = 0;
  console.log("🎧 Bot ouvindo mensagens no Telegram...");

  setInterval(async () => {
    try {
      const res = await fetch(`${BASE_URL}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`);
      const data = await res.json();
      
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          
          if (update.message) {
             onMessage(update.message);
          }
        }
      }
    } catch (err) {
      console.error("Erro no polling do Telegram:", err.message);
    }
  }, 2000);
}

export async function sendPhotoBuffer({ buffer, caption, chat_id = TELEGRAM_CHAT_ID }) {
  if (!TELEGRAM_BOT_TOKEN || !chat_id) return;
  try {
    const formData = new FormData();
    formData.append("chat_id", chat_id);
    formData.append("photo", new Blob([buffer]), "qrcode.png");
    if (caption) {
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
    }

    const response = await fetch(`${BASE_URL}/sendPhoto`, {
      method: "POST",
      body: formData
    });
    
    return await response.json();
  } catch (error) {
    console.error("Erro ao enviar QR Code:", error.message);
  }
}
