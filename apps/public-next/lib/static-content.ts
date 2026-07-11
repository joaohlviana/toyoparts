export interface StaticSection {
  title: string;
  body: string[];
}

export interface StaticPageContent {
  title: string;
  description: string;
  eyebrow: string;
  intro: string;
  canonical: string;
  sections: StaticSection[];
  ctaTitle?: string;
  ctaBody?: string;
}

export const staticPages: Record<string, StaticPageContent> = {
  sobre: {
    title: 'Sobre a Toyoparts | Peças e Acessórios Toyota',
    description: 'Conheça a Toyoparts, operação especializada em peças genuínas Toyota com foco em atendimento consultivo, envio rápido e catálogo por modelo.',
    eyebrow: 'Quem somos',
    intro: 'A Toyoparts nasceu para conectar donos de Toyota às peças genuínas certas, com atendimento consultivo, agilidade logística e foco total em compatibilidade.',
    canonical: '/sobre',
    sections: [
      {
        title: 'Especialistas em Toyota',
        body: [
          'Nossa operação é orientada por catálogo técnico, modelo, ano e aplicação. Isso reduz erro de compra e aumenta a confiança de quem precisa da peça certa sem perder tempo.',
          'Atuamos com visão de concessionária e linguagem de e-commerce: catálogo navegável, suporte por canais digitais e foco em peças genuínas.'
        ]
      },
      {
        title: 'Como atendemos',
        body: [
          'A equipe apoia o cliente na identificação da peça, no entendimento de compatibilidade e na escolha da melhor opção para cada Toyota.',
          'Também mantemos uma estrutura preparada para envio rápido, integração logística e rastreamento do pedido.'
        ]
      }
    ],
    ctaTitle: 'Precisa localizar uma peça?',
    ctaBody: 'Use o catálogo por modelo ou fale com a equipe para validar compatibilidade antes da compra.'
  },
  privacidade: {
    title: 'Política de Privacidade | Toyoparts',
    description: 'Entenda como a Toyoparts coleta, utiliza e protege dados pessoais de clientes e visitantes, em linha com boas práticas de segurança e LGPD.',
    eyebrow: 'Privacidade',
    intro: 'Tratamos dados pessoais com foco em segurança, transparência e finalidade legítima para cadastro, pagamento, entrega, relacionamento e melhoria da experiência.',
    canonical: '/privacidade',
    sections: [
      {
        title: 'Quais dados usamos',
        body: [
          'Dados cadastrais, informações de entrega, dados de pedido e dados mínimos de navegação podem ser utilizados para operar a loja, emitir documentos fiscais e prestar suporte.',
          'Informações de pagamento são processadas por parceiros especializados. A Toyoparts não armazena dados sensíveis de cartão em texto aberto.'
        ]
      },
      {
        title: 'Direitos do titular',
        body: [
          'O titular pode solicitar acesso, correção, atualização ou exclusão de dados quando aplicável, observadas obrigações legais e fiscais.',
          'Solicitações podem ser feitas pelos canais oficiais de atendimento da empresa.'
        ]
      }
    ],
    ctaTitle: 'Dúvida sobre seus dados?',
    ctaBody: 'Entre em contato com o atendimento para orientações sobre cadastro, pedidos e tratamento de dados.'
  },
  entrega: {
    title: 'Política de Entrega | Toyoparts',
    description: 'Veja como funcionam cálculo de frete, despacho, prazos, acompanhamento e regras de entrega da Toyoparts.',
    eyebrow: 'Entrega',
    intro: 'Os pedidos são preparados conforme confirmação de pagamento, disponibilidade e janela logística. O objetivo é garantir despacho ágil e previsibilidade no rastreio.',
    canonical: '/entrega',
    sections: [
      {
        title: 'Prazos e despacho',
        body: [
          'O prazo exibido no checkout considera forma de envio, CEP, disponibilidade do item e confirmação de pagamento.',
          'Pedidos podem ser separados e expedidos em janelas diferentes quando houver composição logística específica ou necessidade de conferência adicional.'
        ]
      },
      {
        title: 'Rastreamento e recebimento',
        body: [
          'Depois da expedição, o cliente recebe código de rastreio para acompanhamento da entrega.',
          'É importante conferir a embalagem no recebimento e registrar qualquer avaria ou divergência imediatamente.'
        ]
      }
    ],
    ctaTitle: 'Quer acompanhar um pedido?',
    ctaBody: 'Use a página de rastreamento e tenha em mãos o código informado após o despacho.'
  },
  troca: {
    title: 'Trocas e Devoluções | Toyoparts',
    description: 'Saiba como funcionam trocas, devoluções, análise de peças e orientações de pós-venda na Toyoparts.',
    eyebrow: 'Pós-venda',
    intro: 'A política de trocas e devoluções busca equilibrar agilidade no atendimento com análise técnica correta das peças e do histórico do pedido.',
    canonical: '/troca-devolucoes',
    sections: [
      {
        title: 'Quando a troca pode acontecer',
        body: [
          'Casos de avaria, divergência de item, defeito constatado ou erro de compatibilidade identificado antes da instalação devem ser reportados pelos canais oficiais.',
          'A equipe orienta sobre documentos, imagens, embalagem e fluxo de retorno quando necessário.'
        ]
      },
      {
        title: 'Conferência técnica',
        body: [
          'Peças devolvidas passam por análise para validação de uso, integridade e aderência à solicitação de troca ou devolução.',
          'Em itens com instalação inadequada, violação ou uso incompatível, a aprovação depende da política técnica aplicável.'
        ]
      }
    ],
    ctaTitle: 'Precisa abrir um atendimento?',
    ctaBody: 'Tenha o número do pedido e o SKU em mãos para acelerar a triagem.'
  },
  rastreamento: {
    title: 'Rastreamento de Pedidos | Toyoparts',
    description: 'Acompanhe entregas da Toyoparts com mais previsibilidade usando o código de rastreio informado após o despacho.',
    eyebrow: 'Rastreamento',
    intro: 'Após a expedição do pedido, o rastreamento permite acompanhar movimentações logísticas, previsão de entrega e tentativas de recebimento.',
    canonical: '/rastreamento-correios',
    sections: [
      {
        title: 'Como rastrear',
        body: [
          'Use o código enviado por e-mail ou disponibilizado na área do pedido para consultar o status atualizado da remessa.',
          'Transportadoras e operadores logísticos podem exibir nomenclaturas diferentes para cada etapa do transporte.'
        ]
      },
      {
        title: 'Quando procurar atendimento',
        body: [
          'Se houver atraso relevante, divergência de status ou tentativa de entrega não reconhecida, procure a equipe para abertura de acompanhamento.',
          'Em regiões com restrição logística, o prazo pode sofrer atualização operacional.'
        ]
      }
    ],
    ctaTitle: 'Não encontrou o rastreio?',
    ctaBody: 'Consulte seu e-mail de confirmação ou fale com a central de atendimento.'
  },
  loja: {
    title: 'Loja Física | Toyoparts',
    description: 'Conheça a operação física da Toyoparts e os canais de atendimento para retirada, suporte e orientações sobre peças Toyota.',
    eyebrow: 'Loja física',
    intro: 'Além da operação digital, a Toyoparts mantém estrutura física de atendimento para suporte comercial, orientação técnica e processos logísticos.',
    canonical: '/loja-fisica',
    sections: [
      {
        title: 'Atendimento local',
        body: [
          'A loja física apoia clientes que desejam retirada, orientação comercial ou atendimento próximo à operação.',
          'Recomenda-se contato prévio para confirmar disponibilidade de item e janela de retirada.'
        ]
      },
      {
        title: 'Integração com a operação online',
        body: [
          'A experiência física e digital compartilham catálogo, atendimento e suporte, o que ajuda a manter consistência entre consulta técnica e processo de compra.',
          'Isso também acelera correções de cadastro, pedidos e encaminhamento de pós-venda.'
        ]
      }
    ],
    ctaTitle: 'Vai retirar um pedido?',
    ctaBody: 'Confirme previamente com a equipe o status da separação e o horário recomendado.'
  },
  contato: {
    title: 'Fale Conosco | Toyoparts',
    description: 'Entre em contato com a Toyoparts para suporte comercial, orientação de compatibilidade, pós-venda e dúvidas sobre pedidos.',
    eyebrow: 'Atendimento',
    intro: 'Se você precisa validar compatibilidade, acompanhar um pedido ou falar com um especialista em peças Toyota, use nossos canais oficiais.',
    canonical: '/fale-conosco',
    sections: [
      {
        title: 'Como ajudamos',
        body: [
          'O atendimento apoia clientes em dúvidas de catálogo, compatibilidade por modelo, andamento do pedido, entrega, troca e devolução.',
          'Sempre que possível, informe o SKU, o modelo do veículo e o número do pedido para acelerar o atendimento.'
        ]
      },
      {
        title: 'Canais recomendados',
        body: [
          'WhatsApp e telefone são os caminhos mais rápidos para triagem comercial e suporte com a equipe.',
          'E-mail segue disponível para casos formais, acompanhamento documental e solicitações complementares.'
        ]
      }
    ],
    ctaTitle: 'Quer atendimento mais rápido?',
    ctaBody: 'Tenha o SKU e o modelo do Toyota em mãos antes de iniciar o contato.'
  }
};
