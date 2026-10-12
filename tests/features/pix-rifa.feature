# language: pt
Funcionalidade: Pix dentro do site (rifa)

  Cenário: Criar o Pix da rifa devolve o QR code e o copia e cola
    Quando eu peço um Pix da rifa para "ana@email.com" com origem "instagram"
    Então a resposta HTTP deve ser 201
    E a resposta deve trazer o Pix com paymentId, rastreioId, qrCode, qrCodeBase64 e expiraEm
    E o Mercado Pago deve ter recebido o pedido de Pix da rifa para "ana@email.com" com origem "INSTAGRAM"

  Cenário: O pagamento é criado no Mercado Pago como Pix da rifa, no valor do bilhete
    Quando o pagamento Pix da rifa para "ana@email.com" é montado para o Mercado Pago
    Então o corpo enviado deve ter payment_method_id "pix" e o e-mail "ana@email.com"
    E o transaction_amount deve ser 100
    E o metadata deve ter tipo "RIFA"
    E o metadata deve ter utm_campaign "RIFA_SOLIDARIA"
    E o external_reference deve ser igual ao rastreio_id do metadata
    E a expiração deve estar no fuso de Brasília
    E o pedido deve usar o rastreio como chave de idempotência

  Cenário: A campanha do link não tira o Pix da rifa da campanha da rifa
    Quando o pagamento Pix da rifa para "ana@email.com" com a campanha "CAMPANHA_ESPECIFICA" é montado para o Mercado Pago
    Então o metadata deve ter utm_campaign "RIFA_SOLIDARIA"

  Esquema do Cenário: Dados inválidos não criam o Pix da rifa
    Quando eu envio "POST /api/rifa/criar-pix" com o corpo <corpo>
    Então a resposta HTTP deve ser 400
    E nenhum Pix da rifa deve ter sido pedido ao Mercado Pago

    Exemplos:
      | corpo                                           |
      | {"email": "ana@email"}                          |
      | {}                                              |
      | {"email": "ana@email.com", "utmSource": "tiktok"} |

  Cenário: O valor mandado pelo navegador é ignorado
    Quando eu envio "POST /api/rifa/criar-pix" com o corpo {"email": "ana@email.com", "valor": 1}
    Então a resposta HTTP deve ser 201
    E o Mercado Pago deve ter recebido o pedido de Pix da rifa sem valor vindo do navegador

  Cenário: Com os números esgotados, o Pix da rifa não é criado
    Dado que existem 500 números já ocupados no banco
    Quando eu peço um Pix da rifa para "ana@email.com" com origem "instagram"
    Então a resposta HTTP deve ser 409
    E nenhum Pix da rifa deve ter sido pedido ao Mercado Pago

  Esquema do Cenário: O status do Pix da rifa acompanha o Mercado Pago
    Dado que existe um Pix da rifa "<id>" com status "<statusMP>" e detalhe "<detalhe>" na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "<id>" com o rastreio dele
    Então a resposta HTTP deve ser 200
    E o status do Pix deve ser "<status>"

    Exemplos:
      | id     | statusMP  | detalhe                  | status    |
      | 890001 | pending   | pending_waiting_transfer | PENDENTE  |
      | 890002 | approved  | accredited               | APROVADO  |
      | 890003 | cancelled | expired                  | EXPIRADO  |
      | 890004 | rejected  | cc_rejected_other_reason | CANCELADO |

  Cenário: Pix da rifa pendente com a validade vencida aparece como expirado
    Dado que existe um Pix da rifa "890005" pendente e já vencido na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "890005" com o rastreio dele
    Então o status do Pix deve ser "EXPIRADO"

  Cenário: Não dá pra consultar o Pix da rifa com o rastreio de outra pessoa
    Dado que existe um Pix da rifa "890006" com status "pending" e detalhe "pending_waiting_transfer" na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "890006" com o rastreio "0f0f0f0f-0000-4000-8000-000000000000"
    Então a resposta HTTP deve ser 404

  Cenário: Pix de doação não é consultável como Pix da rifa
    Dado que existe um Pix de doação "890007" com status "pending" e detalhe "pending_waiting_transfer" na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "890007" com o rastreio dele
    Então a resposta HTTP deve ser 404

  Cenário: Pix da rifa não é consultável como Pix de doação
    Dado que existe um Pix da rifa "890008" com status "pending" e detalhe "pending_waiting_transfer" na API do Mercado Pago
    Quando eu consulto o status do Pix "890008" com o rastreio dele
    Então a resposta HTTP deve ser 404

  Esquema do Cenário: Consulta do Pix da rifa com parâmetros inválidos é rejeitada
    Quando eu chamo "<chamada>"
    Então a resposta HTTP deve ser 400

    Exemplos:
      | chamada                                                                    |
      | GET /api/rifa/status-pix/abc?ref=0f0f0f0f-0000-4000-8000-000000000000      |
      | GET /api/rifa/status-pix/890001                                            |
      | GET /api/rifa/status-pix/890001?ref=nao-e-uuid                             |

  Cenário: Jornada — Pix da rifa aprovado libera a escolha do número
    Dado que existe um Pix da rifa "890009" com status "approved" e detalhe "accredited" na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "890009" com o rastreio dele
    Então o status do Pix deve ser "APROVADO"
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=890009"
    Então a resposta deve conter um campo "token"
    E deve existir um documento com paymentId "890009" e status "APROVADO"

  Cenário: Webhook do Pix da rifa registra o pagamento
    Dado que existe um Pix da rifa "890010" com status "approved" e detalhe "accredited" na API do Mercado Pago
    Quando o backend recebe uma notificação de webhook para "890010" com assinatura válida
    Então deve existir um documento com paymentId "890010" e status "APROVADO"
