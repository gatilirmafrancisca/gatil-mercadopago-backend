# language: pt
Funcionalidade: Checkout Pro só com cartão (o Pix é gerado dentro do site)

  Esquema do Cenário: A preferência não oferece Pix nem boleto
    Quando a preferência da <campanha> é montada para o Mercado Pago
    Então a preferência deve excluir os tipos de pagamento "ticket" e "bank_transfer"
    E a preferência deve excluir o meio de pagamento "pix"
    E a preferência deve aceitar até 2 parcelas

    Exemplos:
      | campanha |
      | doação   |
      | rifa     |

  Cenário: A preferência da rifa fica sempre na campanha da rifa
    Quando a preferência da rifa com a campanha "CAMPANHA_ESPECIFICA" é montada para o Mercado Pago
    Então o metadata da preferência deve ter tipo "RIFA" e utm_campaign "RIFA_SOLIDARIA"

  Cenário: A preferência da rifa leva um external_reference único (conciliação do Mercado Pago)
    Quando a preferência da rifa é montada para o Mercado Pago
    Então a preferência deve ter external_reference igual ao rastreio_id do metadata
