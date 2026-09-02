

const { 
  MERCADO_LIVRE_AFFILIATE_ID, 
  MERCADO_LIVRE_CLIENT_ID, 
  MERCADO_LIVRE_CLIENT_SECRET 
} = process.env;

let mlAccessToken = null;
let mlTokenExpiresAt = 0;

async function getMLToken() {
  if (mlAccessToken && Date.now() < mlTokenExpiresAt) {
    return mlAccessToken;
  }
  
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${MERCADO_LIVRE_CLIENT_ID}&client_secret=${MERCADO_LIVRE_CLIENT_SECRET}`
  });
  
  const data = await response.json();
  if (data.access_token) {
    mlAccessToken = data.access_token;
    mlTokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;
    return mlAccessToken;
  }
  throw new Error("Falha ao obter token do Mercado Livre: " + JSON.stringify(data));
}

import * as cheerio from "cheerio";
import { loadSettings } from "./configStore.js";

async function expandAndCleanUrl(url) {
  try {
    let finalUrl = url;
    let maxRedirects = 5;
    
    while(maxRedirects > 0) {
      const response = await fetch(finalUrl, { 
        redirect: "manual", 
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        } 
      });
      
      const location = response.headers.get('location');
      if (location) {
         finalUrl = location;
         maxRedirects--;
         continue;
      }
      
      const text = await response.text();
      const metaMatch = text.match(/url=['"]?([^'"]+)['"]?/i);
      if (metaMatch && metaMatch[1] && metaMatch[1].startsWith("http")) {
         finalUrl = metaMatch[1];
         maxRedirects--;
         continue;
      }
      break;
    }
    
    // Remove SOMENTE parâmetros de afiliado do concorrente, mantém parâmetros legítimos
    const AFFILIATE_PARAMS = ["matt_tool", "deal_print_id", "deal_id", "position", "tracking_id", "ref", "affId", "utm_source", "utm_medium", "utm_campaign"];
    const urlObj = new URL(finalUrl);
    AFFILIATE_PARAMS.forEach(p => urlObj.searchParams.delete(p));
    
    return urlObj.toString();
  } catch (err) {
    console.error("Erro ao expandir URL do ML:", err.message);
    return url;
  }
}

function buildMlAffiliateLink(cleanLink, affiliateId) {
  // O Mercado Livre usa o parâmetro 'matt_tool' para identificar afiliados
  // Se o affiliateId já vier no formato "matt_tool=SEU_ID", extraímos só o valor
  // Se vier só o valor "SEU_ID", usamos diretamente
  let toolValue = affiliateId;
  if (affiliateId.includes("=")) {
    // ex: "matt_tool=ABC123" → pega "ABC123"
    toolValue = affiliateId.split("=").pop();
  }
  const urlObj = new URL(cleanLink);
  urlObj.searchParams.set("matt_tool", toolValue);
  return urlObj.toString();
}

function extractPriceAndDiscount(text) {
  // Remove linhas de parcelas (ex: "12x de R$ 10,00") para não confundir com preço real
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
    .filter(p => !isNaN(p) && p >= 5); // ignora valores absurdos abaixo de R$5

  let finalPrice = 0;
  let discountPct = 0;

  if (prices.length >= 2) {
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    // Só considera desconto se a diferença for > 5%
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
 * Busca produtos no Mercado Livre usando a técnica de Espelho (Clonagem de Canais Públicos do Telegram).
 */
export async function fetchMercadoLivreCloneOffers({ limit = 20 } = {}) {
  const affiliateId = process.env.MERCADO_LIVRE_AFFILIATE_ID || "";
  
  if (!affiliateId) {
    console.log("⚠️ Credencial MERCADO_LIVRE_AFFILIATE_ID faltando. Pulando...");
    return [];
  }

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
      
        // Processamento assíncrono para cada mensagem
        for (let i = 0; i < $(".tgme_widget_message").length; i++) {
          const el = $(".tgme_widget_message")[i];
          const htmlContent = $(el).find(".tgme_widget_message_text").html() || "";
          const text = htmlContent.replace(/<br\s*[\/]?>/gi, "\n").replace(/<[^>]+>/g, ""); // strip tags
          
          const photoStyle = $(el).find(".tgme_widget_message_photo_wrap").attr("style") || "";
          const match = photoStyle.match(/url\('(.*?)'\)/);
          let photoUrl = match ? match[1] : null;
          
          const links = [];
          $(el).find(".tgme_widget_message_text a").each((j, a) => {
             links.push($(a).attr("href"));
          });
          
          // Filtra links do ML e exclui links de listas/cupons (não são links de produto)
          const COUPON_KEYWORDS_ML = ["desconto", "cupom", "voucher", "coupon", "promo", "ofertas", "oferta/list", "category"];
          const allMlLinks = links.filter(l => l && (l.includes("mercadolivre.com") || l.includes("meli.com")));
          const mlLinks = allMlLinks.filter(l => !COUPON_KEYWORDS_ML.some(kw => l.toLowerCase().includes(kw)));
          
          if (mlLinks.length > 0 && photoUrl) {
             const { price, discountPct } = extractPriceAndDiscount(text);
             
             // Expande o encurtador e limpa as tags do concorrente
             const originalLink = mlLinks[0];
             const cleanLink = await expandAndCleanUrl(originalLink);
             
             // Aplica o SEU afiliado no padrão oficial do ML (matt_tool=SEU_ID)
             const finalLink = buildMlAffiliateLink(cleanLink, affiliateId);
             
             // Pega as linhas, remove as que são links (t.me, http), menções (@), preços e emojis puros
             const lines = text.split('\n')
               .map(l => l.trim())
               .filter(l => l.length > 5) // ignora linhas muito curtas
               .filter(l => !l.includes("t.me") && !l.includes("http") && !l.includes("@")) // remove canais
               .filter(l => !/R\$\s*[\d,.]+/.test(l)); // remove a linha de preço
             
             let title = lines.length > 0 ? lines[0] : "Oferta Especial do Mercado Livre";
             
             // Preserva legenda original substituindo os links e limpando tags não suportadas
             const textEl = $(el).find(".tgme_widget_message_text").clone();
             textEl.find("a").each((_, aEl) => {
               const href = $(aEl).attr("href") || "";
               if (href.includes("mercadolivre.com") || href.includes("meli.com")) {
                 $(aEl).attr("href", finalLink);
                 if ($(aEl).text().includes(originalLink) || $(aEl).text().includes("mercadolivre.com") || $(aEl).text().includes("meli.com")) {
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

             const msgId = $(el).attr("data-post") || 
               finalLink.replace(/[^a-zA-Z0-9]/g, "").slice(-30);
             
             products.push({
               itemId: `ml_${msgId}`,
               productName: title,
               price: price,
               priceDiscountRate: discountPct,
               isClone: true,
               shopName: "Mercado Livre",
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
      console.error(`Erro ao clonar o canal ${channelToClone}:`, error.message);
    }
  }

  // Ordena para que os mais novos apareçam (se houver timestamps, aqui seria bom). 
  // Mas como a ordem da página é suficiente, apenas limitamos.
  const finalList = allProducts.slice(0, limit);
  console.log(`✅ [Mercado Livre] ${finalList.length} ofertas clonadas dos canais (${channels.join(", ")})`);
  return finalList;
}


export async function fetchMercadoLivreAutoOffers({ limit = 10 } = {}) {
  if (!MERCADO_LIVRE_AFFILIATE_ID) {
    console.log("[ML Auto] MERCADO_LIVRE_AFFILIATE_ID não configurado. Pulando mineração automática.");
    return [];
  }
  try {
    const url = "https://api.mercadolibre.com/sites/MLB/search?deal_of_the_day=true&limit=50";
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await response.json();
    if (!data.results || data.results.length === 0) return [];

    const products = data.results
      .filter(item => item.thumbnail && item.permalink)
      .map(item => {
        const salePrice = item.price;
        const originalPrice = item.original_price || salePrice;
        let discountRate = 0;
        if (originalPrice > salePrice) {
          discountRate = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
        }
        const affiliateLink = buildMlAffiliateLink(item.permalink, MERCADO_LIVRE_AFFILIATE_ID);
        const imageUrl = item.thumbnail.replace("-I.jpg", "-O.jpg");
        return {
          itemId: "auto_ml_" + item.id,
          productName: item.title,
          price: salePrice,
          priceDiscountRate: discountRate,
          shopName: "Mercado Livre",
          offerLink: affiliateLink,
          imageUrl,
          commissionRate: 100,
          ratingStar: 5,
          sales: 1000,
          discountPct: discountRate
        };
      });

    const finalList = products.slice(0, limit);
    console.log(`🔍 [ML Auto] ${finalList.length} ofertas mineradas da API do Mercado Livre`);
    return finalList;
  } catch (error) {
    console.error("Erro no ML Automático:", error.message);
    return [];
  }
}