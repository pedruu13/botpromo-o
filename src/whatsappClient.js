import { makeWASocket, useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import fs from "fs";
import path from "path";

let sock;
let telegramCallback = null;

export async function startWhatsApp(onQrCode, onMessage) {
  telegramCallback = onQrCode;
  
  const authDir = path.resolve(process.cwd(), "data", "whatsapp_auth");
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr && telegramCallback) {
      console.log("Gerando QR Code do WhatsApp...");
      try {
        const qrBuffer = await QRCode.toBuffer(qr);
        telegramCallback(qrBuffer);
      } catch (err) {
        console.error("Erro ao gerar imagem do QR:", err);
      }
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Conexão do WhatsApp fechada. Reconectando:", shouldReconnect);
      if (shouldReconnect) {
        startWhatsApp(onQrCode, onMessage);
      } else {
        console.log("WhatsApp deslogado. Apague a pasta data/whatsapp_auth para gerar novo QR.");
        fs.rmSync(authDir, { recursive: true, force: true });
      }
    } else if (connection === "open") {
      console.log("? WhatsApp conectado e pronto para uso!");
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    if (m.type === "notify" && onMessage) {
      const msg = m.messages[0];
      if (!msg.key.fromMe && msg.message) {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        onMessage({
           text,
           from: msg.key.remoteJid,
           isGroup: msg.key.remoteJid.endsWith("@g.us")
        });
      }
    }
  });
}

export async function sendWhatsAppPhotoMessage(jid, imageUrl, caption) {
  if (!sock) return;
  try {
    await sock.sendMessage(jid, {
      image: { url: imageUrl },
      caption: caption
    });
    console.log(`Foto enviada pro WhatsApp JID: ${jid}`);
  } catch (error) {
    console.error("Erro ao enviar pro WhatsApp:", error);
  }
}

export async function sendWhatsAppTextMessage(jid, text) {
  if (!sock) return;
  try {
    await sock.sendMessage(jid, { text });
  } catch (error) {
    console.error("Erro no text do whatsapp:", error);
  }
}

