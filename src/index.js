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
];

function isAppropriate(product) {
  const name = String(product.productName || "").toLowerCase();
  return !BLOCKED_KEYWORDS.some((word) => name.includes(word));
}

const MIN_COMMISSION_RATE = Number(process.env.MIN_COMMISSION_RATE || 0.1);
const PRODUCTS_PER_FETCH = Number(process.env.PRODUCTS_PER_FETCH || 20);
const FETCH_INTERVAL_MINUTES = Number(process.env.FETCH_INTERVAL_MINUTES || 30);

async function runCycle() {
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
  import("./telegramClient.js").then(({ startListening, sendTextMessage }) => {
    startListening(async (command, chatId) => {
      console.log(`Comando recebido: ${command} do chat ${chatId}`);
      
      if (command === "/relatorio") {
        await sendTextMessage({ 
          text: "⏳ <i>Calculando relatório de vendas nas plataformas...</i>", 
          chat_id: chatId 
        });
        
        const report = await generateDailyReport();
        
        await sendTextMessage({ 
          text: report, 
          chat_id: chatId 
        });
      }
    });
  });
}
