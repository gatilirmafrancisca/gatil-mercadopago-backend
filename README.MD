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

1. A pessoa vê o vídeo no Instagram/TikTok e acessa `/rifa` (frontend), uma landing onde escolhe **PIX** ou **cartão**:
   - **PIX** (com `VITE_PIX_NO_SITE=true` no frontend): `POST /api/rifa/criar-pix` cria o Pix no Mercado Pago (valor do bilhete definido aqui) e a tela mostra o QR code, consultando `GET /api/rifa/status-pix/:paymentId?ref=` até aprovar. Aprovado, o front leva pra `/rifa/pagamento-aprovado?payment_id=...`.
   - **Cartão**: `GET /api/rifa/criar-pagamento` cria uma preferência (Checkout Pro, **só cartão** — o Pix fica só dentro do site) e redireciona pro Mercado Pago.
2. O Mercado Pago notifica o backend pelo **webhook** (assíncrono, sempre chega). No cartão, o **redirect** (`back_urls` → `/rifa/pagamento-aprovado`, `/rifa/pagamento-pendente` ou `/rifa/pagamento-recusado`) traz a pessoa de volta.
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
| `CRON_SECRET` | Autoriza o Cron da Vercel a chamar `/api/rifa/tarefas-diarias` — sem ela, a rota fica fechada (401) |
| `PIX_TESTE_CHAVE` | Liga o Pix de teste de R$ 0,01 (header `x-pix-teste`). Vazia = desligado |
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
| `GET` | `/api/rifa/criar-pagamento` | — | Checa estoque e cria uma nova Preferência no Mercado Pago (só cartão) |
| `POST` | `/api/rifa/criar-pix` | rate limit | Checa estoque e cria o Pix do bilhete (`{ email, utm* }`) — devolve QR code, copia e cola, `rastreioId` e expiração |
| `GET` | `/api/rifa/status-pix/:paymentId?ref=` | rate limit | Status do Pix da rifa (`PENDENTE`, `APROVADO`, `CANCELADO`, `EXPIRADO`); `ref` = `rastreioId` |
| `GET` | `/api/rifa/numeros-ocupados` | — | Lista os números já escolhidos, pra pintar a grade |
| `POST` | `/api/rifa/confirmar-numero` | `Bearer <token>` | Reserva um número pro pagamento dono do token |
| `POST` | `/api/rifa/reenviar-email` | — | Reenvia o e-mail de confirmação de um pagamento já resolvido |
| `GET` | `/api/rifa/tarefas-diarias` | `Bearer <CRON_SECRET>` | Cron da Vercel, 1×/dia: confere os PENDENTE vencidos no MP, envia os lembretes de escolha e sorteia os números com prazo vencido |
| `GET` | `/api/rifa/buscar-por-email` | — | Recupera o `payment_id` de uma compra perdida, por e-mail |

## Regras de negócio que valem saber antes de mexer

- **Pix só dentro do site.** As preferências (Checkout Pro) de doação e de rifa excluem Pix e boleto (`PAGAMENTOS_SO_CARTAO`). O Pix é criado por `criarPixDoacao.ts` / `criarPixRifa.ts`, com `external_reference` = `rastreio_id` — a consulta de status exige esse `ref` e o `metadata.tipo` certo (`DOACAO` ou `RIFA`).
- **Rifa é sempre `utm_campaign = RIFA_SOLIDARIA` + `metadata.tipo = RIFA`**, mesmo que o link traga outra campanha: é assim que o webhook registra o bilhete e que o painel separa a rifa das doações (`categoria=DOACAO` = tudo que não é `RIFA_SOLIDARIA`).
- **Envio ao painel** (`POST {PAINEL_ADM_URL}/financeiro/interno/mercadopago`): `valor` é o líquido (`net_received_amount`) — enquanto pendente, o bruto (o painel exige valor; a aprovação sobrescreve) —, `dataConfirmacao` é a data de aprovação no Mercado Pago (não a hora do envio) e o painel faz upsert por `mercadoPagoId`.

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

**`pix-rifa.feature`**
- Pix da rifa criado com o valor do bilhete (o valor do navegador é ignorado), `tipo RIFA`, `utm_campaign RIFA_SOLIDARIA`, expiração em -03:00 e idempotência
- Dados inválidos (400) e estoque esgotado (409) não criam Pix
- Status acompanha o Mercado Pago (inclusive expirado); Pix de doação e da rifa não se cruzam; `ref` de outra pessoa dá 404
- Jornada: Pix aprovado → `verificar-pagamento` devolve o token e registra o bilhete

**`reconciliar-pendentes.feature`**
- Pix vencido ou expirado sem pagamento vira `CANCELADO` (e deixa de ocupar vaga); Pix pago que ficou `PENDENTE` vira `APROVADO`; os dois vão ao painel
- Isso acontece pelo Cron (com segredo) e também ao gerar um Pix ou abrir a grade; Pix recente nem é consultado
- A consulta de status da tela do Pix também atualiza o banco, mesmo sem webhook; um pagamento `APROVADO` nunca volta pra `CANCELADO`
- E-mail do pagador fora do formato não impede o pagamento de ser aprovado

**`lembretes-escolha.feature`**
- Lembretes com o link quando faltam 20, 15, 10, 5 e 1 dia(s), sem repetir e sem rajada; nada na primeira hora
- Prazo vencido: número livre sorteado (nunca um ocupado) e confirmação enviada; quem escolheu sai dos lembretes

