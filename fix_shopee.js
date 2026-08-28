const fs = require('fs');
let code = fs.readFileSync('src/shopeeClient.js', 'utf8');

const expanderCode = 
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
;

code = expanderCode + '\n' + code;

code = code.replace(
  'const finalLink = await generateShopeeShortLink(originalLink);',
  'const expandedLink = await expandShopeeUrl(originalLink);\n           const finalLink = await generateShopeeShortLink(expandedLink);'
);

fs.writeFileSync('src/shopeeClient.js', code);
