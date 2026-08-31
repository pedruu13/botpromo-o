import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
async function run() {
  const response = await fetch('https://t.me/s/EconoMister');
  const html = await response.text();
  const $ = cheerio.load(html);
  const links = [];
  $('.tgme_widget_message_text a').each((i, el) => {
     const href = $(el).attr('href');
     if (href && (href.includes('mercadolivre.com') || href.includes('meli.com'))) {
        links.push(href);
     }
  });
  console.log('Found ML links:', links);
}
run();
