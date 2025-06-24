import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { converterParaMp3 } from './audioConvert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const idiomasCodigos = {
  'inglês': 'en',
  'ingles': 'en',
  'espanhol': 'es',
  'francês': 'fr',
  'frances': 'fr',
  'mandarim': 'zh'
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const openaiVoicesGenero = {
  'inglês': {
    masculino: 'onyx',
    feminino: 'nova'
  },
  'ingles': {
    masculino: 'onyx',
    feminino: 'nova'
  },
  'espanhol': {
    masculino: 'echo',
    feminino: 'shimmer'
  },
  'francês': {
    masculino: 'alloy',
    feminino: 'nova'
  },
  'frances': {
    masculino: 'alloy',
    feminino: 'nova'
  },
  'mandarim': {
    masculino: 'echo',
    feminino: 'shimmer'
  }
};

const velocidadePorIdioma = {
  'inglês': 1,
  'ingles': 1,
  'espanhol': 1,
  'francês': 1,
  'frances': 1,
  'mandarim': 1
};

export async function gerarAudio(texto, idioma, nomeArquivo, genero = 'feminino', speedOverride = null) {
  const codigoIdioma = idiomasCodigos[idioma.toLowerCase()] || 'en';
  const idiomaKey = idioma.toLowerCase();
  const generoKey = (genero || 'feminino').toLowerCase();

  let voice = 'nova'; // padrão otimizado
  if (openaiVoicesGenero[idiomaKey] && openaiVoicesGenero[idiomaKey][generoKey]) {
    voice = openaiVoicesGenero[idiomaKey][generoKey];
  }

  const speed = speedOverride || velocidadePorIdioma[idiomaKey] || 0.90;

  const textoOtimizado = otimizarTextoParaAudio(texto, idiomaKey);

  try {
    console.log(`🎙️ Gerando áudio: Idioma=${idioma}, Voz=${voice}, Velocidade=${speed}`);

    const response = await openai.audio.speech.create({
      model: 'tts-1-hd',
      input: textoOtimizado,
      voice: voice,
      response_format: 'mp3',
      speed: speed
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`✅ Áudio gerado com sucesso: ${buffer.length} bytes`);
    return buffer;
  } catch (err) {
    console.error('❌ Erro ao gerar áudio com OpenAI:', err);
    throw err;
  }
}

// Nova função para processar áudio recebido do aluno
/**
 * Processa o áudio do aluno, convertendo para mp3 se necessário.
 * @param {Buffer} audioBuffer - Buffer do áudio recebido
 * @param {string} idioma - Idioma do áudio
 * @param {string} [extensao='ogg'] - Extensão do áudio recebido (ex: 'ogg', 'mp3', 'wav')
 */
export async function processarAudioAluno(audioBuffer, idioma, extensao = 'ogg') {
  // Cria arquivo temporário para o áudio recebido
  const tempDir = path.join(__dirname, '..', 'temp', 'audio');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempInputFile = path.join(tempDir, `audio_input_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${extensao}`);
  const tempMp3File = path.join(tempDir, `audio_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.mp3`);
  try {
    fs.writeFileSync(tempInputFile, audioBuffer);
    // Converte para mp3 usando ffmpeg
    await converterParaMp3(tempInputFile, tempMp3File);
    // Envia o arquivo mp3 para a API do OpenAI Whisper
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempMp3File),
      model: 'whisper-1',
      language: obterCodigoIdioma(idioma)
    });
    // Remove arquivos temporários
    if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
    if (fs.existsSync(tempMp3File)) fs.unlinkSync(tempMp3File);
    return { texto: response.text };
  } catch (error) {
    if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
    if (fs.existsSync(tempMp3File)) fs.unlinkSync(tempMp3File);
    console.error('Erro ao transcrever áudio:', error);
    throw error;
  }
}

