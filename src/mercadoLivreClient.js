

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

/**
 * Busca produtos no Mercado Livre usando a API.
 */
export async function fetchMercadoLivreOffers({ limit = 20 } = {}) {
  const affiliateId = MERCADO_LIVRE_AFFILIATE_ID;
  
  if (!affiliateId || !MERCADO_LIVRE_CLIENT_ID || !MERCADO_LIVRE_CLIENT_SECRET) {
    console.log("⚠️ Credenciais do Mercado Livre (ID/Secret ou Affiliate) faltando. Pulando...");
    return [];
  }

  try {
    const token = await getMLToken();

    // Busca produtos que estão com promoção/desconto do dia no Brasil (MLB)
    const url = `https://api.mercadolibre.com/sites/MLB/search?deal_of_the_day=true`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();

    if (!data.results) {
      console.error("⚠️ O Mercado Livre bloqueou a busca ou retornou vazio! Resposta:", JSON.stringify(data));
      return [];
    }

    const products = data.results.map(item => {
      // Calcula desconto se houver preço original
      const salePrice = item.price;
      const originalPrice = item.original_price || salePrice;
      let discountRate = 0;
      if (originalPrice > salePrice) {
        discountRate = ((originalPrice - salePrice) / originalPrice) * 100;
      }

      // O Mercado Livre usa permalinks que às vezes já têm ?. Precisamos concatenar com & ou ?.
      const separator = item.permalink.includes("?") ? "&" : "?";
      const affiliateLink = `${item.permalink}${separator}${affiliateId}`;

      // Pega imagem de boa qualidade se existir, senão a thumbnail padrão
      const imageUrl = item.thumbnail.replace("-I.jpg", "-O.jpg");

      return {
        itemId: item.id,
        productName: item.title,
        price: salePrice,
        priceDiscountRate: discountRate,
        shopName: "Mercado Livre",
        offerLink: affiliateLink,
        imageUrl: imageUrl,
        // O Mercado Livre não informa a comissão pela API pública.
        // Jogamos a taxa para 100 aqui internamente apenas para garantir
        // que ele nunca seja barrado pelo filtro MIN_COMMISSION_RATE do index.js
        commissionRate: 100, 
      };
    });

    const finalList = products.slice(0, limit);
    console.log(`✅ [Mercado Livre] ${finalList.length} ofertas capturadas com sucesso!`);
    return finalList;
  } catch (error) {
    console.error("Erro no Mercado Livre Client:", error.message);
    return [];
  }
}
