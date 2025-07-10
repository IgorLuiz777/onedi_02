import OpenAI from 'openai';
import { adicionarVocabulario, buscarPalavrasRevisao, registrarSessaoEstudo, salvarProgressoLicao } from './database.js';
import { obterProximaAula, obterAulaPorId, calcularProgressoNivel } from './lessonProgression.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Função para validar se a mensagem faz sentido
async function validarMensagemSentido(mensagem, idioma) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um validador de mensagens para aprendizado de ${idioma}.

          Analise se a mensagem do usuário faz sentido ou é apenas caracteres aleatórios/palavras sem significado.

          CRITÉRIOS PARA MENSAGEM VÁLIDA:
          - Contém palavras reais em qualquer idioma
          - Tem estrutura de frase, mesmo que simples
          - Expressa uma ideia, mesmo que básica
          - Pode ter erros gramaticais (isso é normal no aprendizado)

          CRITÉRIOS PARA MENSAGEM INVÁLIDA:
          - Apenas caracteres aleatórios (ex: "fksadklfdjjkl", "asdasd", "123456")
          - Sequências sem sentido
          - Apenas símbolos ou números
          - Spam de caracteres

          Responda APENAS com:
          VÁLIDA - se a mensagem faz sentido
          INVÁLIDA - se é apenas caracteres aleatórios

          Se INVÁLIDA, adicione após uma quebra de linha uma sugestão de correção em português.`
        },
        {
          role: 'user',
          content: `Mensagem para validar: "${mensagem}"`
        }
      ],
      temperature: 0.1,
      max_tokens: 150
    });

    const resposta = completion.choices[0].message.content.trim();

    if (resposta.startsWith('INVÁLIDA')) {
      const partes = resposta.split('\n');
      const sugestao = partes.length > 1 ? partes[1] : 'Tente escrever uma frase com palavras reais.';
      return {
        valida: false,
        sugestao: sugestao
      };
    }

    return { valida: true };

  } catch (error) {
    console.error('Erro ao validar mensagem:', error);
    // Em caso de erro, considera válida para não bloquear o fluxo
    return { valida: true };
  }
}

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

      METODOLOGIA DE AULA GUIADA INTERATIVA APRIMORADA:

      ${nivel === 'intermediário' || nivel === 'avançado' ?
        `IMPORTANTE: A partir do nível intermediário, conduza a aula majoritariamente em ${idioma}. Use português apenas para explicações essenciais ou quando o aluno demonstrar dificuldade. Todas as instruções, perguntas e feedbacks devem ser preferencialmente em ${idioma}.` :
        `IMPORTANTE: Para níveis iniciante e básico, use uma abordagem bilíngue equilibrada - explique conceitos em ${idioma} e depois em português para garantir compreensão.`
      }

      🎯 ESTRUTURA DA AULA APRIMORADA (siga esta sequência rigorosamente):
      1. ABERTURA_AULA - Apresente o tópico e objetivos de forma motivadora
      2. EXPLICACAO_CONCEITUAL - Explique o conceito principal com exemplos claros
      3. DEMONSTRACAO_PRATICA - Demonstre o uso prático com situações reais
      4. EXERCICIO_GUIADO - Exercício passo a passo com o aluno
      5. QUIZ_INTERATIVO - Questões de múltipla escolha progressivas
      6. ATIVIDADE_VISUAL - Gere e explore imagem educativa
      7. PRATICA_ORAL - Exercício de pronúncia com feedback
      8. PRODUCAO_TEXTUAL - Criação de frases/textos pelo aluno
      9. CORRECAO_DETALHADA - Correção explicativa e construtiva
      10. CONSOLIDACAO - Revisão e conexão com conhecimentos anteriores
      11. AVALIACAO_PROGRESSO - Avaliação do aprendizado e próximos passos

      📚 INSTRUÇÕES ESPECÍFICAS POR ETAPA:

      ABERTURA_AULA:
      - Cumprimente o aluno de forma calorosa
      - Apresente o tópico da aula de forma clara e motivadora
      - Explique brevemente o que será aprendido
      - Conecte com aulas anteriores se relevante
      - Use emojis para tornar mais atrativo

      EXPLICACAO_CONCEITUAL:
      - Explique o conceito principal de forma didática
      - Use linguagem apropriada ao nível do aluno
      - Forneça 2-3 exemplos claros e contextualizados
      - Destaque pontos importantes com formatação
      - Termine com: "👉 Agora vamos ver isso na prática!"

      DEMONSTRACAO_PRATICA:
      - Mostre o uso em situações reais e cotidianas
      - Use exemplos variados e interessantes
      - Explique o "porquê" por trás das regras
      - Termine com: "✍️ Sua vez de praticar!"

      EXERCICIO_GUIADO:
      - Proponha um exercício simples e claro
      - Dê instruções específicas sobre o que fazer
      - Use frases como: "👉 Complete a frase:", "✍️ Escreva uma resposta usando..."
      - Aguarde a resposta antes de prosseguir

      QUIZ_INTERATIVO:
      - Crie 3-4 questões de múltipla escolha com alternativas: A) B) C) D)
      - Questões progressivas em dificuldade
      - Feedback imediato com explicação detalhada
      - Use: "📝 Escolha a opção correta:"

      ATIVIDADE_VISUAL:
      - Descreva que tipo de imagem será gerada
      - Use o comando: [GERAR_IMAGEM: descrição detalhada e educativa]
      - Após gerar, peça: "🖼️ Descreva o que você vê na imagem usando o vocabulário da aula!"

      PRATICA_ORAL:
      - Escolha palavras/frases específicas para pronúncia
      - Use o comando: [SOLICITAR_AUDIO: texto_para_pronunciar]
      - Dê instruções claras: "🎤 Grave um áudio pronunciando claramente:"
      - Forneça dicas de pronúncia quando necessário

      PRODUCAO_TEXTUAL:
      - Peça para criar frases originais usando o conteúdo aprendido
      - Varie os tipos: afirmativas, negativas, interrogativas
      - Use: "✍️ Crie uma frase usando...", "📝 Escreva um diálogo curto..."
      - Seja específico sobre o que espera

      CORRECAO_DETALHADA:
      - SEMPRE corrija erros de forma construtiva
      - Explique o erro em português e a forma correta em ${idioma}
      - Use emojis positivos mesmo ao corrigir: ✅ ❌ 💡
      - Forneça exemplos adicionais quando necessário
      - Termine com encorajamento

      CONSOLIDACAO:
      - Resuma os pontos principais da aula
      - Conecte com conhecimentos anteriores
      - Destaque o progresso do aluno
      - Use: "🎯 Hoje você aprendeu:", "🔗 Isso se conecta com..."

      AVALIACAO_PROGRESSO:
      - Avalie o desempenho do aluno na aula
      - Identifique pontos fortes e áreas para melhoria
      - Sugira próximos passos
      - Termine de forma motivadora

      ✅ REGRAS DE CORREÇÃO OBRIGATÓRIAS:
      - TODA resposta incorreta deve ser corrigida imediatamente
      - Explique o erro de forma didática, não apenas aponte
      - Forneça a versão correta com explicação
      - Use tom encorajador: "Quase lá! O correto seria..."
      - Reforce com exemplo adicional se necessário

      🎯 INSTRUÇÕES CLARAS OBRIGATÓRIAS:
      - SEMPRE deixe claro o que o aluno deve fazer em seguida
      - Use verbos de ação específicos: "Envie", "Escreva", "Escolha", "Grave"
      - Nunca deixe o aluno sem saber qual é o próximo passo
      - Use formatação para destacar instruções: **negrito**, emojis

      🧠 ADAPTAÇÃO INTELIGENTE:
      - Se o aluno erra muito, simplifique e dê mais exemplos
      - Se acerta tudo, aumente gradualmente a dificuldade
      - Repita conceitos quando necessário de forma variada
      - Mantenha o ritmo adequado ao nível do aluno

      📊 GAMIFICAÇÃO E MOTIVAÇÃO:
      - Use pontuação e feedback positivo
      - Celebre acertos com entusiasmo: "🎉 Excelente!", "👏 Perfeito!"
      - Para erros: "💪 Vamos tentar novamente!", "🎯 Quase lá!"
      - Mantenha o aluno engajado e motivado

      IMPORTANTE: Você deve conduzir a aula passo a passo, seguindo rigorosamente a estrutura definida. Nunca pule etapas. Sempre indique claramente qual etapa está executando e o que o aluno deve fazer.
    `,
    user: (mensagem, aulaAtual, etapaAula) => `
      CONTEXTO DA AULA: ${aulaAtual.topico} - ${aulaAtual.conteudo}
      ETAPA ATUAL: ${etapaAula}

      Resposta do aluno: "${mensagem}"

      Continue a aula seguindo a metodologia estruturada aprimorada. Conduza a próxima etapa apropriada com instruções claras e específicas.
    `
  },

  pratica_livre: {
    system: (professor, idioma, nome, nivel) => `
      Você é ${professor}, conversando naturalmente com ${nome} em ${idioma}.
      Nível do aluno: ${nivel}.

      INSTRUÇÕES APRIMORADAS:
      - Mantenha uma conversa natural e fluida em ${idioma}
      - Use temas atuais, interessantes e relevantes para o aluno
      - Corrija erros de forma sutil, reformulando a frase correta
      - Adapte seu vocabulário e complexidade ao nível do aluno
      - Seja amigável, encorajador e paciente
      - Faça perguntas abertas para manter a conversa fluindo
      - Introduza novo vocabulário gradualmente
      - Forneça feedback construtivo quando apropriado
    `,
    user: (mensagem) => `Continue esta conversa natural de forma engajante: "${mensagem}"`
  },

  modo_professor: {
    system: (professor, idioma, nome, nivel) => `
      Você é ${professor}, um especialista em ${idioma} dando explicações detalhadas para ${nome}.
      Nível: ${nivel}.

      INSTRUÇÕES APRIMORADAS:
      - Responda em ${idioma} com explicações claras e estruturadas
      - Forneça exemplos práticos e contextualizados
      - Explique regras gramaticais de forma didática
      - Use analogias e comparações para facilitar o entendimento
      - Seja paciente e extremamente detalhado nas explicações
      - Ofereça exercícios práticos quando apropriado
      - Use formatação para destacar pontos importantes
      - Termine sempre com uma pergunta para verificar compreensão
    `,
    user: (mensagem) => `Explique de forma detalhada e didática sobre: "${mensagem}"`
  },

  modo_vocabulario: {
    system: (professor, idioma, nome, nivel) => `
      Você é ${professor} ensinando vocabulário em ${idioma} para ${nome}.
      Nível: ${nivel}.

      INSTRUÇÕES APRIMORADAS:
      - Apresente 3-5 palavras novas por sessão de forma organizada
      - Dê exemplos de uso em frases variadas e contextualizadas
      - Crie associações, dicas de memorização e mnemônicos
      - Use técnicas de repetição espaçada
      - Implemente gamificação com desafios e recompensas
      - Conecte palavras novas com vocabulário já conhecido
      - Responda sempre em ${idioma} com traduções quando necessário
      - Termine com exercícios práticos de fixação
    `,
    user: (mensagem) => `Ensine vocabulário relacionado a: "${mensagem}" de forma estruturada e memorável`
  }
};

