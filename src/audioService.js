import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const idiomasCodigos = {
  inglês: 'en',
  ingles: 'en',
  espanhol: 'es',
  francês: 'fr',
  frances: 'fr',
  mandarim: 'zh',
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const openaiVoicesGenero = {
  inglês: {
    masculino: 'onyx',
    feminino: 'nova',
  },
  ingles: {
    masculino: 'onyx',
    feminino: 'nova',
  },
  espanhol: {
    masculino: 'echo',
    feminino: 'shimmer',
  },
  francês: {
    masculino: 'alloy',
    feminino: 'nova',
  },
  frances: {
    masculino: 'alloy',
    feminino: 'nova',
  },
  mandarim: {
    masculino: 'echo',
    feminino: 'shimmer',
  },
};

const velocidadePorIdioma = {
  inglês: 0.95,
  ingles: 0.95,
  espanhol: 0.9,
  francês: 0.9,
  frances: 0.9,
  mandarim: 0.85,
};

export async function gerarAudio(
  texto,
  idioma,
  nomeArquivo,
  genero = 'feminino',
  speedOverride = null
) {
  const codigoIdioma = idiomasCodigos[idioma.toLowerCase()] || 'en';
  const idiomaKey = idioma.toLowerCase();
  const generoKey = (genero || 'feminino').toLowerCase();

  let voice = 'nova'; // padrão otimizado
  if (
    openaiVoicesGenero[idiomaKey] &&
    openaiVoicesGenero[idiomaKey][generoKey]
  ) {
    voice = openaiVoicesGenero[idiomaKey][generoKey];
  }

  const speed = speedOverride || velocidadePorIdioma[idiomaKey] || 0.9;

  const textoOtimizado = otimizarTextoParaAudioAprimorado(texto, idiomaKey);

  try {
    console.log(
      `🎙️ Gerando áudio aprimorado: Idioma=${idioma}, Voz=${voice}, Velocidade=${speed}`
    );

    const response = await openai.audio.speech.create({
      model: 'tts-1-hd',
      input: textoOtimizado,
      voice: voice,
      response_format: 'mp3',
      speed: speed,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`✅ Áudio gerado com sucesso: ${buffer.length} bytes`);
    return buffer;
  } catch (err) {
    console.error('❌ Erro ao gerar áudio com OpenAI:', err);
    throw err;
  }
}

// Função COMPLETAMENTE REFATORADA usando downloadMedia direto
export async function processarAudioAlunoDirecto(client, message, idioma) {
  console.log(`🎤 Iniciando processamento direto de áudio do WhatsApp`);

  try {
    // 1. Baixa o áudio diretamente do WhatsApp
    console.log(`📥 Baixando mídia do WhatsApp...`);
    const mediaData = await client.downloadMedia(message);

    if (!mediaData) {
      throw new Error('Não foi possível baixar a mídia do WhatsApp');
    }

    console.log(`📊 Mídia baixada: ${mediaData.length} caracteres`);

    // 2. Extrai o buffer do base64
    let audioBuffer;
    if (mediaData.includes(';base64,')) {
      // Remove o prefixo data:audio/...;base64,
      const base64Data = mediaData.split(';base64,').pop();
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // Se já é base64 puro
      audioBuffer = Buffer.from(mediaData, 'base64');
    }

    console.log(`🔍 Buffer extraído: ${audioBuffer.length} bytes`);

    // 3. Validações básicas
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Buffer de áudio vazio ou inválido');
    }

    if (audioBuffer.length < 100) {
      throw new Error('Arquivo de áudio muito pequeno (possivelmente corrompido)');
    }

    // 4. Detecta o tipo de áudio
    const tipoDetectado = detectarTipoAudioRobusto(audioBuffer);
    console.log(`🎵 Tipo detectado: ${tipoDetectado}`);

    // 5. Cria diretório temporário
    const tempDir = path.join(__dirname, '..', 'temp', 'audio');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 6. Lista de formatos para tentar
    const formatosTentativa = [
      tipoDetectado,
      'wav',
      'mp3',
      'ogg',
      'webm',
      'm4a'
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 6);
    let ultimoErro = null;

    // 7. Tenta cada formato até funcionar
    for (const formato of formatosTentativa) {
      const nomeArquivo = `whatsapp_audio_${timestamp}_${randomId}.${formato}`;
      const caminhoArquivo = path.join(tempDir, nomeArquivo);

      try {
        console.log(`🔄 Tentando formato: ${formato}`);

        // Salva o buffer como arquivo
        fs.writeFileSync(caminhoArquivo, audioBuffer);
        console.log(`📁 Arquivo salvo: ${nomeArquivo} (${audioBuffer.length} bytes)`);

        // Verifica se foi criado corretamente
        if (!fs.existsSync(caminhoArquivo)) {
          throw new Error('Falha ao criar arquivo temporário');
        }

        const stats = fs.statSync(caminhoArquivo);
        if (stats.size === 0) {
          throw new Error('Arquivo criado está vazio');
        }

        console.log(`✅ Arquivo verificado: ${stats.size} bytes`);

        // Cria stream para o Whisper
        const audioStream = fs.createReadStream(caminhoArquivo);
        audioStream.path = nomeArquivo;

        // Parâmetros otimizados para Whisper
        const whisperParams = {
          file: audioStream,
          model: 'whisper-1',
          language: obterCodigoIdioma(idioma),
          response_format: 'verbose_json',
          temperature: 0.2,
          prompt: gerarPromptContextual(idioma)
        };

        console.log(`🤖 Enviando para Whisper (formato: ${formato})...`);

        // Envia para Whisper
        const response = await openai.audio.transcriptions.create(whisperParams);

        console.log(`✅ Transcrição bem-sucedida: "${response.text}"`);

        // Remove arquivo temporário
        try {
          fs.unlinkSync(caminhoArquivo);
          console.log(`🗑️ Arquivo temporário removido`);
        } catch (cleanupError) {
          console.warn(`⚠️ Erro ao remover arquivo: ${cleanupError.message}`);
        }

        // Retorna resultado estruturado
        return {
          texto: response.text || '',
          confianca: response.segments
            ? response.segments.reduce((acc, seg) => acc + (seg.avg_logprob || 0), 0) / response.segments.length
            : 0.8,
          duracao: response.duration || 0,
          idioma: response.language || idioma,
          formato: formato,
          metodo: 'whatsapp_direto',
          qualidade: 'alta'
        };

      } catch (error) {
        ultimoErro = error;
        console.log(`❌ Falha com formato ${formato}: ${error.message}`);

        // Remove arquivo em caso de erro
        try {
          if (fs.existsSync(caminhoArquivo)) {
            fs.unlinkSync(caminhoArquivo);
          }
        } catch (cleanupError) {
          console.warn(`⚠️ Erro ao limpar: ${cleanupError.message}`);
        }

        // Continua tentando outros formatos
        continue;
      }
    }

    // Se chegou aqui, todos os formatos falharam
    console.error(`❌ Todos os formatos falharam. Último erro:`, ultimoErro);
    throw new Error(`Não foi possível processar o áudio. Formatos tentados: ${formatosTentativa.join(', ')}. Último erro: ${ultimoErro?.message || 'Desconhecido'}`);

  } catch (error) {
    console.error('❌ Erro no processamento direto de áudio:', error);
    throw error;
  }
}

// Função de compatibilidade (mantém a interface antiga)
export async function processarAudioAluno(audioBuffer, idioma, mimetype = 'audio/wav') {
  console.log(`🔄 Usando processamento de buffer direto: ${audioBuffer.length} bytes`);

  // Validações básicas
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Buffer de áudio vazio ou inválido');
  }

  if (audioBuffer.length < 100) {
    throw new Error('Arquivo de áudio muito pequeno (possivelmente corrompido)');
  }

  // Detecta o tipo de áudio
  const tipoDetectado = detectarTipoAudioRobusto(audioBuffer);
  let fileExt = tipoDetectado || 'wav';
  if (mimetype && mimetype.includes('ogg')) fileExt = 'ogg';
  if (mimetype && mimetype.includes('mp3')) fileExt = 'mp3';

  try {
    // Envia o buffer corretamente para a OpenAI usando File nativo do Node.js
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { File } = await import('node:buffer');
    const file = new File([audioBuffer], `audio.${fileExt}`, { type: mimetype || 'audio/wav' });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: obterCodigoIdioma(idioma),
    });
    console.log(`✅ Transcrição bem-sucedida: "${transcription.text}"`);
    return {
      texto: transcription.text || '',
      confianca: 0.8, // OpenAI não retorna confiança diretamente
      duracao: 0, // Não disponível nesse endpoint
      idioma: obterCodigoIdioma(idioma),
      formato: fileExt,
      metodo: 'buffer_direto',
    };
  } catch (error) {
    console.error('❌ Erro ao enviar áudio para OpenAI:', error);
    throw error;
  }
}

