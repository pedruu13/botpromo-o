// ── Configuração da mensagem ────────────────────────────────────────
// Mude "true"/"false" pra mostrar ou esconder cada campo na mensagem
// que vai pro canal. Não precisa mexer em mais nada abaixo.
const SHOW_DISCOUNT = true;
const SHOW_SHOP_NAME = false;
const SHOW_RATING = false; // Desligado a pedido
const SHOW_SALES = false;
// ─────────────────────────────────────────────────────────────────────

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatOfferMessage(product, globalCoupon = "") {
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

  let priceLine = `💰 Por apenas: <b>${formatPrice(price)}</b>`;
  if (discountPct > 0) {
    const originalPrice = price / (1 - (discountPct / 100));
    priceLine = `❌ De <s>${formatPrice(originalPrice)}</s>\n✅ Por apenas: <b>${formatPrice(price)}</b>`;
  }

  // Define um título chamativo dependendo se é muita promoção ou muito vendido
  let title = `🚨 <b>OFERTA DISPONÍVEL!</b> 🚨`;
  if (discountPct >= 20) {
    title = `⚡ <b>SUPER DESCONTO: ${discountPct}% OFF!</b> ⚡`;
  } else if (Number(sales) >= 500) {
    title = `🔥 <b>DESTAQUE DE VENDAS!</b> 🔥`;
  }

  const lines = [
    title,
    "",
    `🔥 <b>${productName}</b>`,
    "",
    priceLine,
  ];

  if (SHOW_DISCOUNT && discountPct > 0) lines.push(`\n💸 <b>VOCÊ ECONOMIZA ${discountPct}% AGORA!</b>`);
  if (SHOW_RATING && ratingStar) lines.push(`⭐ Avaliação: ${Number(ratingStar).toFixed(1)} / 5.0`);
  if (SHOW_SALES && sales) lines.push(`🛒 Mais de ${sales} vendidos!`);
  if (SHOW_SHOP_NAME && shopName) lines.push(`🏪 Loja: ${shopName}`);

  // Regra de Cupom
  lines.push("");
  if (globalCoupon) {
    lines.push(`🎟️ <b>Use o cupom:</b> <code>${globalCoupon}</code>`);
  } else if (shopName === "Shopee" || offerLink.includes("shopee")) {
    lines.push(`🎫 <b>RESGATE AGORA:</b> Cupons de Frete Grátis e Descontos no app!`);
  }

  lines.push(
    "",
    `⏳ <i>Estoque limitado, vai esgotar muito rápido!</i>`,
    `👇 <b>CLIQUE NO LINK ABAIXO PARA GARANTIR:</b> 👇`,
    `🔗 <b><a href="${offerLink}">👉 PEGAR PROMOÇÃO AGORA 👈</a></b>`
  );

  return lines.join("\n");
}
