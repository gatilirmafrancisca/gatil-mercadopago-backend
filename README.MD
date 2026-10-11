# Gatil Irmã Francisca — Backend da Rifa Solidária

API que sustenta a Ação Solidária de 10 anos do Gatil Irmã Francisca: recebe a confirmação de pagamento do Mercado Pago, libera a escolha do número da rifa e envia o e-mail de confirmação.

## Stack

- **Express + TypeScript**, rodando em ESM (imports terminam em `.js` mesmo em arquivos `.ts`)
- **MongoDB + Mongoose**
- **Mercado Pago SDK** (Checkout Pro)
- **JWT** (`jsonwebtoken`) — token de posse de curta duração, não autenticação de usuário
- **Resend + React Email** — e-mail de confirmação
- **tsx** — execução de TypeScript em dev e em teste, sem passo de build separado
- **Cucumber (BDD)** + **supertest** + **mongodb-memory-server** — testes de API
- **Vercel** (serverless) — hospedagem

## Como o sistema funciona, em uma volta

1. A pessoa vê o vídeo no Instagram/TikTok e acessa `/rifa/pagar` (frontend), que pede ao backend uma preferência de pagamento nova e redireciona pro Mercado Pago.
2. Ela paga (cartão ou PIX). O Mercado Pago notifica o backend por dois canais independentes: o **webhook** (assíncrono, sempre chega) e o **redirect** (`back_urls` → `/rifa/pagamento-aprovado`, `/rifa/pagamento-pendente` ou `/rifa/pagamento-recusado`; só chega se ela voltar — automático no cartão, manual no PIX).
3. O webhook cria um registro no banco com o que o Mercado Pago garante (`paymentId`, `status`, `amount`) — `name`, `phone`, `email` e `claimedNumber` nascem `null`.
4. A pessoa cai na tela de escolha do número. O frontend chama `verificar-pagamento`, que confirma o pagamento (com o banco ou, se o webhook ainda não chegou, ao vivo na API do Mercado Pago) e devolve um **token de curta duração**.
5. Com esse token, ela escolhe um número e confirma — o backend só aceita se o `claimedNumber` daquele pagamento específico ainda estiver livre (índice único no banco garante isso mesmo sob concorrência).
6. Um e-mail de confirmação é disparado (sem travar a resposta — falha de envio nunca desfaz a reserva do número).

## Estrutura de pastas

