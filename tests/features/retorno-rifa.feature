# language: pt
Funcionalidade: Páginas de retorno do checkout da rifa

  Cenário: As back_urls da rifa ficam sob /rifa
    Dado que o FRONTEND_URL é "https://gatilirmafrancisca.org"
    Quando eu monto as URLs de retorno da rifa
    Então a URL de "success" deve ser "https://gatilirmafrancisca.org/rifa/pagamento-aprovado"
    E a URL de "pending" deve ser "https://gatilirmafrancisca.org/rifa/pagamento-pendente"
    E a URL de "failure" deve ser "https://gatilirmafrancisca.org/rifa/pagamento-recusado"
