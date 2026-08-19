// ── Configuração da mensagem ────────────────────────────────────────
// Mude "true"/"false" pra mostrar ou esconder cada campo na mensagem
// que vai pro canal. Não precisa mexer em mais nada abaixo.
const SHOW_DISCOUNT = true;
const SHOW_SHOP_NAME = false;
const SHOW_RATING = true;
const SHOW_SALES = false;
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
    `🔥 <b>${productName}</b>`,
    "",
    priceLine,
  ];

  if (SHOW_DISCOUNT && discountPct > 0) lines.push(`🏷️ Desconto: ${discountPct}%`);
  if (SHOW_SHOP_NAME && shopName) lines.push(`🏪 Loja: ${shopName}`);
  if (SHOW_RATING && ratingStar) lines.push(`⭐ ${Number(ratingStar).toFixed(1)}`);
  if (SHOW_SALES && sales) lines.push(`🛒 ${sales} vendidos`);

  lines.push("", `👉 <a href="${offerLink}">Ver oferta na Shopee</a>`);

  return lines.join("\n");
}