```
rifa-solidaria-backend/
├── .env
├── vercel.json
├── cucumber.cjs
├── server.ts                    # entrada local (dev) — chama app.listen()
├── api/
│   ├── app.ts                   # configuração do Express, sem listen — usado pela Vercel e pelos testes
│   ├── index.ts                 # entrada da Vercel — só reexporta app
│   ├── database/
│   │   └── configdb.ts
│   ├── models/
│   │   └── Rifa.ts              # único model — representa "um bilhete" (1 pagamento = 1 número)
│   ├── types/
│   │   └── rifa.types.ts        # TOTAL_NUMEROS, TICKET_PRICE_BRL, STATUSRIFATYPE
│   ├── utils/
│   │   ├── errors.ts            # MissingParamsError, InvalidEnumError, ConflictError, NotFoundError
│   │   └── rifavalidar.ts       # normalização + validação, em 2 estágios (criação x confirmação)
│   ├── mercadoPago/
│   │   ├── verificarAssinatura.ts   # valida x-signature do webhook (HMAC)
│   │   ├── buscarPagamento.ts       # GET /v1/payments/:id — seam testável (mercadoPagoClient)
│   │   └── criarPreferencia.ts      # cria a Preferência (Checkout Pro) — seam testável
│   ├── services/
│   │   ├── pagamentoService.ts      # registrarPagamentoRifa (webhook) + confirmarNumeroRifa (frontend)
│   │   ├── mercadoPago.service.ts   # processarNotificacaoPagamento, mapearStatusMP
│   │   └── email.service.ts         # enviarEmailConfirmacao (Resend)
│   ├── emails/
│   │   └── ConfirmacaoNumeroEmail.tsx
│   ├── middlewares/
│   │   ├── token.middleware.ts      # requirePaymentToken — lê o JWT do header Authorization
│   │   └── errors.middleware.ts
│   ├── controllers/
│   │   └── mercadoPago.controller.ts  # WebhookController, VerificarPagamentoController
│   └── routes/
│       ├── mercadoPago.route.ts     # /mercadopago/*
│       └── rifa.route.ts            # /api/rifa/*
└── tests/
    ├── features/          # cenários em Gherkin (pt)
    ├── steps/             # step definitions
    └── support/           # helpers de teste (fake da API do Mercado Pago)
```

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `PORT` | Porta local (padrão 3000) |
| `MONGODB_URI` | String de conexão, **sem** o nome do banco no path |
| `MONGODB_DB_NAME` | Nome do banco — sem isso, o driver cai no banco `test` por padrão |
| `MP_ACCESS_TOKEN` | Credencial do Mercado Pago (a `APP_USR` da seção de testes, não `TEST-`, no Checkout Pro) |
| `MP_WEBHOOK_SECRET` | Chave secreta mostrada ao cadastrar o webhook no painel, aba **produção** mesmo em conta de teste |
| `FRONTEND_URL` | Usado nos `back_urls` da preferência e no CORS. Precisa ser HTTPS público — não funciona com `localhost` |
| `JWT_SECRET` | Assina o token de posse emitido em `verificar-pagamento` |
| `RESEND_API_KEY` | Envio de e-mail |
| `EMAIL_FROM` | Remetente, ex: `"Gatil Irmã Francisca <rifa@mail.gatilirmafrancisca.org>"` |

⚠️ Todo valor de `process.env` usado neste projeto é lido **dentro de uma função**, nunca no corpo do módulo — ler no topo do arquivo quebra o processo inteiro assim que esse módulo é importado (isso já mordeu o projeto várias vezes: `MercadoPagoConfig`, `Resend`, `FRONTEND_URL.startsWith(...)`). Ao adicionar uma variável de ambiente nova, mantenha esse padrão.

## Como rodar localmente

```bash
npm install
cp .env.example .env   # preencha com os valores acima
npm run dev             # tsx watch server.ts
```

Pra testar o fluxo completo (pagamento → webhook → escolha → e-mail) localmente, o backend precisa estar acessível publicamente — o Mercado Pago não entrega webhook nem `back_urls` pra `localhost`:

```bash
ngrok http 3000
```

Cadastre a URL gerada no painel do Mercado Pago (**Webhooks → aba Modo de produção**, mesmo em conta de teste) e no `.env` do frontend, e atualize sempre que reiniciar o túnel — a URL muda a cada sessão no plano gratuito.

## Endpoints

| Método | Caminho | Autenticação | O que faz |
|---|---|---|---|
| `POST` | `/mercadopago/webhook` | assinatura HMAC (`x-signature`) | Recebe notificação do Mercado Pago, registra o pagamento |
| `GET` | `/mercadopago/verificar-pagamento?payment_id=` | — | Confirma o pagamento e emite o token de posse |
| `GET` | `/api/rifa/criar-pagamento` | — | Checa estoque e cria uma nova Preferência no Mercado Pago |
| `GET` | `/api/rifa/numeros-ocupados` | — | Lista os números já escolhidos, pra pintar a grade |
| `POST` | `/api/rifa/confirmar-numero` | `Bearer <token>` | Reserva um número pro pagamento dono do token |
| `POST` | `/api/rifa/reenviar-email` | — | Reenvia o e-mail de confirmação de um pagamento já resolvido |
| `GET` | `/api/rifa/buscar-por-email` | — | Recupera o `payment_id` de uma compra perdida, por e-mail |

## Regras de negócio que valem saber antes de mexer

