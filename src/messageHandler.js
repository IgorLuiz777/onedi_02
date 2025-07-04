import { gerarAudio } from './audioService.js';
import { gerarTraducao } from './studyModes.js';
import { obterProximaAula, calcularProgressoNivel } from './lessonProgression.js';
import { salvarHistoricoAula, atualizarAulaAtual, verificarStatusPlano, verificarAcessoIdioma, definirIdiomaTestе } from './database.js';
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
    '/aula': 'info_aula_atual',
    '/planos': 'ver_planos',
    '/status': 'ver_status_plano'
  };

  const comando = mensagem.toLowerCase().trim();
  return comandos[comando] || null;
}

export async function mostrarMenuPrincipal(client, user, estado) {
  const menuTexto = `👋 **Olá ${estado.nome}!**

🎓 **Bem-vindo de volta à ONEDI - sua escola de idiomas com IA!**

🚀 **O que você gostaria de fazer hoje?**

💡 *Escolha uma das opções abaixo para começar sua jornada de aprendizado:*`;

  await client.sendListMessage(user, {
    buttonText: 'Escolher modo de estudo',
    description: menuTexto,
    sections: [
      {
        title: '🎯 Modos de Estudo Principais',
        rows: [
          {
            rowId: 'aula_guiada',
            title: '📚 Aula Guiada Interativa',
            description: '🤖 Sistema completo: 11 etapas, imagens IA, análise de áudio'
          },
          {
            rowId: 'pratica_livre',
            title: '💬 Prática Livre',
            description: '🗣️ Conversação natural com correções inteligentes'
          },
          {
            rowId: 'modo_professor',
            title: '👨‍🏫 Modo Professor',
            description: '📖 Explicações detalhadas e esclarecimento de dúvidas'
          },
          {
            rowId: 'modo_vocabulario',
            title: '📝 Modo Vocabulário',
            description: '🧠 Memorização inteligente com repetição espaçada'
          }
        ]
      },
      {
        title: '📊 Acompanhamento',
        rows: [
          {
            rowId: 'ver_progresso',
            title: '📈 Ver Progresso Detalhado',
            description: 'Estatísticas completas do seu aprendizado'
          },
          {
            rowId: 'ver_status_plano',
            title: '💎 Status do Plano',
            description: 'Verificar seu plano atual e tempo restante'
          }
        ]
      }
    ]
  });
}

export async function mostrarMenuAulaGuiada(client, user, estado) {
  const aulaAtual = obterProximaAula(estado.idioma, (estado.aula_atual || 1) - 1);
  const progressoInfo = calcularProgressoNivel(estado.aula_atual || 1, estado.idioma);

  const menuTexto = `🎓 **Aula Guiada Interativa Aprimorada**

🤖 **Sistema de Ensino com IA Completa**

✨ **Recursos Avançados Disponíveis:**
🖼️ **Imagens Educativas IA** - Ilustrações personalizadas para cada tópico
🎤 **Análise de Pronúncia** - Feedback detalhado com pontuação
🔊 **Áudio HD** - Text-to-speech de alta qualidade
📝 **Correção Inteligente** - Explicações detalhadas de erros
🌐 **Tradução Contextual** - Traduções precisas e naturais
🎯 **Gamificação** - Sistema de pontos e recompensas

📚 **Sua Jornada Atual:**
🎯 **Nível:** ${progressoInfo.nivel.charAt(0).toUpperCase() + progressoInfo.nivel.slice(1)} (${Math.round(progressoInfo.progresso)}% completo)
📖 **Aula:** ${aulaAtual.id} - ${aulaAtual.topico}
📝 **Conteúdo:** ${aulaAtual.conteudo}
🔥 **Sequência:** ${estado.streak || 0} dias consecutivos
⭐ **Pontos:** ${estado.pontuacao || 0}

🎪 **Estrutura da Aula (11 Etapas):**
1️⃣ **Abertura** - Apresentação motivadora do tópico
2️⃣ **Explicação** - Conceitos fundamentais
3️⃣ **Demonstração** - Exemplos práticos
4️⃣ **Exercício Guiado** - Prática assistida
5️⃣ **Quiz Interativo** - Questões de múltipla escolha
6️⃣ **Atividade Visual** - Análise de imagens IA
7️⃣ **Prática Oral** - Exercícios de pronúncia
8️⃣ **Produção Textual** - Criação de frases
9️⃣ **Correção Detalhada** - Feedback personalizado
🔟 **Consolidação** - Revisão e conexões
1️⃣1️⃣ **Avaliação** - Progresso e próximos passos

🎮 **Características Especiais:**
• **Instruções Claras** - Sempre sabendo o que fazer
• **Correções Imediatas** - Aprendizado eficiente
• **Adaptação Inteligente** - Dificuldade ajustada ao seu nível
• **Feedback Motivacional** - Encorajamento constante

⏱️ **Duração:** 45-50 minutos de aprendizado intensivo
🎯 **Objetivo:** Domínio completo do tópico da aula

🚀 **Pronto para uma experiência de aprendizado revolucionária?**`;

  await client.sendText(user, menuTexto);
}