export async function processarModoEstudo(estado, mensagem, usuarioBanco) {
  const { modo, idioma, professor, nome } = estado;
  const nivel = usuarioBanco?.nivel || 'iniciante';

  // Valida se a mensagem faz sentido
  const validacao = await validarMensagemSentido(mensagem, idioma);

  if (!validacao.valida) {
    return {
      resposta: `❌ **Mensagem não compreendida**\n\n🤖 **Detectei que sua mensagem pode conter apenas caracteres aleatórios ou não formar palavras reais.**\n\n💡 **Sugestão:** ${validacao.sugestao}\n\n📝 **Exemplo de mensagem válida:**\n• "Hello, how are you?" (${idioma})\n• "Olá, como você está?" (Português)\n• "I want to learn about..." (${idioma})\n\n🎯 **Tente novamente com uma frase que faça sentido!**`,
      incluirTraducao: false,
      incluirAudio: false,
      mensagemInvalida: true
    };
  }

  // Otimização: usar thread_id para manter contexto e economizar tokens
  if (modo === 'aula_guiada') {
    return await processarAulaGuiadaAprimorada(estado, mensagem, usuarioBanco);
  }

  const promptConfig = promptsModos[modo];
  if (!promptConfig) {
    throw new Error(`Modo de estudo inválido: ${modo}`);
  }

  if (modo === 'modo_vocabulario') {
    if (!estado.threadIdVocabulario) estado.threadIdVocabulario = null;

    const systemPrompt = `Você é ${professor}, especialista em ensino de vocabulário de ${idioma} para ${nome} (nível: ${nivel}).

        INSTRUÇÕES:
        - Apresente 3 a 5 palavras novas por sessão, cada uma com tradução em português.
        - Para cada palavra, forneça:
          • Tradução
          • Exemplo de uso contextualizado em frase
          • Dica de memorização ou associação
        - Após apresentar as palavras, proponha exercícios de repetição espaçada:
          • Peça para o aluno repetir as palavras
          • Peça para criar frases usando as palavras
          • Faça perguntas para revisar o significado
        - Sempre responda em ${idioma} e forneça tradução quando necessário.
        - Mantenha o contexto da thread para revisar e reforçar palavras já apresentadas.
        - Use gamificação: pontos, desafios, elogios.
        - Nunca repita as mesmas palavras em sessões consecutivas.
        - No final, proponha um mini-desafio de fixação.
        `;
            const userPrompt = `Tema ou contexto desejado: "${mensagem}"
        Se já houver palavras em revisão, reforce-as antes de apresentar novas.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300,
        ...(estado.threadIdVocabulario ? { thread_id: estado.threadIdVocabulario } : {})
      });

      const resposta = completion.choices[0].message.content;
      if (!estado.threadIdVocabulario && completion.thread_id) {
        estado.threadIdVocabulario = completion.thread_id;
      }

      await extrairEAdicionarVocabulario(resposta, usuarioBanco.id, idioma);

      return {
        resposta,
        incluirTraducao: true,
        incluirAudio: true
      };
    } catch (error) {
      console.error('Erro ao processar modo_vocabulario:', error);
      throw error;
    }
  }

  try {
    // Reduzido: não envia system prompt gigante, só o essencial
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

// --- OTIMIZAÇÃO AULA GUIADA ---
async function processarAulaGuiadaAprimorada(estado, mensagem, usuarioBanco) {
  const { idioma, professor, nome } = estado;
  const nivel = usuarioBanco?.nivel || 'iniciante';

  // Obtém a aula atual do usuário
  const aulaAtualId = usuarioBanco?.aula_atual || 1;
  const aulaAtual = obterAulaPorId(idioma, aulaAtualId) || obterProximaAula(idioma, 0);

  // Determina a etapa da aula baseada no progresso
  const etapaAula = determinarEtapaAulaAprimorada(mensagem, estado.etapaAulaAtual || 'ABERTURA_AULA');

  // --- ECONOMIA DE TOKENS: Envia só o resumo da última etapa e contexto mínimo ---
  // Salva e reutiliza thread_id para manter a mesma conversa
  if (!estado.threadIdAulaGuiada) estado.threadIdAulaGuiada = null;

  // Monta prompt reduzido
  const systemPrompt = `Você é ${professor}, professor de ${idioma}. Aula: ${aulaAtual.topico}. Etapa: ${etapaAula}. Nível: ${nivel}. Responda de forma didática, clara e curta, sem repetir instruções já dadas. Corrija e avance para a próxima etapa se apropriado.`;
  const userPrompt = `Aluno: ${nome}\nMensagem: ${mensagem}\nEtapa: ${etapaAula}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 300,
      ...(estado.threadIdAulaGuiada ? { thread_id: estado.threadIdAulaGuiada } : {})
    });

    let resposta = completion.choices[0].message.content;

    // Salva o thread_id retornado, se for a primeira vez
    if (!estado.threadIdAulaGuiada && completion.thread_id) {
      estado.threadIdAulaGuiada = completion.thread_id;
    }

    // Processa comandos especiais na resposta
    const resultado = await processarComandosEspeciaisAprimorados(resposta, idioma, aulaAtual);

    // Atualiza a etapa da aula no estado
    estado.etapaAulaAtual = proximaEtapaAulaAprimorada(etapaAula);

    // Salva progresso da aula com mais detalhes
    await salvarProgressoLicao(usuarioBanco.id, `aula_${aulaAtual.id}`, 'aula_guiada', {
      questoesRespondidas: 1,
      questoesCorretas: resultado.respostaCorreta ? 1 : 0,
      tempoGasto: 3,
      completada: etapaAula === 'AVALIACAO_PROGRESSO'
    });

    // Extrai vocabulário da resposta
    await extrairEAdicionarVocabulario(resposta, usuarioBanco.id, idioma);

    return {
      resposta: resultado.resposta,
      aulaAtual: aulaAtual,
      imagemGerada: resultado.imagemGerada,
      audioSolicitado: resultado.audioSolicitado,
      etapaAtual: etapaAula,
      proximaEtapa: estado.etapaAulaAtual,
      incluirTraducao: nivel === 'iniciante' || nivel === 'básico',
      incluirAudio: true
    };

  } catch (error) {
    console.error('Erro ao processar aula guiada aprimorada:', error);
    throw error;
  }
}

