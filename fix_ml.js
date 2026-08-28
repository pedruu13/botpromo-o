const fs = require('fs');

const code = 
export async function fetchMercadoLivreAutoOffers({ limit = 10 } = {}) {
  const affiliateId = process.env.MERCADO_LIVRE_AFFILIATE_ID;
  if (!affiliateId) return [];
  try {
    const url = 'https://api.mercadolibre.com/sites/MLB/search?deal_of_the_day=true';
    const response = await fetch(url);
    const data = await response.json();
    if (!data.results) return [];
    const products = data.results.map(item => {
      const salePrice = item.price;
      const originalPrice = item.original_price || salePrice;
      let discountRate = 0;
      if (originalPrice > salePrice) discountRate = ((originalPrice - salePrice) / originalPrice) * 100;
      const separator = item.permalink.includes('?') ? '&' : '?';
      const affiliateLink = item.permalink + separator + 'affiliate_id=' + affiliateId;
      const imageUrl = item.thumbnail.replace('-I.jpg', '-O.jpg');
      return {
        itemId: 'auto_' + item.id,
        productName: item.title,
        price: salePrice,
        priceDiscountRate: discountRate,
        shopName: 'Mercado Livre',
        offerLink: affiliateLink,
        imageUrl: imageUrl,
        commissionRate: 100,
        ratingStar: 5,
        sales: 1000
      };
    });
    const finalList = products.slice(0, limit);
    console.log('[Mercado Livre Automático] ' + finalList.length + ' ofertas randômicas capturadas!');
    return finalList;
  } catch (error) {
    console.error('Erro no ML Automático:', error.message);
    return [];
  }
}
;

let current = fs.readFileSync('src/mercadoLivreClient.js', 'utf8');
current = current.replace('export async function fetchMercadoLivreOffers(', 'export async function fetchMercadoLivreCloneOffers(');
fs.writeFileSync('src/mercadoLivreClient.js', current + '\n' + code, 'utf8');