// Nova função para analisar pronúncia usando IA
export async function analisarPronunciaIA(audioTranscrito, textoEsperado, idioma) {
  try {
    console.log(`🔍 Analisando pronúncia: "${audioTranscrito}" vs "${textoEsperado}"`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um especialista em ensino de pronúncia de ${idioma}.

          Analise a pronúncia do aluno comparando o que ele disse com o que deveria ter dito.

          INSTRUÇÕES:
          - Compare palavra por palavra
          - Identifique erros específicos de pronúncia
          - Dê feedback construtivo e encorajador
          - Sugira técnicas de melhoria
          - Use uma escala de 0-100 para avaliar a pronúncia
          - Responda em português com emojis para tornar amigável

          FORMATO DA RESPOSTA:
          Pontuação: [0-100]
          Análise: [análise detalhada]
          Dicas: [sugestões específicas]`
        },
        {
          role: 'user',
          content: `Texto esperado: "${textoEsperado}"
          O que o aluno disse: "${audioTranscrito}"
          Idioma: ${idioma}

          Analise a pronúncia e forneça feedback detalhado.`
        }
      ],
      temperature: 0.7,
      max_tokens: 400
    });

    const resposta = completion.choices[0].message.content;

    // Extrai a pontuação da resposta
    const pontuacaoMatch = resposta.match(/Pontuação:\s*(\d+)/);
    const pontuacao = pontuacaoMatch ? parseInt(pontuacaoMatch[1]) : 70;

    return {
      pontuacao,
      analiseCompleta: resposta,
      textoEsperado,
      textoFalado: audioTranscrito,
      recomendacoes: extrairRecomendacoes(resposta)
    };
  } catch (error) {
    console.error('❌ Erro ao analisar pronúncia:', error);
    throw error;
  }
}

function extrairRecomendacoes(analise) {
  const linhasDicas = analise.split('\n').filter(linha =>
    linha.toLowerCase().includes('dica') ||
    linha.toLowerCase().includes('sugestão') ||
    linha.toLowerCase().includes('recomendação')
  );

  return linhasDicas.length > 0 ? linhasDicas : ['Continue praticando! Você está no caminho certo! 🎯'];
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

function otimizarTextoParaAudio(texto, idioma) {
  let textoOtimizado = texto;

  textoOtimizado = textoOtimizado.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove **bold**
  textoOtimizado = textoOtimizado.replace(/\*(.*?)\*/g, '$1');     // Remove *italic*
  textoOtimizado = textoOtimizado.replace(/`(.*?)`/g, '$1');       // Remove `code`

  // Remove emojis que podem causar pausas estranhas
  textoOtimizado = textoOtimizado.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');

  // Remove comandos especiais
  textoOtimizado = textoOtimizado.replace(/\[GERAR_IMAGEM:.*?\]/g, '');
  textoOtimizado = textoOtimizado.replace(/\[SOLICITAR_AUDIO:.*?\]/g, '');

  // Adiciona pausas naturais para melhorar a entonação
  textoOtimizado = textoOtimizado.replace(/\. /g, '. '); // Garante pausa após pontos
  textoOtimizado = textoOtimizado.replace(/\? /g, '? '); // Garante pausa após perguntas
  textoOtimizado = textoOtimizado.replace(/! /g, '! '); // Garante pausa após exclamações

  // Otimizações específicas por idioma
  switch (idioma) {
    case 'ingles':
    case 'inglês':
      // Adiciona pausas em conjunções para soar mais natural
      textoOtimizado = textoOtimizado.replace(/ and /g, ', and ');
      textoOtimizado = textoOtimizado.replace(/ but /g, ', but ');
      break;

    case 'espanhol':
      // Melhora a pronuncia de palavras com acentos
      textoOtimizado = textoOtimizado.replace(/ñ/g, 'ñ'); // Garante encoding correto
      break;

    case 'frances':
    case 'francês':
      // Adiciona pausas em liaisons para melhor pronuncia
      textoOtimizado = textoOtimizado.replace(/ et /g, ', et ');
      break;
  }

  // Remove espaços extras
  textoOtimizado = textoOtimizado.replace(/\s+/g, ' ').trim();

  return textoOtimizado;
}

// Função para gerar áudio com configurações específicas de professor
export async function gerarAudioProfessor(texto, idioma, nomeArquivo, genero = 'feminino') {
  // Configurações específicas para soar como um professor
  const speedProfessor = {
    'inglês': 1,
    'ingles': 1,
    'espanhol': 1,
    'francês': 1,
    'frances': 1,
    'mandarim': 1
  };

  const velocidade = speedProfessor[idioma.toLowerCase()] || 1;

  // Adiciona características de professor ao texto
  const textoComEntonacao = adicionarEntonacaoProfessor(texto, idioma);

  return await gerarAudio(textoComEntonacao, idioma, nomeArquivo, genero, velocidade);
}

// Adiciona características de entonação de professor
function adicionarEntonacaoProfessor(texto, idioma) {
  let textoComEntonacao = texto;

  // Adiciona pausas pedagógicas
  textoComEntonacao = textoComEntonacao.replace(/(\?)/g, '$1 '); // Pausa após perguntas
  textoComEntonacao = textoComEntonacao.replace(/(\.)/g, '$1 '); // Pausa após afirmações

  // Enfatiza palavras importantes (simulando entonação de professor)
  const palavrasImportantes = {
    'ingles': ['important', 'remember', 'notice', 'example', 'correct', 'good', 'excellent'],
    'espanhol': ['importante', 'recuerda', 'nota', 'ejemplo', 'correcto', 'bien', 'excelente'],
    'frances': ['important', 'rappelle', 'remarque', 'exemple', 'correct', 'bien', 'excellent'],
    'mandarim': ['重要', '记住', '注意', '例子', '正确', '好', '很好']
  };

  const palavras = palavrasImportantes[idioma.toLowerCase()] || [];
  palavras.forEach(palavra => {
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

    arquivos.forEach(arquivo => {
      const caminhoArquivo = path.join(audioDir, arquivo);
      const stats = fs.statSync(caminhoArquivo);

      if (agora - stats.mtime.getTime() > umDiaEmMs) {
        fs.unlinkSync(caminhoArquivo);
        console.log(`🗑️ Áudio antigo removido: ${arquivo}`);
      }
    });
  }
}

// Executa limpeza a cada hora
setInterval(limparAudiosAntigos, 60 * 60 * 1000);
