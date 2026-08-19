// ── Configuração da mensagem ────────────────────────────────────────
// Mude "true"/"false" pra mostrar ou esconder cada campo na mensagem
// que vai pro canal. Não precisa mexer em mais nada abaixo.
const SHOW_DISCOUNT = true;
const SHOW_SHOP_NAME = false;
const SHOW_RATING = true;
const SHOW_SALES = true;
// ─────────────────────────────────────────────────────────────────────

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatOfferMessage(product) {
  const {
    productName,
    price,
    priceDiscountRate,
    shopName,
    ratingStar,
    sales,
    offerLink,
  } = product;

  const discountPct = Math.round(Number(priceDiscountRate || 0));

  let priceLine = `💰 Por: <b>${formatPrice(price)}</b>`;
  if (discountPct > 0) {
    const originalPrice = price / (1 - (discountPct / 100));
    priceLine = `💰 De <s>${formatPrice(originalPrice)}</s> por <b>${formatPrice(price)}</b>`;
  }

  const lines = [
    `🚨 <b>OFERTA IMPERDÍVEL!</b> 🚨`,
    "",
    `🔥 <b>${productName}</b>`,
    "",
    priceLine,
  ];

  if (SHOW_DISCOUNT && discountPct > 0) lines.push(`😱 <b>ECONOMIZE ${discountPct}% AGORA!</b>`);
  if (SHOW_RATING && ratingStar) lines.push(`⭐ Avaliação: ${Number(ratingStar).toFixed(1)} / 5.0`);
  if (SHOW_SALES && sales) lines.push(`🛒 Mais de ${sales} pessoas já compraram!`);
  if (SHOW_SHOP_NAME && shopName) lines.push(`🏪 Loja: ${shopName}`);

  lines.push(
    "",
    `⏳ <i>Promoção por tempo limitado, o preço pode subir a qualquer momento!</i>`,
    `👉 <b><a href="${offerLink}">CLIQUE AQUI PARA GARANTIR A SUA</a></b>`
  );

  return lines.join("\n");
}
