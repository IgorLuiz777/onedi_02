import { gerarAudio } from './audioService.js';
import { gerarTraducao } from './studyModes.js';
import { obterProximaAula, calcularProgressoNivel } from './lessonProgression.js';
import { salvarHistoricoAula, atualizarAulaAtual } from './database.js';
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
    '/ajuda': 'mostrar_ajuda',
    '/proxima': 'proxima_aula',
    '/aula': 'info_aula_atual'
  };

  const comando = mensagem.toLowerCase().trim();
  return comandos[comando] || null;
}

export async function mostrarMenuPrincipal(client, user, estado) {
  const menuTexto = `Olá ${estado.nome}! 👋

Bem-vindo de volta à sua escola de idiomas!

O que você gostaria de fazer hoje?`;

  await client.sendListMessage(user, {
    buttonText: 'Escolher opção',
    description: menuTexto,
    sections: [
      {
        title: 'Modos de Estudo',
        rows: [
          {
            rowId: 'aula_guiada',
            title: '📚 Aula Guiada Interativa',
            description: 'Aulas passo a passo com explicações, exercícios e desafios.'
          },
          {
            rowId: 'pratica_livre',
            title: '💬 Prática Livre',
            description: 'Converse livremente e receba dicas e correções.'
          },
          {
            rowId: 'modo_professor',
            title: '👨‍🏫 Modo Professor',
            description: 'Tire dúvidas e receba explicações detalhadas.'
          },
          {
            rowId: 'modo_vocabulario',
            title: '📖 Modo Vocabulário',
            description: 'Pratique e memorize novas palavras de forma divertida.'
          }
        ]
      },
      {
        title: 'Outras Opções',
        rows: [
          {
            rowId: 'ver_progresso',
            title: '📊 Ver Progresso',
            description: 'Acompanhe sua evolução detalhada'
          },
          {
            rowId: 'revisar_vocabulario',
            title: '🔄 Revisar Vocabulário',
            description: 'Pratique palavras aprendidas'
          }
        ]
      }
    ]
  });
}

export async function mostrarMenuAulaGuiada(client, user, estado) {
  const aulaAtual = obterProximaAula(estado.idioma, (estado.aula_atual || 1) - 1);
  const progressoInfo = calcularProgressoNivel(estado.aula_atual || 1, estado.idioma);

  const menuTexto = `📚 **Aula Guiada Interativa**

🖼️ Imagens educativas para facilitar o entendimento
🎤 Pratique sua pronúncia e receba sugestões
🔊 Ouça o conteúdo para melhorar sua compreensão
📝 Correção de frases e dicas personalizadas
🌐 Tradução contextual para ampliar seu vocabulário

🎯 **Sua Jornada de Aprendizado:**
📈 Nível: ${progressoInfo.nivel.charAt(0).toUpperCase() + progressoInfo.nivel.slice(1)} (${Math.round(progressoInfo.progresso)}%)
📖 Aula atual: ${aulaAtual.id} - ${aulaAtual.topico}
📝 Conteúdo: ${aulaAtual.conteudo}
🔥 Sequência: ${estado.streak || 0} dias
⭐ Pontos: ${estado.pontuacao || 0}

🎓 **Como funciona:**
1️⃣ Explicações em dois idiomas (${estado.idioma} + Português)
2️⃣ Exercícios de múltipla escolha
3️⃣ Imagens para ilustrar o conteúdo
4️⃣ Prática de pronúncia
5️⃣ Formação de frases com correção
6️⃣ Feedback motivacional

✨ **O que você encontra aqui:**
• 11 etapas organizadas por aula
• Avaliação de pronúncia
• Imagens para cada tópico
• Correções detalhadas
• Sistema de pontos e recompensas

🚀 Pronto para uma experiência de aprendizado diferente?
Envie qualquer mensagem para começar!`;

  await client.sendText(user, menuTexto);
}

