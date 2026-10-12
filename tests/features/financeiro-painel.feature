# language: pt
Funcionalidade: Envio dos pagamentos ao painel-adm (financeiro)

  Cenário: Pagamento da rifa pelo cartão vai ao painel na campanha da rifa, com o valor líquido
    Dado que existe na API do Mercado Pago o pagamento "870001" "approved" de 100, líquido 95.01, com metadata {"tipo": "RIFA", "utm_source": "INSTAGRAM", "utm_medium": "ORGANICO", "utm_campaign": "RIFA_SOLIDARIA"}
    Quando o backend recebe uma notificação de webhook para "870001" com assinatura válida
    Então o painel deve ter recebido o pagamento "870001" com valor 95.01, status "APROVADO" e utmCampaign "RIFA_SOLIDARIA"
    E o envio do pagamento "870001" ao painel deve ser uma "ENTRADA" por "MERCADO_PAGO" com utmSource "INSTAGRAM" e utmMedium "ORGANICO"
    E deve existir um documento com paymentId "870001" e status "APROVADO"

  Cenário: Pix da rifa vai ao painel na campanha da rifa
    Dado que existe na API do Mercado Pago o pagamento "870002" "approved" de 100, líquido 99.01, com metadata {"tipo": "RIFA", "utm_campaign": "RIFA_SOLIDARIA"}
    Quando o backend recebe uma notificação de webhook para "870002" com assinatura válida
    Então o painel deve ter recebido o pagamento "870002" com valor 99.01, status "APROVADO" e utmCampaign "RIFA_SOLIDARIA"

  Cenário: Rifa marcada com outra campanha (preferência antiga) continua indo como rifa
    Dado que existe na API do Mercado Pago o pagamento "870003" "approved" de 100, líquido 95.01, com metadata {"tipo": "RIFA", "utm_campaign": "CAMPANHA_ESPECIFICA"}
    Quando o backend recebe uma notificação de webhook para "870003" com assinatura válida
    Então o painel deve ter recebido o pagamento "870003" com valor 95.01, status "APROVADO" e utmCampaign "RIFA_SOLIDARIA"
    E deve existir um documento com paymentId "870003" e status "APROVADO"

  Cenário: Doação aprovada vai ao painel fora da campanha da rifa, com o valor líquido
    Dado que existe na API do Mercado Pago o pagamento "870004" "approved" de 50, líquido 49.5, com metadata {"tipo": "DOACAO", "utm_source": "INSTAGRAM", "utm_campaign": null}
    Quando o backend recebe uma notificação de webhook para "870004" com assinatura válida
    Então o painel deve ter recebido o pagamento "870004" com valor 49.5, status "APROVADO" e utmCampaign ""
    E nenhum documento deve ser criado na coleção "rifas"

  Cenário: Doação de uma campanha específica mantém a campanha
    Dado que existe na API do Mercado Pago o pagamento "870005" "approved" de 50, líquido 49.5, com metadata {"tipo": "DOACAO", "utm_campaign": "CAMPANHA_ESPECIFICA"}
    Quando o backend recebe uma notificação de webhook para "870005" com assinatura válida
    Então o painel deve ter recebido o pagamento "870005" com valor 49.5, status "APROVADO" e utmCampaign "CAMPANHA_ESPECIFICA"

  Cenário: Pix pendente (sem líquido ainda) vai ao painel com o valor bruto
    Dado que existe na API do Mercado Pago o pagamento "870006" "pending" de 100, sem líquido, com metadata {"tipo": "RIFA", "utm_campaign": "RIFA_SOLIDARIA"}
    Quando o backend recebe uma notificação de webhook para "870006" com assinatura válida
    Então o painel deve ter recebido o pagamento "870006" com valor 100, status "PENDENTE" e utmCampaign "RIFA_SOLIDARIA"

  Cenário: A data enviada ao painel é a da aprovação, não a do envio
    Dado que existe na API do Mercado Pago o pagamento "870007" "approved" de 50, líquido 49.5, com metadata {"tipo": "DOACAO"}
    E o pagamento "870007" foi aprovado em "2026-09-30T23:50:00.000-03:00"
    Quando o backend recebe uma notificação de webhook para "870007" com assinatura válida
    Então o painel deve ter recebido o pagamento "870007" com a data "2026-09-30T23:50:00.000-03:00"

  Cenário: Pix da doação aprovado na consulta da tela também vai ao painel
    Dado que existe um Pix de doação "870008" com status "approved" e detalhe "accredited" na API do Mercado Pago
    Quando eu consulto o status do Pix "870008" com o rastreio dele
    Então o painel deve ter recebido o pagamento "870008" com status "APROVADO" e utmCampaign ""

  Cenário: Pix da rifa confirmado no verificar-pagamento vai ao painel na campanha da rifa
    Dado que existe um Pix da rifa "870009" com status "approved" e detalhe "accredited" na API do Mercado Pago
    Quando eu chamo "GET /mercadopago/verificar-pagamento?payment_id=870009"
    Então o painel deve ter recebido o pagamento "870009" com valor 99.01, status "APROVADO" e utmCampaign "RIFA_SOLIDARIA"
