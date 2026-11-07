# language: pt
Funcionalidade: Pagamento da reserva (Pix e cartão com a mesma validade) e confirmação dos números

  Cenário: Pix da reserva com o valor total e 30 minutos de validade
    Dado que eu reservei os números 10 e 20
    Quando eu gero o Pix da reserva com os meus dados
    Então a resposta HTTP deve ser 201
    E o Mercado Pago deve ter recebido um Pix de 200 reais para os números 10 e 20
    E o Pix deve expirar em cerca de 30 minutos
    E a reserva deve valer até 2 minutos depois do Pix expirar
    E o pedido deve estar "AGUARDANDO_PAGAMENTO" com valor 200
    E o pedido deve guardar o nome, o e-mail, o WhatsApp e o aceite dos termos

  Cenário: Cartão da reserva: um item com a quantidade de números e o link expira junto com o Pix
    Dado que eu reservei os números 10, 20 e 30
    Quando eu gero o pagamento com cartão da reserva com os meus dados
    Então a resposta HTTP deve ser 201
    E a resposta deve conter um campo "initPoint"
    E o link do cartão deve expirar em cerca de 30 minutos

  Cenário: A preferência do cartão vai ao Mercado Pago com quantidade, validade e retorno certos
    Quando a preferência do cartão de um pedido de 3 números é montada para o Mercado Pago
    Então a preferência deve ter 1 item com quantidade 3 de 100 reais
    E a preferência deve expirar no mesmo instante que um Pix gerado agora
    E a preferência deve voltar para "/rifa/compra/aprovada", "/rifa/compra/pendente" e "/rifa/compra/recusada"
    E o external_reference da preferência deve ser o pedido
    E a preferência não deve aceitar Pix

  Cenário: O Pix do pedido vai ao Mercado Pago com o valor e a validade certos
    Quando o Pix de um pedido de 2 números é montado para o Mercado Pago
    Então o Pix montado deve ser de 200 reais
    E o Pix montado deve ter o pedido no metadata
    E o Pix montado deve expirar em cerca de 30 minutos

  Cenário: Trocar do Pix para o cartão cancela o Pix: só um pagamento ativo
    Dado que eu reservei os números 40 e 41 e gerei o Pix
    Quando eu gero o pagamento com cartão da reserva com os meus dados
    Então a resposta HTTP deve ser 201
    E o Pix da reserva deve ter sido cancelado no Mercado Pago

  Cenário: Dois cliques ao mesmo tempo geram um só Pix
    Dado que eu reservei os números 42 e 43
    Quando eu gero o Pix da reserva duas vezes ao mesmo tempo
    Então deve haver exatamente 1 Pix ativo no Mercado Pago para a reserva

  Esquema do Cenário: Dados de contato inválidos não geram pagamento
    Dado que eu reservei os números 44 e 45
    Quando eu gero o Pix da reserva com <campo> igual a <valor>
    Então a resposta HTTP deve ser 400
    E nenhum Pix de pedido deve ter sido criado

    Exemplos:
      | campo          | valor               |
      | "aceiteTermos" | "false"             |
      | "phone"        | "123"               |
      | "email"        | "ana@email"         |
      | "nome"         | "A"                 |
      | "email"        | "{\"$ne\": null}"   |

  Cenário: Reserva vencida não gera pagamento
    Dado que eu reservei os números 46 e 47
    E a reserva venceu
    Quando eu gero o Pix da reserva com os meus dados
    Então a resposta HTTP deve ser 410
    E nenhum Pix de pedido deve ter sido criado

  Cenário: O modo teste não aceita cartão
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    E que eu reservei o número 48 no modo teste com a chave "chave-secreta-teste"
    Quando eu gero o pagamento com cartão da reserva com os meus dados
    Então a resposta HTTP deve ser 400

  Cenário: Pix de teste custa R$ 0,01 e confirma o número de teste
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    E que eu reservei o número 49 no modo teste com a chave "chave-secreta-teste"
    Quando eu gero o Pix da reserva com os meus dados
    Então o Mercado Pago deve ter recebido um Pix de teste
    Quando o Pix da reserva foi aprovado e o webhook chegou
    Então o pedido deve estar "PAGO" com valor 100

  Cenário: Webhook aprovado confirma os números com os dados de quem comprou
    Dado que eu reservei os números 50 e 51 e gerei o Pix
    Quando o Pix da reserva foi aprovado e o webhook chegou
    Então o pedido deve estar "PAGO" com valor 200
    E os números 50 e 51 devem estar "APROVADO" no banco
    E os números 50 e 51 devem ter o nome, o e-mail e o WhatsApp de quem comprou
    E deve ter sido enviado 1 e-mail de confirmação com os números "050, 051"
    E o painel deve ter recebido o pagamento do Pix da reserva

  Cenário: Webhook repetido não confirma nada em dobro
    Dado que eu reservei os números 52 e 53 e gerei o Pix
    Quando o Pix da reserva foi aprovado e o webhook chegou 3 vezes
    Então o pedido deve estar "PAGO" com valor 200
    E deve existir exatamente 1 documento no banco com claimedNumber igual a 52
    E deve ter sido enviado 1 e-mail de confirmação com os números "052, 053"

  Cenário: Webhook, consulta do Pix e volta do cartão ao mesmo tempo confirmam uma vez só
    Dado que eu reservei os números 54 e 55 e gerei o Pix
    Quando o Pix da reserva é aprovado e o webhook, a consulta do Pix e a consulta da compra chegam ao mesmo tempo
    Então o pedido deve estar "PAGO" com valor 200
    E deve ter sido enviado 1 e-mail de confirmação com os números "054, 055"

  Cenário: Valor pago diferente do pedido não confirma os números
    Dado que eu reservei os números 56 e 57 e gerei o Pix
    Quando o Pix da reserva foi aprovado com o valor 100 e o webhook chegou
    Então o pedido deve estar "AGUARDANDO_PAGAMENTO" com valor 200
    E o pedido deve ter o alerta "VALOR_DIVERGENTE"
    E os números 56 e 57 devem estar "RESERVADO" no banco

  Cenário: Pago depois da reserva vencer, com um número já tomado: a pessoa escolhe outro
    Dado que eu reservei os números 60 e 61 e gerei o Pix
    E a reserva venceu e outra pessoa comprou o número 61
    Quando o Pix da reserva foi aprovado e o webhook chegou
    Então o pedido deve estar "PAGO_PARCIAL" com valor 200
    E o pedido deve ter o alerta "PAGO_APOS_EXPIRAR"
    E o número 60 deve estar "APROVADO" no banco
    E deve existir exatamente 1 documento no banco com claimedNumber igual a 61
    E o pedido deve ter 1 número a escolher
    E o e-mail de confirmação deve ter o link para escolher o número que faltou
    E o número que faltou deve poder ser escolhido pelo fluxo de escolha

  Cenário: Pago depois da reserva vencer, com os números ainda livres: ficam com a pessoa
    Dado que eu reservei os números 62 e 63 e gerei o Pix
    E a reserva venceu sem ninguém pegar os números
    Quando o Pix da reserva foi aprovado e o webhook chegou
    Então o pedido deve estar "PAGO" com valor 200
    E os números 62 e 63 devem estar "APROVADO" no banco

  Cenário: Segundo pagamento aprovado para a mesma compra vira alerta de estorno
    Dado que eu reservei os números 64 e 65 e gerei o Pix
    E o Pix da reserva foi aprovado e o webhook chegou
    Quando outro pagamento aprovado do mesmo pedido chega pelo webhook
    Então o pedido deve ter o alerta "PAGAMENTO_DUPLICADO"
    E o pedido deve ter 1 pagamento extra para estornar
    E deve ter sido enviado 1 e-mail de confirmação com os números "064, 065"

  Cenário: O webhook de uma compra não cria o registro do fluxo antigo
    Dado que eu reservei os números 66 e 67 e gerei o Pix
    Quando o Pix da reserva foi aprovado e o webhook chegou
    Então não deve existir documento com o id do Pix da reserva

  Cenário: O id do pagamento de uma compra não libera a escolha de mais um número
    Dado que eu reservei os números 68 e 69 e gerei o Pix
    E o Pix da reserva foi aprovado no Mercado Pago
    Quando eu verifico o pagamento do Pix da reserva
    Então a resposta HTTP deve ser 409
    E a resposta não deve conter um campo "token"
    E o pedido deve estar "PAGO" com valor 200

  Cenário: A consulta do Pix aprovado devolve a compra
    Dado que eu reservei os números 70 e 71 e gerei o Pix
    E o Pix da reserva foi aprovado no Mercado Pago
    Quando eu consulto o status do Pix da reserva
    Então a resposta HTTP deve ser 200
    E a consulta do Pix deve trazer a compra "PAGO" com os números 70 e 71

  Cenário: Volta do cartão aprovado mostra os números
    Dado que eu reservei os números 72 e 73 e gerei o cartão
    E o cartão da reserva foi aprovado no Mercado Pago com o id "555001"
    Quando eu consulto a compra com o pagamento "555001"
    Então a resposta HTTP deve ser 200
    E a compra deve estar "PAGO" com os números 72 e 73
    E o painel deve ter recebido o pagamento "555001"

  Cenário: Volta do cartão com o pedido errado não mostra nada
    Dado que eu reservei os números 74 e 75 e gerei o cartão
    E o cartão da reserva foi aprovado no Mercado Pago com o id "555002"
    Quando eu consulto a compra com o pagamento "555002" e outro pedido
    Então a resposta HTTP deve ser 404

  Cenário: Cartão em análise mantém o pedido aguardando
    Dado que eu reservei os números 76 e 77 e gerei o cartão
    E o cartão da reserva está em análise no Mercado Pago com o id "555003"
    Quando eu consulto a compra com o pagamento "555003"
    Então a resposta HTTP deve ser 200
    E a compra deve estar "AGUARDANDO_PAGAMENTO" com o pagamento "PENDENTE"

  Cenário: Tarefas: pedido vencido vira EXPIRADO e os dados pessoais somem depois de 7 dias
    Dado que eu reservei os números 78 e 79 e gerei o Pix
    E a reserva venceu
    Quando as tarefas da rifa rodam
    Então o pedido deve estar "EXPIRADO" com valor 200
    E devem existir 0 números com status "RESERVADO" no banco
    E o pedido ainda deve ter o e-mail de quem comprou
    Quando passam 8 dias e as tarefas da rifa rodam de novo
    Então o pedido não deve ter mais nome, e-mail, WhatsApp nem IP