export async function mostrarProgresso(client, user, usuarioBanco) {
  const { nome, nivel, pontuacao, streak_dias, ultima_atividade, aula_atual, idioma } = usuarioBanco;

  const aulaAtualInfo = obterProximaAula(idioma, (aula_atual || 1) - 1);
  const progressoInfo = calcularProgressoNivel(aula_atual || 1, idioma);

  const progressoTexto = `
📊 **Progresso Detalhado de ${nome}**

🤖 *ONEDI - Estatísticas Avançadas*

🎯 **Nível Atual:** ${nivel.charAt(0).toUpperCase() + nivel.slice(1)}
📈 **Progresso no Nível:** ${Math.round(progressoInfo.progresso)}%
⭐ **Pontuação Total:** ${pontuacao} pontos
🔥 **Sequência:** ${streak_dias} dias consecutivos

📚 **Aula Atual:** ${aula_atual || 1}
📖 **Tópico:** ${aulaAtualInfo.topico}
📝 **Conteúdo:** ${aulaAtualInfo.conteudo}

🤖 **Recursos IA Utilizados:**
🖼️ Imagens educativas geradas
🎤 Análises de pronúncia realizadas
🔊 Áudios de alta qualidade
📝 Correções gramaticais inteligentes

📅 **Última atividade:** ${new Date(ultima_atividade).toLocaleDateString('pt-BR')}

🚀 Continue estudando para avançar para a próxima aula!

*Digite /proxima para ir para a próxima aula*
*Digite /aula para ver detalhes da aula atual*
  `;

  await client.sendText(user, progressoTexto);
}

export async function mostrarInfoAulaAtual(client, user, usuarioBanco) {
  const { idioma, aula_atual } = usuarioBanco;
  const aulaInfo = obterProximaAula(idioma, (aula_atual || 1) - 1);
  const progressoInfo = calcularProgressoNivel(aula_atual || 1, idioma);

  const infoTexto = `
📚 **Informações da Aula Atual**

🤖 *ONEDI - Aula Interativa*

🆔 **Aula:** ${aulaInfo.id}
📖 **Tópico:** ${aulaInfo.topico}
📝 **Conteúdo:** ${aulaInfo.conteudo}
🎯 **Nível:** ${aulaInfo.nivel.charAt(0).toUpperCase() + aulaInfo.nivel.slice(1)}

📊 **Seu Progresso:**
📈 Progresso no nível: ${Math.round(progressoInfo.progresso)}%

🤖 **Recursos IA Disponíveis:**
🖼️ Imagens educativas personalizadas
🎤 Análise de pronúncia em tempo real
🔊 Áudio de alta qualidade
📝 Correção gramatical inteligente
🌐 Tradução contextual

💡 **Dica:** Use o modo "Aula Guiada Interativa" para ter uma experiência completa com todos os recursos de IA desta aula!
  `;

  await client.sendText(user, infoTexto);
}

