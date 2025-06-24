import OpenAI from 'openai';
import { adicionarVocabulario, buscarPalavrasRevisao, registrarSessaoEstudo, salvarProgressoLicao } from './database.js';
import { obterProximaAula, obterAulaPorId, calcularProgressoNivel } from './lessonProgression.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const promptsModos = {
  aula_guiada: {
    system: (professor, idioma, nome, nivel, aulaAtual, historicoAulas, etapaAula) => `
      Você é ${professor}, um professor especializado em ${idioma} conduzindo uma AULA GUIADA CONTÍNUA INTERATIVA.

      INFORMAÇÕES DO ALUNO:
      - Nome: ${nome}
      - Nível atual: ${nivel}
      - Aula atual: ${aulaAtual.topico}
      - Conteúdo da aula: ${aulaAtual.conteudo}
      - Etapa da aula: ${etapaAula}

      HISTÓRICO DE AULAS ANTERIORES:
      ${historicoAulas}

      METODOLOGIA DE AULA GUIADA INTERATIVA:

      ${{'intermediario': true, 'avançado': true, 'avancado': true}[nivel?.toLowerCase()] ? `IMPORTANTE: A partir do nível intermediário, conduza a aula majoritariamente em inglês. Use português apenas para explicações essenciais ou quando o aluno demonstrar dificuldade. Todas as instruções, perguntas e feedbacks devem ser preferencialmente em inglês.` : ''}

      🎯 ESTRUTURA DA AULA (siga esta sequência):
      1. EXPLICAÇÃO_INICIAL - Explique o tópico em ${idioma} e português
      2. EXEMPLOS_PRATICOS - Dê exemplos claros e contextualizados
      3. EXERCICIO_MULTIPLA_ESCOLHA - Crie questões de múltipla escolha
      4. SOLICITAR_IMAGEM - Peça para gerar uma imagem relacionada ao tópico
      5. DESCRICAO_IMAGEM - Aluno descreve a imagem gerada
      6. EXERCICIO_AUDIO - Solicite que o aluno grave áudio
      7. CORRECAO_PRONUNCIA - Analise e corrija a pronúncia
      8. FORMACAO_FRASES - Peça para formar frases
      9. CORRECAO_GRAMATICAL - Corrija erros gramaticais
      10. REVISAO_VOCABULARIO - Revise palavras aprendidas
      11. AVALIACAO_PROGRESSO - Avalie o progresso na aula

      📚 INSTRUÇÕES ESPECÍFICAS POR ETAPA:

      IMPORTANTE: Em cada etapa, DEIXE CLARO para o aluno qual ação ele deve realizar, usando frases diretas como "Agora envie um áudio", "Responda o questionário abaixo", "Descreva a imagem", etc. Nunca deixe dúvidas sobre o que o aluno deve fazer em seguida.

      EXPLICAÇÃO_INICIAL:
      - Explique primeiro em ${idioma}, depois em português
      - Use linguagem clara e didática
      - Conecte com conhecimentos anteriores

      EXERCICIO_MULTIPLA_ESCOLHA:
      - Crie 3-4 opções com emojis: 🅰️ 🅱️ 🅲️ 🅳️
      - Questões progressivas em dificuldade
      - Feedback imediato com explicação

      SOLICITAR_IMAGEM:
      - Descreva que tipo de imagem será gerada
      - Explique como ela se relaciona com o tópico
      - Use o comando: [GERAR_IMAGEM: descrição detalhada]

      EXERCICIO_AUDIO:
      - Peça para o aluno gravar palavras/frases específicas
      - Use o comando: [SOLICITAR_AUDIO: texto_para_pronunciar]
      - Dê instruções claras de pronúncia

      FORMACAO_FRASES:
      - Peça frases usando vocabulário específico
      - Varie os tipos: afirmativas, negativas, interrogativas
      - Corrija imediatamente com explicação

      ✅ CORREÇÃO OBRIGATÓRIA:
      - TODA resposta deve ser corrigida se houver erro
      - Explique o erro em português e a forma correta em ${idioma}
      - Reforce com exemplos adicionais
      - Seja encorajador mesmo ao corrigir

      🎯 INTERAÇÃO ATIVA:
      - Mantenha o aluno sempre engajado
      - Varie os tipos de exercícios
      - Use gamificação com pontuação
      - Celebre acertos com entusiasmo

      🧠 ADAPTAÇÃO INTELIGENTE:
      - Se o aluno erra muito, simplifique
      - Se acerta tudo, aumente a dificuldade
      - Repita conceitos quando necessário
      - Conecte com aulas anteriores

      IMPORTANTE: Você deve conduzir a aula passo a passo, seguindo a estrutura definida. Nunca pule etapas. Sempre indique qual etapa está executando.
    `,
    user: (mensagem, aulaAtual, etapaAula) => `
      CONTEXTO DA AULA: ${aulaAtual.topico} - ${aulaAtual.conteudo}
      ETAPA ATUAL: ${etapaAula}

      Resposta do aluno: "${mensagem}"

      Continue a aula seguindo a metodologia estruturada. Conduza a próxima etapa apropriada.
    `
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

  if (modo === 'aula_guiada') {
    return await processarAulaGuiada(estado, mensagem, usuarioBanco);
  }

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
      max_tokens: 400
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

async function processarAulaGuiada(estado, mensagem, usuarioBanco) {
  const { idioma, professor, nome } = estado;
  const nivel = usuarioBanco?.nivel || 'iniciante';

  // Obtém a aula atual do usuário
  const aulaAtualId = usuarioBanco?.aula_atual || 1;
  const aulaAtual = obterAulaPorId(idioma, aulaAtualId) || obterProximaAula(idioma, 0);

  // Determina a etapa da aula baseada no progresso
  const etapaAula = determinarEtapaAula(mensagem, estado.etapaAulaAtual || 'EXPLICACAO_INICIAL');

  // Gera histórico das últimas 3 aulas para contexto
  const historicoAulas = gerarHistoricoAulas(idioma, aulaAtualId);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: promptsModos.aula_guiada.system(professor, idioma, nome, nivel, aulaAtual, historicoAulas, etapaAula)
        },
        {
          role: 'user',
          content: promptsModos.aula_guiada.user(mensagem, aulaAtual, etapaAula)
        }
      ],
      temperature: 0.7,
      max_tokens: 600
    });

    let resposta = completion.choices[0].message.content;

    // Processa comandos especiais na resposta
    const resultado = await processarComandosEspeciais(resposta, idioma, aulaAtual);

    // Atualiza a etapa da aula no estado
    estado.etapaAulaAtual = proximaEtapaAula(etapaAula);

    // Salva progresso da aula
    await salvarProgressoLicao(usuarioBanco.id, `aula_${aulaAtual.id}`, 'aula_guiada', {
      questoesRespondidas: 1,
      questoesCorretas: 1,
      tempoGasto: 3,
      completada: false
    });

    // Extrai vocabulário da resposta
    await extrairEAdicionarVocabulario(resposta, usuarioBanco.id, idioma);

    return {
      resposta: resultado.resposta,
      aulaAtual: aulaAtual,
      imagemGerada: resultado.imagemGerada,
      audioSolicitado: resultado.audioSolicitado,
      incluirTraducao: true,
      incluirAudio: true
    };

  } catch (error) {
    console.error('Erro ao processar aula guiada:', error);
    throw error;
  }
}