// Função aprimorada para detectar tipo de áudio
function detectarTipoAudioRobusto(buffer) {
  if (!buffer || buffer.length < 12) return 'wav';

  const header = buffer.slice(0, 16);
  const hex = header.toString('hex').toLowerCase();

  console.log(`🔍 Analisando header: ${hex.substring(0, 24)}...`);

  // Magic numbers específicos
  if (hex.startsWith('4f676753')) {
    console.log('🎵 Detectado: OGG Vorbis');
    return 'ogg';
  }

  if (hex.startsWith('52494646') && hex.includes('57415645')) {
    console.log('🎵 Detectado: WAV');
    return 'wav';
  }

  if (hex.startsWith('fffb') || hex.startsWith('fff3') || hex.startsWith('fff2') || hex.startsWith('494433')) {
    console.log('🎵 Detectado: MP3');
    return 'mp3';
  }

  if (hex.startsWith('66747970')) {
    console.log('🎵 Detectado: M4A/MP4');
    return 'm4a';
  }

  if (hex.startsWith('464c4143')) {
    console.log('🎵 Detectado: FLAC');
    return 'flac';
  }

  if (hex.startsWith('1a45dfa3')) {
    console.log('🎵 Detectado: WebM');
    return 'webm';
  }

  // Padrões específicos do WhatsApp
  if (hex.includes('6f707573')) { // 'opus' em hex
    console.log('🎵 Detectado: Opus (usando OGG)');
    return 'ogg';
  }

  console.log('🎵 Tipo não detectado, usando WAV como fallback');
  return 'wav';
}

