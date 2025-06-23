import OpenAI from 'openai';
import { adicionarVocabulario, buscarPalavrasRevisao, registrarSessaoEstudo } from './database.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const promptsModos = {
  aula_guiada: {
    system: (professor, idioma, nome, nivel) => `
      Você é ${professor}, um professor especializado em ${idioma}.
      Você está dando uma aula guiada para ${nome}, que está no nível ${nivel}.

      INSTRUÇÕES IMPORTANTES:
      - Responda SEMPRE em ${idioma}
      - Faça perguntas progressivas e didáticas
      - Corrija erros de forma gentil e educativa
      - Inclua explicações gramaticais quando necessário
      - Mantenha o foco no aprendizado estruturado
      - Limite suas respostas a 2-3 frases por vez
      - Ao final de cada resposta, faça uma pergunta para continuar a lição
    `,
    user: (mensagem) => `Aluno disse: "${mensagem}". Continue a aula de forma didática.`
  },

  pratica_livre: {
    system: (professor, idioma, nome, nivel) => `
      Você é ${professor}, conversando naturalmente com ${nome} em ${idioma}.
      Nível do aluno: ${nivel}.

      INSTRUÇÕES:
      - Mantenha uma conversa natural em ${idioma}
      - Use temas atuais e cotidianos
      - Corrija erros sutilmente, reformulando a frase correta
      - Adapte seu vocabulário ao nível do aluno
      - Seja amigável e encorajador
      - Faça perguntas para manter a conversa fluindo
    `,
    user: (mensagem) => `Continue esta conversa natural: "${mensagem}"`
  },

  modo_professor: {
    system: (professor, idioma, nome, nivel) => `
      Você é ${professor}, um especialista em ${idioma} dando explicações detalhadas para ${nome}.
      Nível: ${nivel}.

      INSTRUÇÕES:
      - Responda em ${idioma} com explicações claras
      - Forneça exemplos práticos
      - Explique regras gramaticais quando relevante
      - Use analogias para facilitar o entendimento
      - Seja paciente e detalhado nas explicações
      - Ofereça exercícios práticos quando apropriado
    `,
    user: (mensagem) => `Explique detalhadamente sobre: "${mensagem}"`
  },

  modo_vocabulario: {
    system: (professor, idioma, nome, nivel) => `
      Você é ${professor} ensinando vocabulário em ${idioma} para ${nome}.
      Nível: ${nivel}.

      INSTRUÇÕES:
      - Apresente 3-5 palavras novas por sessão
      - Dê exemplos de uso em frases
      - Crie associações e dicas de memorização
      - Faça exercícios de repetição espaçada
      - Use técnicas de gamificação
      - Responda sempre em ${idioma}
    `,
    user: (mensagem) => `Ensine vocabulário relacionado a: "${mensagem}"`
  }
};

export async function processarModoEstudo(estado, mensagem, usuarioBanco) {
  const { modo, idioma, professor, nome } = estado;
  const nivel = usuarioBanco?.nivel || 'iniciante';

  const promptConfig = promptsModos[modo];
  if (!promptConfig) {
    throw new Error(`Modo de estudo inválido: ${modo}`);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: promptConfig.system(professor, idioma, nome, nivel)
        },
        {
          role: 'user',
          content: promptConfig.user(mensagem)
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    const resposta = completion.choices[0].message.content;

    if (modo === 'modo_vocabulario') {
      await extrairEAdicionarVocabulario(resposta, usuarioBanco.id, idioma);
    }

    return {
      resposta,
      incluirTraducao: true,
      incluirAudio: true
    };

  } catch (error) {
    console.error('Erro ao processar modo de estudo:', error);
    throw error;
  }
}

async function extrairEAdicionarVocabulario(resposta, usuarioId, idioma) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Extraia as palavras mais importantes desta resposta em ${idioma} e forneça suas traduções em português.
                   Formato: palavra1:tradução1|palavra2:tradução2|palavra3:tradução3
                   Máximo 5 palavras.`
        },
        {
          role: 'user',
          content: resposta
        }
      ],
      temperature: 0.3,
      max_tokens: 150
    });

    const vocabularioExtraido = completion.choices[0].message.content;
    const pares = vocabularioExtraido.split('|');

    for (const par of pares) {
      const [palavra, traducao] = par.split(':');
      if (palavra && traducao) {
        await adicionarVocabulario(usuarioId, palavra.trim(), traducao.trim(), idioma);
      }
    }
  } catch (error) {
    console.error('Erro ao extrair vocabulário:', error);
  }
}

export async function gerarTraducao(texto, idiomaOrigem) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Traduza o seguinte texto de ${idiomaOrigem} para português brasileiro.
                   Forneça apenas a tradução, sem explicações adicionais.`
        },
        {
          role: 'user',
          content: texto
        }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao gerar tradução:', error);
    return 'Tradução não disponível no momento.';
  }
}

export async function iniciarRevisaoVocabulario(usuarioId, idioma) {
  const palavras = await buscarPalavrasRevisao(usuarioId, 5);

  if (palavras.length === 0) {
    return {
      tipo: 'sem_revisao',
      mensagem: 'Parabéns! Você não tem palavras para revisar no momento. Continue estudando para adicionar mais vocabulário!'
    };
  }

  return {
    tipo: 'revisao',
    palavras: palavras,
    mensagem: `Vamos revisar ${palavras.length} palavras do seu vocabulário!`
  };
}

export class SessaoAulaGuiada {
  constructor(usuarioId, idioma) {
    this.usuarioId = usuarioId;
    this.idioma = idioma;
    this.questoesRespondidas = 0;
    this.questoesCorretas = 0;
    this.inicioSessao = new Date();
    this.maxQuestoes = 20;
    this.maxTempo = 30; // minutos
  }

  incrementarQuestao(correta = false) {
    this.questoesRespondidas++;
    if (correta) this.questoesCorretas++;
  }

  verificarLimites() {
    const tempoDecorrido = (new Date() - this.inicioSessao) / (1000 * 60); // em minutos

    return {
      atingiuLimite: this.questoesRespondidas >= this.maxQuestoes || tempoDecorrido >= this.maxTempo,
      questoesRestantes: this.maxQuestoes - this.questoesRespondidas,
      tempoRestante: Math.max(0, this.maxTempo - Math.floor(tempoDecorrido))
    };
  }

  async finalizarSessao() {
    const duracaoMinutos = Math.floor((new Date() - this.inicioSessao) / (1000 * 60));
    const pontosGanhos = this.questoesCorretas * 10;

    await registrarSessaoEstudo(this.usuarioId, 'aula_guiada', {
      duracaoMinutos,
      questoesRespondidas: this.questoesRespondidas,
      questoesCorretas: this.questoesCorretas,
      pontosGanhos
    });

    return {
      questoesRespondidas: this.questoesRespondidas,
      questoesCorretas: this.questoesCorretas,
      duracaoMinutos,
      pontosGanhos,
      aproveitamento: Math.round((this.questoesCorretas / this.questoesRespondidas) * 100)
    };
  }
}
