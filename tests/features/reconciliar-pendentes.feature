# language: pt
Funcionalidade: Pagamentos da rifa que ficaram PENDENTE no banco

  Cenário: Pix vencido sem pagamento vira CANCELADO e deixa de ocupar vaga
    Dado que existe um pagamento "880001" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880001" pendente e já vencido na API do Mercado Pago
    Quando o agendador confere os pagamentos pendentes da rifa
    Então a resposta HTTP deve ser 200
    E deve existir um documento com paymentId "880001" e status "CANCELADO"
    E o painel deve ter recebido o pagamento "880001" com status "CANCELADO" e utmCampaign "RIFA_SOLIDARIA"

  Cenário: Pix expirado no Mercado Pago vira CANCELADO
    Dado que existe um pagamento "880002" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880002" com status "cancelled" e detalhe "expired" na API do Mercado Pago
    Quando o agendador confere os pagamentos pendentes da rifa
    Então deve existir um documento com paymentId "880002" e status "CANCELADO"

  Cenário: Pix pago que ficou PENDENTE no banco vira APROVADO e vai ao painel
    Dado que existe um pagamento "880003" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880003" com status "approved" e detalhe "accredited" na API do Mercado Pago
    Quando o agendador confere os pagamentos pendentes da rifa
    Então deve existir um documento com paymentId "880003" e status "APROVADO"
    E o painel deve ter recebido o pagamento "880003" com status "APROVADO" e utmCampaign "RIFA_SOLIDARIA"

  Cenário: Pix ainda dentro da validade continua PENDENTE
    Dado que existe um pagamento "880004" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880004" com status "pending" e detalhe "pending_waiting_transfer" na API do Mercado Pago
    Quando o agendador confere os pagamentos pendentes da rifa
    Então deve existir um documento com paymentId "880004" e status "PENDENTE"

  Cenário: Sem o segredo do agendador, nada é conferido
    Dado que existe um pagamento "880005" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880005" pendente e já vencido na API do Mercado Pago
    Quando alguém chama a conferência dos pendentes sem o segredo do agendador
    Então a resposta HTTP deve ser 401
    E deve existir um documento com paymentId "880005" e status "PENDENTE"

  Cenário: A tela do Pix vê o pagamento aprovado e o banco é atualizado, mesmo sem webhook
    Dado que existe um pagamento "880006" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880006" com status "approved" e detalhe "accredited" na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "880006" com o rastreio dele
    Então o status do Pix deve ser "APROVADO"
    E deve existir um documento com paymentId "880006" e status "APROVADO"
    E o painel deve ter recebido o pagamento "880006" com status "APROVADO" e utmCampaign "RIFA_SOLIDARIA"

  Cenário: A tela do Pix vê o Pix vencido e o registro é cancelado
    Dado que existe um pagamento "880007" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880007" pendente e já vencido na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "880007" com o rastreio dele
    Então o status do Pix deve ser "EXPIRADO"
    E deve existir um documento com paymentId "880007" e status "CANCELADO"

  Cenário: Um pagamento já APROVADO nunca volta para CANCELADO
    Dado que existe um pagamento "880008" registrado no banco como "APROVADO"
    E que existe um Pix da rifa "880008" com status "cancelled" e detalhe "expired" na API do Mercado Pago
    Quando eu consulto o status do Pix da rifa "880008" com o rastreio dele
    Então deve existir um documento com paymentId "880008" e status "APROVADO"

  Cenário: E-mail do pagador fora do formato não impede o Pix pago de virar APROVADO
    Dado que existe um pagamento "880009" registrado no banco como "PENDENTE"
    E que existe um Pix da rifa "880009" aprovado com o e-mail do pagador "pagador-sem-dominio" na API do Mercado Pago
    Quando o backend recebe uma notificação de webhook para "880009" com assinatura válida
    Então deve existir um documento com paymentId "880009" e status "APROVADO"
