import fetch from 'node-fetch';
async function run() {
  const response = await fetch('https://mercadolivre.com/sec/1y17K6L', { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Status:', response.status);
  console.log('Headers:', response.headers.raw());
  const text = await response.text();
  console.log('Text:', text.substring(0, 500));
}
run();