export async function mostrarProgresso(client, user, usuarioBanco) {
  const { nome, nivel, pontuacao, streak_dias, ultima_atividade, aula_atual, idioma } = usuarioBanco;

  const aulaAtualInfo = obterProximaAula(idioma, (aula_atual || 1) - 1);
  const progressoInfo = calcularProgressoNivel(aula_atual || 1, idioma);

  const progressoTexto = `📊 **Relatório Completo de Progresso**

👤 **Aluno:** ${nome}
🤖 **Sistema:** ONEDI - IA Educacional

🎯 **Status Atual:**
📈 **Nível:** ${nivel.charAt(0).toUpperCase() + nivel.slice(1)}
📊 **Progresso no Nível:** ${Math.round(progressoInfo.progresso)}%
⭐ **Pontuação Total:** ${pontuacao} pontos
🔥 **Sequência Ativa:** ${streak_dias} dias consecutivos

📚 **Aula em Andamento:**
🆔 **Número:** ${aula_atual || 1}
📖 **Tópico:** ${aulaAtualInfo.topico}
📝 **Conteúdo:** ${aulaAtualInfo.conteudo}
🎯 **Nível da Aula:** ${aulaAtualInfo.nivel}

🤖 **Recursos IA Utilizados:**
🖼️ **Imagens Educativas** - Geração personalizada
🎤 **Análise de Pronúncia** - Feedback em tempo real
🔊 **Áudio HD** - Text-to-speech avançado
📝 **Correção Inteligente** - Explicações detalhadas
🌐 **Tradução Contextual** - Precisão linguística

📅 **Última Atividade:** ${new Date(ultima_atividade).toLocaleDateString('pt-BR', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})}

🎯 **Próximos Objetivos:**
• Completar a aula atual com aproveitamento ≥80%
• Manter a sequência diária de estudos
• Avançar para o próximo nível

💡 **Comandos Úteis:**
• **/proxima** - Avançar para próxima aula
• **/aula** - Detalhes da aula atual
• **/vocabulario** - Revisar palavras aprendidas

🚀 **Continue sua jornada de aprendizado!**`;

  await client.sendText(user, progressoTexto);
}

