# Promo Bot — Shopee → Telegram

Bot que busca ofertas na Shopee (via **Affiliate Open API oficial**) e posta
automaticamente num grupo/canal do Telegram, já com link de afiliado.

## 1. Passo a passo pra configurar

### a) Criar o bot no Telegram
1. Abra o Telegram e converse com **@BotFather**
2. Envie `/newbot`, escolha um nome e um username (precisa terminar em `bot`)
3. Copie o **token** que ele te der → vai em `TELEGRAM_BOT_TOKEN`
4. Crie o grupo ou canal onde as ofertas vão ser postadas
5. Adicione seu bot como **administrador** do grupo/canal
6. Pra pegar o `TELEGRAM_CHAT_ID`:
   - Se for canal público: use `@nome_do_canal` direto
   - Se for grupo privado: mande uma mensagem no grupo e acesse
     `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates` no navegador —
     o `chat.id` aparece no JSON (vai ser um número negativo tipo `-100123456789`)

### b) Pegar as credenciais da Shopee
1. Acesse o painel de afiliado da Shopee → **Open API**
2. Copie o **App ID** e o **App Secret**
3. Confirme a URL do endpoint (BR = `open-api.affiliate.shopee.com.br/graphql`)

### c) Configurar o projeto
```bash
cp .env.example .env
# edite o .env com os dados acima
npm install
```

### d) Testar uma vez (sem deixar rodando)
```bash
npm run once
```
Isso busca as ofertas e posta no Telegram uma única vez — bom pra validar
antes de deixar automático.

### e) Rodar de verdade (contínuo)
```bash
npm start
```
Isso deixa rodando e buscando novas ofertas a cada `FETCH_INTERVAL_MINUTES`
(padrão: 30 min).

## 2. Colocar pra rodar 24h (Railway — recomendado)

1. Suba este projeto num repositório no GitHub
2. Crie conta em https://railway.app (dá pra logar com GitHub)
3. "New Project" → "Deploy from GitHub repo" → selecione o repositório
4. Em **Variables**, cole todas as variáveis do seu `.env`
5. Em **Settings → Start Command**, confirme que está `npm start`
6. Deploy. Pronto, roda sem precisar do seu PC ligado.

Alternativas: Render.com (parecido) ou uma VPS barata (DigitalOcean/Hetzner)
rodando com `pm2` pra manter o processo vivo.

## 3. Sobre WhatsApp (fase 2)

Não existe API oficial da Meta pra postar em **grupos** de WhatsApp (só
mensagens diretas/broadcast). O caminho técnico é a biblioteca **Baileys**
(WhatsApp Web não-oficial), mas isso viola os termos de uso do WhatsApp e
tem risco real de banimento do número, principalmente com postagens
frequentes. Se quiser seguir por aí mesmo assim, dá pra integrar depois — é
só avisar que eu monto esse módulo separado, com throttling pra reduzir o
risco.

## 4. Ajustar o filtro de ofertas

No `.env`:
- `MIN_COMMISSION_RATE`: comissão mínima pra considerar a oferta boa (0.10 = 10%)
- `PRODUCTS_PER_FETCH`: quantos produtos buscar por ciclo
- `FETCH_INTERVAL_MINUTES`: intervalo entre buscas

O bot guarda em `data/posted.json` os produtos já postados, então não repete
oferta.

## 5. Adicionar outras lojas depois

Pra Amazon, Magalu, Awin etc., a estrutura é a mesma: um novo arquivo tipo
`src/amazonClient.js` que retorna produtos no mesmo formato
(`productName`, `price`, `offerLink`, `imageUrl`...) e você inclui no
`runCycle()` do `src/index.js`. Me chama quando tiver a conta aprovada em
alguma delas que eu já monto esse client.