export async function avancarProximaAula(client, user, usuarioBanco) {
  const { idioma, aula_atual } = usuarioBanco;
  const proximaAulaId = (aula_atual || 1) + 1;
  const proximaAula = obterProximaAula(idioma, proximaAulaId - 1);

  if (!proximaAula) {
    await client.sendText(user, '🎉 Parabéns! Você completou todas as aulas disponíveis! Continue praticando nos outros modos de estudo com IA.');
    return;
  }

  // Atualiza a aula atual no banco
  await atualizarAulaAtual(user, proximaAulaId);

  // Salva no histórico
  await salvarHistoricoAula(usuarioBanco.id, proximaAula.id, proximaAula.topico, proximaAula.conteudo, proximaAula.nivel);

  const progressoInfo = calcularProgressoNivel(proximaAulaId, idioma);

  const mensagem = `
🎉 **Avançou para a Próxima Aula!**

🤖 *ONEDI - Nova Aula Disponível*

📚 **Nova Aula:** ${proximaAula.id}
📖 **Tópico:** ${proximaAula.topico}
📝 **Conteúdo:** ${proximaAula.conteudo}
🎯 **Nível:** ${proximaAula.nivel.charAt(0).toUpperCase() + proximaAula.nivel.slice(1)}

📊 **Progresso Atualizado:**
📈 Progresso no nível: ${Math.round(progressoInfo.progresso)}%

🤖 **Recursos IA Preparados:**
🖼️ Novas imagens educativas
🎤 Exercícios de pronúncia
🔊 Áudios personalizados
📝 Correções inteligentes

🚀 Pronto para começar? Selecione "Aula Guiada Interativa" no menu!
  `;

  await client.sendText(user, mensagem);
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
    // Aula Guiada
    'aula_guiada': 'aula_guiada',
    'aula guiada': 'aula_guiada',
    'aula guiada continua': 'aula_guiada',
    'aula guiada interativa': 'aula_guiada',
    '📚 aula guiada interativa': 'aula_guiada',
    '📚 aula guiada continua': 'aula_guiada',
    '📚 aula guiada continua sistema estruturado com progressao': 'aula_guiada',
    '📚 aula guiada continua continuar: alphabet and basic sounds': 'aula_guiada',
    '📚 aula guiada interativa 🤖 ia completa: imagens, áudio, pronúncia': 'aula_guiada',

    // Prática Livre
    'pratica_livre': 'pratica_livre',
    'pratica livre': 'pratica_livre',
    'prática livre': 'pratica_livre',
    '💬 pratica livre': 'pratica_livre',
    '💬 prática livre': 'pratica_livre',
    '💬 pratica livre conversas abertas com correcao': 'pratica_livre',
    '💬 prática livre conversas abertas com correção': 'pratica_livre',
    '💬 prática livre conversas abertas com correção ia': 'pratica_livre',

    // Modo Professor
    'modo_professor': 'modo_professor',
    'modo professor': 'modo_professor',
    '👨‍🏫 modo professor': 'modo_professor',
    '👨‍🏫 modo professor ia': 'modo_professor',
    '👨‍🏫 modo professor explicacoes e revisoes detalhadas': 'modo_professor',
    '👨‍🏫 modo professor explicações e revisões detalhadas': 'modo_professor',
    '👨‍🏫 modo professor ia explicações detalhadas com ia': 'modo_professor',

    // Modo Vocabulário
    'modo_vocabulario': 'modo_vocabulario',
    'modo vocabulario': 'modo_vocabulario',
    'modo vocabulário': 'modo_vocabulario',
    '📖 modo vocabulario': 'modo_vocabulario',
    '📖 modo vocabulário': 'modo_vocabulario',
    '📖 modo vocabulario ia': 'modo_vocabulario',
    '📖 modo vocabulário ia': 'modo_vocabulario',
    '📖 modo vocabulario memorizacao e repeticao espacada': 'modo_vocabulario',
    '📖 modo vocabulário memorização e repetição espaçada': 'modo_vocabulario',
    '📖 modo vocabulário ia memorização inteligente com ia': 'modo_vocabulario'
  };

  const modoNormalizado = normalizarTexto(modoInput.replace(/\n/g, ' ').replace(/ +/g, ' '));

  // Primeiro tenta match exato
  if (modosValidos[modoNormalizado]) {
    return modosValidos[modoNormalizado];
  }

  // Depois tenta match parcial
  for (const chave in modosValidos) {
    if (modoNormalizado.includes(chave.replace(/[^\w\s]/g, '').toLowerCase())) {
      return modosValidos[chave];
    }
  }

  return null;
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
    buttonText: 'Ferramentas IA',
    description: 'Escolha uma ferramenta de IA:',
    sections: [
      {
        title: 'Recursos Inteligentes',
        rows: [
          {
            rowId: 'traduzir_texto',
            title: '📝 Traduzir com IA',
            description: 'Tradução contextual inteligente'
          },
          {
            rowId: 'enviar_audio',
            title: '🔊 Áudio IA',
            description: 'Text-to-Speech de alta qualidade'
          }
        ]
      }
    ]
  });
}
