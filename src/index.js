import "dotenv/config";
import cron from "node-cron";
import { fetchProductOffers } from "./shopeeClient.js";
import { fetchAliExpressOffers } from "./aliExpressClient.js";
import { fetchAwinOffers } from "./awinClient.js";
import { fetchMercadoLivreOffers } from "./mercadoLivreClient.js";
import { sendPhotoMessage } from "./telegramClient.js";
import { filterUnposted, markAsPosted, clearPosted } from "./store.js";
import { formatOfferMessage } from "./formatMessage.js";

import { loadSettings, saveSettings } from "./configStore.js";

function isAppropriate(product, blockedKeywords, activeCategories = [], categories = {}) {
  const name = String(product.productName || "").toLowerCase();
  
  if (blockedKeywords.some((word) => name.includes(word))) {
    return false;
  }

  if (activeCategories.length > 0) {
    const activeKeywords = activeCategories.flatMap(cat => categories[cat] || []);
    if (!activeKeywords.some(word => name.includes(word))) {
      return false;
    }
  }

  return true;
}

const MIN_COMMISSION_RATE = Number(process.env.MIN_COMMISSION_RATE || 0.1);
const PRODUCTS_PER_FETCH = Number(process.env.PRODUCTS_PER_FETCH || 20);
const FETCH_INTERVAL_MINUTES = Number(process.env.FETCH_INTERVAL_MINUTES || 30);

async function runCycle() {
  const settings = loadSettings();
  if (settings.isPaused) {
    console.log(`[${new Date().toISOString()}] Bot está pausado. Pulando ciclo...`);
    return;
  }
  
  console.log(`[${new Date().toISOString()}] Buscando ofertas nas lojas (Shopee, AliExpress, Awin)...`);

  let offers = [];
  try {
    const [shopeeResult, aliResult, awinResult] = await Promise.allSettled([
      fetchProductOffers({ limit: PRODUCTS_PER_FETCH }),
      fetchAliExpressOffers({ limit: PRODUCTS_PER_FETCH }),
      fetchAwinOffers({ limit: PRODUCTS_PER_FETCH }),
    ]);

    const shopeeOffers = shopeeResult.status === "fulfilled" ? shopeeResult.value : [];
    const aliOffers = aliResult.status === "fulfilled" ? aliResult.value : [];
    const awinOffers = awinResult.status === "fulfilled" ? awinResult.value : [];

    if (shopeeResult.status === "rejected") console.error("Falha Shopee:", shopeeResult.reason);
    if (aliResult.status === "rejected") console.error("Falha AliExpress:", aliResult.reason);
    if (awinResult.status === "rejected") console.error("Falha Awin:", awinResult.reason);

    offers = [...shopeeOffers, ...aliOffers, ...awinOffers];
  } catch (err) {
    console.error("Erro geral na busca de ofertas:", err.message);
    return;
  }

  const goodOffers = offers
    .filter((o) => Number(o.commissionRate || 0) >= settings.minCommission)
    .filter((o) => isAppropriate(o, settings.blockedKeywords, settings.activeCategories, settings.categories));

  const newOffers = filterUnposted(goodOffers, "itemId");

  if (newOffers.length === 0) {
    console.log("Nenhuma oferta nova pra postar neste ciclo.");
    return;
  }

  console.log(`Postando ${newOffers.length} oferta(s) nova(s)...`);

  for (const product of newOffers) {
    try {
      const caption = formatOfferMessage(product);
      await sendPhotoMessage({ imageUrl: product.imageUrl, caption });
      markAsPosted([product], "itemId");
      // pequeno intervalo entre posts pra não tomar rate-limit do Telegram
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`Erro ao postar item ${product.itemId}:`, err.message);
    }
  }

  console.log("Ciclo concluído.");
}

import { generateDailyReport } from "./metrics.js";

const runOnce = process.argv.includes("--once");

let currentCronJob = null;

