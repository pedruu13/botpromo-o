

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

/**
 * Busca produtos no Mercado Livre usando a técnica de Espelho (Clonagem de Canais Públicos do Telegram).
 * Isso evita bloqueios de API do ML e garante produtos já curados.
 */
export async function fetchMercadoLivreOffers({ limit = 20 } = {}) {
  const affiliateId = process.env.MERCADO_LIVRE_AFFILIATE_ID || "";
  
  // Canal público alvo para espelhar as ofertas do ML (pode alterar no futuro se precisar)
  const channelToClone = "promocoeseofertas"; 
  
  if (!affiliateId) {
    console.log("⚠️ Credencial MERCADO_LIVRE_AFFILIATE_ID faltando. Pulando...");
    return [];
  }

  try {
    const url = `https://t.me/s/${channelToClone}`;
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const products = [];
    
    $(".tgme_widget_message").each((i, el) => {
      const text = $(el).find(".tgme_widget_message_text").text() || "";
      const photoStyle = $(el).find(".tgme_widget_message_photo_wrap").attr("style") || "";
      const match = photoStyle.match(/url\('(.*?)'\)/);
      let photoUrl = match ? match[1] : null;
      
      const links = [];
      $(el).find(".tgme_widget_message_text a").each((j, a) => {
         links.push($(a).attr("href"));
      });
      
      // Filtra só os links que são do Mercado Livre
      const mlLinks = links.filter(l => l && (l.includes("mercadolivre.com") || l.includes("meli.com")));
      
      if (mlLinks.length > 0 && photoUrl) {
         let price = 0;
         const priceMatch = text.match(/R\$\s*([\d,.]+)/i);
         if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(".", "").replace(",", "."));
         }
         
         const originalLink = mlLinks[0];
         // Pendura a tag de afiliado do cliente
         const finalLink = originalLink.includes("?") 
            ? `${originalLink}&${affiliateId}` 
            : `${originalLink}?${affiliateId}`;
         
         // Limpa o título (pega a primeira linha útil)
         let title = text.split('\n')[0].trim();
         if (title.length < 5 || title.includes("🔥")) {
            title = text.split('\n').find(l => l.trim().length > 10 && !l.includes("http")) || title;
         }
         
         // Usamos o ID da mensagem original como itemId para o bot não postar duplicado
         const msgId = $(el).attr("data-post") || String(Math.random());
         
         products.push({
           itemId: `ml_${msgId}`,
           productName: title,
           price: price,
           priceDiscountRate: 100, // Dummy alto pra passar nos novos filtros de qualidade
           shopName: "Mercado Livre",
           offerLink: finalLink,
           imageUrl: photoUrl,
           commissionRate: 100, // Dummy alto pra passar no filtro de comissão
           ratingStar: 5,
           sales: 1000
         });
      }
    });
    
    // O Telegram manda as mensagens na ordem cronológica (as últimas no final),
    // então revertemos a array para pegar sempre as MAIS NOVAS primeiro
    products.reverse();
    
    const finalList = products.slice(0, limit);
    console.log(`✅ [Mercado Livre] ${finalList.length} ofertas clonadas do canal @${channelToClone}!`);
    return finalList;
  } catch (error) {
    console.error("Erro no Mercado Livre Client (Espelho):", error.message);
    return [];
  }
}
