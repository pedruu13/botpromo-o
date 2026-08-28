import crypto from "crypto";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { loadSettings } from "./configStore.js";

const { SHOPEE_APP_ID, SHOPEE_APP_SECRET, SHOPEE_API_URL } = process.env;

/**
 * Gera o header de autorização exigido pela Shopee Affiliate Open API.
 * Fórmula oficial: SHA256(appId + timestamp + payload + secret)
 */
export async function expandShopeeUrl(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location && location.includes('shopee.com.br')) {
         const urlObj = new URL(location);
         return urlObj.origin + urlObj.pathname; 
      }
    }
    return url;
  } catch (error) {
    console.error('Erro ao expandir URL da Shopee:', error.message);
    return url;
  }
}

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

function extractPriceAndDiscount(text) {
  const matches = [...text.matchAll(/R\$\s*([\d,.]+)/ig)];
  const prices = matches.map(m => {
    const raw = m[1];
    let clean = raw;
    if (raw.includes(",") && raw.includes(".")) {
      clean = raw.replace(/\./g, "").replace(",", ".");
    } else if (raw.includes(",")) {
      clean = raw.replace(",", ".");
    }
    return parseFloat(clean);
  }).filter(p => !isNaN(p) && p > 0);

  let finalPrice = 0;
  let discountPct = 0;

  if (prices.length >= 2) {
    const price1 = prices[0];
    const price2 = prices[1];
    if (price1 > price2) {
      finalPrice = price2;
      discountPct = Math.round(((price1 - price2) / price1) * 100);
    } else {
      finalPrice = price1;
      discountPct = 0;
    }
  } else if (prices.length === 1) {
    finalPrice = prices[0];
    discountPct = 0;
  }

  return { price: finalPrice, discountPct };
}

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
        // O Telegram Web usa <br> pra pular linha, mas o .text() do Cheerio remove e junta tudo.
        // Vamos arrumar isso pegando o HTML interno e substituindo.
        const htmlContent = $(el).find(".tgme_widget_message_text").html() || "";
        const text = htmlContent.replace(/<br\s*[\/]?>/gi, "\n").replace(/<[^>]+>/g, ""); // strip tags
        
        const photoStyle = $(el).find(".tgme_widget_message_photo_wrap").attr("style") || "";
        const match = photoStyle.match(/url\('(.*?)'\)/);
        let photoUrl = match ? match[1] : null;
        
        const links = [];
        $(el).find(".tgme_widget_message_text a").each((j, a) => {
           links.push($(a).attr("href"));
        });
        
        const shopeeLinks = links.filter(l => l && (l.includes("shopee.com") || l.includes("shope.ee")));
        
        if (shopeeLinks.length > 0 && photoUrl) {
           const { price, discountPct } = extractPriceAndDiscount(text);
           
           const originalLink = shopeeLinks[0];
           
           // Limpa título tirando t.me, http e @
           const lines = text.split('\n')
             .map(l => l.trim())
             .filter(l => l.length > 5) 
             .filter(l => !l.includes("t.me") && !l.includes("http") && !l.includes("@")) 
             .filter(l => !/R\$\s*[\d,.]+/.test(l)); 
           
           let title = lines.length > 0 ? lines[0] : "Oferta Especial Shopee";
           
           // Gera o link de afiliado oficial do usuário descompactando o link curto
           const expandedLink = await expandShopeeUrl(originalLink);
           const finalLink = await generateShopeeShortLink(expandedLink);
            
            // Preserva legenda original substituindo os links e limpando tags não suportadas
            const textEl = $(el).find(".tgme_widget_message_text").clone();
            textEl.find("a").each((_, aEl) => {
              const href = $(aEl).attr("href") || "";
              if (href.includes("shopee.com") || href.includes("shope.ee")) {
                $(aEl).attr("href", finalLink);
                if ($(aEl).text().includes(originalLink) || $(aEl).text().includes("shope.ee") || $(aEl).text().includes("shopee.com")) {
                  $(aEl).text(finalLink);
                }
              }
            });

            let originalCaption = textEl.html() || "";
            originalCaption = originalCaption.replace(/<br\s*\/?>/gi, "\n");
            originalCaption = originalCaption.replace(/<strong\b[^>]*>/gi, "<b>").replace(/<\/strong>/gi, "</b>");
            originalCaption = originalCaption.replace(/<em\b[^>]*>/gi, "<i>").replace(/<\/em>/gi, "</i>");
            originalCaption = originalCaption.replace(/<(?!\/?(b|i|a|s|u|code|pre|span|tg-spoiler)\b)[^>]+>/gi, "");
            originalCaption = originalCaption.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            originalCaption = originalCaption.split(originalLink).join(finalLink);
            
            const msgId = $(el).attr("data-post") || String(Math.random());
            
            products.push({
              itemId: `shp_${msgId}`,
              productName: title,
              price: price,
              priceDiscountRate: discountPct,
              isClone: true,
              shopName: "Shopee",
              offerLink: finalLink,
              imageUrl: photoUrl,
              commissionRate: 100,
              ratingStar: 5,
              sales: 1000,
              originalCaption,
              discountPct
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
