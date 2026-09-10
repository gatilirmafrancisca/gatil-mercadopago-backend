# language: pt
Funcionalidade: Recebimento de notificações do Mercado Pago

  Cenário: Assinatura válida registra o pagamento
    Dado que existe um pagamento aprovado "999001" na API do Mercado Pago
    Quando o backend recebe uma notificação de webhook para "999001" com assinatura válida
    Então a resposta HTTP deve ser 200
    E deve existir um documento na coleção "rifas" com paymentId "999001"
    E o campo "claimedNumber" desse documento deve ser null

  Cenário: Assinatura inválida é rejeitada
    Quando o backend recebe uma notificação de webhook com assinatura inválida
    Então a resposta HTTP deve ser 401
    E nenhum documento deve ser criado na coleção "rifas"

  Cenário: Reenvio do mesmo pagamento não duplica o registro
    Dado que existe um pagamento aprovado "999002" já registrado no banco
    Quando o backend recebe uma segunda notificação de webhook para "999002" com assinatura válida
    Então a resposta HTTP deve ser 200
    E deve existir exatamente 1 documento com paymentId "999002" na coleção "rifas"

  Cenário: Pagamento com status "rejected" é registrado, mas não libera número
    Dado que existe um pagamento com status "rejected" "999003" na API do Mercado Pago
    Quando o backend recebe uma notificação de webhook para "999003" com assinatura válida
    Então deve existir um documento com paymentId "999003" e status "CANCELADO"