export async function mostrarStatusPlano(client, user, usuarioBanco) {
  const statusPlano = await verificarStatusPlano(usuarioBanco.telefone);
  
  let statusTexto = `💎 **Status do Seu Plano**\n\n`;
  
  if (statusPlano.status_plano === 'teste_gratuito') {
    const tempoRestante = statusPlano.tempo_restante_minutos;
    statusTexto += `🆓 **Teste Gratuito Ativo**\n\n`;
    statusTexto += `⏱️ **Tempo Restante:** ${tempoRestante} minutos\n`;
    statusTexto += `📚 **Idioma do Teste:** ${statusPlano.idioma_teste || statusPlano.idioma}\n`;
    statusTexto += `🎯 **Limite Total:** ${statusPlano.limite_teste_minutos} minutos\n\n`;
    
    if (tempoRestante <= 2) {
      statusTexto += `⚠️ **Atenção:** Seu teste está quase acabando!\n\n`;
      statusTexto += `🚀 **Adquira um plano para continuar aprendendo:**\n`;
      statusTexto += `• Digite **/planos** para ver as opções disponíveis\n`;
      statusTexto += `• Acesso ilimitado a todos os recursos\n`;
      statusTexto += `• Múltiplos idiomas disponíveis\n`;
    } else {
      statusTexto += `💡 **Aproveite seu teste gratuito!**\n`;
      statusTexto += `• Experimente todos os modos de estudo\n`;
      statusTexto += `• Teste os recursos de IA avançada\n`;
      statusTexto += `• Digite **/planos** para ver opções de upgrade\n`;
    }
  } else if (statusPlano.status_plano === 'ativo') {
    statusTexto += `✅ **Plano Ativo: ${statusPlano.nome_plano}**\n\n`;
    statusTexto += `📅 **Válido até:** ${new Date(statusPlano.data_fim_plano).toLocaleDateString('pt-BR')}\n`;
    statusTexto += `🌐 **Idiomas Disponíveis:** ${statusPlano.idiomas_disponiveis?.length || 0}\n`;
    statusTexto += `📚 **Idiomas:** ${statusPlano.idiomas_disponiveis?.join(', ') || 'Nenhum'}\n\n`;
    statusTexto += `🎯 **Recursos Inclusos:**\n`;
    statusTexto += `• ✅ Acesso ilimitado\n`;
    statusTexto += `• ✅ Todos os modos de estudo\n`;
    statusTexto += `• ✅ IA avançada completa\n`;
    statusTexto += `• ✅ Suporte prioritário\n`;
  } else {
    statusTexto += `❌ **Plano Expirado**\n\n`;
    statusTexto += `🚀 **Renove seu plano para continuar:**\n`;
    statusTexto += `• Digite **/planos** para ver as opções\n`;
    statusTexto += `• Mantenha seu progresso salvo\n`;
    statusTexto += `• Continue de onde parou\n`;
  }
  
  await client.sendText(user, statusTexto);
}

export async function mostrarInfoAulaAtual(client, user, usuarioBanco) {
  const { idioma, aula_atual } = usuarioBanco;
  const aulaInfo = obterProximaAula(idioma, (aula_atual || 1) - 1);
  const progressoInfo = calcularProgressoNivel(aula_atual || 1, idioma);

  const infoTexto = `📚 **Detalhes da Aula Atual**

🤖 **ONEDI - Sistema de Aula Interativa**

🆔 **Identificação da Aula:**
📖 **Número:** ${aulaInfo.id}
🎯 **Tópico:** ${aulaInfo.topico}
📝 **Conteúdo:** ${aulaInfo.conteudo}
🎚️ **Nível:** ${aulaInfo.nivel.charAt(0).toUpperCase() + aulaInfo.nivel.slice(1)}

📊 **Seu Progresso:**
📈 **Progresso no Nível:** ${Math.round(progressoInfo.progresso)}%
🎯 **Status:** ${progressoInfo.progresso === 100 ? 'Nível Completo! 🎉' : 'Em Progresso 📚'}

🤖 **Recursos IA Disponíveis Nesta Aula:**
🖼️ **Geração de Imagens** - Ilustrações educativas personalizadas
🎤 **Análise de Pronúncia** - Feedback detalhado com pontuação 0-100
🔊 **Áudio Profissional** - Pronúncia nativa de alta qualidade
📝 **Correção Inteligente** - Explicações gramaticais detalhadas
🌐 **Tradução Contextual** - Traduções precisas e naturais

🎪 **Estrutura da Aula (11 Etapas):**
1️⃣ Abertura motivadora
2️⃣ Explicação conceitual
3️⃣ Demonstração prática
4️⃣ Exercício guiado
5️⃣ Quiz interativo
6️⃣ Atividade visual
7️⃣ Prática oral
8️⃣ Produção textual
9️⃣ Correção detalhada
🔟 Consolidação
1️⃣1️⃣ Avaliação final

⏱️ **Duração Estimada:** 45-50 minutos
🎯 **Objetivo:** Domínio completo do tópico

💡 **Dica Especial:** Use o modo "Aula Guiada Interativa" para ter acesso a todos os recursos de IA desta aula e uma experiência de aprendizado completa e personalizada!

🚀 **Pronto para começar?** Selecione "Aula Guiada Interativa" no menu principal!`;

  await client.sendText(user, infoTexto);
}

