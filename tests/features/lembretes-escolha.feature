# language: pt
Funcionalidade: Lembretes para escolher o número e sorteio depois de 20 dias

  Cenário: Pagamento aprovado há 2 horas sem número recebe o primeiro lembrete, com o link
    Dado que existe um pagamento "770001" aprovado há 120 minutos, sem número, com o e-mail "bia@email.com"
    Quando o agendador roda as tarefas da rifa
    Então deve ter sido enviado 1 e-mail de escolha de número para "bia@email.com"
    E o e-mail de escolha para "bia@email.com" deve dizer que faltam 20 dias e ter o link do pagamento "770001"
    E o pagamento "770001" deve ter os lembretes "20" registrados

  Cenário: Logo depois de aprovar, a pessoa ainda está escolhendo — nada é enviado
    Dado que existe um pagamento "770002" aprovado há 30 minutos, sem número, com o e-mail "caio@email.com"
    Quando o agendador roda as tarefas da rifa
    Então nenhum e-mail deve ter sido enviado

  Esquema do Cenário: Os lembretes saem quando faltam 15, 10, 5 e 1 dia(s)
    Dado que existe um pagamento "<id>" aprovado há <dias> dias, sem número, com o e-mail "dani@email.com" e os lembretes "<anteriores>" já enviados
    Quando o agendador roda as tarefas da rifa
    Então deve ter sido enviado 1 e-mail de escolha de número para "dani@email.com"
    E o pagamento "<id>" deve ter os lembretes "<depois>" registrados

    Exemplos:
      | id     | dias | anteriores    | depois          |
      | 770010 | 5    | 20            | 20,15           |
      | 770011 | 10   | 20,15         | 20,15,10        |
      | 770012 | 15   | 20,15,10      | 20,15,10,5      |
      | 770013 | 19   | 20,15,10,5    | 20,15,10,5,1    |

  Cenário: O último lembrete avisa que é o último dia
    Dado que existe um pagamento "770014" aprovado há 19 dias, sem número, com o e-mail "edu@email.com" e os lembretes "20,15,10,5" já enviados
    Quando o agendador roda as tarefas da rifa
    Então o e-mail de escolha para "edu@email.com" deve ser o do último dia

  Cenário: O mesmo lembrete nunca sai duas vezes
    Dado que existe um pagamento "770003" aprovado há 120 minutos, sem número, com o e-mail "fe@email.com"
    Quando o agendador roda as tarefas da rifa
    E o agendador roda as tarefas da rifa
    Então deve ter sido enviado 1 e-mail de escolha de número para "fe@email.com"

  Cenário: Com o agendador parado alguns dias, só o lembrete mais recente é enviado
    Dado que existe um pagamento "770004" aprovado há 11 dias, sem número, com o e-mail "gil@email.com" e os lembretes "20" já enviados
    Quando o agendador roda as tarefas da rifa
    Então deve ter sido enviado 1 e-mail de escolha de número para "gil@email.com"
    E o e-mail de escolha para "gil@email.com" deve dizer que faltam 9 dias e ter o link do pagamento "770004"
    E o pagamento "770004" deve ter os lembretes "20,15,10" registrados

  Cenário: Passados 20 dias sem escolha, um número livre é sorteado e a confirmação é enviada
    Dado que existe um pagamento "770005" aprovado há 21 dias, sem número, com o e-mail "hel@email.com" e os lembretes "20,15,10,5,1" já enviados
    Quando o agendador roda as tarefas da rifa
    Então o pagamento "770005" deve ter um número entre 1 e 500
    E deve ter sido enviado o e-mail de confirmação com o número sorteado para "hel@email.com"

  Cenário: O sorteio nunca escolhe um número já ocupado
    Dado que os números de 1 a 499 já estão escolhidos
    E que existe um pagamento "770006" aprovado há 21 dias, sem número, com o e-mail "ivo@email.com"
    Quando o agendador roda as tarefas da rifa
    Então o pagamento "770006" deve ter o número 500

  Cenário: Quem já escolheu o número não recebe mais lembretes
    Dado que existe um pagamento "770007" aprovado há 5 dias, sem número, com o e-mail "ju@email.com" e os lembretes "20" já enviados
    E que tenho um token para o pagamento já registrado "770007"
    Quando eu escolho o número 42 com esse token
    E o agendador roda as tarefas da rifa
    Então deve ter sido enviado 0 e-mail de escolha de número para "ju@email.com"
    E o pagamento "770007" deve ter o número 42

  Cenário: Pagamento aprovado pelo webhook abre o prazo de escolha
    Dado que existe um pagamento aprovado "770008" na API do Mercado Pago
    Quando o backend recebe uma notificação de webhook para "770008" com assinatura válida
    Então deve existir um documento com paymentId "770008" e status "APROVADO"
    E o pagamento "770008" deve ter a data de aprovação registrada
