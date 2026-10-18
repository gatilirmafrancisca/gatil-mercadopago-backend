# language: pt
Funcionalidade: Pix de teste de R$ 0,01 em produção

  Cenário: Com a chave certa, o Pix da rifa sai de R$ 0,01, marcado como teste
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    Quando eu peço um Pix da rifa de teste para "ana@email.com" com a chave "chave-secreta-teste"
    Então a resposta HTTP deve ser 201
    E o Pix criado deve ter o valor "0.01"
    E o Mercado Pago deve ter recebido o pedido de Pix da rifa de teste

  Cenário: O Pix de teste é montado igual ao da rifa, só que de R$ 0,01
    Quando o pagamento Pix da rifa de teste para "ana@email.com" é montado para o Mercado Pago
    Então o Pix montado deve ser de teste, de R$ 0,01

  Cenário: Sem a chave, o Pix é o normal, de R$ 100
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    Quando eu peço um Pix da rifa para "ana@email.com" com origem "instagram"
    Então a resposta HTTP deve ser 201
    E o Pix criado deve ter o valor "100"
    E o Mercado Pago deve ter recebido o pedido de Pix da rifa normal

  Cenário: Chave errada é recusada e nenhum Pix é criado
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    Quando eu peço um Pix da rifa de teste para "ana@email.com" com a chave "chave-errada"
    Então a resposta HTTP deve ser 403
    E nenhum Pix da rifa deve ter sido pedido ao Mercado Pago

  Cenário: Sem PIX_TESTE_CHAVE configurada, o modo teste fica desligado
    Quando eu peço um Pix da rifa de teste para "ana@email.com" com a chave "qualquer-coisa"
    Então a resposta HTTP deve ser 403
    E nenhum Pix da rifa deve ter sido pedido ao Mercado Pago

  Cenário: Com o estoque esgotado, o Pix de teste ainda funciona — ele não ocupa vaga
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    E que existem 500 números já ocupados no banco
    Quando eu peço um Pix da rifa de teste para "ana@email.com" com a chave "chave-secreta-teste"
    Então a resposta HTTP deve ser 201

  Cenário: O Pix de teste pago segue o fluxo da rifa e fica marcado como teste
    Dado que existe um Pix da rifa de teste "660001" aprovado na API do Mercado Pago
    Quando o backend recebe uma notificação de webhook para "660001" com assinatura válida
    Então deve existir um documento com paymentId "660001" e status "APROVADO"
    E o pagamento "660001" deve estar marcado como teste, com valor 0.01
    E a descrição enviada ao painel para "660001" deve começar com "[TESTE]"

  Cenário: O Pix de teste aprovado libera a escolha do número, como o normal
    Dado que existe um Pix da rifa de teste "660002" aprovado na API do Mercado Pago
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=660002"
    Então a resposta deve conter um campo "token"

  Cenário: Número escolhido num teste não aparece na grade nem bloqueia um comprador real
    Dado que existe um pagamento de teste "660003" aprovado com o número 7
    E que tenho um token válido para o pagamento "660004"
    Quando alguém abre a grade de números da rifa
    Então a grade de números não deve ter o número 7
    Quando eu escolho o número 7 com esse token
    Então o pagamento "660004" deve ter o número 7

  Cenário: Registro antigo, sem o campo teste, continua bloqueando o número para um registro novo
    Dado que existe um registro antigo "650001" com o número 9, sem o campo teste
    E que tenho um token válido para o pagamento "650002"
    Quando eu envio "POST /api/rifa/confirmar-numero" de novo com o mesmo token, para o número 9
    Então a resposta HTTP deve ser 409

  Cenário: Pagamento real registrado pelo webhook não grava o campo teste
    Dado que existe um pagamento aprovado "650003" na API do Mercado Pago
    Quando o backend recebe uma notificação de webhook para "650003" com assinatura válida
    Então deve existir um documento com paymentId "650003" e status "APROVADO"
    E o pagamento "650003" não deve ter o campo teste gravado
