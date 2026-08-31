import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function test() {
  const res = await fetch('https://www.mercadolivre.com.br/ofertas');
  const html = await res.text();
  const $ = cheerio.load(html);
  const items = Array.from($('.promotion-item'));
  console.log('Items:', items.length);
  if (items.length > 0) {
    console.log('Title:', $(items[0]).find('.promotion-item__title').text().trim());
    console.log('Price:', $(items[0]).find('.andes-money-amount__fraction').text().trim());
    console.log('Link:', $(items[0]).find('a').attr('href'));
  }
}
test();
