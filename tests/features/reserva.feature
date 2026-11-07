# language: pt
Funcionalidade: Reserva de números antes do pagamento (sem condição de corrida)

  Cenário: Reservar números livres
    Quando eu reservo os números 10, 20 e 30
    Então a resposta HTTP deve ser 201
    E a reserva deve ter os números 10, 20 e 30 e nenhum indisponível
    E a reserva deve expirar em cerca de 15 minutos
    E o pedido deve estar "RESERVADO" com valor 300
    E devem existir 3 números com status "RESERVADO" no banco

  Cenário: Vinte pessoas tentam reservar o mesmo número ao mesmo tempo
    Quando 20 pessoas diferentes tentam reservar o número 250 ao mesmo tempo
    Então exatamente 1 das reservas deve ter sido aceita
    E as outras 19 devem ter recebido 409
    E deve existir exatamente 1 documento no banco com claimedNumber igual a 250

  Cenário: Reserva, escolha do fluxo antigo e cadastro manual disputam o mesmo número
    Dado que tenho um token válido para o pagamento "997001"
    Quando ao mesmo tempo eu reservo o número 300, o pagamento antigo confirma o 300 e o painel cadastra o 300
    Então deve existir exatamente 1 documento no banco com claimedNumber igual a 300

  Cenário: Parte dos números já tinha dono
    Dado que o número 47 já foi vendido
    Quando eu reservo os números 46, 47 e 48
    Então a resposta HTTP deve ser 201
    E a reserva deve ter os números 46 e 48 e o indisponível 47
    E o pedido deve estar "RESERVADO" com valor 200

  Cenário: Todos os números pedidos já tinham dono
    Dado que o número 47 já foi vendido
    Quando eu reservo o número 47
    Então a resposta HTTP deve ser 409
    E a resposta deve listar 47 como indisponível
    E nenhum pedido deve ter sido criado

  Esquema do Cenário: Números inválidos são recusados
    Quando eu reservo com o corpo <corpo>
    Então a resposta HTTP deve ser 400
    E nenhum pedido deve ter sido criado

    Exemplos:
      | corpo                                              |
      | {"numeros": []}                                    |
      | {"numeros": [1,2,3,4,5,6,7,8,9,10,11]}             |
      | {"numeros": [0]}                                   |
      | {"numeros": [501]}                                 |
      | {"numeros": [5, 5]}                                |
      | {"numeros": [1.5]}                                 |
      | {"numeros": ["7"]}                                 |
      | {"numeros": {"$gt": 0}}                            |
      | {"numeros": [{"$gt": 0}]}                          |

  Cenário: Sem o desafio anti-robô, a reserva é recusada
    Dado que a verificação anti-robô está ligada
    Quando eu reservo os números 10 e 20 sem o token anti-robô
    Então a resposta HTTP deve ser 403
    E nenhum pedido deve ter sido criado

  Cenário: Desafio anti-robô inválido é recusado
    Dado que a verificação anti-robô está ligada
    Quando eu reservo os números 10 e 20 com o token anti-robô "token-de-robo"
    Então a resposta HTTP deve ser 403

  Cenário: Desafio anti-robô válido reserva
    Dado que a verificação anti-robô está ligada
    Quando eu reservo os números 10 e 20 com o token anti-robô "token-humano"
    Então a resposta HTTP deve ser 201

  Cenário: Em produção, sem a chave do anti-robô, a reserva fica fechada
    Dado que o anti-robô é obrigatório mas não tem chave configurada
    Quando eu reservo os números 10 e 20
    Então a resposta HTTP deve ser 503

  Cenário: Muitas tentativas de reserva do mesmo IP são bloqueadas
    Quando eu faço 10 tentativas inválidas de reserva
    E eu reservo o número 15
    Então a resposta HTTP deve ser 429

  Cenário: A terceira reserva aberta da mesma pessoa é recusada
    Quando eu reservo o número 11
    E eu reservo o número 12
    E eu reservo o número 13
    Então a resposta HTTP deve ser 429
    E o número 13 deve continuar livre

  Cenário: Reserva vencida devolve o número ao quadro
    Dado que alguém reservou o número 77 e a reserva venceu
    Quando eu chamo "GET /api/rifa/numeros-ocupados"
    Então o número 77 não deve aparecer como ocupado
    Quando outra pessoa reserva o número 77
    Então a resposta HTTP deve ser 201
    E deve existir exatamente 1 documento no banco com claimedNumber igual a 77

  Cenário: Reserva ativa aparece como ocupada no quadro
    Quando eu reservo o número 88
    E eu chamo "GET /api/rifa/numeros-ocupados"
    Então o número 88 deve aparecer como ocupado

  Cenário: A reserva respeita a vaga de quem pagou no fluxo antigo e ainda não escolheu
    Dado que 498 números já foram vendidos
    E que existe um pagamento confirmado "997002" no banco, sem número escolhido
    Quando eu reservo os números 499 e 500
    Então a resposta HTTP deve ser 201
    E a reserva deve ter os números 499 e o indisponível 500

  Cenário: Liberar a reserva devolve os números na hora
    Quando eu reservo os números 31 e 32
    E eu libero a reserva
    Então a resposta HTTP deve ser 200
    E o pedido deve estar "CANCELADO" com valor 200
    E devem existir 0 números com status "RESERVADO" no banco
    Quando outra pessoa reserva o número 31
    Então a resposta HTTP deve ser 201

  Cenário: Liberar a reserva com o Pix gerado cancela o Pix
    Dado que eu reservei os números 33 e 34 e gerei o Pix
    Quando eu libero a reserva
    Então a resposta HTTP deve ser 200
    E o Pix da reserva deve ter sido cancelado no Mercado Pago

  Cenário: Não dá pra liberar uma compra já paga
    Dado que eu reservei os números 35 e 36 e gerei o Pix
    E o Pix da reserva foi aprovado e o webhook chegou
    Quando eu libero a reserva
    Então a resposta HTTP deve ser 409
    E os números 35 e 36 devem estar "APROVADO" no banco

  Cenário: Consultar a reserva não devolve dados pessoais
    Dado que eu reservei os números 37 e 38 e gerei o Pix
    Quando eu consulto a reserva
    Então a resposta HTTP deve ser 200
    E a consulta deve mostrar o status "AGUARDANDO_PAGAMENTO" e os números 37 e 38
    E a consulta não deve conter e-mail, nome nem telefone

  Cenário: Reserva de teste não bloqueia o número real
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    Quando eu reservo o número 90 no modo teste com a chave "chave-secreta-teste"
    E outra pessoa reserva o número 90
    Então a resposta HTTP deve ser 201

  Cenário: Chave de teste errada é recusada na reserva
    Dado que a chave do Pix de teste é "chave-secreta-teste"
    Quando eu reservo o número 91 no modo teste com a chave "chave-errada"
    Então a resposta HTTP deve ser 403
