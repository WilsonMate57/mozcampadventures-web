/**
 * MOZ CAMP ADVENTURES — i18n.mjs
 * Textos da interface em PT e EN. Os textos de conteúdo (pacotes)
 * vêm de data/*.json (PT) e data/en.json (EN).
 * Textos marcados [A CONFIRMAR] em docs/REDESIGN_E_UI_UX.md são sugestões.
 */

import { readFileSync } from 'node:fs';

/* Categorias: data/categories.json (partilhado com o painel de administração) */
const _cat = JSON.parse(readFileSync(new URL('../data/categories.json', import.meta.url), 'utf8'));
delete _cat._comment;
export const CATEGORIES = _cat;

export const LOCATIONS = {
  inhaca:     { pt: 'Ilha da Inhaca', en: 'Inhaca Island' },
  machangulo: { pt: 'Machangulo',     en: 'Machangulo' }
};

export const T = {
  pt: {
    locale: 'pt-PT', htmlLang: 'pt',
    skip: 'Saltar para o conteúdo',
    nav: { experiences: 'Experiências', accommodation: 'Alojamentos', destinations: 'Destinos', how: 'Como reservar', contact: 'Contacto', about: 'Sobre nós', search: 'Procurar experiências', menuOpen: 'Abrir menu', menuClose: 'Fechar menu', book: 'Reservar experiência', bookShort: 'Reservar', explore: 'Explorar', all: 'Ver todas as experiências', options: n => n === 1 ? '1 opção' : `${n} opções`, home: 'Início', lang: 'Idioma', wa: 'Falar no WhatsApp', phone: 'Para mais info:', more: 'Ver mais', account: 'A minha conta', packages: 'Pacotes de férias', packagesSub: '4 a 6 dias, com alojamento (em inglês)' },
    price: { from: 'Desde', currency: 'MZN' },
    hero: {
      chip: 'Baía de Maputo · Moçambique',
      title: 'Ilhas, oceano e safaris <em>a partir de Maputo.</em>',
      lead: 'Island hopping, snorkeling na Inhaca, sunset cruises e safaris — planeados e acompanhados pela equipa da Moz Camp Adventures.',
      alt: 'Grupo a bordo de um barco da Moz Camp Adventures junto à costa arborizada da Ilha da Inhaca',
      /* Slider do topo (os 5 slides do site original): [imagem, local, título, texto, categoria, alt] */
      slides: [
        ['snorkeling-santa-maria', 'Santa Maria', 'Mergulhe num Mundo Subaquático Inesquecível', 'Descubra águas cristalinas, vida marinha vibrante e momentos únicos no paraíso de Santa Maria.', 'island-tours', 'Snorkeling em Santa Maria'],
        ['island-hopping-maputo-bay', 'Baía de Maputo', 'Explore Ilhas Paradisíacas num Só Dia', 'Navegue pela Baía de Maputo e descubra praias intocadas, águas turquesa e experiências inesquecíveis.', 'island-tours', 'Island hopping na Baía de Maputo'],
        ['sunset-cruise-maputo-bay', 'Baía de Maputo', 'Viva o Pôr do Sol Mais Incrível de Maputo', 'Relaxe a bordo, desfrute de vistas deslumbrantes e crie memórias inesquecíveis ao som do mar.', 'sunset-cruise', 'Sunset cruise na Baía de Maputo'],
        ['eswatini-kingdom-tour', 'Eswatini', 'Descubra a Cultura Viva do Reino de Eswatini', 'Uma jornada autêntica por tradições, paisagens e experiências culturais únicas em África.', 'safaris', 'Tour cultural no Reino de Eswatini'],
        ['safari-kruger', 'Kruger National Park', 'Encontre a Vida Selvagem de África de Perto', 'Explore o Kruger National Park e viva a emoção de um safari autêntico e inesquecível.', 'safaris', 'Safari no Kruger National Park']
      ],
      cta: 'Explorar destinos', prev: 'Slide anterior', next: 'Slide seguinte', pause: 'Pausar a apresentação', play: 'Retomar a apresentação', goTo: n => `Ir para o slide ${n}`, label: 'Destaques',
      fExp: 'Experiência', fAll: 'Todas as experiências', fDate: 'Data', fPax: 'Pessoas', fGo: 'Ver experiências'
    },
    trust: [
      ['bx-anchor', 'Base na Marina', 'Escola Náutica, Cidade de Maputo'],
      ['bx-check-shield', 'Confirmação pela equipa', 'Disponibilidade verificada antes de pagar'],
      ['bx-wallet', 'M-Pesa, e-Mola ou banco', 'Pagamentos locais, sem complicações'],
      ['bxl-whatsapp', 'Apoio por WhatsApp', '+258 84 440 6543']
    ],
    home: {
      title: 'Moz Camp Adventures | Passeios às ilhas, sunset cruises e safaris em Maputo',
      desc: 'Island hopping na Baía de Maputo, snorkeling na Inhaca, sunset cruises, safaris e alojamento nas ilhas. Reserve com a Moz Camp Adventures — Marina de Maputo.',
      catEyebrow: 'Experiências', catTitle: 'Escolha a sua próxima aventura', catLead: 'Do barco ao 4×4: passeios de um dia pelas ilhas da Baía de Maputo, praias do sul, vida selvagem e alojamento nas ilhas.',
      featured: 'Mais completo',
      featEyebrow: 'Em destaque', featTitle: 'Experiências para começar',
      aboutEyebrow: 'Sobre nós', aboutTitle: 'Uma equipa local, apaixonada pelo sul de Moçambique',
      aboutText: [
        'A Moz Camp Adventures nasceu da paixão por Moçambique e pelo desejo de revelar ao mundo os seus tesouros escondidos. Mais do que organizar passeios, criamos experiências autênticas que conectam pessoas à natureza, ao oceano e à cultura local.',
        'Com uma equipa experiente e dedicada, levamos os nossos viajantes a explorar destinos icónicos como Santa Maria, a Ilha da Inhaca e a Ilha dos Portugueses com segurança, conforto e um toque de exclusividade.'
      ],
      aboutAlt: 'Viajantes da Moz Camp Adventures',
      destEyebrow: 'Destinos', destTitle: 'O sul de Moçambique, a poucas horas de Maputo', destExplore: 'Explorar',
      howEyebrow: 'Como reservar', howTitle: 'Três passos, sem surpresas', howLead: 'Só paga depois de a equipa confirmar a data e a disponibilidade. Até lá, o seu pedido é apenas um pedido.',
      steps: [
        ['Escolha e simule', 'Escolha a experiência, a data e o número de pessoas. O preço estimado é calculado com as tarifas publicadas.'],
        ['Envie o pedido', 'Pelo site, por WhatsApp ou por e-mail. A equipa responde com a disponibilidade para a data escolhida.'],
        ['Confirmação e pagamento', 'Com a data confirmada, recebe as instruções de pagamento. A reserva fica garantida após o pagamento.']
      ],
      payTitle: 'Pagamentos aceites', bank: 'Transferência bancária',
      stayEyebrow: 'Alojamentos', stayTitle: 'Fique mais uma noite na ilha', stayAll: n => `Ver os ${n} alojamentos`,
      revEyebrow: 'Avaliações', revTitle: 'Contado por quem já foi', revLead: 'Só mostramos avaliações reais, aprovadas pela equipa.', revWrite: 'Deixar avaliação',
      ctaEyebrow: 'Grupos, eventos e pedidos especiais', ctaTitle: 'Tem um grupo ou uma data especial?', ctaLead: 'Fale connosco e montamos a experiência à sua medida: barco privado, sunset cruise para eventos ou combinação de ilhas e alojamento.', ctaWa: 'Pedir cotação no WhatsApp', ctaWaMsg: 'Olá Moz Camp Adventures, gostaria de pedir uma cotação para um grupo.'
    },
    catalog: {
      title: 'Tours e experiências | Moz Camp Adventures',
      desc: 'Todas as experiências da Moz Camp Adventures: island tours na Baía de Maputo, sunset cruises, beach tours, safaris, actividades no oceano, city tour e transfers.',
      eyebrow: 'Tours e experiências', h1: 'Todas as experiências', lead: 'Ilhas, safaris, praias, city tours e muito mais no sul de Moçambique.',
      all: 'Todas', search: 'Procurar por nome, local ou actividade', sort: 'Ordenar', sortRec: 'Recomendado', sortAsc: 'Preço: mais baixo', sortDesc: 'Preço: mais alto',
      count: n => n === 1 ? '1 experiência' : `${n} experiências`, empty: 'Nenhuma experiência corresponde à pesquisa.', reset: 'Limpar filtros', stays: 'Alojamentos'
    },
    stays: {
      title: 'Alojamentos na Inhaca e em Machangulo | Moz Camp Adventures',
      desc: 'Lodges, villas e glamping na Ilha da Inhaca e em Machangulo. Preços por pessoa por noite, reserva com confirmação pela equipa da Moz Camp Adventures.',
      eyebrow: 'Alojamentos', h1: 'Alojamento nas ilhas', lead: 'Lodges, villas e glamping na Ilha da Inhaca e na península de Machangulo.', all: 'Todos', count: n => n === 1 ? '1 alojamento' : `${n} alojamentos`
    },
    contact: {
      title: 'Contacto | Moz Camp Adventures',
      desc: 'Fale com a Moz Camp Adventures por WhatsApp, telefone ou e-mail. Marina, Escola Náutica, Cidade de Maputo.',
      eyebrow: 'Contacto', h1: 'Fale connosco', lead: 'Estamos prontos para ajudar a planear a sua próxima aventura em Moçambique.',
      phone: 'Telefone', email: 'E-mail', bookings: 'Reservas', quotes: 'Cotações', where: 'Onde estamos', address: 'Marina, Escola Náutica<br>Cidade de Maputo, Moçambique',
      hours: 'Horário de atendimento', hoursRows: [['Segunda – Sexta', '08h00 – 18h00'], ['Sábado', '08h00 – 14h00'], ['Domingo', 'Só WhatsApp']],
      formTitle: 'Envie-nos uma mensagem', formLead: 'Respondemos por e-mail ou telefone. Se preferir, envie a mesma mensagem pelo WhatsApp.',
      send: 'Enviar mensagem', sending: 'A enviar…', ok: 'Mensagem recebida. Obrigado — vamos responder em breve.', fail: 'Não foi possível enviar pelo site. Use o WhatsApp ou o e-mail:', tooMany: 'Recebemos muitas mensagens deste dispositivo. Use o WhatsApp ou o e-mail.',
      name: 'Nome completo', mail: 'E-mail', tel: 'Telefone (opcional)', subject: 'Assunto', message: 'Mensagem', choose: 'Seleccione um assunto…',
      subjects: [['island-tours', 'Island Tours'], ['accommodation', 'Alojamentos'], ['transfers', 'Transfers'], ['safari', 'Safaris'], ['custom', 'Pacote personalizado'], ['info', 'Informações gerais'], ['other', 'Outro']],
      sendWa: 'Enviar por WhatsApp', sendMail: 'Enviar por e-mail', privacy: 'Os seus dados são usados apenas para responder ao seu pedido.',
      errName: 'Indique o seu nome.', errMail: 'Indique um e-mail válido.', errSubject: 'Seleccione um assunto.', errMsg: 'Escreva a sua mensagem.', map: 'Mapa — Maputo'
    },
    pkg: {
      overview: 'Visão geral', itinerary: 'Itinerário', included: 'O que está incluído', inc: 'Inclui', exc: 'Não inclui', menu: 'Menu', info: 'Informações importantes', reviews: 'Avaliações', book: 'Reservar', related: 'Também pode gostar', highlights: 'Destaques', amenities: 'Comodidades',
      duration: 'Duração', location: 'Local', destinations: 'Destinos', minimum: 'Mínimo', maximum: 'Máximo', children: 'Crianças', cancellation: 'Cancelamento', nights: 'Estadia mínima', capacity: 'Capacidade',
      people: n => `${n} participantes`, noMin: 'Sem mínimo', noChild: 'Sem tarifa de criança', cancelFree: p => `Gratuito ${p}`, cancelAsk: 'Consulte a equipa', nightsN: n => n === 1 ? '1 noite' : `${n} noites`, upTo: n => `Até ${n} pessoas`,
      photos: n => `Ver ${n} fotos`, photoN: (i, n) => `Abrir fotografia ${i} de ${n}`, unavailableTitle: 'Esta experiência não está disponível', unavailableLead: 'Pode ter sido removida ou estar temporariamente suspensa.', unavailableCta: 'Ver experiências disponíveis',
      tour: 'Tour', stay: 'Alojamento', sections: 'Secções'
    },
    bk: {
      title: 'Pedir reserva', date: 'Data pretendida', dateLabel: 'Data', checkin: 'Entrada', checkout: 'Saída', stayDates: 'Datas da estadia',
      pax: 'Participantes', adults: 'Adultos', childrenL: 'Crianças', less: 'Menos', more: 'Mais', options: 'Opções', shared: 'Barco partilhado', sharedSub: 'Preço por pessoa',
      noTransfer: 'Sem transfer privado', noTransferSub: 'Transporte incluído no pacote', included: 'Incluído', perPax: '/pax', paidApart: 'pago à parte',
      you: 'Os seus dados', name: 'Nome completo', phone: 'Telefone / WhatsApp', email: 'E-mail (opcional)',
      total: 'Total estimado', nightsX: n => n === 1 ? '1 noite' : `${n} noites`, perNight: 'por noite', toConfirm: 'A confirmar pela equipa',
      send: 'Enviar pedido por WhatsApp', sendMail: 'Enviar pedido por e-mail',
      note: 'Isto é um <strong>pedido</strong>, não uma reserva confirmada. A equipa confirma a disponibilidade e envia as instruções de pagamento (M-Pesa, e-Mola ou transferência).',
      errDate: 'Escolha uma data.', errName: 'Indique o seu nome.', errPhone: 'Indique um contacto.', errCheckout: 'A saída tem de ser depois da entrada.',
      minBlock: n => `Esta experiência exige um mínimo de ${n} participantes. Ajuste o número de pessoas ou fale connosco.`,
      minNights: n => `Estadia mínima de ${n} noites.`, maxReached: n => `Máximo de ${n} pessoas.`,
      waHello: 'Olá Moz Camp Adventures 👋', waIntro: 'Gostaria de pedir a reserva de:', waExp: 'Experiência', waDate: 'Data', waIn: 'Entrada', waOut: 'Saída', waPax: 'Participantes',
      waAdults: 'adultos', waChildren: 'crianças', waName: 'Nome', waPhone: 'Telefone', waEmail: 'E-mail', waEnd: 'Por favor, confirmem a disponibilidade.', mailSubject: 'Pedido de reserva',
      submit: 'Enviar pedido de reserva', sending: 'A enviar…', accountAs: 'Sessão iniciada: este pedido fica na sua conta.', okTitle: 'Pedido recebido', okRef: 'Referência do pedido',
      okLead: 'Guarde esta referência. A nossa equipa vai confirmar a disponibilidade e enviar as instruções de pagamento.',
      okMail: 'Enviámos um resumo para {email}.', okWa: 'Falar no WhatsApp sobre este pedido', again: 'Fazer outro pedido',
      waRef: 'Olá Moz Camp Adventures 👋\n\nFiz o pedido de reserva {ref} — {item}.\nNome: {name}',
      failTitle: 'Não foi possível registar o pedido pelo site', failLead: 'Envie-o directamente — a mensagem já vai preenchida:', orMail: 'ou por e-mail',
      avPrev: 'Mês anterior', avNext: 'Mês seguinte', avAvailable: 'Disponível', avLimited: 'Últimas vagas', avSoldOut: 'Esgotado', avUnavailable: 'Indisponível', avSession: 'Escolha o horário',
      avLeft1: 'Resta 1 vaga.', avLeftN: 'Restam {n} vagas.', avGone: 'Essa data deixou de estar disponível. Escolha outra.', avOnly: 'Só restam {n} vagas: reduza o número de participantes.', avStay: 'Há noites indisponíveis neste período. Escolha outras datas.',
      errors: {
        sold_out: 'Essa data esgotou. Escolha outra data.', not_enough_places: 'Só restam {left} vagas nessa data.', date_blocked: 'Essa data não está disponível. Escolha outra.', date_closed: 'Essa data não está aberta a reservas. Escolha outra.', session_required: 'Escolha o horário.', invalid_session: 'Esse horário não está disponível.',
        min_people: 'Esta experiência exige um mínimo de {min} participantes.', min_nights: 'A estadia mínima é de {min} noites.', capacity: 'O máximo é de {max} pessoas.',
        date_out_of_range: 'Escolha uma data a partir de hoje.', item_unavailable: 'Esta experiência não está disponível.', boat_required: 'Escolha uma embarcação.',
        too_many_requests: 'Recebemos muitos pedidos deste dispositivo. Tente mais tarde ou use o WhatsApp.', invalid_phone: 'Indique um telefone válido.', invalid_email: 'Indique um e-mail válido.', invalid_name: 'Indique o seu nome.'
      }
    },
    rev: {
      none: 'Ainda não há avaliações publicadas.', loading: 'A carregar avaliações…', fail: 'Não foi possível carregar as avaliações.',
      formTitle: 'Partilhe a sua experiência', name: 'Nome', origin: 'De onde é? (opcional)', rating: 'Classificação', text: 'A sua experiência', send: 'Enviar avaliação', sending: 'A enviar…',
      ok: 'Obrigado! A sua avaliação será publicada depois de aprovada pela equipa.', err: 'Erro ao enviar. Tente novamente ou contacte-nos por WhatsApp.', errName: 'Indique o seu nome.', errRating: 'Escolha uma classificação.', errText: 'Escreva a sua experiência.', close: 'Fechar', stars: n => `${n} de 5 estrelas`, reviews: n => n === 1 ? '1 avaliação' : `${n} avaliações`
    },
    footer: {
      blurb: 'Passeios às ilhas, sunset cruises, safaris e alojamento no sul de Moçambique, a partir da Marina de Maputo.',
      company: 'Empresa', contact: 'Contacto', privacy: 'Política de privacidade', terms: 'Termos e condições', cookies: 'Gerir cookies', rights: 'Todos os direitos reservados.', credit: 'Site por'
    },
    cookie: {
      title: 'Usamos cookies', text: 'Utilizamos cookies para analisar o tráfego e melhorar a sua experiência. Pode alterar a escolha a qualquer momento em «Gerir cookies».',
      essentials: 'Só essenciais', customize: 'Personalizar', accept: 'Aceitar tudo', modalTitle: 'Preferências de cookies',
      essTitle: 'Essenciais', essText: 'Necessários para o site funcionar (preferências de idioma e de cookies). Sempre activos.',
      anaTitle: 'Análise', anaText: 'Google Analytics (via Google Tag Manager) para percebermos como o site é usado. Dados agregados.', save: 'Guardar preferências'
    },
    notFound: { title: 'Página não encontrada', lead: 'A página que procura não existe ou mudou de endereço.', cta: 'Voltar ao início', tours: 'Ver experiências' },
    redirect: 'A abrir a experiência…'
  },

  en: {
    locale: 'en-GB', htmlLang: 'en',
    skip: 'Skip to content',
    nav: { experiences: 'Experiences', accommodation: 'Accommodation', destinations: 'Destinations', how: 'How to book', contact: 'Contact', about: 'About us', search: 'Search experiences', menuOpen: 'Open menu', menuClose: 'Close menu', book: 'Book an experience', bookShort: 'Book', explore: 'Explore', all: 'See all experiences', options: n => n === 1 ? '1 option' : `${n} options`, home: 'Home', lang: 'Language', wa: 'Chat on WhatsApp', phone: 'More info:', more: 'See more', account: 'My account', packages: 'Holiday Packages', packagesSub: '4 to 6 days, accommodation included' },
    price: { from: 'From', currency: 'MZN' },
    hero: {
      chip: 'Maputo Bay · Mozambique',
      title: 'Islands, ocean and safaris <em>from Maputo.</em>',
      lead: 'Island hopping, snorkelling at Inhaca, sunset cruises and safaris — planned and guided by the Moz Camp Adventures team.',
      alt: 'Group on board a Moz Camp Adventures boat off the forested coast of Inhaca Island',
      slides: [
        ['snorkeling-santa-maria', 'Santa Maria', 'Dive into an Unforgettable Underwater World', 'Discover crystal-clear waters, vibrant marine life and unique moments in the paradise of Santa Maria.', 'island-tours', 'Snorkelling at Santa Maria'],
        ['island-hopping-maputo-bay', 'Maputo Bay', 'Explore Paradise Islands in a Single Day', 'Sail across Maputo Bay and discover untouched beaches, turquoise waters and unforgettable experiences.', 'island-tours', 'Island hopping in Maputo Bay'],
        ['sunset-cruise-maputo-bay', 'Maputo Bay', "Experience Maputo's Most Breathtaking Sunset", 'Relax on board, enjoy stunning views and create unforgettable memories to the sound of the sea.', 'sunset-cruise', 'Sunset cruise in Maputo Bay'],
        ['eswatini-kingdom-tour', 'Eswatini', 'Discover the Living Culture of the Kingdom of Eswatini', 'An authentic journey through traditions, landscapes and unique cultural experiences in Africa.', 'safaris', 'Cultural tour in the Kingdom of Eswatini'],
        ['safari-kruger', 'Kruger National Park', "Encounter Africa's Wildlife Up Close", 'Explore Kruger National Park and live the thrill of an authentic and unforgettable safari.', 'safaris', 'Safari in Kruger National Park']
      ],
      cta: 'Explore destinations', prev: 'Previous slide', next: 'Next slide', pause: 'Pause the slideshow', play: 'Resume the slideshow', goTo: n => `Go to slide ${n}`, label: 'Highlights',
      fExp: 'Experience', fAll: 'All experiences', fDate: 'Date', fPax: 'People', fGo: 'Show experiences'
    },
    trust: [
      ['bx-anchor', 'Based at the Marina', 'Escola Náutica, Maputo City'],
      ['bx-check-shield', 'Confirmed by our team', 'Availability checked before you pay'],
      ['bx-wallet', 'M-Pesa, e-Mola or bank', 'Easy local payments'],
      ['bxl-whatsapp', 'WhatsApp support', '+258 84 440 6543']
    ],
    home: {
      title: 'Moz Camp Adventures | Island tours, sunset cruises and safaris from Maputo',
      desc: 'Island hopping in Maputo Bay, snorkelling at Inhaca, sunset cruises, safaris and island stays. Book with Moz Camp Adventures — Maputo Marina.',
      catEyebrow: 'Experiences', catTitle: 'Choose your next adventure', catLead: 'By boat or 4×4: day trips to the islands of Maputo Bay, southern beaches, wildlife and island stays.',
      featured: 'Most complete',
      featEyebrow: 'Featured', featTitle: 'Experiences to start with',
      aboutEyebrow: 'About us', aboutTitle: 'A local team with a passion for southern Mozambique',
      aboutText: [
        'Moz Camp Adventures was born from a passion for Mozambique and the wish to show the world its hidden treasures. More than organising tours, we create authentic experiences that connect people with nature, the ocean and local culture.',
        'With an experienced and dedicated team, we take our travellers to iconic places such as Santa Maria, Inhaca Island and Portuguese Island with safety, comfort and a touch of exclusivity.'
      ],
      aboutAlt: 'Moz Camp Adventures travellers',
      destEyebrow: 'Destinations', destTitle: 'Southern Mozambique, a few hours from Maputo', destExplore: 'Explore',
      howEyebrow: 'How to book', howTitle: 'Three steps, no surprises', howLead: 'You only pay once our team has confirmed the date and availability. Until then, your request is just a request.',
      steps: [
        ['Choose and estimate', 'Choose the experience, date and number of people. The estimate uses our published rates.'],
        ['Send your request', 'Through the website, WhatsApp or e-mail. Our team replies with availability for your date.'],
        ['Confirmation and payment', 'Once the date is confirmed you receive payment instructions. Your booking is secured after payment.']
      ],
      payTitle: 'Accepted payments', bank: 'Bank transfer',
      stayEyebrow: 'Accommodation', stayTitle: 'Stay another night on the island', stayAll: n => `See all ${n} places to stay`,
      revEyebrow: 'Reviews', revTitle: 'In our travellers’ words', revLead: 'We only show real reviews, approved by our team.', revWrite: 'Write a review',
      ctaEyebrow: 'Groups, events and special requests', ctaTitle: 'Planning for a group or a special date?', ctaLead: 'Talk to us and we will tailor the experience: private boat, sunset cruise for events, or islands combined with accommodation.', ctaWa: 'Ask for a quote on WhatsApp', ctaWaMsg: 'Hello Moz Camp Adventures, I would like a quote for a group.'
    },
    catalog: {
      title: 'Tours and experiences | Moz Camp Adventures',
      desc: 'All Moz Camp Adventures experiences: island tours in Maputo Bay, sunset cruises, beach tours, safaris, ocean activities, city tour and transfers.',
      eyebrow: 'Tours and experiences', h1: 'All experiences', lead: 'Islands, safaris, beaches, city tours and more in southern Mozambique.',
      all: 'All', search: 'Search by name, place or activity', sort: 'Sort', sortRec: 'Recommended', sortAsc: 'Price: low to high', sortDesc: 'Price: high to low',
      count: n => n === 1 ? '1 experience' : `${n} experiences`, empty: 'No experiences match your search.', reset: 'Clear filters', stays: 'Accommodation'
    },
    stays: {
      title: 'Accommodation on Inhaca and Machangulo | Moz Camp Adventures',
      desc: 'Lodges, villas and glamping on Inhaca Island and in Machangulo. Prices per person per night, bookings confirmed by the Moz Camp Adventures team.',
      eyebrow: 'Accommodation', h1: 'Island accommodation', lead: 'Lodges, villas and glamping on Inhaca Island and the Machangulo peninsula.', all: 'All', count: n => n === 1 ? '1 place to stay' : `${n} places to stay`
    },
    contact: {
      title: 'Contact | Moz Camp Adventures',
      desc: 'Talk to Moz Camp Adventures on WhatsApp, by phone or e-mail. Marina, Escola Náutica, Maputo City.',
      eyebrow: 'Contact', h1: 'Get in touch', lead: 'We are ready to help you plan your next adventure in Mozambique.',
      phone: 'Phone', email: 'E-mail', bookings: 'Bookings', quotes: 'Quotes', where: 'Where we are', address: 'Marina, Escola Náutica<br>Maputo City, Mozambique',
      hours: 'Opening hours', hoursRows: [['Monday – Friday', '08:00 – 18:00'], ['Saturday', '08:00 – 14:00'], ['Sunday', 'WhatsApp only']],
      formTitle: 'Send us a message', formLead: 'We reply by e-mail or phone. If you prefer, send the same message on WhatsApp.',
      send: 'Send message', sending: 'Sending…', ok: 'Message received. Thank you — we will reply soon.', fail: 'We could not send it through the website. Please use WhatsApp or e-mail:', tooMany: 'We received many messages from this device. Please use WhatsApp or e-mail.',
      name: 'Full name', mail: 'E-mail', tel: 'Phone (optional)', subject: 'Subject', message: 'Message', choose: 'Choose a subject…',
      subjects: [['island-tours', 'Island Tours'], ['accommodation', 'Accommodation'], ['transfers', 'Transfers'], ['safari', 'Safaris'], ['custom', 'Custom package'], ['info', 'General information'], ['other', 'Other']],
      sendWa: 'Send via WhatsApp', sendMail: 'Send by e-mail', privacy: 'Your details are only used to reply to your request.',
      errName: 'Please enter your name.', errMail: 'Please enter a valid e-mail.', errSubject: 'Please choose a subject.', errMsg: 'Please write your message.', map: 'Map — Maputo'
    },
    pkg: {
      overview: 'Overview', itinerary: 'Itinerary', included: 'What’s included', inc: 'Included', exc: 'Not included', menu: 'Menu', info: 'Important information', reviews: 'Reviews', book: 'Book', related: 'You may also like', highlights: 'Highlights', amenities: 'Amenities',
      duration: 'Duration', location: 'Location', destinations: 'Destinations', minimum: 'Minimum', maximum: 'Maximum', children: 'Children', cancellation: 'Cancellation', nights: 'Minimum stay', capacity: 'Capacity',
      people: n => `${n} people`, noMin: 'No minimum', noChild: 'No child rate', cancelFree: p => `Free ${p}`, cancelAsk: 'Ask our team', nightsN: n => n === 1 ? '1 night' : `${n} nights`, upTo: n => `Up to ${n} people`,
      photos: n => `See ${n} photos`, photoN: (i, n) => `Open photo ${i} of ${n}`, unavailableTitle: 'This experience is not available', unavailableLead: 'It may have been removed or temporarily suspended.', unavailableCta: 'See available experiences',
      tour: 'Tour', stay: 'Accommodation', sections: 'Sections'
    },
    bk: {
      title: 'Request a booking', date: 'Preferred date', dateLabel: 'Date', checkin: 'Check-in', checkout: 'Check-out', stayDates: 'Stay dates',
      pax: 'Participants', adults: 'Adults', childrenL: 'Children', less: 'Fewer', more: 'More', options: 'Options', shared: 'Shared boat', sharedSub: 'Price per person',
      noTransfer: 'No private transfer', noTransferSub: 'Transport included in the package', included: 'Included', perPax: '/pax', paidApart: 'paid separately',
      you: 'Your details', name: 'Full name', phone: 'Phone / WhatsApp', email: 'E-mail (optional)',
      total: 'Estimated total', nightsX: n => n === 1 ? '1 night' : `${n} nights`, perNight: 'per night', toConfirm: 'To be confirmed by our team',
      send: 'Send request via WhatsApp', sendMail: 'Send request by e-mail',
      note: 'This is a <strong>request</strong>, not a confirmed booking. Our team confirms availability and sends payment instructions (M-Pesa, e-Mola or bank transfer).',
      errDate: 'Please choose a date.', errName: 'Please enter your name.', errPhone: 'Please enter a contact number.', errCheckout: 'Check-out must be after check-in.',
      minBlock: n => `This experience requires a minimum of ${n} participants. Adjust the number of people or contact us.`,
      minNights: n => `Minimum stay of ${n} nights.`, maxReached: n => `Maximum of ${n} people.`,
      waHello: 'Hello Moz Camp Adventures 👋', waIntro: 'I would like to request a booking for:', waExp: 'Experience', waDate: 'Date', waIn: 'Check-in', waOut: 'Check-out', waPax: 'Participants',
      waAdults: 'adults', waChildren: 'children', waName: 'Name', waPhone: 'Phone', waEmail: 'E-mail', waEnd: 'Please confirm availability.', mailSubject: 'Booking request',
      submit: 'Send booking request', sending: 'Sending…', accountAs: 'Signed in: this request will appear in your account.', okTitle: 'Request received', okRef: 'Request reference',
      okLead: 'Please keep this reference. Our team will confirm availability and send payment instructions.',
      okMail: 'We have sent a summary to {email}.', okWa: 'Chat on WhatsApp about this request', again: 'Make another request',
      waRef: 'Hello Moz Camp Adventures 👋\n\nI made booking request {ref} — {item}.\nName: {name}',
      failTitle: 'We could not register your request on the website', failLead: 'Send it directly — the message is already filled in:', orMail: 'or by e-mail',
      avPrev: 'Previous month', avNext: 'Next month', avAvailable: 'Available', avLimited: 'Last places', avSoldOut: 'Sold out', avUnavailable: 'Unavailable', avSession: 'Choose a time',
      avLeft1: '1 place left.', avLeftN: '{n} places left.', avGone: 'That date is no longer available. Please choose another.', avOnly: 'Only {n} places left: please reduce the number of participants.', avStay: 'Some nights in this period are unavailable. Please choose other dates.',
      errors: {
        sold_out: 'That date has sold out. Please choose another date.', not_enough_places: 'Only {left} places left on that date.', date_blocked: 'That date is not available. Please choose another.', date_closed: 'That date is not open for booking. Please choose another.', session_required: 'Please choose a time.', invalid_session: 'That time is not available.',
        min_people: 'This experience requires a minimum of {min} participants.', min_nights: 'The minimum stay is {min} nights.', capacity: 'The maximum is {max} people.',
        date_out_of_range: 'Please choose a date from today onwards.', item_unavailable: 'This experience is not available.', boat_required: 'Please choose a boat.',
        too_many_requests: 'We received many requests from this device. Please try later or use WhatsApp.', invalid_phone: 'Please enter a valid phone number.', invalid_email: 'Please enter a valid e-mail.', invalid_name: 'Please enter your name.'
      }
    },
    rev: {
      none: 'No reviews published yet.', loading: 'Loading reviews…', fail: 'Reviews could not be loaded.',
      formTitle: 'Share your experience', name: 'Name', origin: 'Where are you from? (optional)', rating: 'Rating', text: 'Your experience', send: 'Send review', sending: 'Sending…',
      ok: 'Thank you! Your review will be published once approved by our team.', err: 'Could not send. Please try again or contact us on WhatsApp.', errName: 'Please enter your name.', errRating: 'Please choose a rating.', errText: 'Please write about your experience.', close: 'Close', stars: n => `${n} out of 5 stars`, reviews: n => n === 1 ? '1 review' : `${n} reviews`
    },
    footer: {
      blurb: 'Island tours, sunset cruises, safaris and island stays in southern Mozambique, from Maputo Marina.',
      company: 'Company', contact: 'Contact', privacy: 'Privacy policy', terms: 'Terms and conditions', cookies: 'Manage cookies', rights: 'All rights reserved.', credit: 'Website by'
    },
    cookie: {
      title: 'We use cookies', text: 'We use cookies to analyse traffic and improve your experience. You can change your choice at any time under “Manage cookies”.',
      essentials: 'Essentials only', customize: 'Customise', accept: 'Accept all', modalTitle: 'Cookie preferences',
      essTitle: 'Essential', essText: 'Needed for the site to work (language and cookie preferences). Always on.',
      anaTitle: 'Analytics', anaText: 'Google Analytics (via Google Tag Manager) so we understand how the site is used. Aggregated data.', save: 'Save preferences'
    },
    notFound: { title: 'Page not found', lead: 'The page you are looking for does not exist or has moved.', cta: 'Back to home', tours: 'See experiences' },
    redirect: 'Opening the experience…'
  }
};