function determinarEtapaAula(mensagem, etapaAtual) {
  const etapas = [
    'EXPLICACAO_INICIAL',
    'EXEMPLOS_PRATICOS',
    'EXERCICIO_MULTIPLA_ESCOLHA',
    'SOLICITAR_IMAGEM',
    'DESCRICAO_IMAGEM',
    'EXERCICIO_AUDIO',
    'CORRECAO_PRONUNCIA',
    'FORMACAO_FRASES',
    'CORRECAO_GRAMATICAL',
    'REVISAO_VOCABULARIO',
    'AVALIACAO_PROGRESSO'
  ];

  // Se é a primeira mensagem da aula, começa pela explicação
  if (!mensagem || mensagem.toLowerCase().includes('começar') || mensagem.toLowerCase().includes('iniciar')) {
    return 'EXPLICACAO_INICIAL';
  }

  // Avança para a próxima etapa baseada na atual
  const indiceAtual = etapas.indexOf(etapaAtual);
  if (indiceAtual >= 0 && indiceAtual < etapas.length - 1) {
    return etapas[indiceAtual + 1];
  }

  return etapaAtual;
}

function proximaEtapaAula(etapaAtual) {
  const etapas = [
    'EXPLICACAO_INICIAL',
    'EXEMPLOS_PRATICOS',
    'EXERCICIO_MULTIPLA_ESCOLHA',
    'SOLICITAR_IMAGEM',
    'DESCRICAO_IMAGEM',
    'EXERCICIO_AUDIO',
    'CORRECAO_PRONUNCIA',
    'FORMACAO_FRASES',
    'CORRECAO_GRAMATICAL',
    'REVISAO_VOCABULARIO',
    'AVALIACAO_PROGRESSO'
  ];

  const indiceAtual = etapas.indexOf(etapaAtual);
  if (indiceAtual >= 0 && indiceAtual < etapas.length - 1) {
    return etapas[indiceAtual + 1];
  }

  return 'AVALIACAO_PROGRESSO'; // Última etapa
}

