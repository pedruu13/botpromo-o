import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function test() {
  const res = await fetch('https://t.me/s/RadarRpadilha');
  const html = await res.text();
  const $ = cheerio.load(html);
  let link = null;
  .tgme_widget_message_text a.each((i, a) => {
     const href = .attr('href');
     if (href && (href.includes('mercadolivre.com/sec/') || href.includes('meli.com'))) {
        link = href;
     }
  });
  console.log('Found ML link:', link);
  if(link) {
     const res2 = await fetch(link, { redirect: 'manual' });
     console.log('Status:', res2.status, 'Location:', res2.headers.get('location'));
     if (res2.status === 301 || res2.status === 302) {
       return;
     }
     const text2 = await res2.text();
     const match = text2.match(/url=['"]?([^'"]+)['"]?/i);
     console.log('Meta refresh match:', match ? match[1] : null);
  }
}
test();
