import fetch from "node-fetch";

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export async function sendPhotoMessage({ imageUrl, caption }) {
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
    // Se a imagem falhar (URL inválida, etc), cai pra mensagem de texto simples
    console.error("Falha ao enviar foto, tentando texto:", data.description);
    return sendTextMessage({ text: caption });
  }

  return data;
}

export async function sendTextMessage({ text }) {
  const res = await fetch(`${BASE_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
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