async function processarComandosEspeciais(resposta, idioma, aulaAtual) {
  let respostaProcessada = resposta;
  let imagemGerada = null;
  let audioSolicitado = null;

  // Processa comando de geração de imagem
  const regexImagem = /\[GERAR_IMAGEM:\s*([^\]]+)\]/g;
  const matchImagem = regexImagem.exec(resposta);

  if (matchImagem) {
    const descricaoImagem = matchImagem[1];
    try {
      imagemGerada = await gerarImagemEducativa(descricaoImagem, idioma, aulaAtual);
      respostaProcessada = resposta.replace(matchImagem[0],
        `\n🖼️ **Imagem gerada!** Observe a imagem que acabei de criar para você.\n\n📝 **Sua tarefa:** Descreva o que você vê na imagem usando o vocabulário que acabamos de aprender!`
      );
    } catch (error) {
      console.error('Erro ao gerar imagem:', error);
      respostaProcessada = resposta.replace(matchImagem[0],
        '🖼️ Desculpe, não foi possível gerar a imagem no momento. Vamos continuar com a aula!'
      );
    }
  }

  // Processa comando de solicitação de áudio
  const regexAudio = /\[SOLICITAR_AUDIO:\s*([^\]]+)\]/g;
  const matchAudio = regexAudio.exec(resposta);

  if (matchAudio) {
    audioSolicitado = matchAudio[1];
    respostaProcessada = resposta.replace(matchAudio[0],
      `\n🎤 **Exercício de Pronúncia!**\n\n📢 Grave um áudio pronunciando: "${matchAudio[1]}"\n\n💡 **Dica:** Fale claramente e com calma. Vou analisar sua pronúncia e te dar feedback!`
    );
  }

  return {
    resposta: respostaProcessada,
    imagemGerada,
    audioSolicitado
  };
}

async function gerarImagemEducativa(descricao, idioma, aulaAtual) {
  try {
    const promptImagem = `Educational illustration for ${idioma} language learning. Topic: ${aulaAtual.topico}.
    Create a realistic, modern, and visually appealing image showing: ${descricao}.
    Style: professional, mature, suitable for adults and teenagers, with a sober and elegant look.
    No text in the image, focus on visual elements that help language comprehension.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: promptImagem,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });

    return {
      url: response.data[0].url,
      descricao: descricao,
      topico: aulaAtual.topico
    };
  } catch (error) {
    console.error('Erro ao gerar imagem educativa:', error);
    throw error;
  }
}

export async function analisarAudioPronuncia(audioBuffer, textoEsperado, idioma) {
  try {
    // Converte áudio para texto usando Whisper
    const transcricao = await openai.audio.transcriptions.create({
      file: audioBuffer,
      model: "whisper-1",
      language: obterCodigoIdioma(idioma),
      response_format: "text"
    });

    // Analisa a pronúncia comparando com o texto esperado
    const analise = await analisarPronunciaComIA(transcricao, textoEsperado, idioma);

    return {
      transcricao: transcricao,
      textoEsperado: textoEsperado,
      analise: analise,
      pontuacao: calcularPontuacaoPronuncia(transcricao, textoEsperado)
    };
  } catch (error) {
    console.error('Erro ao analisar áudio:', error);
    throw error;
  }
}

async function analisarPronunciaComIA(transcricao, textoEsperado, idioma) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em pronúncia de ${idioma}. Analise a pronúncia do aluno comparando o que ele disse com o que deveria ter dito.

          INSTRUÇÕES:
          - Compare a transcrição com o texto esperado
          - Identifique erros de pronúncia específicos
          - Dê feedback construtivo e encorajador
          - Sugira melhorias específicas
          - Use emojis para tornar o feedback mais amigável
          - Responda em português`
        },
        {
          role: 'user',
          content: `Texto esperado: "${textoEsperado}"
          O que o aluno disse: "${transcricao}"

          Analise a pronúncia e dê feedback detalhado.`
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao analisar pronúncia com IA:', error);
    return 'Não foi possível analisar a pronúncia no momento.';
  }
}