export async function avancarProximaAula(client, user, usuarioBanco) {
  const { idioma, aula_atual } = usuarioBanco;
  const proximaAulaId = (aula_atual || 1) + 1;
  const proximaAula = obterProximaAula(idioma, proximaAulaId - 1);

  if (!proximaAula) {
    await client.sendText(user, `🎉 **Parabéns! Jornada Completa!**

🏆 Você completou todas as ${(aula_atual || 1) - 1} aulas disponíveis do curso de ${idioma}!

🎓 **Conquistas Desbloqueadas:**
✅ Domínio completo do currículo estruturado
✅ Experiência com todos os recursos de IA
✅ Desenvolvimento de todas as habilidades linguísticas

🚀 **Continue Praticando:**
💬 **Prática Livre** - Mantenha a fluência
👨‍🏫 **Modo Professor** - Aprofunde conhecimentos
📖 **Modo Vocabulário** - Expanda seu repertório

🤖 **Todos os recursos de IA continuam disponíveis para seu aperfeiçoamento!**`);
    return;
  }

  // Atualiza a aula atual no banco
  await atualizarAulaAtual(user, proximaAulaId);

  // Salva no histórico
  await salvarHistoricoAula(usuarioBanco.id, proximaAula.id, proximaAula.topico, proximaAula.conteudo, proximaAula.nivel);

  const progressoInfo = calcularProgressoNivel(proximaAulaId, idioma);

  const mensagem = `🎉 **Nova Aula Desbloqueada!**

🤖 **ONEDI - Progressão Automática**

📚 **Sua Nova Aula:**
🆔 **Número:** ${proximaAula.id}
📖 **Tópico:** ${proximaAula.topico}
📝 **Conteúdo:** ${proximaAula.conteudo}
🎯 **Nível:** ${proximaAula.nivel.charAt(0).toUpperCase() + proximaAula.nivel.slice(1)}

📊 **Progresso Atualizado:**
📈 **Progresso no Nível:** ${Math.round(progressoInfo.progresso)}%
🎚️ **Status:** ${progressoInfo.progresso === 100 ? 'Nível Completo! 🎉' : 'Em Progresso 📚'}

🤖 **Recursos IA Preparados:**
🖼️ **Novas Imagens Educativas** - Ilustrações específicas do tópico
🎤 **Exercícios de Pronúncia** - Palavras e frases do conteúdo
🔊 **Áudios Personalizados** - Pronúncia nativa atualizada
📝 **Correções Inteligentes** - Feedback adaptado ao novo nível

✨ **Novidades Desta Aula:**
• Conteúdo progressivo baseado em aulas anteriores
• Exercícios adaptados ao seu nível atual
• Vocabulário conectado com conhecimentos prévios
• Desafios personalizados para seu progresso

🚀 **Pronto para a próxima etapa?**

👉 **Selecione "Aula Guiada Interativa" no menu para começar!**`;

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
    '📚 aula guiada interativa 🤖 sistema completo: 11 etapas, imagens ia, análise de áudio': 'aula_guiada',

    // Prática Livre
    'pratica_livre': 'pratica_livre',
    'pratica livre': 'pratica_livre',
    'prática livre': 'pratica_livre',
    '💬 pratica livre': 'pratica_livre',
    '💬 prática livre': 'pratica_livre',
    '💬 pratica livre conversas abertas com correcao': 'pratica_livre',
    '💬 prática livre conversas abertas com correção': 'pratica_livre',
    '💬 prática livre conversas abertas com correção ia': 'pratica_livre',
    '💬 prática livre 🗣️ conversação natural com correções inteligentes': 'pratica_livre',

    // Modo Professor
    'modo_professor': 'modo_professor',
    'modo professor': 'modo_professor',
    '👨‍🏫 modo professor': 'modo_professor',
    '👨‍🏫 modo professor ia': 'modo_professor',
    '👨‍🏫 modo professor explicacoes e revisoes detalhadas': 'modo_professor',
    '👨‍🏫 modo professor explicações e revisões detalhadas': 'modo_professor',
    '👨‍🏫 modo professor ia explicações detalhadas com ia': 'modo_professor',
    '👨‍🏫 modo professor 📖 explicações detalhadas e esclarecimento de dúvidas': 'modo_professor',

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
    '📖 modo vocabulário ia memorização inteligente com ia': 'modo_vocabulario',
    '📝 modo vocabulário 🧠 memorização inteligente com repetição espaçada': 'modo_vocabulario'
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
  if (pontuacao < 150) return 'iniciante';
  if (pontuacao < 400) return 'básico';
  if (pontuacao < 800) return 'intermediário';
  if (pontuacao < 1500) return 'avançado';
  return 'fluente';
}