function determinarEtapaAulaAprimorada(mensagem, etapaAtual) {
  const etapas = [
    'ABERTURA_AULA',
    'EXPLICACAO_CONCEITUAL',
    'DEMONSTRACAO_PRATICA',
    'EXERCICIO_GUIADO',
    'QUIZ_INTERATIVO',
    'ATIVIDADE_VISUAL',
    'PRATICA_ORAL',
    'PRODUCAO_TEXTUAL',
    'CORRECAO_DETALHADA',
    'CONSOLIDACAO',
    'AVALIACAO_PROGRESSO'
  ];

  // Se é a primeira mensagem da aula, começa pela abertura
  if (!mensagem || mensagem.toLowerCase().includes('começar') ||
      mensagem.toLowerCase().includes('iniciar') ||
      mensagem.toLowerCase().includes('start')) {
    return 'ABERTURA_AULA';
  }

  // Avança para a próxima etapa baseada na atual
  const indiceAtual = etapas.indexOf(etapaAtual);
  if (indiceAtual >= 0 && indiceAtual < etapas.length - 1) {
    return etapas[indiceAtual + 1];
  }

  return etapaAtual;
}

function proximaEtapaAulaAprimorada(etapaAtual) {
  const etapas = [
    'ABERTURA_AULA',
    'EXPLICACAO_CONCEITUAL',
    'DEMONSTRACAO_PRATICA',
    'EXERCICIO_GUIADO',
    'QUIZ_INTERATIVO',
    'ATIVIDADE_VISUAL',
    'PRATICA_ORAL',
    'PRODUCAO_TEXTUAL',
    'CORRECAO_DETALHADA',
    'CONSOLIDACAO',
    'AVALIACAO_PROGRESSO'
  ];

  const indiceAtual = etapas.indexOf(etapaAtual);
  if (indiceAtual >= 0 && indiceAtual < etapas.length - 1) {
    return etapas[indiceAtual + 1];
  }

  return 'AVALIACAO_PROGRESSO'; // Última etapa
}