if (runOnce) {
  runCycle().then(() => process.exit(0));
} else {
  const initialSettings = loadSettings();
  const freq = initialSettings.fetchInterval || FETCH_INTERVAL_MINUTES;
  console.log(`Bot iniciado. Buscando ofertas a cada ${freq} minuto(s).`);
  runCycle();
  currentCronJob = cron.schedule(`*/${freq} * * * *`, runCycle);

  import("./telegramClient.js").then(({ startListening, sendTextMessage, sendPhotoMessage }) => {
    startListening(async (message) => {
      const chatId = message.chat.id;
      const text = message.text || "";
      const caption = message.caption || "";
      const fullText = text + caption;

      // 1. Tratamento de Comandos
      if (text.startsWith("/relatorio")) {
        console.log(`Comando recebido: /relatorio do chat ${chatId}`);
        await sendTextMessage({ 
          text: "⏳ <i>Calculando relatório de vendas nas plataformas...</i>", 
          chat_id: chatId 
        });
        const report = await generateDailyReport();
        await sendTextMessage({ text: report, chat_id: chatId });
        return;
      }

      if (text.startsWith("/config") || text.startsWith("/status")) {
        const settings = loadSettings();
        const msg = `⚙️ <b>Status & Configurações:</b>\n\n` +
                    `⏸️ <b>Pausado:</b> ${settings.isPaused ? "SIM" : "NÃO"}\n` +
                    `⏱️ <b>Frequência:</b> a cada ${settings.fetchInterval} min\n` +
                    `💰 <b>Comissão Mínima:</b> ${settings.minCommission * 100}%\n` +
                    `🚫 <b>Palavras Bloqueadas:</b> ${settings.blockedKeywords.length} palavras\n` +
                    `🗂️ <b>Categorias Ativas:</b> ${settings.activeCategories.length === 0 ? "Todas (Nenhum filtro)" : settings.activeCategories.join(", ")}\n\n` +
                    `<i>Comandos: /pausar, /retomar, /zerar, /frequencia [minutos], /comissao [valor], /bloquear [palavra], /desbloquear [palavra], /categorias, /ativar [cat], /desativar [cat]</i>`;
        await sendTextMessage({ text: msg, chat_id: chatId });
        return;
      }
      
      if (text.startsWith("/pausar")) {
        const settings = loadSettings();
        settings.isPaused = true;
        saveSettings(settings);
        await sendTextMessage({ text: `⏸️ <b>Bot Pausado.</b>\nAs postagens automáticas foram interrompidas. Use /retomar para voltar.`, chat_id: chatId });
        return;
      }

      if (text.startsWith("/retomar")) {
        const settings = loadSettings();
        settings.isPaused = false;
        saveSettings(settings);
        await sendTextMessage({ text: `▶️ <b>Bot Retomado.</b>\nEle voltará a postar no próximo ciclo!`, chat_id: chatId });
        return;
      }

      if (text.startsWith("/zerar")) {
        clearPosted();
        await sendTextMessage({ text: `🧹 <b>Memória apagada!</b>\nO bot "esqueceu" todos os produtos que já postou e pode repeti-los a partir de agora.`, chat_id: chatId });
        return;
      }

      if (text.startsWith("/frequencia ")) {
        const num = parseInt(text.replace("/frequencia", "").trim(), 10);
        if (!isNaN(num) && num > 0) {
          const settings = loadSettings();
          settings.fetchInterval = num;
          saveSettings(settings);
          
          if (currentCronJob) currentCronJob.stop();
          currentCronJob = cron.schedule(`*/${num} * * * *`, runCycle);
          
          await sendTextMessage({ text: `⏱️ Frequência alterada! Buscando ofertas a cada <b>${num} minuto(s)</b>.`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/comissao ")) {
        const value = text.replace("/comissao", "").trim();
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const settings = loadSettings();
          settings.minCommission = num / 100; // transforma 5 em 0.05
          saveSettings(settings);
          await sendTextMessage({ text: `✅ Comissão mínima alterada para <b>${num}%</b>.`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/bloquear ")) {
        const word = text.replace("/bloquear", "").trim().toLowerCase();
        if (word) {
          const settings = loadSettings();
          if (!settings.blockedKeywords.includes(word)) {
            settings.blockedKeywords.push(word);
            saveSettings(settings);
            await sendTextMessage({ text: `✅ Palavra <b>${word}</b> bloqueada!`, chat_id: chatId });
          }
        }
        return;
      }

      if (text.startsWith("/desbloquear ")) {
        const word = text.replace("/desbloquear", "").trim().toLowerCase();
        if (word) {
          const settings = loadSettings();
          settings.blockedKeywords = settings.blockedKeywords.filter(w => w !== word);
          saveSettings(settings);
          await sendTextMessage({ text: `✅ Palavra <b>${word}</b> desbloqueada!`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/categorias")) {
        const settings = loadSettings();
        const allCats = Object.keys(settings.categories || {});
        let msg = `🗂️ <b>Filtro de Categorias</b>\n\n`;
        
        if (allCats.length === 0) {
           msg += "Nenhuma categoria configurada no sistema.";
        } else {
           allCats.forEach(cat => {
             const isOn = settings.activeCategories.includes(cat);
             msg += `${isOn ? "🟢" : "🔴"} <b>${cat}</b>\n`;
           });
           if (settings.activeCategories.length === 0) {
             msg += `\n⚠️ <i>Todas desativadas = Postando de tudo.</i>`;
           }
        }
        await sendTextMessage({ text: msg, chat_id: chatId });
        return;
      }

      if (text.startsWith("/ativar ")) {
        const cat = text.replace("/ativar", "").trim().toLowerCase();
        const settings = loadSettings();
        if (settings.categories && settings.categories[cat]) {
          if (!settings.activeCategories.includes(cat)) {
            settings.activeCategories.push(cat);
            saveSettings(settings);
          }
          await sendTextMessage({ text: `🟢 Categoria <b>${cat}</b> ativada!`, chat_id: chatId });
        } else {
          await sendTextMessage({ text: `❌ Categoria <b>${cat}</b> não encontrada. Use /categorias para ver a lista.`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/desativar ")) {
        const cat = text.replace("/desativar", "").trim().toLowerCase();
        const settings = loadSettings();
        if (settings.activeCategories.includes(cat)) {
          settings.activeCategories = settings.activeCategories.filter(c => c !== cat);
          saveSettings(settings);
          await sendTextMessage({ text: `🔴 Categoria <b>${cat}</b> desativada!`, chat_id: chatId });
        } else {
          await sendTextMessage({ text: `❌ A categoria <b>${cat}</b> já está desativada ou não existe.`, chat_id: chatId });
        }
        return;
      }

      // 2. Postagem Manual Assistida (Foto + Legenda com Link e Preço)
      if (message.photo && caption.includes("http")) {
        console.log(`Postagem manual recebida do chat ${chatId}`);
        
        const fileId = message.photo[message.photo.length - 1].file_id;
        
        // Extrai o link original (Shopee, ML ou Aliexpress) usando Regex básico
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = caption.match(urlRegex) || [];
        const originalUrl = urls[0];

        if (!originalUrl) return;

        let finalLink = originalUrl;

        // Gera o link de afiliado dependendo da loja
        if (originalUrl.includes("shopee.com") || originalUrl.includes("shope.ee")) {
          const { generateShopeeShortLink } = await import("./shopeeClient.js");
          finalLink = await generateShopeeShortLink(originalUrl);
        } else if (originalUrl.includes("mercadolivre.com")) {
          const affId = process.env.MERCADO_LIVRE_AFFILIATE_ID || "";
          finalLink = originalUrl.includes("?") 
            ? `${originalUrl}&${affId}` 
            : `${originalUrl}?${affId}`;
        }

        // Tenta achar o preço (ex: R$ 99,90 ou 99.90) na legenda para formatar
        let priceStr = "";
        const priceMatch = caption.match(/R\$\s*[\d,.]+/i);
        if (priceMatch) {
          priceStr = priceMatch[0];
        }

        // Pega o resto do texto tirando o link e o preço para ser o título
        let title = caption.replace(originalUrl, "").replace(priceStr, "").trim();
        // Remove quebras de linha excessivas
        title = title.replace(/\n+/g, " ");

        // Formata a mensagem no Padrão Apple do bot!
        const finalCaption = `
🎁 <b>Achadinho Incrível!</b>
<i>${title}</i>

${priceStr ? `🔥 <b>Apenas ${priceStr}</b>\n` : ""}
🛒 <b>Compre aqui:</b> ${finalLink}
        `.trim();

        try {
          // Usa um atalho: envia a foto usando o file_id do Telegram (é instantâneo)
          await sendPhotoMessage({ imageUrl: fileId, caption: finalCaption });
          await sendTextMessage({ text: "✅ Oferta manual formatada e postada com sucesso no canal!", chat_id: chatId });
        } catch (err) {
          console.error("Erro ao fazer postagem manual:", err);
          await sendTextMessage({ text: "❌ Erro ao postar no canal: " + err.message, chat_id: chatId });
        }
      }
    });
  });
}
