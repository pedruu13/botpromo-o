import fetch from 'node-fetch';
async function expandAndCleanUrl(url) {
  try {
    let finalUrl = url;
    let maxRedirects = 3;
    while(maxRedirects > 0) {
      const response = await fetch(finalUrl, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
      finalUrl = response.url;
      if (finalUrl.includes('/sec/') || finalUrl.includes('meli.com')) {
        const text = await response.text();
        const metaMatch = text.match(/url=['"]?([^'"]+)['"]?/i);
        if (metaMatch && metaMatch[1] && metaMatch[1].startsWith('http')) {
           finalUrl = metaMatch[1];
           maxRedirects--;
           continue;
        }
      }
      break;
    }
    const urlObj = new URL(finalUrl);
    urlObj.search = ''; 
    return urlObj.toString();
  } catch (err) { return url; }
}
expandAndCleanUrl('https://mercadolivre.com/sec/1y17K6L').then(console.log);