async function processarComandosEspeciaisAprimorados(resposta, idioma, aulaAtual) {
  let respostaProcessada = resposta;
  let imagemGerada = null;
  let audioSolicitado = null;
  let respostaCorreta = true; // Assume correto por padrão

  // Processa comando de geração de imagem
  const regexImagem = /\[GERAR_IMAGEM:\s*([^\]]+)\]/g;
  const matchImagem = regexImagem.exec(resposta);

  if (matchImagem) {
    const descricaoImagem = matchImagem[1];
    try {
      imagemGerada = await gerarImagemEducativaAprimorada(descricaoImagem, idioma, aulaAtual);
      respostaProcessada = resposta.replace(matchImagem[0],
        `\n🖼️ **Imagem Educativa Gerada!**\n\n📸 Observe atentamente a imagem que criei para ilustrar nosso tópico de hoje.\n\n👉 **Sua tarefa agora:** Descreva detalhadamente o que você vê na imagem, usando o vocabulário e estruturas que acabamos de aprender!\n\n💡 **Dica:** Tente usar pelo menos 3-4 frases completas em sua descrição.`
      );
    } catch (error) {
      console.error('Erro ao gerar imagem:', error);
      respostaProcessada = resposta.replace(matchImagem[0],
        '🖼️ **Ops!** Não foi possível gerar a imagem no momento, mas vamos continuar nossa aula de forma dinâmica!'
      );
    }
  }

  // Processa comando de solicitação de áudio
  const regexAudio = /\[SOLICITAR_AUDIO:\s*([^\]]+)\]/g;
  const matchAudio = regexAudio.exec(resposta);

  if (matchAudio) {
    audioSolicitado = matchAudio[1];
    respostaProcessada = resposta.replace(matchAudio[0],
      `\n🎤 **Exercício de Pronúncia Personalizado!**\n\n📢 **Grave um áudio pronunciando claramente:**\n"${matchAudio[1]}"\n\n💡 **Dicas importantes:**\n• Fale devagar e com clareza\n• Pronuncie cada palavra distintamente\n• Mantenha um tom natural\n\n🎯 Vou analisar sua pronúncia e dar feedback detalhado!`
    );
  }

  return {
    resposta: respostaProcessada,
    imagemGerada,
    audioSolicitado,
    respostaCorreta
  };
}

