import { gerarAudio } from './audioService.js';
import { gerarTraducao } from './studyModes.js';
import OpenAI from 'openai';
import { mp3ToBase64 } from './mp3ToBase64.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function detectarGenero(nome) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente que responde apenas "masculino" ou "feminino" de acordo com o gênero mais provável do nome fornecido. Se não conseguir identificar, responda "feminino".'
        },
        {
          role: 'user',
          content: `Qual o gênero do nome "${nome}"? Responda apenas com "masculino" ou "feminino".`
        }
      ],
      temperature: 0.1,
      max_tokens: 10
    });

    return completion.choices[0].message.content.trim().toLowerCase();
  } catch (error) {
    console.error('Erro ao detectar gênero:', error);
    return 'feminino'; // padrão
  }
}

export async function enviarMensagemCompleta(client, user, texto, idioma, incluirTraducao = true, incluirAudio = true) {
  try {
    await client.sendText(user, texto);

    if (incluirAudio) {
      try {
        const nomeArquivo = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const audioBuffer = await gerarAudio(texto, idioma, nomeArquivo);
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');
        await client.sendPttFromBase64(user, audioBase64);
      } catch (audioError) {
        console.error('Erro ao gerar/enviar áudio:', audioError);
      }
    }

    if (incluirTraducao) {
      try {
        const traducao = await gerarTraducao(texto, idioma);
        await client.sendText(user, `📝 *Tradução:* ${traducao}`);
      } catch (traducaoError) {
        console.error('Erro ao gerar tradução:', traducaoError);
      }
    }

  } catch (error) {
    console.error('Erro ao enviar mensagem completa:', error);
    throw error;
  }
}

export function processarComandoEspecial(mensagem) {
  const comandos = {
    '/menu': 'menu_principal',
    '/progresso': 'ver_progresso',
    '/vocabulario': 'revisar_vocabulario',
    '/nivel': 'verificar_nivel',
    '/streak': 'ver_streak',
    '/ajuda': 'mostrar_ajuda'
  };

  const comando = mensagem.toLowerCase().trim();
  return comandos[comando] || null;
}

export async function mostrarMenuPrincipal(client, user, estado) {
  await client.sendListMessage(user, {
    buttonText: 'Escolher opção',
    description: `Olá ${estado.nome}! O que você gostaria de fazer hoje?`,
    sections: [
      {
        title: 'Modos de Estudo',
        rows: [
          {
            rowId: 'aula_guiada',
            title: 'Aula Guiada',
            description: 'Passo a passo com IA (30 min/dia ou 20 questões)'
          },
          {
            rowId: 'pratica_livre',
            title: 'Prática Livre',
            description: 'Conversas abertas com correção'
          },
          {
            rowId: 'modo_professor',
            title: 'Modo Professor',
            description: 'Explicações e revisões com IA especialista'
          },
          {
            rowId: 'modo_vocabulario',
            title: 'Modo Vocabulário',
            description: 'Memorização, repetição espaçada e minigame'
          }
        ]
      },
      {
        title: 'Outras Opções',
        rows: [
          {
            rowId: 'ver_progresso',
            title: 'Ver Progresso',
            description: 'Acompanhe sua evolução'
          },
          {
            rowId: 'revisar_vocabulario',
            title: 'Revisar Vocabulário',
            description: 'Pratique palavras aprendidas'
          }
        ]
      }
    ]
  });
}

export async function mostrarProgresso(client, user, usuarioBanco) {
  const { nome, nivel, pontuacao, streak_dias, ultima_atividade } = usuarioBanco;

  const progressoTexto = `
📊 *Progresso de ${nome}*

🎯 *Nível:* ${nivel.charAt(0).toUpperCase() + nivel.slice(1)}
⭐ *Pontuação:* ${pontuacao} pontos
🔥 *Sequência:* ${streak_dias} dias
📅 *Última atividade:* ${new Date(ultima_atividade).toLocaleDateString('pt-BR')}

Continue estudando para subir de nível! 🚀
  `;

  await client.sendText(user, progressoTexto);
}

export function normalizarTexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function validarIdioma(idiomaInput) {
  const idiomasValidos = {
    'ingles': 'Inglês',
    'inglês': 'Inglês',
    '🇺🇸 ingles': 'Inglês',
    '🇺🇸 inglês': 'Inglês',
    '🇺🇸 ingles o idioma mais falado no mundo': 'Inglês',
    '🇺🇸 inglês o idioma mais falado no mundo': 'Inglês',
    'espanhol': 'Espanhol',
    '🇪🇸 espanhol': 'Espanhol',
    '🇪🇸 espanhol segundo idioma mais falado': 'Espanhol',
    'frances': 'Francês',
    'francês': 'Francês',
    '🇫🇷 frances': 'Francês',
    '🇫🇷 francês': 'Francês',
    '🇫🇷 frances a lingua do amor e da cultura': 'Francês',
    '🇫🇷 francês a lingua do amor e da cultura': 'Francês',
    'mandarim': 'Mandarim',
    '🇨🇳 mandarim': 'Mandarim',
    '🇨🇳 mandarim o idioma do futuro': 'Mandarim'
  };

  let idiomaNormalizado = normalizarTexto(idiomaInput.replace(/\n/g, ' ').replace(/ +/g, ' '));
  if (idiomasValidos[idiomaNormalizado]) return idiomasValidos[idiomaNormalizado];
  for (const chave in idiomasValidos) {
    if (idiomaNormalizado.includes(chave)) {
      return idiomasValidos[chave];
    }
  }
  return null;
}

export function validarModoEstudo(modoInput) {
  const modosValidos = {
    'aula_guiada': 'Aula Guiada',
    'aula guiada': 'Aula Guiada',
    'pratica_livre': 'Prática Livre',
    'pratica livre': 'Prática Livre',
    'prática livre': 'Prática Livre',
    'modo_professor': 'Modo Professor',
    'modo professor': 'Modo Professor',
    'modo_vocabulario': 'Modo Vocabulário',
    'modo vocabulario': 'Modo Vocabulário',
    'modo vocabulário': 'Modo Vocabulário'
  };

  const modoNormalizado = normalizarTexto(modoInput);
  return modosValidos[modoNormalizado] || null;
}

export function calcularNivel(pontuacao) {
  if (pontuacao < 100) return 'iniciante';
  if (pontuacao < 300) return 'básico';
  if (pontuacao < 600) return 'intermediário';
  if (pontuacao < 1000) return 'avançado';
  return 'fluente';
}

export async function enviarOpcoesMensagem(client, user, idioma) {
  await client.sendListMessage(user, {
    buttonText: 'Opções',
    description: 'Escolha uma opção:',
    sections: [
      {
        title: 'Ferramentas',
        rows: [
          {
            rowId: 'traduzir_texto',
            title: '📝 Traduzir',
            description: 'Obtenha a tradução desta mensagem'
          },
          {
            rowId: 'enviar_audio',
            title: '🔊 Áudio',
            description: 'Ouça esta mensagem em áudio'
          }
        ]
      }
    ]
  });
}
