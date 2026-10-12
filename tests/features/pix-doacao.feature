# language: pt
Funcionalidade: Pix dentro do site (doação)

  Cenário: Criar um Pix devolve o QR code e o copia e cola
    Quando eu peço um Pix de 50 para "ana@email.com" com origem "instagram"
    Então a resposta HTTP deve ser 201
    E a resposta deve trazer o Pix com paymentId, rastreioId, qrCode, qrCodeBase64 e expiraEm
    E o Mercado Pago deve ter recebido o pedido de Pix de 50 para "ana@email.com" com origem "INSTAGRAM"

  Cenário: O pagamento é criado no Mercado Pago como Pix, com o rastreio da doação
    Quando o pagamento Pix de 35.5 para "ana@email.com" é montado para o Mercado Pago
    Então o corpo enviado deve ter payment_method_id "pix" e o e-mail "ana@email.com"
    E o external_reference deve ser igual ao rastreio_id do metadata
    E o valor_esperado do metadata deve ser igual ao transaction_amount
    E o metadata deve ter tipo "DOACAO"
    E a expiração deve estar no fuso de Brasília
    E o pedido deve usar o rastreio como chave de idempotência

  Esquema do Cenário: Dados inválidos não criam o Pix
    Quando eu envio "POST /api/doacao/criar-pix" com o corpo <corpo>
    Então a resposta HTTP deve ser 400
    E nenhum Pix deve ter sido pedido ao Mercado Pago

    Exemplos:
      | corpo                                                            |
      | {"valor": 50, "email": "ana@email"}                              |
      | {"valor": 50}                                                    |
      | {"valor": 0, "email": "ana@email.com"}                           |
      | {"valor": "50", "email": "ana@email.com"}                        |
      | {"valor": 50, "email": "ana@email.com", "utmSource": "tiktok"}   |

  Esquema do Cenário: O status do Pix acompanha o Mercado Pago
    Dado que existe um Pix de doação "<id>" com status "<statusMP>" e detalhe "<detalhe>" na API do Mercado Pago
    Quando eu consulto o status do Pix "<id>" com o rastreio dele
    Então a resposta HTTP deve ser 200
    E o status do Pix deve ser "<status>"

    Exemplos:
      | id     | statusMP  | detalhe                 | status    |
      | 880001 | pending   | pending_waiting_transfer | PENDENTE  |
      | 880002 | approved  | accredited              | APROVADO  |
      | 880003 | cancelled | expired                 | EXPIRADO  |
      | 880004 | rejected  | cc_rejected_other_reason | CANCELADO |

  Cenário: Pix pendente com a validade vencida aparece como expirado
    Dado que existe um Pix de doação "880005" pendente e já vencido na API do Mercado Pago
    Quando eu consulto o status do Pix "880005" com o rastreio dele
    Então o status do Pix deve ser "EXPIRADO"

  Cenário: Não dá pra consultar o Pix com o rastreio de outra pessoa
    Dado que existe um Pix de doação "880006" com status "pending" e detalhe "pending_waiting_transfer" na API do Mercado Pago
    Quando eu consulto o status do Pix "880006" com o rastreio "0f0f0f0f-0000-4000-8000-000000000000"
    Então a resposta HTTP deve ser 404

  Cenário: Pagamento da rifa não é consultável como Pix de doação
    Dado que existe um pagamento com status "pending" "880007" na API do Mercado Pago
    Quando eu consulto o status do Pix "880007" com o rastreio "0f0f0f0f-0000-4000-8000-000000000000"
    Então a resposta HTTP deve ser 404

  Esquema do Cenário: Consulta com parâmetros inválidos é rejeitada
    Quando eu chamo "<chamada>"
    Então a resposta HTTP deve ser 400

    Exemplos:
      | chamada                                                                  |
      | GET /api/doacao/status/abc?ref=0f0f0f0f-0000-4000-8000-000000000000      |
      | GET /api/doacao/status/880001                                            |
      | GET /api/doacao/status/880001?ref=nao-e-uuid                             |