async function gerarImagemEducativaAprimorada(descricao, idioma, aulaAtual) {
  try {
    const promptImagem = `Create a high-quality educational illustration for ${idioma} language learning.

    Topic: ${aulaAtual.topico}
    Content: ${aulaAtual.conteudo}

    Visual description: ${descricao}

    Style requirements:
    - Professional, modern, and visually appealing
    - Suitable for adult learners (ages 16-60)
    - Clean, elegant design with good contrast
    - Educational and informative visual elements
    - No text overlays in the image
    - Realistic style with clear, identifiable objects/scenes
    - Bright, engaging colors that aid learning
    - Focus on visual elements that support language comprehension

    The image should clearly illustrate the concept being taught and be easily describable by language learners.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: promptImagem,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "vivid"
    });

    return {
      url: response.data[0].url,
      descricao: descricao,
      topico: aulaAtual.topico,
      conteudo: aulaAtual.conteudo
    };
  } catch (error) {
    console.error('Erro ao gerar imagem educativa aprimorada:', error);
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
    const analise = await analisarPronunciaComIAAprimorada(transcricao, textoEsperado, idioma);

    return {
      transcricao: transcricao,
      textoEsperado: textoEsperado,
      analise: analise,
      pontuacao: calcularPontuacaoPronunciaAprimorada(transcricao, textoEsperado)
    };
  } catch (error) {
    console.error('Erro ao analisar áudio:', error);
    throw error;
  }
}

async function analisarPronunciaComIAAprimorada(transcricao, textoEsperado, idioma) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em fonética e pronúncia de ${idioma}. Analise detalhadamente a pronúncia do aluno.

          INSTRUÇÕES PARA ANÁLISE:
          - Compare a transcrição com o texto esperado palavra por palavra
          - Identifique erros específicos de pronúncia, entonação e ritmo
          - Dê feedback construtivo, específico e encorajador
          - Sugira técnicas práticas de melhoria
          - Use uma escala de 0-100 para avaliar a pronúncia
          - Destaque pontos positivos antes de mencionar melhorias
          - Use emojis para tornar o feedback mais amigável
          - Responda em português de forma didática

          FORMATO DA RESPOSTA:
          🎯 Pontuação: [0-100]

          ✅ Pontos positivos: [o que o aluno fez bem]

          🔧 Áreas para melhoria: [erros específicos e como corrigir]

          💡 Dicas práticas: [técnicas específicas de pronúncia]

          🎵 Exercício recomendado: [prática específica para melhorar]`
        },
        {
          role: 'user',
          content: `Idioma: ${idioma}
          Texto esperado: "${textoEsperado}"
          O que o aluno disse: "${transcricao}"

          Analise a pronúncia e forneça feedback detalhado e construtivo.`
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao analisar pronúncia com IA aprimorada:', error);
    return 'Não foi possível analisar a pronúncia no momento. Tente novamente!';
  }
}

