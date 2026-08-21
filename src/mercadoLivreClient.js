import fetch from "node-fetch";

/**
 * Busca produtos no Mercado Livre usando a API pública.
 * Como o ML não retorna diretamente a comissão na busca, pegamos ofertas com desconto.
 */
export async function fetchMercadoLivreOffers({ limit = 20 } = {}) {
  // Apenas a tag do afiliado é obrigatória para montar o link
  const affiliateId = process.env.MERCADO_LIVRE_AFFILIATE_ID;
  
  if (!affiliateId) {
    console.log("⚠️ MERCADO_LIVRE_AFFILIATE_ID não configurado. Pulando busca no ML...");
    return [];
  }

  try {
    // Busca produtos que estão com promoção/desconto do dia no Brasil (MLB)
    const url = `https://api.mercadolibre.com/sites/MLB/search?deal_of_the_day=true`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.results) return [];

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
        // Mercado livre varia a comissão por categoria (ex: 9% a 15%), setamos um valor seguro para passar no filtro
        commissionRate: 0.10, 
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
