import "dotenv/config";
import cron from "node-cron";
import { fetchProductOffers } from "./shopeeClient.js";
import { fetchAliExpressOffers } from "./aliExpressClient.js";
import { fetchAwinOffers } from "./awinClient.js";
import { fetchMercadoLivreOffers } from "./mercadoLivreClient.js";
import { sendPhotoMessage } from "./telegramClient.js";
import { filterUnposted, markAsPosted } from "./store.js";
import { formatOfferMessage } from "./formatMessage.js";

// Palavras que fazem o produto ser descartado automaticamente (moda íntima,
// praia, etc). Ajuste essa lista conforme for vendo o que ainda passa.
const BLOCKED_KEYWORDS = [
  "biquíni",
  "biquini",
  "lingerie",
  "calcinha",
  "sutiã",
  "sutia",
  "moda praia",
  "fio dental",
  "body sensual",
  "réplica",
  "replica",
  "1 linha",
  "primeira linha",
  "fake",
  "falso",
  "tênis",
  "tenis",
  "camisa de time",
  "perfume contratipo",
];

function isAppropriate(product) {
  const name = String(product.productName || "").toLowerCase();
  return !BLOCKED_KEYWORDS.some((word) => name.includes(word));
}

const MIN_COMMISSION_RATE = Number(process.env.MIN_COMMISSION_RATE || 0.1);
const PRODUCTS_PER_FETCH = Number(process.env.PRODUCTS_PER_FETCH || 20);
const FETCH_INTERVAL_MINUTES = Number(process.env.FETCH_INTERVAL_MINUTES || 30);

async function runCycle() {
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
    .filter((o) => Number(o.commissionRate || 0) >= MIN_COMMISSION_RATE)
    .filter(isAppropriate);

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

if (runOnce) {
  runCycle().then(() => process.exit(0));
} else {
  console.log(
    `Bot iniciado. Buscando ofertas a cada ${FETCH_INTERVAL_MINUTES} minuto(s).`
  );
  runCycle(); // roda uma vez imediatamente ao subir
  cron.schedule(`*/${FETCH_INTERVAL_MINUTES} * * * *`, runCycle);

  // Inicia o listener para responder comandos no Telegram
  import("./telegramClient.js").then(({ startListening, sendTextMessage, sendPhotoMessage }) => {
    startListening(async (message) => {
      const chatId = message.chat.id;
      const text = message.text || "";
      const caption = message.caption || "";
      const fullText = text + caption;

      // 1. Tratamento de Comandos (/relatorio)
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