function calcularPontuacaoPronunciaAprimorada(transcricao, textoEsperado) {
  // Algoritmo aprimorado de similaridade
  const palavrasEsperadas = textoEsperado.toLowerCase().trim().split(/\s+/);
  const palavrasTranscritas = transcricao.toLowerCase().trim().split(/\s+/);

  let pontuacaoTotal = 0;
  const totalPalavras = palavrasEsperadas.length;

  for (let i = 0; i < totalPalavras; i++) {
    const palavraEsperada = palavrasEsperadas[i];
    const palavraTranscrita = palavrasTranscritas[i] || '';

    if (palavraEsperada === palavraTranscrita) {
      pontuacaoTotal += 100; // Palavra perfeita
    } else if (palavraTranscrita.includes(palavraEsperada) || palavraEsperada.includes(palavraTranscrita)) {
      pontuacaoTotal += 70; // Palavra similar
    } else {
      // Calcula similaridade por caracteres
      const similaridade = calcularSimilaridadeCaracteres(palavraEsperada, palavraTranscrita);
      pontuacaoTotal += similaridade;
    }
  }

  // Penaliza se há palavras extras ou faltando
  const diferencaTamanho = Math.abs(palavrasEsperadas.length - palavrasTranscritas.length);
  const penalidade = diferencaTamanho * 10;

  const pontuacaoFinal = Math.max(0, Math.round((pontuacaoTotal / totalPalavras) - penalidade));
  return Math.min(100, pontuacaoFinal);
}

