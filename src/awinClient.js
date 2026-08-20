import fetch from "node-fetch";

export async function fetchAwinOffers({ limit = 20 } = {}) {
  const apiToken = process.env.AWIN_API_TOKEN;
  const publisherId = process.env.AWIN_PUBLISHER_ID;
  const advertiserId = process.env.AWIN_ADVERTISER_ID;

  if (!apiToken || !publisherId) {
    console.log("⚠️ Credenciais da Awin não encontradas. Pulando busca na Awin...");
    return [];
  }

  if (!advertiserId) {
    console.log("⚠️ AWIN_ADVERTISER_ID não definido. Especifique um ID de loja (ex: Fast Shop) para buscar produtos da Awin.");
    return [];
  }

  try {
    // API de Produtos da Awin (Product API)
    const url = `https://productdata.awin.com/export/api/v1/productfeed/export?publisherId=${publisherId}&advertiserId=${advertiserId}&format=json&apikey=${apiToken}`;
    
    /*
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data || !data.products) {
      throw new Error("Resposta inválida ou vazia do feed da Awin");
    }

    const products = data.products.map(item => {
      const originalPrice = Number(item.price?.storePrice) || 0;
      const salePrice = Number(item.price?.salePrice) || 0;
      let discountRate = 0;
      
      if (originalPrice > salePrice && originalPrice > 0) {
        discountRate = ((originalPrice - salePrice) / originalPrice) * 100;
      }

      return {
        itemId: item.productId.toString(),
        productName: item.productName,
        price: salePrice,
        priceDiscountRate: discountRate,
        shopName: item.merchantName || "Loja Awin",
        offerLink: item.awinDeepLink,
        imageUrl: item.imageUrl,
        commissionRate: 0.1 // O Awin não envia a comissão exata via API na maioria dos feeds, definimos um padrão
      };
    });
    
    return products.slice(0, limit);
    */
    
    return []; // Retornando array vazio até as credenciais serem preenchidas e o código descomentado
  } catch (error) {
    console.error("Erro no Awin Client:", error.message);
    return [];
  }
}
