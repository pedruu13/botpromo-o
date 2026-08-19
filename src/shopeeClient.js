import crypto from "crypto";
import fetch from "node-fetch";

const { SHOPEE_APP_ID, SHOPEE_APP_SECRET, SHOPEE_API_URL } = process.env;

/**
 * Gera o header de autorização exigido pela Shopee Affiliate Open API.
 * Fórmula oficial: SHA256(appId + timestamp + payload + secret)
 */
function buildAuthHeader(payloadString) {
  const timestamp = Math.floor(Date.now() / 1000);
  const base = `${SHOPEE_APP_ID}${timestamp}${payloadString}${SHOPEE_APP_SECRET}`;
  const signature = crypto.createHash("sha256").update(base).digest("hex");
  return {
    timestamp,
    header: `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
  };
}

async function shopeeGraphQL(query, variables = {}) {
  const body = { query, variables };
  const payloadString = JSON.stringify(body);
  const { header } = buildAuthHeader(payloadString);

  const res = await fetch(SHOPEE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: header,
    },
    body: payloadString,
  });

  const data = await res.json();

  if (data.errors) {
    throw new Error(
      `Erro na Shopee API: ${data.errors.map((e) => e.message).join(", ")}`
    );
  }

  return data.data;
}

/**
 * Busca ofertas de produtos ordenadas por comissão/vendas.
 * sortType: 1 = relevância, 2 = vendas, 3 = comissão (checar doc atual, pode variar)
 */
export async function fetchProductOffers({ page = 0, limit = 20 } = {}) {
  const query = `
    query Fetch($page: Int, $limit: Int) {
      productOfferV2(listType: 0, sortType: 2, page: $page, limit: $limit) {
        nodes {
          itemId
          productName
          commissionRate
          commission
          price
          priceDiscountRate
          imageUrl
          productLink
          offerLink
          shopName
          ratingStar
          sales
        }
      }
    }
  `;

  const data = await shopeeGraphQL(query, { page, limit });
  return data?.productOfferV2?.nodes ?? [];
}
