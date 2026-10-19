# language: pt
Funcionalidade: E-mail e contato de quem pagou a rifa

  Cenário: Gerar o Pix já grava o pagamento com o e-mail digitado no site
    Quando eu peço um Pix da rifa para "ana@email.com" com origem "instagram"
    Então a resposta HTTP deve ser 201
    E deve existir um documento com paymentId "777000111" e status "PENDENTE"
    E o pagamento "777000111" deve ter o e-mail "ana@email.com" e o meio "pix"

  Cenário: Pix aprovado sem payer.email usa o e-mail digitado no site
    Dado que existe um Pix da rifa "640001" aprovado sem payer.email, com email_contato "bia@email.com" e pago por "BIANCA SOUZA"
    Quando o backend recebe uma notificação de webhook para "640001" com assinatura válida
    Então deve existir um documento com paymentId "640001" e status "APROVADO"
    E o pagamento "640001" deve ter o e-mail "bia@email.com" e o meio "pix"
    E o pagamento "640001" deve ter o nome do pagador "BIANCA SOUZA"

  Cenário: Cartão aprovado guarda o titular do cartão como nome de contato
    Dado que existe um pagamento com cartão "640002" aprovado sem e-mail, do titular "CAIO LIMA"
    Quando o backend recebe uma notificação de webhook para "640002" com assinatura válida
    Então o pagamento "640002" deve ter o nome do pagador "CAIO LIMA"
    E o pagamento "640002" deve estar sem e-mail

  Cenário: Pix pendente sem data de expiração, criado há 2 dias, vira CANCELADO
    Dado que existe um pagamento "640003" registrado no banco como "PENDENTE" há 60 minutos
    E que existe um Pix da rifa "640003" pendente, sem data de expiração, criado há 2 dias na API do Mercado Pago
    Quando o agendador roda as tarefas da rifa
    Então deve existir um documento com paymentId "640003" e status "CANCELADO"

  Cenário: Cartão em análise há dias continua PENDENTE
    Dado que existe um pagamento "640004" registrado no banco como "PENDENTE" há 60 minutos
    E que existe um pagamento com cartão "640004" em análise, criado há 2 dias na API do Mercado Pago
    Quando o agendador roda as tarefas da rifa
    Então deve existir um documento com paymentId "640004" e status "PENDENTE"

  Cenário: As tarefas buscam o e-mail de quem pagou e ficou sem, e o lembrete sai na mesma execução
    Dado que existe um pagamento "640005" aprovado há 2 dias, sem número e sem e-mail
    E que existe um Pix da rifa "640005" aprovado sem payer.email, com email_contato "dani@email.com" e pago por "DANIELA REIS"
    Quando o agendador roda as tarefas da rifa
    Então o pagamento "640005" deve ter o e-mail "dani@email.com" e o meio "pix"
    E deve ter sido enviado 1 e-mail de escolha de número para "dani@email.com"

  Cenário: O e-mail que a pessoa já tem no banco nunca é trocado pelo do Mercado Pago
    Dado que existe um pagamento "640006" aprovado há 2 dias, sem número, com o e-mail "pessoa@email.com"
    E que existe um Pix da rifa "640006" aprovado sem payer.email, com email_contato "outro@email.com" e pago por "EDU"
    Quando o backend recebe uma notificação de webhook para "640006" com assinatura válida
    Então o pagamento "640006" deve ter o e-mail "pessoa@email.com" e o meio "pix"

  Cenário: Sem e-mail no Mercado Pago, o pagamento é conferido uma vez e fica para o painel
    Dado que existe um pagamento "640007" aprovado há 2 dias, sem número e sem e-mail
    E que existe um pagamento com cartão "640007" aprovado sem e-mail, do titular "FABIO MELO"
    Quando o agendador roda as tarefas da rifa
    Então o pagamento "640007" deve estar sem e-mail
    E o pagamento "640007" deve ter o nome do pagador "FABIO MELO"
    E o contato do pagamento "640007" deve estar marcado como conferido
    E nenhum e-mail deve ter sido enviado