// Função para gerar prompt contextual
function gerarPromptContextual(idioma) {
  const prompts = {
    Inglês: 'This is a language learning exercise. The speaker is practicing English pronunciation. Common words: hello, good, morning, thank, you, please, yes, no.',
    Espanhol: 'Este es un ejercicio de aprendizaje de idiomas. El hablante está practicando pronunciación en español. Palabras comunes: hola, buenos, días, gracias, por, favor, sí, no.',
    Francês: "Ceci est un exercice d'apprentissage des langues. Le locuteur pratique la prononciation française. Mots courants: bonjour, merci, s'il, vous, plaît, oui, non.",
    Mandarim: '这是语言学习练习。说话者正在练习中文发音。常用词：你好，谢谢，请，是，不是。',
  };
  return prompts[idioma] || prompts['Inglês'];
}

// Função para obter código do idioma
function obterCodigoIdioma(idioma) {
  const codigos = {
    Inglês: 'en',
    Espanhol: 'es',
    Francês: 'fr',
    Mandarim: 'zh',
  };
  return codigos[idioma] || 'en';
}

// Função aprimorada para analisar pronúncia usando IA
export async function analisarPronunciaIA(
  audioTranscrito,
  textoEsperado,
  idioma
) {
  try {
    console.log(
      `🔍 Analisando pronúncia: "${audioTranscrito}" vs "${textoEsperado}"`
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em fonética e ensino de pronúncia de ${idioma} com anos de experiência.

          INSTRUÇÕES PARA ANÁLISE DETALHADA:
          - Compare meticulosamente o que foi dito com o esperado
          - Analise pronúncia, entonação, ritmo e fluência
          - Identifique erros específicos e suas causas
          - Forneça feedback construtivo e técnicas de melhoria
          - Use escala 0-100 (0-40: Precisa melhorar, 41-70: Bom, 71-85: Muito bom, 86-100: Excelente)
          - Seja encorajador mas preciso na avaliação
          - Use emojis para tornar o feedback mais amigável
          - Responda em português de forma didática

          FORMATO OBRIGATÓRIO DA RESPOSTA:
          🎯 **Pontuação:** [0-100]

          ✅ **Acertos:** [pontos positivos específicos]

          🔧 **Melhorias:** [erros identificados e correções]

          💡 **Dicas Técnicas:** [técnicas específicas de pronúncia]

          🎵 **Exercício:** [prática recomendada para melhorar]

          🌟 **Motivação:** [mensagem encorajadora personalizada]`,
        },
        {
          role: 'user',
          content: `Idioma de estudo: ${idioma}
          Texto que deveria ser pronunciado: "${textoEsperado}"
          O que o aluno realmente disse: "${audioTranscrito}"

          Faça uma análise completa e detalhada da pronúncia, fornecendo feedback específico e construtivo.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    const resposta = completion.choices[0].message.content;

    // Extrai a pontuação da resposta
    const pontuacaoMatch = resposta.match(/(?:Pontuação|pontuação):\s*(\d+)/i);
    const pontuacao = pontuacaoMatch
      ? parseInt(pontuacaoMatch[1])
      : calcularPontuacaoBasica(audioTranscrito, textoEsperado);

    return {
      pontuacao,
      analiseCompleta: resposta,
      textoEsperado,
      textoFalado: audioTranscrito,
      recomendacoes: extrairRecomendacoesAprimoradas(resposta),
      categoria: categorizarPronuncia(pontuacao),
    };
  } catch (error) {
    console.error('❌ Erro ao analisar pronúncia:', error);

    // Fallback com análise básica
    const pontuacaoBasica = calcularPontuacaoBasica(
      audioTranscrito,
      textoEsperado
    );
    return {
      pontuacao: pontuacaoBasica,
      analiseCompleta: `🎤 **Análise Básica da Pronúncia**\n\n🎯 **Pontuação:** ${pontuacaoBasica}/100\n\n${
        pontuacaoBasica >= 70
          ? '✅ Boa pronúncia! Continue praticando!'
          : '💪 Continue se esforçando, você está melhorando!'
      }`,
      textoEsperado,
      textoFalado: audioTranscrito,
      recomendacoes: ['Continue praticando regularmente! 🎯'],
      categoria: categorizarPronuncia(pontuacaoBasica),
    };
  }
}

function calcularPontuacaoBasica(audioTranscrito, textoEsperado) {
  const palavrasEsperadas = textoEsperado.toLowerCase().trim().split(/\s+/);
  const palavrasTranscritas = audioTranscrito.toLowerCase().trim().split(/\s+/);

  let pontuacaoTotal = 0;
  const totalPalavras = palavrasEsperadas.length;

  for (let i = 0; i < totalPalavras; i++) {
    const palavraEsperada = palavrasEsperadas[i];
    const palavraTranscrita = palavrasTranscritas[i] || '';

    if (palavraEsperada === palavraTranscrita) {
      pontuacaoTotal += 100;
    } else if (
      palavraTranscrita.includes(palavraEsperada) ||
      palavraEsperada.includes(palavraTranscrita)
    ) {
      pontuacaoTotal += 70;
    } else {
      const similaridade = calcularSimilaridade(
        palavraEsperada,
        palavraTranscrita
      );
      pontuacaoTotal += similaridade;
    }
  }

  const diferencaTamanho = Math.abs(
    palavrasEsperadas.length - palavrasTranscritas.length
  );
  const penalidade = diferencaTamanho * 15;

  const pontuacaoFinal = Math.max(
    0,
    Math.round(pontuacaoTotal / totalPalavras - penalidade)
  );
  return Math.min(100, pontuacaoFinal);
}

function calcularSimilaridade(str1, str2) {
  if (!str1 || !str2) return 0;

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

function categorizarPronuncia(pontuacao) {
  if (pontuacao >= 86) return 'Excelente';
  if (pontuacao >= 71) return 'Muito Bom';
  if (pontuacao >= 41) return 'Bom';
  return 'Precisa Melhorar';
}

function extrairRecomendacoesAprimoradas(analise) {
  const linhasDicas = analise
    .split('\n')
    .filter(
      (linha) =>
        linha.toLowerCase().includes('dica') ||
        linha.toLowerCase().includes('sugestão') ||
        linha.toLowerCase().includes('recomendação') ||
        linha.toLowerCase().includes('exercício') ||
        linha.toLowerCase().includes('técnica')
    );

  if (linhasDicas.length > 0) {
    return linhasDicas
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 10);
  }

  return [
    'Pratique pronunciando devagar primeiro, depois aumente a velocidade 🐌➡️🏃',
    'Grave-se falando e compare com áudios nativos 🎤',
    'Foque na posição da língua e lábios ao pronunciar 👄',
    'Pratique 10 minutos por dia para ver progresso consistente ⏰',
  ];
}

function otimizarTextoParaAudioAprimorado(texto, idioma) {
  let textoOtimizado = texto;

  // Remove formatação markdown
  textoOtimizado = textoOtimizado.replace(/\*\*(.*?)\*\*/g, '$1');
  textoOtimizado = textoOtimizado.replace(/\*(.*?)\*/g, '$1');
  textoOtimizado = textoOtimizado.replace(/`(.*?)`/g, '$1');
  textoOtimizado = textoOtimizado.replace(/#{1,6}\s/g, '');

  // Remove emojis que podem causar pausas estranhas
  textoOtimizado = textoOtimizado.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
    ''
  );

  // Remove comandos especiais
  textoOtimizado = textoOtimizado.replace(/\[GERAR_IMAGEM:.*?\]/g, '');
  textoOtimizado = textoOtimizado.replace(/\[SOLICITAR_AUDIO:.*?\]/g, '');

  // Remove instruções específicas para o aluno
  textoOtimizado = textoOtimizado.replace(/👉.*?$/gm, '');
  textoOtimizado = textoOtimizado.replace(/✍️.*?$/gm, '');
  textoOtimizado = textoOtimizado.replace(/📝.*?$/gm, '');

  // Melhora pausas naturais
  textoOtimizado = textoOtimizado.replace(/\. /g, '. ');
  textoOtimizado = textoOtimizado.replace(/\? /g, '? ');
  textoOtimizado = textoOtimizado.replace(/! /g, '! ');
  textoOtimizado = textoOtimizado.replace(/: /g, ': ');

  // Otimizações específicas por idioma
  switch (idioma) {
    case 'ingles':
    case 'inglês':
      textoOtimizado = textoOtimizado.replace(/ and /g, ', and ');
      textoOtimizado = textoOtimizado.replace(/ but /g, ', but ');
      textoOtimizado = textoOtimizado.replace(/ or /g, ', or ');
      break;

    case 'espanhol':
      textoOtimizado = textoOtimizado.replace(/ñ/g, 'ñ');
      textoOtimizado = textoOtimizado.replace(/ y /g, ', y ');
      textoOtimizado = textoOtimizado.replace(/ pero /g, ', pero ');
      break;

    case 'frances':
    case 'francês':
      textoOtimizado = textoOtimizado.replace(/ et /g, ', et ');
      textoOtimizado = textoOtimizado.replace(/ mais /g, ', mais ');
      textoOtimizado = textoOtimizado.replace(/ ou /g, ', ou ');
      break;

    case 'mandarim':
      textoOtimizado = textoOtimizado.replace(/，/g, ', ');
      textoOtimizado = textoOtimizado.replace(/。/g, '. ');
      break;
  }

  // Remove espaços extras e quebras de linha desnecessárias
  textoOtimizado = textoOtimizado.replace(/\n+/g, ' ');
  textoOtimizado = textoOtimizado.replace(/\s+/g, ' ').trim();

  // Limita o tamanho para evitar áudios muito longos
  if (textoOtimizado.length > 800) {
    textoOtimizado = textoOtimizado.substring(0, 800) + '...';
  }

  return textoOtimizado;
}

// Função aprimorada para gerar áudio com configurações específicas de professor
export async function gerarAudioProfessor(
  texto,
  idioma,
  nomeArquivo,
  genero = 'feminino'
) {
  const speedProfessor = {
    inglês: 0.95,
    ingles: 0.95,
    espanhol: 0.9,
    francês: 0.9,
    frances: 0.9,
    mandarim: 0.85,
  };

  const velocidade = speedProfessor[idioma.toLowerCase()] || 0.9;

  const textoComEntonacao = adicionarEntonacaoProfessorAprimorada(
    texto,
    idioma
  );

  return await gerarAudio(
    textoComEntonacao,
    idioma,
    nomeArquivo,
    genero,
    velocidade
  );
}

function adicionarEntonacaoProfessorAprimorada(texto, idioma) {
  let textoComEntonacao = texto;

  // Adiciona pausas pedagógicas mais naturais
  textoComEntonacao = textoComEntonacao.replace(/(\?)/g, '$1 ');
  textoComEntonacao = textoComEntonacao.replace(/(\.)/g, '$1 ');
  textoComEntonacao = textoComEntonacao.replace(/(:)/g, '$1 ');

  // Enfatiza palavras importantes por idioma
  const palavrasImportantes = {
    ingles: [
      'important',
      'remember',
      'notice',
      'example',
      'correct',
      'good',
      'excellent',
      'listen',
      'repeat',
      'practice',
    ],
    espanhol: [
      'importante',
      'recuerda',
      'nota',
      'ejemplo',
      'correcto',
      'bien',
      'excelente',
      'escucha',
      'repite',
      'practica',
    ],
    frances: [
      'important',
      'rappelle',
      'remarque',
      'exemple',
      'correct',
      'bien',
      'excellent',
      'écoute',
      'répète',
      'pratique',
    ],
    mandarim: [
      '重要',
      '记住',
      '注意',
      '例子',
      '正确',
      '好',
      '很好',
      '听',
      '重复',
      '练习',
    ],
  };

  const palavras = palavrasImportantes[idioma.toLowerCase()] || [];
  palavras.forEach((palavra) => {
    const regex = new RegExp(`\\b${palavra}\\b`, 'gi');
    textoComEntonacao = textoComEntonacao.replace(regex, ` ${palavra} `);
  });

  return textoComEntonacao.replace(/\s+/g, ' ').trim();
}

export function limparAudiosAntigos() {
  const audioDir = path.join(__dirname, '..', 'temp', 'audio');

  if (fs.existsSync(audioDir)) {
    const arquivos = fs.readdirSync(audioDir);
    const agora = Date.now();
    const umDiaEmMs = 24 * 60 * 60 * 1000;

    let arquivosRemovidos = 0;
    arquivos.forEach((arquivo) => {
      const caminhoArquivo = path.join(audioDir, arquivo);
      try {
        const stats = fs.statSync(caminhoArquivo);

        if (agora - stats.mtime.getTime() > umDiaEmMs) {
          fs.unlinkSync(caminhoArquivo);
          arquivosRemovidos++;
        }
      } catch (error) {
        console.error(`Erro ao processar arquivo ${arquivo}:`, error);
      }
    });

    if (arquivosRemovidos > 0) {
      console.log(
        `🗑️ ${arquivosRemovidos} arquivos de áudio antigos removidos`
      );
    }
  }
}

// Executa limpeza a cada 2 horas
setInterval(limparAudiosAntigos, 2 * 60 * 60 * 1000);