export async function enviarOpcoesMensagem(client, user, idioma, incluirAudio = false) {
  // Só mostra opções de tradução para todos os modos
  // Áudio é enviado automaticamente nos modos que não são aula_guiada
  const opcoes = [
    {
      rowId: 'traduzir_texto',
      title: '📝 Tradução IA',
      description: '🌐 Tradução contextual e precisa'
    }
  ];

  // Só adiciona opção de áudio se especificamente solicitado (para aula_guiada)
  if (incluirAudio) {
    opcoes.push({
      rowId: 'enviar_audio',
      title: '🔊 Áudio HD IA',
      description: '🎤 Text-to-Speech de alta qualidade'
    });
  }

  await client.sendListMessage(user, {
    buttonText: '🤖 Ferramentas IA',
    description: '🚀 Escolha uma ferramenta de IA avançada:',
    sections: [
      {
        title: '🧠 Recursos Inteligentes',
        rows: opcoes
      }
    ]
  });
}

export async function verificarLimitesTempo(client, user, usuarioBanco, minutosUsados = 2) {
  const statusPlano = await verificarStatusPlano(usuarioBanco.telefone);
  
  if (statusPlano.status_plano === 'teste_gratuito') {
    const tempoRestante = statusPlano.tempo_restante_minutos - minutosUsados;
    
    if (tempoRestante <= 0) {
      await client.sendText(user, `⏰ **Teste Gratuito Finalizado!**

🎉 **Parabéns por experimentar a ONEDI!**

🚀 **Para continuar aprendendo, escolha um de nossos planos:**

💎 **Planos Disponíveis:**
• **Básico** - 1 idioma por R$ 29,90/mês
• **Intermediário** - 2 idiomas por R$ 49,90/mês  
• **Avançado** - 3 idiomas por R$ 69,90/mês
• **Premium** - Todos os idiomas por R$ 89,90/mês

✨ **Benefícios dos Planos:**
• ✅ Acesso ilimitado a todos os recursos
• ✅ IA avançada completa
• ✅ Múltiplos idiomas
• ✅ Suporte prioritário

📞 **Para adquirir seu plano:**
Entre em contato conosco ou acesse nossa plataforma de pagamento.

💡 **Digite /planos para mais informações!**`);
      
      return false; // Bloqueia o acesso
    } else if (tempoRestante <= 2) {
      await client.sendText(user, `⚠️ **Atenção:** Restam apenas ${tempoRestante} minutos do seu teste gratuito!

🚀 **Adquira um plano para continuar sem interrupções!**
Digite **/planos** para ver as opções.`);
    }
    
    // Atualiza o tempo usado
    await import('./database.js').then(db => db.atualizarTempoTeste(usuarioBanco.telefone, minutosUsados));
  }
  
  return true; // Permite o acesso
}