import wppconnect from '@wppconnect-team/wppconnect';
import dotenv from 'dotenv';
import {
  consultarUsuario,
  salvarUsuario,
  atualizarStreak,
  salvarHistoricoAula
} from './src/database.js';
import {
  detectarGenero,
  enviarMensagemCompleta,
  enviarOpcoesMensagem,
  processarComandoEspecial,
  mostrarMenuPrincipal,
  mostrarMenuAulaGuiada,
  mostrarProgresso,
  mostrarInfoAulaAtual,
  avancarProximaAula,
  validarIdioma,
  validarModoEstudo,
  calcularNivel,
  normalizarTexto
} from './src/messageHandler.js';
import { gerarTraducao, analisarAudioPronuncia } from './src/studyModes.js';
import { gerarAudioProfessor, processarAudioAluno, analisarPronunciaIA } from './src/audioService.js';
import { mp3ToBase64 } from './src/mp3ToBase64.js';
import {
  processarModoEstudo,
  iniciarRevisaoVocabulario,
  SessaoAulaGuiada
} from './src/studyModes.js';
import { obterProximaAula } from './src/lessonProgression.js';

dotenv.config();

const estados = {};
const sessoesAulaGuiada = {};
const lastResponses = {};
const aguardandoAudio = {}; // Para controlar quando estamos esperando áudio do aluno

