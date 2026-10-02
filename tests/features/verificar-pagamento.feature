# language: pt
Funcionalidade: Verificação de pagamento e emissão de token

  Cenário: Pagamento aprovado e já processado pelo webhook gera token
    Dado que existe um pagamento confirmado "999010" no banco, sem número escolhido
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=999010"
    Então a resposta deve conter um campo "token"
    E a resposta HTTP deve ser 200

  Cenário: Pagamento aprovado mas webhook ainda não chegou (corrida)
    Dado que existe um pagamento aprovado "999011" só na API do Mercado Pago, ainda não no banco
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=999011"
    Então a resposta deve conter um campo "token"
    E deve existir um documento com paymentId "999011" no banco depois da chamada

  Cenário: Pagamento não aprovado não gera token
    Dado que existe um pagamento com status "pending" "999012" na API do Mercado Pago
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=999012"
    Então a resposta HTTP deve ser 402
    E a resposta não deve conter um campo "token"

  Cenário: Pagamento que já escolheu número não gera novo token
    Dado que existe um pagamento confirmado "999013" no banco, com claimedNumber 42
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=999013"
    Então a resposta HTTP deve ser 409

  Cenário: payment_id ausente é rejeitado
    Quando eu chamo "GET /mercadopago/verificar-pagamento"
    Então a resposta HTTP deve ser 400

  Cenário: PIX gravado como pendente e já aprovado no Mercado Pago gera token
    Dado que existe um pagamento "999014" registrado no banco como "PENDENTE"
    E que existe um pagamento aprovado "999014" na API do Mercado Pago
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=999014"
    Então a resposta deve conter um campo "token"
    E deve existir um documento com paymentId "999014" e status "APROVADO"

  Cenário: PIX gravado como pendente e ainda pendente no Mercado Pago não gera token
    Dado que existe um pagamento "999015" registrado no banco como "PENDENTE"
    E que existe um pagamento com status "pending" "999015" na API do Mercado Pago
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=999015"
    Então a resposta HTTP deve ser 402
