# language: pt
Funcionalidade: Proteções da API (tokens, headers e corpo das requisições)

  Cenário: Reenviar o e-mail usa o pagamento do token, não o do corpo
    Dado que o pagamento "998001" escolheu o número 11 com o e-mail "dono@teste.com"
    E que o pagamento "998002" escolheu o número 12 com o e-mail "outro@teste.com"
    E que tenho o token de reenvio do pagamento "998001"
    Quando eu peço o reenvio do e-mail do pagamento "998002" com esse token
    Então a resposta HTTP deve ser 403
    E nenhum e-mail deve ter sido enviado

  Cenário: Reenviar o e-mail do próprio pagamento
    Dado que o pagamento "998003" escolheu o número 13 com o e-mail "dono@teste.com"
    E que tenho o token de reenvio do pagamento "998003"
    Quando eu peço o reenvio do e-mail com esse token
    Então a resposta HTTP deve ser 200
    E deve ter sido enviado 1 e-mail para "dono@teste.com"

  Cenário: Reenviar sem token é recusado
    Quando eu peço o reenvio do e-mail do pagamento "998004" sem token
    Então a resposta HTTP deve ser 401

  Cenário: O verificar-pagamento de um número já escolhido devolve o token de reenvio
    Dado que o pagamento "998005" escolheu o número 15 com o e-mail "dono@teste.com"
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=998005"
    Então a resposta HTTP deve ser 409
    E a resposta deve conter um campo "tokenReenvio"
    E a resposta não deve conter um campo "token"

  Cenário: O token de reenvio não serve pra escolher número
    Dado que existe um pagamento confirmado "998006" no banco, sem número escolhido
    E que tenho o token de reenvio do pagamento "998006"
    Quando eu tento confirmar o número 77 com esse token
    Então a resposta HTTP deve ser 401

  Cenário: Token assinado com outro algoritmo (alg none) é recusado
    Dado que existe um pagamento confirmado "998007" no banco, sem número escolhido
    Quando eu tento confirmar o número 78 com um token sem assinatura do pagamento "998007"
    Então a resposta HTTP deve ser 401

  Cenário: Headers de segurança
    Quando eu chamo "GET /"
    Então o header "x-content-type-options" deve ser "nosniff"
    E o header "x-powered-by" não deve existir

  Cenário: Corpo JSON grande demais é recusado
    Quando eu envio um corpo JSON de 50 kB para "POST /api/rifa/criar-pix"
    Então a resposta HTTP deve ser 413

  Cenário: JSON malformado é recusado sem erro 500
    Quando eu envio um JSON malformado para "POST /api/rifa/criar-pix"
    Então a resposta HTTP deve ser 400