function calcularSimilaridadeCaracteres(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 100 : 0;
  if (len2 === 0) return 0;

  let matches = 0;
  const maxLen = Math.max(len1, len2);

  for (let i = 0; i < Math.min(len1, len2); i++) {
    if (str1[i] === str2[i]) matches++;
  }

  return Math.round((matches / maxLen) * 100);
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

function gerarHistoricoAulasDetalhado(idioma, aulaAtualId) {
  let historico = "📚 Contexto das aulas anteriores:\n";

  for (let i = Math.max(1, aulaAtualId - 3); i < aulaAtualId; i++) {
    const aula = obterAulaPorId(idioma, i);
    if (aula) {
      historico += `✅ Aula ${aula.id}: ${aula.topico}\n   Conteúdo: ${aula.conteudo}\n   Nível: ${aula.nivel}\n\n`;
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
          content: `Extraia as 3-5 palavras mais importantes e úteis desta resposta em ${idioma} e forneça suas traduções precisas em português.

                   Critérios para seleção:
                   - Palavras novas ou importantes para o aprendizado
                   - Vocabulário relevante para o nível do aluno
                   - Termos que aparecem no contexto da aula

                   Formato: palavra1:tradução1|palavra2:tradução2|palavra3:tradução3
                   Máximo 5 palavras, mínimo 3.`
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
      if (palavra && traducao && palavra.trim().length > 1) {
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
          content: `Traduza o seguinte texto de ${idiomaOrigem} para português brasileiro de forma natural e contextual.

                   Instruções:
                   - Mantenha o tom e estilo do texto original
                   - Use linguagem natural e fluente
                   - Preserve formatação e emojis quando relevantes
                   - Forneça apenas a tradução, sem explicações adicionais`
        },
        {
          role: 'user',
          content: texto
        }
      ],
      temperature: 0.3,
      max_tokens: 300
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
      mensagem: '🎉 Parabéns! Você não tem palavras para revisar no momento.\n\n💡 Continue estudando para adicionar mais vocabulário ao seu repertório!'
    };
  }

  let mensagemRevisao = `📖 **Revisão de Vocabulário**\n\nVamos revisar ${palavras.length} palavras importantes:\n\n`;

  palavras.forEach((palavra, index) => {
    mensagemRevisao += `${index + 1}. **${palavra.palavra}** - ${palavra.traducao}\n`;
  });

  mensagemRevisao += `\n💪 **Desafio:** Crie uma frase usando pelo menos 2 dessas palavras!`;

  return {
    tipo: 'revisao',
    palavras: palavras,
    mensagem: mensagemRevisao
  };
}

