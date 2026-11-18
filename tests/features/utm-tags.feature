# language: pt
Funcionalidade: Tags de UTM vêm do banco (gerenciadas no painel)

  Cenário: Antes do seed, valem as tags de sempre
    Quando eu chamo "GET /api/utm/tags"
    Então a resposta HTTP deve ser 200
    E as tags de "source" devem ser "LANDING_PAGE,INSTAGRAM,FACEBOOK,FEIRA_ADOCAO"
    E as tags de "campaign" devem ser "CAMPANHA_ESPECIFICA,RIFA_SOLIDARIA"

  Cenário: A rota pública lista só as tags ativas
    Dado que o painel cadastrou as tags de UTM padrão
    E que o painel cadastrou a tag "SOURCE" "TIKTOK"
    E que o painel desativou a tag "SOURCE" "FACEBOOK"
    Quando eu chamo "GET /api/utm/tags"
    Então as tags de "source" devem ser "LANDING_PAGE,INSTAGRAM,FEIRA_ADOCAO,TIKTOK"

  Cenário: Doação com Pix aceita uma tag criada no painel
    Dado que o painel cadastrou as tags de UTM padrão
    E que o painel cadastrou a tag "SOURCE" "TIKTOK"
    Quando eu envio "POST /api/doacao/criar-pix" com o corpo {"valor": 50, "email": "ana@email.com", "utmSource": "tiktok", "utmMedium": "pago"}
    Então a resposta HTTP deve ser 201
    E o Mercado Pago deve ter recebido o pedido de Pix de 50 para "ana@email.com" com origem "TIKTOK"

  Cenário: Tag criada depois que o cache já foi carregado é aceita na hora
    Dado que o painel cadastrou as tags de UTM padrão
    Quando eu chamo "GET /api/utm/tags"
    E que o painel cadastrou a tag "SOURCE" "TIKTOK"
    E eu envio "POST /api/doacao/criar-pix" com o corpo {"valor": 50, "email": "ana@email.com", "utmSource": "TIKTOK"}
    Então a resposta HTTP deve ser 201

  Cenário: Tag desativada no painel é recusada com a mesma mensagem de antes
    Dado que o painel cadastrou as tags de UTM padrão
    E que o painel desativou a tag "SOURCE" "FACEBOOK"
    Quando eu envio "POST /api/doacao/criar-pix" com o corpo {"valor": 50, "email": "ana@email.com", "utmSource": "facebook"}
    Então a resposta HTTP deve ser 400
    E a mensagem deve conter "utmSource inválido 'FACEBOOK'. Valores permitidos: LANDING_PAGE, INSTAGRAM, FEIRA_ADOCAO."
    E nenhum Pix deve ter sido pedido ao Mercado Pago

  Cenário: Pix da rifa e reserva também usam as tags do banco
    Dado que o painel cadastrou as tags de UTM padrão
    E que o painel cadastrou a tag "MEDIUM" "INFLUENCER"
    Quando eu envio "POST /api/rifa/criar-pix" com o corpo {"email": "ana@email.com", "utmSource": "instagram", "utmMedium": "influencer"}
    Então a resposta HTTP deve ser 201
    Quando eu envio "POST /api/rifa/reservar" com o corpo {"numeros": [7], "utmSource": "instagram", "utmMedium": "influencer"}
    Então a resposta HTTP deve ser 201

  Cenário: Doação com cartão aceita tag nova e manda ao Mercado Pago em maiúsculas
    Dado que o painel cadastrou as tags de UTM padrão
    E que o painel cadastrou a tag "CAMPAIGN" "NATAL_2026"
    Quando eu crio a preferência de doação de 30 com o corpo {"utmSource": "instagram", "utmMedium": "pago", "utmCampaign": "natal_2026"}
    Então a resposta HTTP deve ser 200
    E a preferência de doação deve ter ido ao Mercado Pago com utmCampaign "NATAL_2026"

  Cenário: Banco fora do ar na leitura das tags não derruba a doação
    Dado que a leitura das tags de UTM falha
    Quando eu crio a preferência de doação de 30 com o corpo {"utmSource": "instagram", "utmMedium": "organico"}
    Então a resposta HTTP deve ser 200
