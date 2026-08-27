import crypto from "crypto";
import fetch from "node-fetch";

const { SHOPEE_APP_ID, SHOPEE_APP_SECRET, SHOPEE_API_URL } = process.env;

/**
 * Gera o header de autorização exigido pela Shopee Affiliate Open API.
 * Fórmula oficial: SHA256(appId + timestamp + payload + secret)
 */
function buildAuthHeader(payloadString) {
  const timestamp = Math.floor(Date.now() / 1000);
  const base = `${SHOPEE_APP_ID}${timestamp}${payloadString}${SHOPEE_APP_SECRET}`;
  const signature = crypto.createHash("sha256").update(base).digest("hex");
  return {
    timestamp,
    header: `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
  };
}

async function shopeeGraphQL(query, variables = {}) {
  const body = { query, variables };
  const payloadString = JSON.stringify(body);
  const { header } = buildAuthHeader(payloadString);

  const res = await fetch(SHOPEE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: header,
    },
    body: payloadString,
  });

  const data = await res.json();

  if (data.errors) {
    throw new Error(
      `Erro na Shopee API: ${data.errors.map((e) => e.message).join(", ")}`
    );
  }

  return data.data;
}

import * as cheerio from "cheerio";
import { loadSettings } from "./configStore.js";

/**
 * Busca ofertas da Shopee usando a técnica de Espelho (Clonagem de Canais Públicos do Telegram).
 */
export async function fetchProductOffers({ limit = 20 } = {}) {
  const settings = loadSettings();
  const channels = settings.cloneChannels && settings.cloneChannels.length > 0 ? settings.cloneChannels : ["EconoMister"];
  
  const allProducts = [];

  for (const channelToClone of channels) {
    try {
      const url = `https://t.me/s/${channelToClone}`;
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const products = [];
      
      const messages = $(".tgme_widget_message").toArray();
      
      for (const el of messages) {
        const text = $(el).find(".tgme_widget_message_text").text() || "";
        const photoStyle = $(el).find(".tgme_widget_message_photo_wrap").attr("style") || "";
        const match = photoStyle.match(/url\('(.*?)'\)/);
        let photoUrl = match ? match[1] : null;
        
        const links = [];
        $(el).find(".tgme_widget_message_text a").each((j, a) => {
           links.push($(a).attr("href"));
        });
        
        const shopeeLinks = links.filter(l => l && (l.includes("shopee.com") || l.includes("shope.ee")));
        
        if (shopeeLinks.length > 0 && photoUrl) {
           let price = 0;
           const priceMatch = text.match(/R\$\s*([\d,.]+)/i);
           if (priceMatch) {
              price = parseFloat(priceMatch[1].replace(".", "").replace(",", "."));
           }
           
           const originalLink = shopeeLinks[0];
           
           // Limpa título tirando t.me, http e @
           const lines = text.split('\n')
             .map(l => l.trim())
             .filter(l => l.length > 5) 
             .filter(l => !l.includes("t.me") && !l.includes("http") && !l.includes("@")) 
             .filter(l => !/R\$\s*[\d,.]+/.test(l)); 
           
           let title = lines.length > 0 ? lines[0] : "Oferta Especial Shopee";
           
           // Gera o link de afiliado oficial do usuário
           const finalLink = await generateShopeeShortLink(originalLink);
           
           const msgId = $(el).attr("data-post") || String(Math.random());
           
           products.push({
             itemId: `shp_${msgId}`,
             productName: title,
             price: price,
             priceDiscountRate: 100,
             shopName: "Shopee",
             offerLink: finalLink,
             imageUrl: photoUrl,
             commissionRate: 100,
             ratingStar: 5,
             sales: 1000
           });
        }
      }
      
      products.reverse();
      allProducts.push(...products);
      
    } catch (error) {
      console.error(`Erro ao clonar o canal ${channelToClone} (Shopee):`, error.message);
    }
  }

  const finalList = allProducts.slice(0, limit);
  console.log(`✅ [Shopee] ${finalList.length} ofertas clonadas dos canais (${channels.join(", ")})`);
  return finalList;
}

/**
 * Busca o relatório de vendas (conversões) da Shopee.
 */
export async function fetchShopeeConversions() {
  const query = `
    query {
      conversionReport(limit: 50) {
        nodes {
          orderStatus
          commission
          purchaseTime
        }
      }
    }
  `;

  try {
    const data = await shopeeGraphQL(query);
    return data?.conversionReport?.nodes ?? [];
  } catch (error) {
    console.error("Erro ao buscar métricas da Shopee (GraphQL):", error.message);
    throw error;
  }
}

export async function generateShopeeShortLink(originalUrl) {
  const query = `
    mutation GenerateShortLink($originUrl: String!) {
      generateShortLink(input: {originUrl: $originUrl}) {
        shortLink
      }
    }
  `;

  try {
    const data = await shopeeGraphQL(query, { originUrl: originalUrl });
    return data?.generateShortLink?.shortLink || originalUrl;
  } catch (error) {
    console.error("Erro ao gerar shortlink da Shopee:", error.message);
    return originalUrl;
  }
}
