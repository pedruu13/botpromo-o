import "dotenv/config";
import cron from "node-cron";
import { fetchProductOffers } from "./shopeeClient.js";
import { fetchAliExpressOffers } from "./aliExpressClient.js";
import { fetchAwinOffers } from "./awinClient.js";
import { fetchMercadoLivreOffers } from "./mercadoLivreClient.js";
import { sendPhotoMessage } from "./telegramClient.js";
import { filterUnposted, markAsPosted, clearPosted } from "./store.js";
import { formatOfferMessage } from "./formatMessage.js";
import { startWhatsApp, sendWhatsAppPhotoMessage } from "./whatsappClient.js";

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
  
  console.log(`[${new Date().toISOString()}] Buscando ofertas nas lojas (Shopee, AliExpress, Awin, Mercado Livre)...`);

  let offers = [];
  try {
    const [shopeeResult, aliResult, awinResult, mlResult] = await Promise.allSettled([
      fetchProductOffers({ limit: PRODUCTS_PER_FETCH }),
      fetchAliExpressOffers({ limit: PRODUCTS_PER_FETCH }),
      fetchAwinOffers({ limit: PRODUCTS_PER_FETCH }),
      fetchMercadoLivreOffers({ limit: PRODUCTS_PER_FETCH }),
    ]);

    const shopeeOffers = shopeeResult.status === "fulfilled" ? shopeeResult.value : [];
    const aliOffers = aliResult.status === "fulfilled" ? aliResult.value : [];
    const awinOffers = awinResult.status === "fulfilled" ? awinResult.value : [];
    const mlOffers = mlResult.status === "fulfilled" ? mlResult.value : [];

    if (shopeeResult.status === "rejected") console.error("Falha Shopee:", shopeeResult.reason);
    if (aliResult.status === "rejected") console.error("Falha AliExpress:", aliResult.reason);
    if (awinResult.status === "rejected") console.error("Falha Awin:", awinResult.reason);
    if (mlResult.status === "rejected") console.error("Falha Mercado Livre:", mlResult.reason);

    offers = [...shopeeOffers, ...aliOffers, ...awinOffers, ...mlOffers];
  } catch (err) {
    console.error("Erro geral na busca de ofertas:", err.message);
    return;
  }

  const goodOffers = offers
    .filter((o) => Number(o.commissionRate || 0) >= settings.minCommission)
    .filter((o) => isAppropriate(o, settings.blockedKeywords, settings.activeCategories, settings.categories))
    .filter((o) => {
      // nova regra de qualidade
      if (settings.minDiscount > 0) {
        if ((o.priceDiscountRate || 0) < settings.minDiscount) return false;
      }
      if (o.shopName === "Shopee" || o.sales !== undefined) {
         if (settings.minSales > 0 && (o.sales || 0) < settings.minSales) return false;
         if (settings.minRating > 0 && (o.ratingStar || 0) < settings.minRating) return false;
      }
      return true;
    });

  const newOffers = filterUnposted(goodOffers, "itemId");

  if (newOffers.length === 0) {
    console.log("Nenhuma oferta nova pra postar neste ciclo.");
    return;
  }

  console.log(`Postando ${newOffers.length} oferta(s) nova(s)...`);

  for (const product of newOffers) {
    try {
      let caption = product.originalCaption;
      if (caption) {
        let footerLines = [];

        if (product.discountPct > 0 && product.discountPct < 100) {
          footerLines.push(`📉 <b>Desconto: ${product.discountPct}% OFF!</b>`);
        }

        const isShopee = product.shopName === "Shopee" || (product.offerLink || "").includes("shopee");
        const isML = product.shopName === "Mercado Livre" || (product.offerLink || "").includes("mercadolivre");

        if (settings.globalCoupon) {
          footerLines.push(`🎟️ <b>Use o cupom:</b> <code>${settings.globalCoupon}</code>`);
        } else if (isShopee && settings.shopeeCoupon) {
          footerLines.push(`🧡 <b>Cupom Shopee:</b> <code>${settings.shopeeCoupon}</code>`);
        } else if (isML && settings.mlCoupon) {
          footerLines.push(`💛 <b>Cupom ML:</b> <code>${settings.mlCoupon}</code>`);
        } else if (isShopee) {
          footerLines.push(`🎫 <b>Cupons de frete grátis e descontos disponíveis no app!</b>`);
        }

        if (footerLines.length > 0) {
          caption += "\n\n" + footerLines.join("\n");
        }
      } else {
        const coupon = settings.globalCoupon ||
          (product.shopName === "Shopee" ? settings.shopeeCoupon : "") ||
          (product.shopName === "Mercado Livre" ? settings.mlCoupon : "");
        caption = formatOfferMessage(product, coupon);
      }

      await sendPhotoMessage({ imageUrl: product.imageUrl, caption });
      
      if (settings.whatsappGroups && settings.whatsappGroups.length > 0) {
        for (const jid of settings.whatsappGroups) {
           await sendWhatsAppPhotoMessage(jid, product.imageUrl, caption);
        }
      }
      
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

  import("./telegramClient.js").then(({ startListening, sendTextMessage, sendPhotoMessage, sendPhotoBuffer }) => {
    // Inicia o WhatsApp em paralelo
    startWhatsApp(
      async (msgInfo) => {
        // Escuta mensagens DENTRO do WhatsApp
        if (msgInfo.text.trim() === "/whatsappgrupo") {
          const settings = loadSettings();
          if (!settings.whatsappGroups) settings.whatsappGroups = [];
          if (!settings.whatsappGroups.includes(msgInfo.from)) {
            settings.whatsappGroups.push(msgInfo.from);
            saveSettings(settings);
            const { sendWhatsAppTextMessage } = await import("./whatsappClient.js");
            await sendWhatsAppTextMessage(msgInfo.from, "✅ Grupo vinculado com sucesso! As próximas promoções serão enviadas aqui.");
          }
        }
      }
    );

    startListening(async (message) => {
      const chatId = message.chat.id;
      const text = message.text || "";
      const caption = message.caption || "";
      const fullText = text + caption;

      // Salva o chatId como admin sempre que mandar um comando
      if (text.startsWith("/")) {
        const settings = loadSettings();
        if (settings.adminChatId !== chatId) {
           settings.adminChatId = chatId;
           saveSettings(settings);
        }
      }

      // 1. Tratamento de Comandos
      if (text.startsWith("/comandos") || text.startsWith("/help") || text.startsWith("/ajuda")) {
        const helpMsg = `🤖 <b>Manual do Piloto Automático</b>

<b>🔌 Conexão & Relatórios</b>
/status (ou /config) - Painel de configurações
/relatorio - Faturamento do dia
/wppqr - Gera QR Code do WhatsApp
/whatsappgrupo - (Usar DENTRO do WhatsApp) Vincula o grupo

<b>🕹️ Controle de Disparos</b>
/pausar - Pausa o bot
/retomar - Volta a postar
/frequencia [minutos] - Ex: /frequencia 60
/zerar - Apaga memória de produtos postados

<b>💎 Filtros de Qualidade</b>
/comissao [valor] - Ex: /comissao 10
/descontomin [valor] - Ex: /descontomin 20
/avalmin [nota] - Ex: /avalmin 4.5
/vendasmin [valor] - Ex: /vendasmin 100
/cupom [codigo] - Adiciona cupom global (use /cupom off para remover)
/cupomshopee [codigo] - Adiciona cupom para Shopee (use /cupomshopee off para remover)
/cupomml [codigo] - Adiciona cupom para Mercado Livre (use /cupomml off para remover)

<b>🗂️ Categorias & Canais</b>
/categorias - Ver categorias ativas
/ativar [nome] - Liga categoria
/desativar [nome] - Desliga categoria
/addcanal [nome_sem_arroba] - Adiciona canal ML pra clonar
/rmcanal [nome] - Remove canal da clonagem

<b>🚫 Palavras Proibidas</b>
/bloquear [palavra] - Censura produto
/desbloquear [palavra] - Libera palavra`;
        await sendTextMessage({ text: helpMsg, chat_id: chatId });
        return;
      }
      if (text.startsWith("/wppqr")) {
        console.log(`Comando recebido: /wppqr do chat ${chatId}`);
        const { getCurrentQr } = await import("./whatsappClient.js");
        const currentQrBuffer = getCurrentQr();
        if (currentQrBuffer) {
           await sendPhotoBuffer({
             buffer: currentQrBuffer,
             caption: "📲 Aqui está o QR Code fresquinho do WhatsApp. Escaneie rápido antes que expire!",
             chat_id: chatId
           });
        } else {
           await sendTextMessage({ text: "⚠️ O WhatsApp já está conectado, ou o QR code ainda não foi gerado no servidor. Aguarde uns segundos e tente de novo se estiver desconectado.", chat_id: chatId });
        }
        return;
      }

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
                    `📉 <b>Desconto Mínimo:</b> ${settings.minDiscount}%\n` +
                    `⭐ <b>Avaliação Mínima:</b> ${settings.minRating}\n` +
                    `🛒 <b>Vendas Mínimas:</b> ${settings.minSales}\n` +
                    `🎟️ <b>Cupom Global:</b> ${settings.globalCoupon ? settings.globalCoupon : "Nenhum"}\n` +
                    `🧡 <b>Cupom Shopee:</b> ${settings.shopeeCoupon ? settings.shopeeCoupon : "Nenhum (Usando alerta genérico)"}\n` +
                    `💛 <b>Cupom Mercado Livre:</b> ${settings.mlCoupon ? settings.mlCoupon : "Nenhum"}\n` +
                    `📡 <b>Canais Alvo (ML):</b> ${(settings.cloneChannels || []).length > 0 ? (settings.cloneChannels || []).join(", ") : "Nenhum"}\n` +
                    `🚫 <b>Palavras Bloqueadas:</b> ${settings.blockedKeywords.length} palavras\n` +
                    `🗂️ <b>Categorias Ativas:</b> ${settings.activeCategories.length === 0 ? "Todas (Nenhum filtro)" : settings.activeCategories.join(", ")}\n\n` +
                    `<i>Comandos: /pausar, /retomar, /zerar, /frequencia [min], /comissao [valor], /descontomin [valor], /avalmin [valor], /vendasmin [valor], /cupom [codigo], /cupomshopee [codigo], /cupomml [codigo], /bloquear [palavra], /desbloquear [palavra], /categorias, /ativar [cat], /desativar [cat], /addcanal [canal], /rmcanal [canal]</i>`;
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

      if (text.startsWith("/descontomin ")) {
        const value = text.replace("/descontomin", "").trim();
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const settings = loadSettings();
          settings.minDiscount = num;
          saveSettings(settings);
          await sendTextMessage({ text: `📉 Desconto mínimo alterado para <b>${num}%</b>.`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/avalmin ")) {
        const value = text.replace("/avalmin", "").trim();
        const num = parseFloat(value);
        if (!isNaN(num)) {
          const settings = loadSettings();
          settings.minRating = num;
          saveSettings(settings);
          await sendTextMessage({ text: `⭐ Avaliação mínima alterada para <b>${num}</b>.`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/vendasmin ")) {
        const value = text.replace("/vendasmin", "").trim();
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
          const settings = loadSettings();
          settings.minSales = num;
          saveSettings(settings);
          await sendTextMessage({ text: `🛒 Quantidade de vendas mínima alterada para <b>${num}</b>.`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/cupom ")) {
        const value = text.replace("/cupom", "").trim();
        const settings = loadSettings();
        
        if (value.toLowerCase() === "off") {
          settings.globalCoupon = "";
          saveSettings(settings);
          await sendTextMessage({ text: `🎟️ Cupom global <b>removido</b>.`, chat_id: chatId });
        } else {
          settings.globalCoupon = value;
          saveSettings(settings);
          await sendTextMessage({ text: `🎟️ Cupom global alterado para: <code>${value}</code>. Ele aparecerá em todas as postagens!`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/cupomshopee ")) {
        const value = text.replace("/cupomshopee", "").trim();
        const settings = loadSettings();
        if (value.toLowerCase() === "off") {
          settings.shopeeCoupon = "";
          saveSettings(settings);
          await sendTextMessage({ text: `🧡 Cupom da Shopee <b>removido</b>. O bot usará o alerta genérico de frete grátis.`, chat_id: chatId });
        } else {
          settings.shopeeCoupon = value;
          saveSettings(settings);
          await sendTextMessage({ text: `🧡 Cupom da Shopee alterado para: <code>${value}</code>. Aparecerá nas postagens da Shopee!`, chat_id: chatId });
        }
        return;
      }

      if (text.startsWith("/cupomml ")) {
        const value = text.replace("/cupomml", "").trim();
        const settings = loadSettings();
        if (value.toLowerCase() === "off") {
          settings.mlCoupon = "";
          saveSettings(settings);
          await sendTextMessage({ text: `💛 Cupom do Mercado Livre <b>removido</b>.`, chat_id: chatId });
        } else {
          settings.mlCoupon = value;
          saveSettings(settings);
          await sendTextMessage({ text: `💛 Cupom do Mercado Livre alterado para: <code>${value}</code>. Aparecerá nas postagens do ML!`, chat_id: chatId });
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

      if (text.startsWith("/addcanal ")) {
        const channel = text.replace("/addcanal", "").trim().replace("@", "");
        if (channel) {
          const settings = loadSettings();
          if (!settings.cloneChannels) settings.cloneChannels = [];
          if (!settings.cloneChannels.includes(channel)) {
            settings.cloneChannels.push(channel);
            saveSettings(settings);
            await sendTextMessage({ text: `📡 Canal alvo <b>@${channel}</b> adicionado para clonagem!`, chat_id: chatId });
          } else {
             await sendTextMessage({ text: `⚠️ Esse canal já está na lista.`, chat_id: chatId });
          }
        }
        return;
      }

      if (text.startsWith("/rmcanal ")) {
        const channel = text.replace("/rmcanal", "").trim().replace("@", "");
        if (channel) {
          const settings = loadSettings();
          if (settings.cloneChannels && settings.cloneChannels.includes(channel)) {
            settings.cloneChannels = settings.cloneChannels.filter(c => c !== channel);
            saveSettings(settings);
            await sendTextMessage({ text: `🚫 Canal alvo <b>@${channel}</b> removido da clonagem!`, chat_id: chatId });
          }
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