- **`paymentId` é único; `claimedNumber` também é único, mas por índice *parcial*** (`partialFilterExpression: { claimedNumber: { $type: "number" } }`) — um índice `sparse` comum quebraria isso, porque trata `null` como valor presente, não ausente.
- **A confirmação de número nunca confia em `paymentId` vindo do corpo da requisição** — só o que está codificado dentro do JWT verificado pelo middleware conta.
- **O webhook responde 200 antes de terminar de processar** (ack imediato, processamento em segundo plano) — por isso o controller nunca deve tentar responder de novo depois disso.
- **Duas fontes confirmam um pagamento**: o webhook (assíncrono) e a checagem ao vivo em `verificar-pagamento` (síncrona, fallback pra quando o webhook ainda não chegou). As duas convergem no mesmo `registrarPagamentoRifa`, então nunca duplicam.

## Testes

```bash
npm run test:bdd
```

Cucumber + `supertest` batendo direto no `app` do Express (sem subir servidor numa porta), com **MongoDB efêmero** (`mongodb-memory-server`, recriado a cada cenário) e a API do Mercado Pago **substituída por um fake controlável** (não há chamada de rede real em nenhum teste).

### O que cada `.feature` evidencia

**`webhook.feature`**
- Notificação com assinatura válida cria o registro corretamente
- Assinatura inválida é rejeitada (401), sem criar nada
- Reenvio do mesmo pagamento (retry do Mercado Pago) não duplica o registro
- Pagamento recusado é registrado, mas fica marcado como `cancelado`

**`verificar-pagamento.feature`**
- Pagamento já processado pelo webhook gera token normalmente
- Pagamento aprovado mas ainda não processado pelo webhook (corrida) é resolvido ao vivo, e o registro é criado na hora
- Pagamento não aprovado não gera token (402)
- Pagamento que já escolheu número não gera novo token (409)
- `payment_id` ausente é rejeitado (400)

**`confirmar-numero.feature`**
- Confirmação com token válido funciona de ponta a ponta
- Requisição sem token é rejeitada (401)
- Token expirado é rejeitado (401)
- **Dois pagamentos disputando o mesmo número ao mesmo tempo — só um vence, o outro recebe 409, e o banco nunca fica com dois donos pro mesmo número.** É a prova de que a proteção de corrida (índice único + `findOneAndUpdate` atômico) funciona sob concorrência real, não só na teoria.
- O mesmo pagamento tentando confirmar duas vezes é rejeitado na segunda
- Dados de participante incompletos são rejeitados (400)

**`estoque.feature`**
- Com números disponíveis, a preferência é criada normalmente
- Com os 500 números esgotados, a criação é bloqueada (409) e nenhuma preferência chega a ser criada no Mercado Pago

**`retorno-rifa.feature`**
- As `back_urls` da preferência da rifa apontam para `/rifa/pagamento-aprovado`, `/rifa/pagamento-pendente` e `/rifa/pagamento-recusado` — separadas das páginas de retorno da doação (`/doar/pagamento-aprovado`, `/doar/pagamento-pendente` e `/doar/pagamento-recusado`)

## CI/CD

`.github/workflows/tests.yml` roda `npm run test:bdd` em todo `pull_request` e push pra `main` — nenhuma mudança que quebre a proteção de corrida (ou qualquer outro cenário) chega a `main` sem o CI acusar.

## Deploy (Vercel)

O `vercel.json` aponta pra `api/index.ts` como a função serverless. Esse arquivo só reexporta o `app` (sem `.listen()` — em serverless, a Vercel invoca `app` diretamente por requisição). Variáveis de ambiente precisam ser cadastradas no painel do projeto na Vercel, não só no `.env` local.

## Pontos em aberto / conferir contra o código real

- O caminho exato do webhook foi assumido como `/mercadopago/webhook` nos testes — confirme contra `mercadoPago.route.ts`.
- E-mail de confirmação: domínio verificado no Resend via Cloudflare (ver guia separado) antes de ir pra produção.