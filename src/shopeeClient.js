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
    const res = await fetch(url, { 
      redirect: 'follow', 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      } 
    });
    const finalUrl = res.url;
    if (finalUrl && finalUrl.includes('shopee')) {
       const urlObj = new URL(finalUrl);
       return urlObj.origin + urlObj.pathname; 
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
  const cleanText = text
    .split("\n")
    .filter(line => !/\d+\s*x\s*(de\s*)?R\$/i.test(line))
    .filter(line => !/frete\s*(gr[áa]tis|de)\s*R\$/i.test(line))
    .join("\n");

  const matches = [...cleanText.matchAll(/R\$\s*([\d.,]+)/gi)];
  const prices = matches
    .map(m => {
      const raw = m[1];
      let clean = raw;
      if (raw.includes(",") && raw.includes(".")) {
        clean = raw.replace(/\./g, "").replace(",", ".");
      } else if (raw.includes(",")) {
        clean = raw.replace(",", ".");
      }
      return parseFloat(clean);
    })
    .filter(p => !isNaN(p) && p >= 5);

  let finalPrice = 0;
  let discountPct = 0;

  if (prices.length >= 2) {
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    if (maxPrice > minPrice && ((maxPrice - minPrice) / maxPrice) > 0.05) {
      finalPrice = minPrice;
      discountPct = Math.round(((maxPrice - minPrice) / maxPrice) * 100);
    } else {
      finalPrice = minPrice;
    }
  } else if (prices.length === 1) {
    finalPrice = prices[0];
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
        
        // Expande links da Shopee ANTES de filtrar, porque encurtadores escondem o tipo
        const allShopeeRaw = links.filter(l => l && (l.includes("shopee.com") || l.includes("shope.ee") || l.includes("s.shopee")));
        
        // Filtra cupons/vouchers APÓS expansão
        const COUPON_KEYWORDS = ["voucher", "coupon", "cupom", "promo", "frete-gratis", "coin", "bonus", "shopee-coins"];
        const shopeeLinks = allShopeeRaw.filter(l => !COUPON_KEYWORDS.some(kw => l.toLowerCase().includes(kw)));
        
        if (shopeeLinks.length > 0 && photoUrl) {
           const { price, discountPct } = extractPriceAndDiscount(text);
           
           const originalLink = shopeeLinks[0];
           
           // Expande o link curto ANTES de gerar o afiliado
           const expandedLink = await expandShopeeUrl(originalLink);
           
           // Se depois de expandir for um link de cupom, pula
           if (COUPON_KEYWORDS.some(kw => expandedLink.toLowerCase().includes(kw))) {
             continue;
           }
           
           // Gera link de afiliado (limpa params do concorrente)
           const finalLink = await generateShopeeShortLink(expandedLink);
           
           // Limpa título tirando t.me, http e @
           const lines = text.split('\n')
             .map(l => l.trim())
             .filter(l => l.length > 5) 
             .filter(l => !l.includes("t.me") && !l.includes("http") && !l.includes("@")) 
             .filter(l => !/R\$\s*[\d,.]+/.test(l)); 
           
           let title = lines.length > 0 ? lines[0] : "Oferta Especial Shopee";
            
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
  const { SHOPEE_APP_ID, SHOPEE_APP_SECRET } = process.env;

  // Helper: remove parâmetros de afiliado do concorrente e retorna URL limpa
  function cleanCompetitorParams(url) {
    try {
      const urlObj = new URL(url);
      ["mmp_pid","utm_source","utm_medium","utm_campaign","utm_content","utm_term",
       "sp_atk","xptdk","uls_trackid","gads_t_sig","extraParams"].forEach(p => urlObj.searchParams.delete(p));
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  // Se não tem credenciais da API Shopee, retorna link limpo (sem afiliado do concorrente)
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    console.log("[Shopee] Sem credenciais da API, usando link limpo sem afiliado do concorrente.");
    return cleanCompetitorParams(originalUrl);
  }

  const query = `
    mutation GenerateShortLink($originUrl: String!) {
      generateShortLink(input: {originUrl: $originUrl}) {
        shortLink
      }
    }
  `;

  try {
    const data = await shopeeGraphQL(query, { originUrl: originalUrl });
    return data?.generateShortLink?.shortLink || cleanCompetitorParams(originalUrl);
  } catch (error) {
    console.error("Erro ao gerar shortlink da Shopee:", error.message);
    // Fallback: link limpo sem parâmetros do concorrente
    return cleanCompetitorParams(originalUrl);
  }
}

/**
 * Mineração automática: busca ofertas Shopee em canais públicos grandes
 * de forma independente dos canais configurados pelo usuário.
 */
export async function fetchShopeeAutoOffers({ limit = 10 } = {}) {
  // Canais públicos populares de promoções Shopee no Telegram (fallback interno)
  const AUTO_CHANNELS = ["ShopeeOfertasBrasil", "PromocoesShopee", "ofertasshopee"];
  const allProducts = [];

  for (const ch of AUTO_CHANNELS) {
    try {
      const url = `https://t.me/s/${ch}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = (await import("cheerio")).load(html);

      const msgs = $(".tgme_widget_message").toArray();
      for (const el of msgs) {
        const htmlContent = $(el).find(".tgme_widget_message_text").html() || "";
        const text = htmlContent.replace(/<br\s*[\/]?>/gi, "\n").replace(/<[^>]+>/g, "");
        const photoStyle = $(el).find(".tgme_widget_message_photo_wrap").attr("style") || "";
        const photoMatch = photoStyle.match(/url\('(.*?)'\)/);
        const photoUrl = photoMatch ? photoMatch[1] : null;
        if (!photoUrl) continue;

        const links = [];
        $(el).find(".tgme_widget_message_text a").each((_, a) => links.push($(a).attr("href")));

        const COUPON_KW = ["voucher", "coupon", "cupom", "promo", "frete", "coin", "bonus"];
        const shopeeLinks = links
          .filter(l => l && (l.includes("shopee.com") || l.includes("shope.ee")))
          .filter(l => !COUPON_KW.some(kw => l.toLowerCase().includes(kw)));

        if (shopeeLinks.length === 0) continue;

        const { price, discountPct } = extractPriceAndDiscount(text);
        const originalLink = shopeeLinks[0];
        const finalLink = await generateShopeeShortLink(originalLink);

        const msgId = $(el).attr("data-post") || String(Math.random());
        allProducts.push({
          itemId: `auto_shp_${msgId}`,
          productName: text.split("\n").filter(l => l.trim().length > 5 && !l.includes("http"))[0] || "Oferta Shopee",
          price,
          priceDiscountRate: discountPct,
          isClone: true,
          shopName: "Shopee",
          offerLink: finalLink,
          imageUrl: photoUrl,
          commissionRate: 100,
          ratingStar: 5,
          sales: 1000,
          discountPct
        });
        if (allProducts.length >= limit) break;
      }
      if (allProducts.length >= limit) break;
    } catch (e) {
      // canal indisponível, tenta o próximo
    }
  }

  console.log(`🔍 [Shopee Auto] ${allProducts.length} ofertas mineradas automaticamente`);
  return allProducts.slice(0, limit);
}