wppconnect
  .create({
    session: 'sessionName',
    headless: true,
    multiDevice: true,
  })
  .then((client) => {
    console.log('🚀 Conectado ao WhatsApp!');
    console.log('📚 Sistema de Ensino de Idiomas com Aula Guiada Interativa Ativo');

    client.onMessage(async (message) => {
      const user = message.from;

      if (user !== '5511980483504@c.us') return;
      if (message.isGroupMsg || user.endsWith('@status') || user === 'status@broadcast') return;

      console.log(`📱 Mensagem de ${user}: ${message.body || '[ÁUDIO/MÍDIA]'}`);
      console.log(`📱 Tipo: ${message.type}, SelectedRowId: ${message.selectedRowId}`);

      if (message.type === 'ptt' || message.type === 'audio') {
        await client.startTyping(user); // Inicia feedback de digitando
        await processarAudioDoAluno(client, user, message);
        await client.stopTyping(user); // Para feedback de digitando
        return;
      }

      // Trata ações de opções rápidas (Traduzir/Áudio) - APENAS quando há lastResponse
      const textoMsg = message.body ? message.body.trim().toLowerCase() : '';

      // Verifica se é uma ação de tradução - APENAS se há lastResponse
      if ((message.selectedRowId === 'traduzir_texto' ||
          textoMsg === 'traduzir' ||
          textoMsg === '📝 traduzir' ||
          textoMsg.includes('traduzir')) && lastResponses[user]) {

        try {
          await client.startTyping(user);
          console.log(`🔄 Traduzindo: ${lastResponses[user]}`);
          const traducao = await gerarTraducao(lastResponses[user], estados[user]?.idioma || 'Inglês');
          await client.stopTyping(user);
          await client.sendText(user, `📝 *Tradução:* ${traducao}`);
        } catch (err) {
          await client.stopTyping(user);
          console.error('Erro ao traduzir:', err);
          await client.sendText(user, 'Erro ao traduzir o texto.');
        }
        return;
      }

      // Verifica se é uma ação de áudio - APENAS se há lastResponse
      if ((message.selectedRowId === 'enviar_audio' ||
          textoMsg === 'áudio' ||
          textoMsg === 'audio' ||
          textoMsg === '🔊 áudio' ||
          textoMsg === '🔊 audio' ||
          textoMsg.includes('áudio') ||
          textoMsg.includes('audio')) && lastResponses[user]) {

        try {
          await client.startTyping(user);
          console.log(`🔊 Gerando áudio otimizado: ${lastResponses[user]}`);
          const nomeArquivo = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Usa a função otimizada para professor com o gênero do usuário
          const generoUsuario = estados[user]?.genero || 'feminino';
          const audioBuffer = await gerarAudioProfessor(
            lastResponses[user],
            estados[user]?.idioma || 'Inglês',
            nomeArquivo,
            generoUsuario
          );

          const audioBase64 = Buffer.from(audioBuffer).toString('base64');
          await client.stopTyping(user);
          await client.sendPttFromBase64(user, audioBase64);
          console.log(`✅ Áudio enviado com sucesso (${audioBuffer.length} bytes)`);
        } catch (err) {
          await client.stopTyping(user);
          console.error('❌ Erro ao gerar áudio:', err);
          await client.sendText(user, 'Erro ao gerar o áudio. Tente novamente em alguns segundos.');
        }
        return;
      }

      // Se chegou até aqui e é uma solicitação de áudio/tradução sem lastResponse, informa o usuário
      // Só mostra essa mensagem se o usuário já estiver na etapa de estudo (etapa 4)
      if (
        (textoMsg.includes('áudio') || textoMsg.includes('audio') || textoMsg.includes('traduzir')) &&
        !lastResponses[user] &&
        estados[user]?.etapa === 4
      ) {
        await client.sendText(user, 'Não há mensagem para converter em áudio. Envie uma mensagem primeiro!');
        return;
      }

      try {
        await client.startTyping(user);
        const comando = processarComandoEspecial(message.body);
        if (comando) {
          await processarComando(client, user, comando);
          await client.stopTyping(user);
          return;
        }

        let usuarioBanco = await consultarUsuario(user);

        if (!estados[user]) {
          if (usuarioBanco) {
            estados[user] = {
              nome: usuarioBanco.nome,
              genero: usuarioBanco.genero,
              idioma: usuarioBanco.idioma,
              professor: usuarioBanco.professor,
              etapa: 3, // Vai direto para seleção de modo
              nivel: usuarioBanco.nivel,
              pontuacao: usuarioBanco.pontuacao,
              streak: usuarioBanco.streak_dias,
              aula_atual: usuarioBanco.aula_atual || 1,
              etapaAulaAtual: 'EXPLICACAO_INICIAL'
            };

            const novoStreak = await atualizarStreak(user);
            estados[user].streak = novoStreak;

            await mostrarMenuPrincipal(client, user, estados[user]);
            await client.stopTyping(user);
            return;
          } else {
            estados[user] = { etapa: 0 };
          }
        }

        const estado = estados[user];

        if (estado.etapa === 0) {
          await iniciarCadastro(client, user, estado);
          await client.stopTyping(user);
          return;
        }

        if (estado.etapa === 1) {
          await processarNome(client, user, estado, message.body);
          await client.stopTyping(user);
          return;
        }

        if (estado.etapa === 2) {
          await processarIdioma(client, user, estado, message);
          await client.stopTyping(user);
          return;
        }

        if (estado.etapa === 3) {
          await processarSelecaoModoEstudo(client, user, estado, message);
          await client.stopTyping(user);
          return;
        }

        if (estado.etapa === 4) {
          await processarEstudo(client, user, estado, message, usuarioBanco);
          await client.stopTyping(user);
          return;
        }

      } catch (error) {
        await client.stopTyping(user);
        console.error('❌ Erro ao processar mensagem:', error);
        await client.sendText(user, 'Desculpe, ocorreu um erro. Tente novamente ou digite /menu para voltar ao início.');
      }
    });

    async function processarAudioDoAluno(client, user, message) {
      try {
        if (!aguardandoAudio[user]) {
          await client.sendText(user, '🎤 Recebi seu áudio! Mas no momento não estou esperando uma gravação. Use o modo Aula Guiada para exercícios de pronúncia!');
          return;
        }

        console.log('🎤 Processando áudio do aluno...');
        await client.sendText(user, '🔄 Analisando seu áudio... Um momento!');

        // Baixa o áudio e converte para buffer
        const mediaData = await client.downloadMedia(message);
        const audioBuffer = Buffer.from(mediaData.split(';base64,').pop(), 'base64');

        // Processa o áudio usando a função centralizada
        const resultadoTranscricao = await processarAudioAluno(
          audioBuffer,
          estados[user]?.idioma || 'Inglês',
          message.mimetype || 'audio/wav'
        );

        // Analisa a pronúncia
        const textoEsperado = aguardandoAudio[user].textoEsperado;
        const analise = await analisarPronunciaIA(
          resultadoTranscricao.texto,
          textoEsperado,
          estados[user]?.idioma || 'Inglês'
        );

        // Monta resposta detalhada
        const feedback = `
🎤 **Análise da sua Pronúncia**

📝 **Você disse:** "${resultadoTranscricao.texto}"
🎯 **Esperado:** "${textoEsperado}"

📊 **Pontuação:** ${analise.pontuacao}/100

${analise.analiseCompleta}

${analise.pontuacao >= 80 ? '🎉 Excelente pronúncia!' :
  analise.pontuacao >= 60 ? '👍 Boa pronúncia, continue praticando!' :
  '💪 Continue praticando, você vai melhorar!'}
        `;

        await client.sendText(user, feedback);

        // Adiciona à sessão se estiver em aula guiada
        if (sessoesAulaGuiada[user]) {
          sessoesAulaGuiada[user].adicionarAudioAnalisado(analise);
          sessoesAulaGuiada[user].incrementarQuestao(analise.pontuacao >= 60);
        }

        // Limpa o estado de espera de áudio
        delete aguardandoAudio[user];

        // Continua a aula se estiver no modo aula guiada
        if (estados[user]?.modo === 'aula_guiada') {
          setTimeout(async () => {
            await client.sendText(user, '📚 Vamos continuar com a aula! Envie qualquer mensagem para prosseguir.');
          }, 2000);
        }

      } catch (error) {
        console.error('❌ Erro ao processar áudio do aluno:', error);
        await client.sendText(user, '❌ Desculpe, não consegui processar seu áudio. Tente gravar novamente!');
        delete aguardandoAudio[user];
      }
    }

    async function processarComando(client, user, comando) {
      const usuarioBanco = await consultarUsuario(user);
      if (!usuarioBanco) {
        await client.sendText(user, 'Você precisa se cadastrar primeiro. Envie qualquer mensagem para começar!');
        return;
      }

      // Atualiza o estado se necessário
      if (!estados[user]) {
        estados[user] = {
          nome: usuarioBanco.nome,
          genero: usuarioBanco.genero,
          idioma: usuarioBanco.idioma,
          professor: usuarioBanco.professor,
          etapa: 3,
          nivel: usuarioBanco.nivel,
          pontuacao: usuarioBanco.pontuacao,
          streak: usuarioBanco.streak_dias,
          aula_atual: usuarioBanco.aula_atual || 1,
          etapaAulaAtual: 'EXPLICACAO_INICIAL'
        };
      }

      switch (comando) {
        case 'menu_principal':
          await mostrarMenuPrincipal(client, user, estados[user]);
          break;
        case 'ver_progresso':
          await mostrarProgresso(client, user, usuarioBanco);
          break;
        case 'info_aula_atual':
          await mostrarInfoAulaAtual(client, user, usuarioBanco);
          break;
        case 'proxima_aula':
          await avancarProximaAula(client, user, usuarioBanco);
          // Atualiza o estado local
          estados[user].aula_atual = (usuarioBanco.aula_atual || 1) + 1;
          estados[user].etapaAulaAtual = 'EXPLICACAO_INICIAL'; // Reset da etapa
          break;
        case 'revisar_vocabulario':
          const revisao = await iniciarRevisaoVocabulario(usuarioBanco.id, usuarioBanco.idioma);
          await client.sendText(user, revisao.mensagem);
          break;
        case 'verificar_nivel':
          await client.sendText(user, `🎯 Seu nível atual: ${usuarioBanco.nivel.charAt(0).toUpperCase() + usuarioBanco.nivel.slice(1)}`);
          break;
        case 'ver_streak':
          await client.sendText(user, `🔥 Sua sequência atual: ${usuarioBanco.streak_dias} dias consecutivos!`);
          break;
        case 'mostrar_ajuda':
          await mostrarAjuda(client, user);
          break;
      }
    }

    async function iniciarCadastro(client, user, estado) {
      await client.sendText(user, '👋 Olá! Bem-vindo à ONEDI, sua escola de idiomas inteligente com IA!\n\n📝 Para começar, qual é o seu nome?');
      estado.etapa = 1;
    }

    async function processarNome(client, user, estado, nome) {
      estado.nome = nome.trim();

      const genero = await detectarGenero(estado.nome);
      estado.genero = genero;

      const nomeAssistente = genero === 'masculino' ? 'Isaias' : 'Rute';
      estado.professor = nomeAssistente;

      await client.sendText(user, `Prazer em conhecê-lo, ${estado.nome}! 👨‍🏫👩‍🏫\n\nMeu nome é ${nomeAssistente} e serei seu professor de idiomas com inteligência artificial!`);

      await client.sendListMessage(user, {
        buttonText: 'Escolher idioma',
        description: 'Qual idioma você deseja aprender? Temos um teste gratuito para você! 🎁',
        sections: [
          {
            title: 'Idiomas Disponíveis',
            rows: [
              { rowId: 'ingles', title: '🇺🇸 Inglês', description: 'O idioma mais falado no mundo' },
              { rowId: 'espanhol', title: '🇪🇸 Espanhol', description: 'Segundo idioma mais falado' },
              { rowId: 'frances', title: '🇫🇷 Francês', description: 'A língua do amor e da cultura' },
              { rowId: 'mandarim', title: '🇨🇳 Mandarim', description: 'O idioma do futuro' }
            ]
          }
        ]
      });

      estado.etapa = 2;
    }

    async function processarIdioma(client, user, estado, message) {
      const idiomaInput = message.selectedRowId || message.body.trim();
      const idioma = validarIdioma(idiomaInput);

      if (!idioma) {
        await client.sendText(user, '❌ Por favor, selecione um idioma válido clicando no botão.');
        return;
      }

      estado.idioma = idioma;
      estado.aula_atual = 1; // Inicia na primeira aula
      estado.etapaAulaAtual = 'EXPLICACAO_INICIAL';

      await salvarUsuario(user, {
        nome: estado.nome,
        genero: estado.genero,
        idioma: estado.idioma,
        professor: estado.professor,
        etapa: 3,
        nivel: 'iniciante',
        pontuacao: 0,
        streak_dias: 1,
        aula_atual: 1
      });

      // Salva a primeira aula no histórico
      const primeiraAula = obterProximaAula(idioma, 0);
      const usuarioBanco = await consultarUsuario(user);
      await salvarHistoricoAula(usuarioBanco.id, primeiraAula.id, primeiraAula.topico, primeiraAula.conteudo, primeiraAula.nivel);

      await client.sendText(user, `🎉 Excelente! Você escolheu aprender ${idioma}.\n\n🚀 Agora vamos começar sua jornada de aprendizado com IA avançada!`);

      await mostrarMenuPrincipal(client, user, estado);
      estado.etapa = 3;
    }

    async function processarSelecaoModoEstudo(client, user, estado, message) {
      const modoInput = message.selectedRowId || message.body.trim().split('\n')[0];
      const modo = validarModoEstudo(modoInput);

      console.log(`🔍 Validando modo: "${modoInput}" -> "${modo}"`);

      if (!modo) {
        await client.sendText(user, '❌ Por favor, selecione um modo de estudo válido clicando no botão.');
        return;
      }

      // Limpa threadIdAulaGuiada ao trocar de modo
      if (estado.modo !== modo && estado.threadIdAulaGuiada) {
        delete estado.threadIdAulaGuiada;
      }
      estado.modo = modo;

      const usuarioBanco = await consultarUsuario(user);

      // Se for aula guiada, mostra informações detalhadas e inicia
      if (modo === 'aula_guiada') {
        await mostrarMenuAulaGuiada(client, user, estado);

        // Cria sessão de aula guiada aprimorada
        sessoesAulaGuiada[user] = new SessaoAulaGuiada(usuarioBanco.id, estado.idioma);

        // Reset da etapa da aula
        estado.etapaAulaAtual = 'ABERTURA_AULA';
        estado.threadIdAulaGuiada = null; // Garante que começa nova thread

        // Inicia a aula automaticamente após mostrar o menu
        setTimeout(async () => {
          await client.sendText(user, '🚀 **Iniciando sua Aula Guiada Interativa!**\n\n👉 **Envie qualquer mensagem para começar a primeira etapa da aula!**');
        }, 2000);
      } else {
        // Para outros modos, mensagens simples
        const mensagensModo = {
          'pratica_livre': '💬 Modo Prática Livre ativado!\n\nVamos ter uma conversa natural. Eu vou corrigir seus erros e te ajudar a melhorar.\n\nSobre o que você gostaria de conversar?',

          'modo_professor': '👨‍🏫 Modo Professor ativado!\n\nEstou aqui para explicar qualquer dúvida detalhadamente.\n\nQual tópico você gostaria que eu explicasse?',

          'modo_vocabulario': '📖 Modo Vocabulário ativado!\n\nVou te ensinar palavras novas e revisar as que você já aprendeu.\n\nQue tipo de vocabulário você quer aprender hoje?'
        };

        await client.sendText(user, mensagensModo[modo] || 'Modo selecionado! Vamos começar?');
      }

      estado.etapa = 4;
    }

    async function processarEstudo(client, user, estado, message, usuarioBanco) {
      if (!message.body || message.body.length === 0) return;

      try {
        console.log(`🎓 Processando estudo: ${message.body}`);
        const resultado = await processarModoEstudo(estado, message.body, usuarioBanco);

        // Salva a última resposta para tradução/áudio
        lastResponses[user] = resultado.resposta;
        console.log(`💾 Salvando resposta para tradução/áudio: ${resultado.resposta.substring(0, 50)}...`);

        // Envia a mensagem principal
        await client.sendText(user, resultado.resposta);

        // Se há imagem gerada, envia a imagem
        if (resultado.imagemGerada) {
          try {
            await client.sendImage(user, resultado.imagemGerada.url, 'imagem-aula',
              `🖼️ Imagem da aula: ${resultado.imagemGerada.topico}`);

            if (sessoesAulaGuiada[user]) {
              sessoesAulaGuiada[user].adicionarImagemGerada(resultado.imagemGerada);
            }
          } catch (imgError) {
            console.error('Erro ao enviar imagem:', imgError);
            await client.sendText(user, '🖼️ Não foi possível enviar a imagem, mas vamos continuar com a aula!');
          }
        }

        // Se há solicitação de áudio, configura o estado de espera
        if (resultado.audioSolicitado) {
          aguardandoAudio[user] = {
            textoEsperado: resultado.audioSolicitado,
            timestamp: Date.now()
          };

          // Remove a espera após 5 minutos se não receber áudio
          setTimeout(() => {
            if (aguardandoAudio[user]) {
              delete aguardandoAudio[user];
            }
          }, 5 * 60 * 1000);
        }

        // Envia as opções de tradução e áudio apenas se não estiver esperando áudio
        if (!aguardandoAudio[user]) {
          await enviarOpcoesMensagem(client, user, estado.idioma);
        }

        // Se for aula guiada, salva o progresso da aula atual
        if (estado.modo === 'aula_guiada' && resultado.aulaAtual) {
          await salvarHistoricoAula(
            usuarioBanco.id,
            resultado.aulaAtual.id,
            resultado.aulaAtual.topico,
            resultado.aulaAtual.conteudo,
            resultado.aulaAtual.nivel
          );
        }

        if (estado.modo === 'aula_guiada' && sessoesAulaGuiada[user]) {
          const sessao = sessoesAulaGuiada[user];

          // Adiciona a etapa completada
          if (estado.etapaAulaAtual) {
            sessao.adicionarEtapaCompletada(estado.etapaAulaAtual);
          }

          sessao.incrementarQuestao(true);

          const limites = sessao.verificarLimites();

          if (limites.atingiuLimite) {
            const resultadoSessao = await sessao.finalizarSessao();

            await client.sendText(user, `
🎉 **Sessão de Aula Guiada Interativa Concluída!**

📊 **Resultado da Sessão:**
• Questões respondidas: ${resultadoSessao.questoesRespondidas}
• Questões corretas: ${resultadoSessao.questoesCorretas}
• Aproveitamento: ${resultadoSessao.aproveitamento}%
• Etapas completadas: ${resultadoSessao.etapasCompletas}/11
• Imagens analisadas: ${resultadoSessao.imagensGeradas}
• Áudios analisados: ${resultadoSessao.audiosAnalisados}

💰 **Pontuação Detalhada:**
• Pontos base: ${resultadoSessao.bonusDetalhado.pontosBase}
• Bônus etapas: ${resultadoSessao.bonusDetalhado.bonusEtapas}
• Bônus imagens: ${resultadoSessao.bonusDetalhado.bonusImagens}
• Bônus áudios: ${resultadoSessao.bonusDetalhado.bonusAudios}
• **Total: ${resultadoSessao.pontosGanhos} pontos!**

⏱️ Tempo de estudo: ${resultadoSessao.duracaoMinutos} minutos

🚀 **Parabéns pelo seu progresso interativo!**

💡 *Dica: Use /proxima para avançar para a próxima aula quando estiver pronto!*
            `);

            const novaPontuacao = (usuarioBanco.pontuacao || 0) + resultadoSessao.pontosGanhos;
            const novoNivel = calcularNivel(novaPontuacao);

            await salvarUsuario(user, {
              ...estado,
              pontuacao: novaPontuacao,
              nivel: novoNivel,
              etapa: 3
            });

            delete sessoesAulaGuiada[user];
            delete aguardandoAudio[user]; // Limpa qualquer espera de áudio
            estado.etapa = 3;
            estado.etapaAulaAtual = 'EXPLICACAO_INICIAL'; // Reset

            setTimeout(() => {
              mostrarMenuPrincipal(client, user, estado);
            }, 3000);

          } else {
            await client.sendText(user, `⏱️ **Progresso da Sessão Interativa:**\n📝 Questões restantes: ${limites.questoesRestantes}\n⏰ Tempo restante: ${limites.tempoRestante} min\n🎯 Etapas completadas: ${limites.etapasCompletas}/11`);
          }
        }

        await atualizarStreak(user);

      } catch (error) {
        console.error('Erro ao processar estudo:', error);
        await client.sendText(user, 'Desculpe, houve um problema. Vamos tentar novamente!');
      }
    }

    async function mostrarAjuda(client, user) {
      const textoAjuda = `
🆘 **Central de Ajuda - ONEDI IA**

**Comandos disponíveis:**
• /menu - Voltar ao menu principal
• /progresso - Ver seu progresso detalhado
• /aula - Ver informações da aula atual
• /proxima - Avançar para a próxima aula
• /vocabulario - Revisar palavras aprendidas
• /nivel - Verificar seu nível atual
• /streak - Ver sua sequência de dias
• /ajuda - Mostrar esta ajuda

**Modos de Estudo:**
📚 **Aula Guiada Interativa** - Sistema completo com:
   • Explicações bilíngues (idioma + português)
   • Exercícios de múltipla escolha
   • Geração de imagens educativas
   • Análise de pronúncia com IA
   • Correção gramatical inteligente
   • Progressão estruturada

💬 **Prática Livre** - Conversação natural
👨‍🏫 **Modo Professor** - Explicações detalhadas
📖 **Modo Vocabulário** - Aprendizado de palavras

**Recursos de IA Avançada:**
🖼️ **Geração de Imagens** - Imagens educativas personalizadas
🎤 **Análise de Pronúncia** - Feedback detalhado de fala
🔊 **Text-to-Speech** - Áudio de alta qualidade
📝 **Correção Inteligente** - IA corrige e explica erros
🌐 **Tradução Instantânea** - Tradução contextual

**Como usar a Aula Guiada Interativa:**
1. Selecione "Aula Guiada Contínua"
2. Siga as instruções do professor IA
3. Responda às perguntas de múltipla escolha
4. Descreva as imagens geradas
5. Grave áudios quando solicitado
6. Forme frases para correção
7. Complete todas as etapas da aula

**Dicas:**
• Estude todos os dias para manter sua sequência
• Use o áudio para melhorar a pronúncia
• Grave áudios claros para melhor análise
• Descreva as imagens com detalhes
• Complete as aulas em sequência

Precisa de mais ajuda? Entre em contato conosco! 📞
      `;

      await client.sendText(user, textoAjuda);
    }

  })
  .catch((error) => {
    console.error('❌ Erro ao conectar:', error);
  });

// Limpeza periódica de estados de áudio antigos
setInterval(() => {
  const agora = Date.now();
  const cincoMinutos = 5 * 60 * 1000;

  for (const user in aguardandoAudio) {
    if (agora - aguardandoAudio[user].timestamp > cincoMinutos) {
      delete aguardandoAudio[user];
      console.log(`🧹 Limpou estado de áudio antigo para ${user}`);
    }
  }
}, 60 * 1000); // Executa a cada minuto

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado:', err);
  // Não encerra o processo, apenas loga o erro
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Rejeição de promessa não tratada:', reason);
  // Não encerra o processo, apenas loga o erro
});

console.log('🔄 Iniciando sistema de aula guiada interativa com IA completa...');
