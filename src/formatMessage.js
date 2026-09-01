// ── Configuração da mensagem ────────────────────────────────────────
const SHOW_DISCOUNT = true;
const SHOW_SHOP_NAME = false;
const SHOW_RATING = false;
const SHOW_SALES = false;
// ─────────────────────────────────────────────────────────────────────

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num) || num <= 0) return null;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatOfferMessage(product, globalCoupon = "") {
  let {
    productName,
    price,
    priceDiscountRate,
    shopName,
    ratingStar,
    sales,
    offerLink,
  } = product;

  // Limpa o productName
  let cleanName = String(productName).replace(/<[^>]+>/g, '').replace(/https?:\/\/\S+/g, '').trim();
  const parts = cleanName.split(/(?:🔥|✅|👉|❌|🚨|⚠️|\n)/).filter(p => p.trim().length > 5);
  if (parts.length > 0) cleanName = parts[0].trim();
  if (cleanName.length > 80) cleanName = cleanName.substring(0, 77) + '...';
  productName = cleanName;

  const discountPct = Math.round(Number(priceDiscountRate || 0));
  const formattedPrice = formatPrice(price);

  // Título baseado em dados reais
  let title = `🚨 <b>OFERTA DISPONÍVEL!</b> 🚨`;
  if (discountPct >= 30) {
    title = `⚡ <b>SUPER DESCONTO: ${discountPct}% OFF!</b> ⚡`;
  } else if (discountPct >= 10) {
    title = `🔥 <b>${discountPct}% DE DESCONTO!</b> 🔥`;
  } else if (Number(sales) >= 500) {
    title = `🔥 <b>DESTAQUE DE VENDAS!</b> 🔥`;
  }

  const lines = [title, ""];

  lines.push(`🔥 <b>${productName}</b>`, "");

  // Linha de preço — só mostra se tiver preço real
  if (formattedPrice) {
    if (discountPct > 0) {
      lines.push(`💰 Por apenas: <b>${formattedPrice}</b> (${discountPct}% OFF)`);
    } else {
      lines.push(`💰 Por apenas: <b>${formattedPrice}</b>`);
    }
  }

  if (SHOW_RATING && ratingStar) lines.push(`⭐ Avaliação: ${Number(ratingStar).toFixed(1)} / 5.0`);
  if (SHOW_SALES && sales) lines.push(`🛒 Mais de ${sales} vendidos!`);
  if (SHOW_SHOP_NAME && shopName) lines.push(`🏪 Loja: ${shopName}`);

  lines.push("");
  if (globalCoupon) {
    lines.push(`🎟️ <b>Use o cupom:</b> <code>${globalCoupon}</code>`);
  } else if (shopName === "Shopee" || (offerLink || "").includes("shopee")) {
    lines.push(`🎫 <b>Cupons de Frete Grátis e Descontos disponíveis no app!</b>`);
  }

  lines.push(
    "",
    `⏳ <i>Estoque limitado!</i>`,
    `👇 <b>CLIQUE NO LINK ABAIXO PARA GARANTIR:</b> 👇`,
    `🔗 <b><a href="${offerLink}">👉 PEGAR PROMOÇÃO AGORA 👈</a></b>`
  );

  return lines.join("\n");
}
