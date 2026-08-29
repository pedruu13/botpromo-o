// ==========================================
// RASTREAMENTO DE VENDAS E COMISSÕES (AWIN)
// ==========================================
export async function getAwinMetrics(startDate, endDate) {
  const apiToken = process.env.AWIN_API_TOKEN;
  const publisherId = process.env.AWIN_PUBLISHER_ID;

  if (!apiToken || !publisherId) {
    return { platform: "Awin", sales: 0, commission: 0, status: "Credenciais não configuradas" };
  }

  try {
    // Awin REST API Endpoint para Transações (Vendas)
    // Documentação: https://wiki.awin.com/forum/api/publisher/transactions
    const url = `https://api.awin.com/publishers/${publisherId}/transactions/?startDate=${startDate}T00:00:00&endDate=${endDate}T23:59:59&timezone=UTC`;
    
    /*
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    });
    const transactions = await response.json();
    
    let totalSalesAmount = 0;
    let totalCommission = 0;
    let salesCount = transactions.length || 0;

    transactions.forEach(transaction => {
      totalSalesAmount += transaction.saleAmount?.amount || 0;
      totalCommission += transaction.commissionAmount?.amount || 0;
    });

    return { 
      platform: "Awin", 
      sales: salesCount, 
      revenue: totalSalesAmount, 
      commission: totalCommission,
      status: "Ativo"
    };
    */
    
    // Retorno fake para teste estrutural
    return { platform: "Awin", sales: 0, revenue: 0.00, commission: 0.00, status: "Mock" };
  } catch (error) {
    console.error("Erro ao buscar métricas da Awin:", error.message);
    return { platform: "Awin", error: error.message };
  }
}

// ==========================================
// RASTREAMENTO DE VENDAS (ALIEXPRESS)
// ==========================================
export async function getAliExpressMetrics() {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  
  if (!appKey) {
    return { platform: "AliExpress", sales: 0, commission: 0, status: "Credenciais não configuradas" };
  }

  try {
    // AliExpress Open Platform - aliexpress.affiliate.order.get
    // A chamada real precisa de assinatura HMAC-MD5.
    
    /*
    // Lógica estrutural de como você receberia as vendas
    const response = await fetch("https://api.taobao.com/router/rest?method=aliexpress.affiliate.order.list...");
    const data = await response.json();
    const orders = data.aliexpress_affiliate_order_list_response.resp_result.orders || [];
    
    let totalCommission = 0;
    orders.forEach(order => {
      totalCommission += Number(order.estimated_paid_commission) || 0;
    });
    */

    return { platform: "AliExpress", sales: 0, revenue: 0.00, commission: 0.00, status: "Mock" };
  } catch (error) {
    return { platform: "AliExpress", error: error.message };
  }
}

// ==========================================
// RASTREAMENTO DE VENDAS (SHOPEE)
// ==========================================
import { fetchShopeeConversions } from "./shopeeClient.js";

export async function getShopeeMetrics() {
  const appId = process.env.SHOPEE_APP_ID;
  
  if (!appId) {
    return { platform: "Shopee", sales: 0, revenue: 0.00, commission: 0.00, status: "Credenciais não configuradas" };
  }

  try {
    // Chama o cliente oficial da Shopee que já assina a requisição com o AppSecret
    const conversions = await fetchShopeeConversions();
    
    let totalCommission = 0;
    let salesCount = conversions.length || 0;

    // Filtra vendas concluídas ou pendentes e soma a comissão
    conversions.forEach(order => {
      // Você pode filtrar por order.orderStatus === 'Completed' se quiser
      totalCommission += Number(order.commission) || 0;
    });

    return { 
      platform: "Shopee", 
      sales: salesCount, 
      commission: totalCommission, 
      status: "Ativo" 
    };
  } catch (error) {
    return { platform: "Shopee", sales: 0, commission: 0, error: error.message };
  }
}

// ==========================================
// GERAÇÃO DO RELATÓRIO GERAL
// ==========================================
export async function generateDailyReport() {
  console.log("📊 Buscando métricas de vendas nas plataformas...");
  
  const today = new Date().toISOString().split('T')[0];

  const [awin, aliExpress, shopee] = await Promise.all([
    getAwinMetrics(today, today),
    getAliExpressMetrics(),
    getShopeeMetrics()
  ]);

  const shopeeComm = Number(shopee.commission || 0);
  const aliComm = Number(aliExpress.commission || 0);
  const awinComm = Number(awin.commission || 0);
  const total = (shopeeComm + aliComm + awinComm).toFixed(2);

  const report =
`📈 <b>Relatório de Vendas de Hoje</b>

🟠 <b>Shopee</b>
Vendas: ${shopee.sales ?? 0}
Comissão Estimada: R\$ ${shopeeComm.toFixed(2)}
Status: ${shopee.status || shopee.error || "—"}

🔴 <b>AliExpress</b>
Vendas: ${aliExpress.sales ?? 0}
Comissão Estimada: R\$ ${aliComm.toFixed(2)}
Status: ${aliExpress.status || aliExpress.error || "—"}

⚫ <b>Awin</b>
Vendas: ${awin.sales ?? 0}
Comissão Aprovada: R\$ ${awinComm.toFixed(2)}
Status: ${awin.status || awin.error || "—"}

💰 <b>LUCRO TOTAL HOJE: R\$ ${total}</b>`;

  console.log(report);
  return report;
}
