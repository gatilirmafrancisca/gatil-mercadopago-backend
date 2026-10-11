# language: pt
Funcionalidade: Páginas de retorno do checkout da doação

  Cenário: As back_urls da doação ficam sob /doar
    Dado que o FRONTEND_URL é "https://gatilirmafrancisca.org"
    Quando eu monto as URLs de retorno da doação
    Então a URL de "success" deve ser "https://gatilirmafrancisca.org/doar/pagamento-aprovado"
    E a URL de "pending" deve ser "https://gatilirmafrancisca.org/doar/pagamento-pendente"
    E a URL de "failure" deve ser "https://gatilirmafrancisca.org/doar/pagamento-recusado"