function calcularPontuacaoPronuncia(transcricao, textoEsperado) {
  // Algoritmo simples de similaridade
  const palavrasEsperadas = textoEsperado.toLowerCase().split(' ');
  const palavrasTranscritas = transcricao.toLowerCase().split(' ');

  let acertos = 0;
  const totalPalavras = Math.max(palavrasEsperadas.length, palavrasTranscritas.length);

  for (let i = 0; i < Math.min(palavrasEsperadas.length, palavrasTranscritas.length); i++) {
    if (palavrasEsperadas[i] === palavrasTranscritas[i]) {
      acertos++;
    }
  }

  return Math.round((acertos / totalPalavras) * 100);
}

function obterCodigoIdioma(idioma) {
  const codigos = {
    'Inglês': 'en',
    'Espanhol': 'es',
    'Francês': 'fr',
    'Mandarim': 'zh'
  };
  return codigos[idioma] || 'en';
}

function gerarHistoricoAulas(idioma, aulaAtualId) {
  let historico = "Aulas já cobertas:\n";

  for (let i = Math.max(1, aulaAtualId - 3); i < aulaAtualId; i++) {
    const aula = obterAulaPorId(idioma, i);
    if (aula) {
      historico += `- Aula ${aula.id}: ${aula.topico} (${aula.conteudo})\n`;
    }
  }

  return historico;
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
    this.maxQuestoes = 25; // Aumentado para acomodar mais interações
    this.maxTempo = 45; // Aumentado para 45 minutos
    this.etapasCompletadas = [];
    this.imagensGeradas = [];
    this.audiosAnalisados = [];
  }

  incrementarQuestao(correta = false) {
    this.questoesRespondidas++;
    if (correta) this.questoesCorretas++;
  }

  adicionarEtapaCompletada(etapa) {
    if (!this.etapasCompletadas.includes(etapa)) {
      this.etapasCompletadas.push(etapa);
    }
  }

  adicionarImagemGerada(imagem) {
    this.imagensGeradas.push(imagem);
  }

  adicionarAudioAnalisado(analise) {
    this.audiosAnalisados.push(analise);
  }

  verificarLimites() {
    const tempoDecorrido = (new Date() - this.inicioSessao) / (1000 * 60);
    const etapasObrigatorias = ['EXPLICACAO_INICIAL', 'EXERCICIO_MULTIPLA_ESCOLHA', 'FORMACAO_FRASES'];
    const etapasObrigatoriasCompletas = etapasObrigatorias.every(etapa =>
      this.etapasCompletadas.includes(etapa)
    );

    return {
      atingiuLimite: (this.questoesRespondidas >= this.maxQuestoes || tempoDecorrido >= this.maxTempo) && etapasObrigatoriasCompletas,
      questoesRestantes: this.maxQuestoes - this.questoesRespondidas,
      tempoRestante: Math.max(0, this.maxTempo - Math.floor(tempoDecorrido)),
      etapasCompletadas: this.etapasCompletadas.length,
      etapasObrigatoriasCompletas
    };
  }

  async finalizarSessao() {
    const duracaoMinutos = Math.floor((new Date() - this.inicioSessao) / (1000 * 60));
    const pontosBase = this.questoesCorretas * 10;
    const bonusEtapas = this.etapasCompletadas.length * 5;
    const bonusImagens = this.imagensGeradas.length * 10;
    const bonusAudios = this.audiosAnalisados.length * 15;
    const pontosGanhos = pontosBase + bonusEtapas + bonusImagens + bonusAudios;

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
      aproveitamento: Math.round((this.questoesCorretas / this.questoesRespondidas) * 100),
      etapasCompletadas: this.etapasCompletadas.length,
      imagensGeradas: this.imagensGeradas.length,
      audiosAnalisados: this.audiosAnalisados.length,
      bonusDetalhado: {
        pontosBase,
        bonusEtapas,
        bonusImagens,
        bonusAudios
      }
    };
  }
}