export class SessaoAulaGuiada {
  constructor(usuarioId, idioma) {
    this.usuarioId = usuarioId;
    this.idioma = idioma;
    this.questoesRespondidas = 0;
    this.questoesCorretas = 0;
    this.inicioSessao = new Date();
    this.maxQuestoes = 30; // Aumentado para acomodar mais interações
    this.maxTempo = 50; // Aumentado para 50 minutos
    this.etapasCompletadas = [];
    this.imagensGeradas = [];
    this.audiosAnalisados = [];
    this.errosCorrigidos = [];
    this.vocabularioAprendido = [];
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
    this.imagensGeradas.push({
      ...imagem,
      timestamp: new Date()
    });
  }

  adicionarAudioAnalisado(analise) {
    this.audiosAnalisados.push({
      ...analise,
      timestamp: new Date()
    });
  }

  adicionarErroCorrigido(erro) {
    this.errosCorrigidos.push({
      erro: erro,
      timestamp: new Date()
    });
  }

  adicionarVocabularioAprendido(palavras) {
    this.vocabularioAprendido.push(...palavras);
  }

  verificarLimites() {
    const tempoDecorrido = (new Date() - this.inicioSessao) / (1000 * 60);
    const etapasObrigatorias = [
      'ABERTURA_AULA',
      'EXPLICACAO_CONCEITUAL',
      'EXERCICIO_GUIADO',
      'QUIZ_INTERATIVO',
      'PRODUCAO_TEXTUAL'
    ];
    const etapasObrigatoriasCompletas = etapasObrigatorias.every(etapa =>
      this.etapasCompletadas.includes(etapa)
    );

    return {
      atingiuLimite: (this.questoesRespondidas >= this.maxQuestoes || tempoDecorrido >= this.maxTempo) && etapasObrigatoriasCompletas,
      questoesRestantes: Math.max(0, this.maxQuestoes - this.questoesRespondidas),
      tempoRestante: Math.max(0, this.maxTempo - Math.floor(tempoDecorrido)),
      etapasCompletadas: this.etapasCompletadas.length,
      etapasObrigatoriasCompletas,
      progressoDetalhado: {
        imagensGeradas: this.imagensGeradas.length,
        audiosAnalisados: this.audiosAnalisados.length,
        errosCorrigidos: this.errosCorrigidos.length,
        vocabularioAprendido: this.vocabularioAprendido.length
      }
    };
  }

  async finalizarSessao() {
    const duracaoMinutos = Math.floor((new Date() - this.inicioSessao) / (1000 * 60));
    const pontosBase = this.questoesCorretas * 12;
    const bonusEtapas = this.etapasCompletadas.length * 8;
    const bonusImagens = this.imagensGeradas.length * 15;
    const bonusAudios = this.audiosAnalisados.length * 20;
    const bonusCorrecoes = this.errosCorrigidos.length * 5;
    const bonusVocabulario = this.vocabularioAprendido.length * 3;

    const pontosGanhos = pontosBase + bonusEtapas + bonusImagens + bonusAudios + bonusCorrecoes + bonusVocabulario;

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
      aproveitamento: this.questoesRespondidas > 0 ? Math.round((this.questoesCorretas / this.questoesRespondidas) * 100) : 0,
      etapasCompletadas: this.etapasCompletadas.length,
      imagensGeradas: this.imagensGeradas.length,
      audiosAnalisados: this.audiosAnalisados.length,
      errosCorrigidos: this.errosCorrigidos.length,
      vocabularioAprendido: this.vocabularioAprendido.length,
      bonusDetalhado: {
        pontosBase,
        bonusEtapas,
        bonusImagens,
        bonusAudios,
        bonusCorrecoes,
        bonusVocabulario
      }
    };
  }
}
