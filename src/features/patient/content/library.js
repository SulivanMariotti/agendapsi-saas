/**
 * Biblioteca (Paciente)
 * - Conteúdo curto e clínico (psicoeducação) para sustentar vínculo/constância.
 * - Importante: leitura NÃO substitui a sessão.
 * - Sem CTA de cancelar/remarcar.
 */

export const LIBRARY_TOP_MANTRA = {
  title: "Leitura é apoio — não substitui sua sessão",
  text:
    "A terapia acontece na continuidade. Estes textos são um lembrete gentil do seu compromisso com você mesmo: manter a constância sustenta o seu processo.",
};

export const SESSION_TAKEAWAYS = {
  title: "Para levar para a sessão",
  subtitle:
    "Se quiser, anote 1–2 pontos. Não precisa “estar pronto” — o importante é estar presente.",
  prompts: [
    "O que ficou mais vivo em mim desde a última sessão?",
    "O que eu evitei sentir ou falar (e por quê)?",
    "Que situação me mexeu (no corpo, no humor, nas relações)?",
    "Qual é a pergunta que eu gostaria de levar para hoje?",
    "O que eu preciso de mim nesta semana para sustentar o cuidado?",
  ],
};

/**
 * `body` como array de parágrafos para renderização simples e acessível.
 */
export const LIBRARY_ARTICLES = [
  {
    id: "constancia",
    category: "Constância",
    readingTime: "2–3 min",
    title: "Constância: por que vir, mesmo quando dá vontade de faltar",
    summary:
      "Quando a vida aperta, faltar parece aliviar. Mas é justamente na repetição dos encontros que o cuidado se sustenta.",
    body: [
      "Em muitos momentos, a vontade de faltar não é falta de interesse — é um sinal de que algo importante está em jogo.",
      "A terapia não é apenas o conteúdo do que você fala. É também o compromisso com um espaço estável, onde você pode se encontrar com mais honestidade.",
      "Quando você mantém a constância, você treina um gesto de cuidado: aparecer por você, mesmo quando o impulso é se esconder.",
      "Se hoje a vontade de faltar apareceu, leve isso para a sessão. Isso costuma ser parte do processo — e pode ser um caminho de evolução, não um motivo de afastamento.",
    ],
  },
  {
    id: "faltar",
    category: "Processo",
    readingTime: "2 min",
    title: "Faltar não é “só” perder uma hora",
    summary:
      "A ausência interrompe um ritmo. E na terapia, o ritmo é parte do tratamento.",
    body: [
      "Na terapia, o que cura não é um encontro isolado: é a continuidade. A constância cria um fio que sustenta mudanças pequenas e profundas.",
      "Faltar pode acontecer por muitos motivos, e sem culpa: mas vale observar o efeito. Às vezes a falta vira um “atalho” para não tocar em algo sensível.",
      "Se você faltou, não significa fracasso. Significa que há algo para ser entendido. O melhor lugar para compreender isso é na própria sessão.",
    ],
  },
  {
    id: "preparacao",
    category: "Preparação",
    readingTime: "2–3 min",
    title: "Como se preparar para a sessão (sem se cobrar demais)",
    summary:
      "Você não precisa ter um “assunto certo”. Preparação é chegar com presença.",
    body: [
      "Uma boa preparação não é montar um roteiro perfeito. É só reservar alguns minutos para notar como você está: corpo, pensamentos, emoções.",
      "Pergunte-se: o que está mais vivo em mim hoje? O que eu queria ter dito antes e adiei?",
      "Se puder, anote 1 frase. Isso ajuda especialmente quando o dia está corrido ou quando a ansiedade sobe perto do horário.",
      "O principal é vir. A sessão é o lugar onde as coisas se organizam — não uma prova para estar pronto.",
    ],
  },
  {
    id: "ansiedade",
    category: "Ansiedade",
    readingTime: "2 min",
    title: "Quando a ansiedade aumenta perto do horário",
    summary:
      "A ansiedade pode tentar te convencer a evitar. Você pode escolher ficar.",
    body: [
      "É comum que a ansiedade aumente quando um encontro importante se aproxima. A mente procura controle e, às vezes, oferece a falta como “solução rápida”.",
      "Se isso acontecer, faça algo pequeno: respire mais lento por 60 segundos e nomeie o que sente (sem brigar com isso).",
      "Você não precisa “se livrar” da ansiedade para vir. Você pode vir com ela. E isso, muitas vezes, é parte do cuidado.",
    ],
  },
  {
    id: "entre_sessoes",
    category: "Entre sessões",
    readingTime: "2–3 min",
    title: "Pequenos cuidados entre sessões",
    summary:
      "Entre uma sessão e outra, o cuidado se mantém em gestos simples e repetidos.",
    body: [
      "A terapia não vive só na sessão. Ela se prolonga quando você pratica pequenas escolhas: hidratar-se, dormir melhor, caminhar, pedir ajuda, dizer não.",
      "Não é sobre perfeição — é sobre continuidade. Um gesto pequeno feito com regularidade vale mais do que um esforço enorme que não se sustenta.",
      "Se você perceber que está se afastando de si, use isso como um sinal para se aproximar da sessão, não para fugir dela.",
    ],
  },
  {
    id: "sem_assunto",
    category: "Diálogo",
    readingTime: "2 min",
    title: "“Não tenho nada para falar” — e se isso também for conteúdo?",
    summary:
      "Silêncios e “vazios” são parte do processo. Eles podem dizer muito.",
    body: [
      "Muitas pessoas chegam pensando que precisam trazer um tema pronto. Mas o modo como você chega já é material terapêutico.",
      "Às vezes, “não tenho nada” significa cansaço, proteção, medo de tocar em algo, ou a sensação de que falar não vai ajudar.",
      "Você pode simplesmente levar isso: “Estou com dificuldade de falar hoje.” A terapia também é sobre encontrar palavras — com tempo e cuidado.",
    ],
  },
];