**`pix-teste.feature`**
- Chave certa → Pix de R$ 0,01 marcado como teste; sem chave → R$ 100; chave errada ou desligado → 403
- O teste segue o fluxo da rifa, não ocupa vaga nem número real e vai ao painel com "[TESTE]"

**`preferencias-sem-pix.feature`**
- As preferências de doação e de rifa só aceitam cartão (sem Pix nem boleto); a rifa fica sempre na campanha da rifa

**`financeiro-painel.feature`**
- O que vai ao painel: rifa (cartão e Pix) como `RIFA_SOLIDARIA`, doação fora dela, valor líquido, bruto enquanto pendente, data da aprovação

**`retorno-rifa.feature`**
- As `back_urls` da preferência da rifa apontam para `/rifa/pagamento-aprovado`, `/rifa/pagamento-pendente` e `/rifa/pagamento-recusado` — separadas das páginas de retorno da doação (`/doar/pagamento-aprovado`, `/doar/pagamento-pendente` e `/doar/pagamento-recusado`)

## Recuperar pagamentos da rifa que não chegaram ao banco

Um pagamento aprovado no Mercado Pago só entra no banco pelo webhook ou
quando a pessoa volta ao site (`/rifa/pagamento-aprovado`). Se nenhum dos
dois acontecer (ex: Pix pago pelo Checkout Pro antigo, sem voltar ao site),
o script abaixo encontra esses pagamentos e os registra como APROVADO, sem
número, imprimindo o link para cada pessoa escolher o número:

```bash
npm run recuperar:rifa -- --desde 2026-09-01           # só lista
npm run recuperar:rifa -- --desde 2026-09-01 --apply   # registra
npm run recuperar:rifa -- 123456789 987654321 --apply  # IDs específicos
```

## Pagamentos da rifa presos em PENDENTE

O registro nasce `PENDENTE` quando o Pix é gerado (o Mercado Pago avisa o
webhook antes de alguém pagar). Ele sai desse estado pelo webhook de
aprovação/cancelamento, pela consulta de status da tela do Pix ou, se nada
disso acontecer, pelas **tarefas da rifa** (abaixo). Pix vencido vira
`CANCELADO` e libera a vaga; pago vira `APROVADO`. Para conferir na hora:

```bash
npm run reconciliar:rifa            # só lista o que mudaria
npm run reconciliar:rifa -- --apply # atualiza banco e painel
```

## Escolha do número: lembretes e sorteio

Quem pagou e não escolheu o número tem **20 dias** (a partir de `aprovadoEm`)
para escolher. Nesse prazo, recebe um e-mail com o link de escolha quando
faltam **20, 15, 10, 5 e 1 dia(s)** — o último no último dia, e o primeiro só
1 h depois da aprovação (a pessoa ainda pode estar escolhendo na tela). Só o
lembrete mais recente sai: se as tarefas pararam uns dias, não chega uma
rajada de e-mails. Vencido o prazo, um número livre é **sorteado** e a
confirmação é enviada. Quem escolhe no meio do caminho para de receber
lembretes. Aprovados de antes dessa regra ganham o prazo a partir da primeira
execução.

## Tarefas da rifa (no site e no Cron diário)

A conferência dos pendentes vencidos e os lembretes/sorteios rodam:

- **durante o uso do site** — ao gerar um Pix, abrir o pagamento por cartão
  ou abrir a grade de números: no máximo a cada 5 minutos por instância e 5
  registros por vez;
- **1×/dia pelo Cron da Vercel** (`vercel.json`, 9h de Brasília) em
  `GET /api/rifa/tarefas-diarias`, com `Authorization: Bearer <CRON_SECRET>`
  — garante os e-mails mesmo em dias sem visitas.

## Pix de teste (R$ 0,01)

Para validar o fluxo da rifa em produção sem pagar o bilhete: com
`PIX_TESTE_CHAVE` definida, um `POST /api/rifa/criar-pix` com o header
`x-pix-teste: <PIX_TESTE_CHAVE>` cria um Pix de **R$ 0,01** com
`metadata.teste = true`. O fluxo é o mesmo (webhook, status, escolha do número,
e-mails com "[TESTE]" no assunto, painel com "[TESTE]" na descrição), mas o
registro fica com `teste: true`: não ocupa vaga, não aparece na grade e um
número escolhido no teste continua livre para um comprador real. Chave errada,
ou variável vazia, dá 403 — nunca vira um Pix de R$ 100. No site, o
frontend liga o modo pelo console (`gatilPixTeste("<chave>")` na página
`/rifa`).

Depois do deploy que trouxe o campo `teste`, rode uma vez
`npm run migrate:indices -- --apply` para trocar o índice único do número.

## CI/CD

`.github/workflows/tests.yml` roda `npm run test:bdd` em todo `pull_request` e push pra `main` — nenhuma mudança que quebre a proteção de corrida (ou qualquer outro cenário) chega a `main` sem o CI acusar.

## Deploy (Vercel)

O `vercel.json` aponta pra `api/index.ts` como a função serverless. Esse arquivo só reexporta o `app` (sem `.listen()` — em serverless, a Vercel invoca `app` diretamente por requisição). Variáveis de ambiente precisam ser cadastradas no painel do projeto na Vercel, não só no `.env` local.

## Pontos em aberto / conferir contra o código real

- O caminho exato do webhook foi assumido como `/mercadopago/webhook` nos testes — confirme contra `mercadoPago.route.ts`.
- E-mail de confirmação: domínio verificado no Resend via Cloudflare (ver guia separado) antes de ir pra produção.