import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
async function run() {
  const res = await fetch('https://t.me/s/RadarRpadilha');
  const html = await res.text();
  const $ = cheerio.load(html);
  const links = [];
  $('a').each((i, a) => {
    const href = $(a).attr('href');
    if (href && (href.includes('mercadolivre') || href.includes('meli.com'))) {
      links.push(href);
    }
  });
  console.log(links.slice(0, 5));
  
  for (const l of links.slice(0, 5)) {
    const res2 = await fetch(l, { redirect: 'follow' });
    console.log(res2.url);
  }
}
run();