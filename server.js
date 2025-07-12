import wppconnect from '@wppconnect-team/wppconnect';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import {
  consultarUsuario,
  salvarUsuario,
  atualizarStreak,
  salvarHistoricoAula,
  verificarAcessoIdioma,
  definirIdiomaTestе,
  verificarStatusPlano,
  salvarDadosTeste
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
  mostrarStatusPlano,
  mostrarSelecaoIdioma,
  processarSelecaoIdioma,
  mostrarPersonalizarPlano,
  validarIdioma,
  validarModoEstudo,
  calcularNivel,
  normalizarTexto,
  verificarLimitesTempo,
  enviarLembreteRecursos
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
import {
  iniciarTesteModo,
  obterSessaoTeste,
  finalizarSessaoTeste
} from './src/testModeFlow.js';

dotenv.config();

const estados = {};
const sessoesAulaGuiada = {};
const lastResponses = {};
const aguardandoAudio = {};
const contadorMensagens = {};

wppconnect
  .create({
    session: 'session-teste',
    headless: true,
    multiDevice: true,
    phoneNumber: '553193796314',
    catchLinkCode: (str) => console.log('Code: ' + str),
    forceLinkCode: true,
    puppeteerOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  })
  .then((client) => {
    console.log('🚀 Conectado ao WhatsApp!');
    console.log('📚 Sistema de Ensino de Idiomas com Teste Personalizado Ativo');

    function extrairNumeroWhatsapp(idWhatsapp) {
      return idWhatsapp.replace('@c.us', '');
    }

    client.onMessage(async (message) => {
      const user = message.from;
      const numeroLimpo = extrairNumeroWhatsapp(user);

      // if (user !== '5511980483504@c.us') return;
      if (message.isGroupMsg || user.endsWith('@status') || user === 'status@broadcast') return;

      // Ignora mensagens antigas (mais de 10 minutos)
      const agora = Math.floor(Date.now() / 1000);
      if (message.timestamp && agora - message.timestamp > 600) {
        console.log(`⏳ Ignorando mensagem antiga de ${user} (timestamp: ${message.timestamp})`);
        return;
      }

      let usuarioBancoLog = null;
      try {
        usuarioBancoLog = await consultarUsuario(numeroLimpo);
        if (usuarioBancoLog) {
          console.log(`🔎 Usuário encontrado no banco: ${JSON.stringify(usuarioBancoLog)}`);
        } else {
          console.log(`🔎 Usuário NÃO encontrado no banco: ${numeroLimpo}`);
        }
      } catch (e) {
        console.error('Erro ao consultar usuário para log:', e);
      }

      console.log(`📱 Mensagem de ${user}: ${message.body || '[ÁUDIO/MÍDIA]'}`);
      console.log(`📱 Tipo: ${message.type}, SelectedRowId: ${message.selectedRowId}`);

      // Incrementa contador de mensagens para lembretes de menu
      if (!contadorMensagens[user]) contadorMensagens[user] = 0;
      contadorMensagens[user]++;

      if (message.type === 'ptt' || message.type === 'audio') {
        await client.startTyping(user);
        await processarAudioDoAluno(client, user, message);
        await client.stopTyping(user);
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

      // Verifica se é uma ação de áudio - APENAS se há lastResponse E modo aula_guiada
      if ((message.selectedRowId === 'enviar_audio' ||
        textoMsg === 'áudio' ||
        textoMsg === 'audio' ||
        textoMsg === '🔊 áudio' ||
        textoMsg === '🔊 audio' ||
        textoMsg.includes('áudio') ||
        textoMsg.includes('audio')) && lastResponses[user] && estados[user]?.modo === 'aula_guiada') {

        try {
          await client.startTyping(user);
          console.log(`🔊 Gerando áudio otimizado: ${lastResponses[user]}`);
          const nomeArquivo = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

      try {
        await client.startTyping(user);
        const comando = message.body ? processarComandoEspecial(message.body) : null;
        if (comando) {
          await processarComando(client, user, comando);
          await client.stopTyping(user);
          return;
        }

        let usuarioBanco = await consultarUsuario(numeroLimpo);

        if (!estados[user]) {
          if (usuarioBanco) {
            // Verifica status do plano antes de continuar
            const statusPlano = await verificarStatusPlano(numeroLimpo);

            estados[user] = {
              nome: usuarioBanco.nome,
              genero: usuarioBanco.genero,
              idioma: usuarioBanco.idioma,
              professor: usuarioBanco.professor,
              etapa: usuarioBanco.idioma ? 3 : 2.5, // Se não tem idioma, vai para seleção
              nivel: usuarioBanco.nivel,
              pontuacao: usuarioBanco.pontuacao,
              streak: usuarioBanco.streak_dias,
              aula_atual: usuarioBanco.aula_atual || 1,
              etapaAulaAtual: 'EXPLICACAO_INICIAL',
              statusPlano: statusPlano.status_plano,
              tempoRestante: statusPlano.tempo_restante_minutos
            };

            const novoStreak = await atualizarStreak(numeroLimpo);
            estados[user].streak = novoStreak;

            // NOVO: Verifica se é usuário em modo de teste
            if (statusPlano.status_plano !== 'ativo') {
              console.log(`🧪 Usuário em modo de teste detectado: ${numeroLimpo}`);

              // Verifica se já concluiu o teste personalizado
              if (usuarioBanco.teste_personalizado_concluido) {
                console.log(`✅ Usuário já concluiu o teste personalizado: ${numeroLimpo}`);
                await client.sendText(user, `🎉 **Parabéns! Teste Concluído!**

🏆 **Você já completou seu Teste Personalizado da ONEDI!**

📊 **Seus Resultados:**
• ✅ **${usuarioBanco.perguntas_teste_respondidas || 10} perguntas** respondidas
• 📈 **Nível final:** ${usuarioBanco.nivel_teste_final || 'intermediário'}

🚀 **Continue sua Jornada com a ONEDI!**
💎 **Planos Personalizados Disponíveis!**

🌐 **Acesse nosso site oficial:**
👉 https://onedi-lp.vercel.app/

💡 **Para personalizar seu plano, digite /personalizar**

💡 **Comandos úteis:** /menu | /personalizar | /status`);
                await client.stopTyping(user);
                return;
              }

              // Verifica se já tem sessão de teste ativa
              let sessaoTeste = obterSessaoTeste(usuarioBanco.id);

              if (!sessaoTeste && !usuarioBanco.teste_personalizado_concluido) {
                // Inicia novo teste personalizado
                sessaoTeste = iniciarTesteModo(usuarioBanco.id, usuarioBanco.idioma, usuarioBanco.nome, usuarioBanco.genero);
                const resultadoInicial = await sessaoTeste.iniciarTeste();

                await client.sendText(user, resultadoInicial.mensagem);
                await client.stopTyping(user);
                return;
              } else if (sessaoTeste) {
                // Continua teste em andamento
                await client.sendText(user, `🧪 **Continuando seu Teste Personalizado**\n\n📊 **Progresso:** ${sessaoTeste.getProgresso().perguntaAtual}/10 perguntas\n\n💡 Responda à pergunta anterior para continuar!`);
                await client.stopTyping(user);
                return;
              }
            }

            // Mostra status do plano se necessário
            if (statusPlano.status_plano === 'teste_gratuito' && statusPlano.tempo_restante_minutos <= 3) {
              await client.sendText(user, `⚠️ **Atenção:** Restam ${statusPlano.tempo_restante_minutos} minutos do seu teste gratuito!\n\nPara continuar estudando sem limites, digite **/personalizar** para criar seu plano ideal!`);
            }

            // Se não tem idioma definido, vai para seleção de idioma
            if (!usuarioBanco.idioma) {
              await client.sendText(user, `👋 **Bem-vindo de volta, ${usuarioBanco.nome}!**\n\n🌐 **Primeiro, vamos selecionar seu idioma de estudo:**`);
              await mostrarSelecaoIdioma(client, user, usuarioBanco);
              estados[user].etapa = 2.5; // Aguardando seleção de idioma
              await client.stopTyping(user);
              return;
            }

            await mostrarMenuPrincipal(client, user, estados[user]);
            await client.stopTyping(user);
            return;
          } else {
            estados[user] = { etapa: 0 };
          }
        }

        // NOVO: Verifica se há sessão de teste ativa
        const sessaoTeste = obterSessaoTeste(usuarioBanco?.id);
        if (sessaoTeste && usuarioBanco && usuarioBanco.status_plano !== 'ativo') {
          // Verifica se o usuário já concluiu o teste
          if (usuarioBanco.teste_personalizado_concluido) {
            await client.sendText(user, `🎉 **Parabéns! Teste Concluído!**

🏆 **Você já completou seu Teste Personalizado da ONEDI!**

🚀 **Continue sua jornada com nossos planos personalizados!**
💎 Digite **/personalizar** para ver as opções.

💡 **Comandos úteis:** /menu | /personalizar | /status`);
            await client.stopTyping(user);
            return;
          }

          console.log(`🎤 Processando áudio no teste personalizado`);

          const resultadoTranscricao = await processarAudioAluno(
            audioBuffer,
            sessaoTeste.idioma,
            message.mimetype || 'audio/wav'
          );

          console.log(`📝 Transcrição do teste: "${resultadoTranscricao.texto}"`);

          await client.sendText(user, `🎤 **Áudio recebido e transcrito!**\n\n📝 **Você disse:** "${resultadoTranscricao.texto}"\n\n🧪 **Processando sua resposta no teste personalizado...**`);

          // Processa a transcrição como resposta do teste
          const resultado = await sessaoTeste.processarResposta(resultadoTranscricao.texto, client, user);

          if (resultado.testeConcluido) {
            // Salva dados do teste no banco
            await salvarDadosTeste(usuarioBanco.id, {
              interessesDetectados: resultado.interessesDetectados,
              perguntasRespondidas: resultado.perguntasRespondidas,
              nivelFinal: resultado.nivelFinal
            });

            // Remove sessão de teste
            finalizarSessaoTeste(usuarioBanco.id);

            console.log(`✅ Teste personalizado concluído para usuário ${usuarioBanco.id}`);
          }

          // Se a resposta foi inválida, não continua
          if (resultado.respostaInvalida) {
            await client.stopTyping(user);
            return;
          }

          if (resultado.testeConcluido) {
            // Salva dados do teste no banco
            await salvarDadosTeste(usuarioBanco.id, {
              interessesDetectados: resultado.interessesDetectados,
              perguntasRespondidas: resultado.perguntasRespondidas,
              nivelFinal: resultado.nivelFinal
            });

            // Remove sessão de teste
            finalizarSessaoTeste(usuarioBanco.id);

            console.log(`✅ Teste personalizado concluído para usuário ${usuarioBanco.id}`);
          }

          await client.stopTyping(user);
          return;
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

        if (estado.etapa === 2.5) {
          // Processando seleção de idioma para usuário existente
          const resultado = await processarSelecaoIdioma(client, user, usuarioBanco, message);
          if (resultado && resultado.aguardandoSelecaoNivel) {
            estado.idioma = resultado.idiomaSelecionado;
            estado.etapa = 2.7; // Nova etapa para seleção de nível
          } else if (resultado && resultado.idiomaSelecionado) {
            estado.idioma = resultado.idiomaSelecionado;
            estado.etapa = 3;

            // Verifica se já concluiu o teste antes de mostrar o menu
            if (usuarioBanco.teste_personalizado_concluido) {
              await mostrarMenuPrincipal(client, user, estado);
            } else {
              // Se não concluiu o teste, inicia automaticamente
              const sessaoTeste = iniciarTesteModo(usuarioBanco.id, resultado.idiomaSelecionado, estado.nome, estado.genero);
              const resultadoInicial = await sessaoTeste.iniciarTeste();

              setTimeout(async () => {
                await client.sendText(user, resultadoInicial.mensagem);
              }, 2000);
            }
          }
          await client.stopTyping(user);
          return;
        }

        if (estado.etapa === 2.7) {
          // Processando seleção de nível
          const resultado = await processarSelecaoNivel(client, user, usuarioBanco, message, estado.idioma);
          if (resultado && resultado.nivelSelecionado) {
            estado.nivel = resultado.nivelSelecionado;
            estado.aula_atual = resultado.aulaInicial;
            estado.etapa = 3;

            // Verifica se deve iniciar teste ou mostrar menu
            if (resultado.iniciarTeste) {
              // Inicia teste personalizado com nível ajustado
              const sessaoTeste = iniciarTesteModo(usuarioBanco.id, estado.idioma, estado.nome, estado.genero);
              sessaoTeste.setNivelInicial(resultado.nivelSelecionado); // Ajusta nível inicial do teste
              const resultadoInicial = await sessaoTeste.iniciarTeste();

              setTimeout(async () => {
                await client.sendText(user, resultadoInicial.mensagem);
              }, 2000);
            } else {
              // Usuário já concluiu teste, mostra menu principal
              await mostrarMenuPrincipal(client, user, estado);
            }
          }
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
        await client.sendText(user, 'Desculpe, ocorreu um erro. Tente novamente ou digite **/menu** para voltar ao início.');
      }
    });

    async function processarAudioDoAluno(client, user, message) {
      try {
        console.log('🎤 Processando áudio do aluno...');

        // Extrai número limpo para consulta
        const numeroLimpo = extrairNumeroWhatsapp(user);
        // Verifica limites de tempo antes de processar
        const usuarioBanco = await consultarUsuario(numeroLimpo);
        if (usuarioBanco) {
          // NOVO: Verifica se há sessão de teste ativa
          const sessaoTeste = obterSessaoTeste(usuarioBanco.id);
          if (sessaoTeste && usuarioBanco.status_plano !== 'ativo') {
            await client.sendText(user, '🎤 **Áudio recebido!**\n\n🧪 **Modo Teste Personalizado:** Por favor, responda por texto para uma melhor experiência personalizada.\n\n💡 **Dica:** Digite sua resposta para continuar o teste!');
            return;
          }

          const podeUsar = await verificarLimitesTempo(client, user, usuarioBanco, 1);
          if (!podeUsar) return;
        }

        await client.sendText(user, '🔄 Analisando seu áudio... Um momento!');

        const mediaData = await client.downloadMedia(message);
        const audioBuffer = Buffer.from(mediaData.split(';base64,').pop(), 'base64');

        const resultadoTranscricao = await processarAudioAluno(
          audioBuffer,
          estados[user]?.idioma || 'Inglês',
          message.mimetype || 'audio/wav'
        );

        console.log(`📝 Transcrição: "${resultadoTranscricao.texto}"`);

        if (aguardandoAudio[user]) {
          const textoEsperado = aguardandoAudio[user].textoEsperado;
          const analise = await analisarPronunciaIA(
            resultadoTranscricao.texto,
            textoEsperado,
            estados[user]?.idioma || 'Inglês'
          );

          const feedback = `
🎤 **Análise da sua Pronúncia**

📝 **Você disse:** "${resultadoTranscricao.texto}"
🎯 **Esperado:** "${textoEsperado}"

📊 **Pontuação:** ${analise.pontuacao}/100

${analise.analiseCompleta}

${analise.pontuacao >= 80 ? '🎉 Excelente pronúncia!' :
              analise.pontuacao >= 60 ? '👍 Boa pronúncia, continue praticando!' :
                '💪 Continue praticando, você vai melhorar!'}

💡 **Comandos úteis:** /menu | /idioma
          `;

          await client.sendText(user, feedback);

          if (sessoesAulaGuiada[user]) {
            sessoesAulaGuiada[user].adicionarAudioAnalisado(analise);
            sessoesAulaGuiada[user].incrementarQuestao(analise.pontuacao >= 60);
          }

          delete aguardandoAudio[user];

          if (estados[user]?.modo === 'aula_guiada') {
            setTimeout(async () => {
              await client.sendText(user, '📚 Vamos continuar com a aula! Envie qualquer mensagem para prosseguir.\n\n💡 **Comandos úteis:** /menu | /idioma');
            }, 2000);
          }
        } else {
          console.log('🎤 Processando áudio como mensagem de texto...');

          const resultado = await processarModoEstudo(estados[user], resultadoTranscricao.texto, usuarioBanco);

          lastResponses[user] = resultado.resposta;

          let respostaCompleta = `🎤 **Recebi seu áudio:** "${resultadoTranscricao.texto}"\n\n`;
          respostaCompleta += resultado.resposta;

          await client.sendText(user, respostaCompleta);

          // Envia áudio automaticamente para modos que não são aula_guiada
          if (estados[user]?.modo !== 'aula_guiada') {
            try {
              const nomeArquivo = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const generoUsuario = estados[user]?.genero || 'feminino';
              const audioBuffer = await gerarAudioProfessor(
                resultado.resposta,
                estados[user]?.idioma || 'Inglês',
                nomeArquivo,
                generoUsuario
              );
              const audioBase64 = Buffer.from(audioBuffer).toString('base64');
              await client.sendPttFromBase64(user, audioBase64);
            } catch (audioError) {
              console.error('Erro ao gerar áudio automático:', audioError);
            }
          }

          if (resultado.imagemGerada) {
            try {
              await client.sendImage(user, resultado.imagemGerada.url, 'imagem-aula',
                `🖼️ Imagem da aula: ${resultado.imagemGerada.topico}`);
            } catch (imgError) {
              console.error('Erro ao enviar imagem:', imgError);
              await client.sendText(user, '🖼️ Não foi possível enviar a imagem, mas vamos continuar!');
            }
          }

          // Só mostra opções de áudio para aula_guiada
          await enviarOpcoesMensagem(client, user, estados[user].idioma, estados[user]?.modo === 'aula_guiada');

          await enviarLembreteRecursos(client, user, contadorMensagens[user]);
        }

      } catch (error) {
        console.error('❌ Erro ao processar áudio do aluno:', error);
        await client.sendText(user, '❌ Desculpe, não consegui processar seu áudio. Tente gravar novamente ou digite **/menu** para outras opções!');
        delete aguardandoAudio[user];
      }
    }

    async function processarComando(client, user, comando) {
      const numeroLimpo = extrairNumeroWhatsapp(user);
      const usuarioBanco = await consultarUsuario(numeroLimpo);
      if (!usuarioBanco) {
        await client.sendText(user, 'Você precisa se cadastrar primeiro. Envie qualquer mensagem para começar!');
        return;
      }

      // NOVO: Verifica se há sessão de teste ativa
      const sessaoTeste = obterSessaoTeste(usuarioBanco.id);
      if (sessaoTeste && usuarioBanco.status_plano !== 'ativo') {
        // Verifica se o usuário já concluiu o teste
        if (usuarioBanco.teste_personalizado_concluido) {
          await client.sendText(user, `🎉 **Parabéns! Teste Concluído!**

🏆 **Você já completou seu Teste Personalizado da ONEDI!**

🚀 **Continue sua jornada com nossos planos personalizados!**
💎 Digite **/personalizar** para ver as opções.

💡 **Comandos úteis:** /menu | /personalizar | /status`);
          return;
        }

        if (comando === 'menu_principal') {
          await client.sendText(user, `🧪 **Teste Personalizado em Andamento**\n\n📊 **Progresso:** ${sessaoTeste.getProgresso().perguntaAtual}/10 perguntas\n\n💡 **Para acessar o menu principal, complete primeiro seu teste personalizado!**\n\nResponda à pergunta anterior para continuar.`);
          return;
        }
      }

      // Atualiza o estado se necessário
      if (!estados[user]) {
        const statusPlano = await verificarStatusPlano(numeroLimpo);
        estados[user] = {
          nome: usuarioBanco.nome,
          genero: usuarioBanco.genero,
          idioma: usuarioBanco.idioma,
          professor: usuarioBanco.professor,
          etapa: usuarioBanco.idioma ? 3 : 2.5,
          nivel: usuarioBanco.nivel,
          pontuacao: usuarioBanco.pontuacao,
          streak: usuarioBanco.streak_dias,
          aula_atual: usuarioBanco.aula_atual || 1,
          etapaAulaAtual: 'EXPLICACAO_INICIAL',
          statusPlano: statusPlano.status_plano
        };
      }

      switch (comando) {
        case 'menu_principal':
          contadorMensagens[user] = 0;
          if (!estados[user].idioma) {
            await client.sendText(user, `🌐 **Primeiro, vamos selecionar seu idioma de estudo:**`);
            await mostrarSelecaoIdioma(client, user, usuarioBanco);
            estados[user].etapa = 2.5;
          } else {
            await mostrarMenuPrincipal(client, user, estados[user]);
          }
          break;
        case 'trocar_idioma':
          await client.sendText(user, `🌐 **Trocar Idioma**\n\nVamos selecionar um novo idioma para seus estudos:`);
          await mostrarSelecaoIdioma(client, user, usuarioBanco);
          estados[user].etapa = 2.5;
          break;
        case 'ver_progresso':
          await mostrarProgresso(client, user, usuarioBanco);
          break;
        case 'ver_status_plano':
          await mostrarStatusPlano(client, user, usuarioBanco);
          break;
        case 'info_aula_atual':
          await mostrarInfoAulaAtual(client, user, usuarioBanco);
          break;
        case 'proxima_aula':
          await avancarProximaAula(client, user, usuarioBanco);
          estados[user].aula_atual = (usuarioBanco.aula_atual || 1) + 1;
          estados[user].etapaAulaAtual = 'EXPLICACAO_INICIAL';
          break;
        case 'revisar_vocabulario':
          const revisao = await iniciarRevisaoVocabulario(usuarioBanco.id, usuarioBanco.idioma);
          await client.sendText(user, revisao.mensagem);
          break;
        case 'verificar_nivel':
          await client.sendText(user, `🎯 Seu nível atual: ${usuarioBanco.nivel.charAt(0).toUpperCase() + usuarioBanco.nivel.slice(1)}\n\n💡 **Comandos úteis:** /menu | /idioma`);
          break;
        case 'ver_streak':
          await client.sendText(user, `🔥 Sua sequência atual: ${usuarioBanco.streak_dias} dias consecutivos!\n\n💡 **Comandos úteis:** /menu | /idioma`);
          break;
        case 'personalizar_plano':
          await mostrarPersonalizarPlano(client, user);
          break;
        case 'mostrar_ajuda':
          await mostrarAjuda(client, user);
          break;
      }
    }

    async function iniciarCadastro(client, user, estado) {
      await client.sendText(user, '👋 Olá! Bem-vindo à ONEDI, sua escola de idiomas inteligente com IA!\n\n🎁 **Você terá uma experiência personalizada!**\n\n📝 Para começar, qual é o seu nome?');
      estado.etapa = 1;
    }

    async function processarNome(client, user, estado, nome) {
      estado.nome = nome.trim();

      const genero = await detectarGenero(estado.nome);
      estado.genero = genero;

      const nomeAssistente = genero === 'masculino' ? 'Isaias' : 'Rute';
      estado.professor = nomeAssistente;

      await client.sendText(user, `Prazer em conhecê-lo, ${estado.nome}! 👨‍🏫👩‍🏫\n\nMeu nome é ${nomeAssistente} e serei seu professor de idiomas com inteligência artificial!\n\n🎁 **Você terá uma experiência personalizada para testar todos os recursos!**`);

      await client.sendListMessage(user, {
        buttonText: 'Escolher idioma',
        description: 'Qual idioma você deseja experimentar? Escolha um para sua experiência personalizada! 🎁',
        sections: [
          {
        title: 'Idiomas Disponíveis',
        rows: [
          { rowId: 'ingles', title: '🇺🇸 Inglês', description: 'O idioma mais falado no mundo' },
          { rowId: 'espanhol', title: '🇪🇸 Espanhol', description: 'O idioma oficial de 20 países' },
          { rowId: 'frances', title: '🇫🇷 Francês', description: 'A língua do amor e da cultura' },
          { rowId: 'mandarim', title: '🇨🇳 Mandarim', description: 'Segundo idioma mais falado' }
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
      estado.aula_atual = 1;
      estado.etapaAulaAtual = 'EXPLICACAO_INICIAL';

      // Define o idioma do teste
      const numeroLimpo = extrairNumeroWhatsapp(user);
      await definirIdiomaTestе(numeroLimpo, idioma);

      const usuarioSalvo = await salvarUsuario(numeroLimpo, {
        nome: estado.nome,
        genero: estado.genero,
        idioma: estado.idioma,
        professor: estado.professor,
        etapa: 3,
        nivel: 'iniciante',
        pontuacao: 0,
        streak_dias: 1,
        aula_atual: 1,
        status_plano: 'teste_gratuito',
        idioma_teste: idioma
      });

      const primeiraAula = obterProximaAula(idioma, 0);
      await salvarHistoricoAula(usuarioSalvo.id, primeiraAula.id, primeiraAula.topico, primeiraAula.conteudo, primeiraAula.nivel);

      await client.sendText(user, `🎉 Excelente! Você escolheu experimentar ${idioma}.\n\n🎁 **Sua experiência personalizada começou agora!**\n\n🚀 Vamos começar com perguntas personalizadas baseadas nos seus interesses!\n\n💡 **Dica:** Digite **/idioma** a qualquer momento para trocar de idioma.`);

      // NOVO: Inicia teste personalizado automaticamente
      const sessaoTeste = iniciarTesteModo(usuarioSalvo.id, idioma, estado.nome, estado.genero);
      const resultadoInicial = await sessaoTeste.iniciarTeste();

      setTimeout(async () => {
        await client.sendText(user, resultadoInicial.mensagem);
      }, 2000);

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

      // Verifica acesso ao idioma antes de continuar
      const numeroLimpo = extrairNumeroWhatsapp(user);
      const usuarioBanco = await consultarUsuario(numeroLimpo);
      const acessoIdioma = await verificarAcessoIdioma(numeroLimpo, estado.idioma);

      if (!acessoIdioma.acesso) {
        await client.sendText(user, `❌ **Acesso Negado**\n\n${acessoIdioma.motivo}\n\n💎 Digite **/personalizar** para ver as opções de upgrade!\n\n💡 **Comandos úteis:** /menu | /idioma`);
        return;
      }

      if (estado.modo !== modo && estado.threadIdAulaGuiada) {
        delete estado.threadIdAulaGuiada;
      }
      estado.modo = modo;

      if (modo === 'aula_guiada') {
        await mostrarMenuAulaGuiada(client, user, estado);
        sessoesAulaGuiada[user] = new SessaoAulaGuiada(usuarioBanco.id, estado.idioma);
        estado.etapaAulaAtual = 'ABERTURA_AULA';
        estado.threadIdAulaGuiada = null;

        setTimeout(async () => {
          await client.sendText(user, '🚀 **Iniciando sua Aula Guiada Interativa!**\n\n👉 **Envie qualquer mensagem para começar a primeira etapa da aula!**\n\n💡 **Comandos úteis:** /menu | /idioma');
        }, 2000);
      } else {
        const mensagensModo = {
          'pratica_livre': '💬 **Modo Prática Livre ativado!**\n\nVamos ter uma conversa natural. Eu vou corrigir seus erros e te ajudar a melhorar.\n\n🎤 **Dica:** Você pode enviar áudios! Eu vou transcrever e responder com texto + áudio automaticamente.\n\n📝 Sobre o que você gostaria de conversar?\n\n💡 **Comandos úteis:** /menu | /idioma',

          'modo_professor': '👨‍🏫 **Modo Professor ativado!**\n\nEstou aqui para explicar qualquer dúvida detalhadamente.\n\n🎤 **Dica:** Você pode enviar áudios com suas perguntas! Eu vou transcrever e explicar com texto + áudio automaticamente.\n\n📚 Qual tópico você gostaria que eu explicasse?\n\n💡 **Comandos úteis:** /menu | /idioma',

          'modo_vocabulario': '📖 **Modo Vocabulário ativado!**\n\nVou te ensinar palavras novas e revisar as que você já aprendeu.\n\n🎤 **Dica:** Você pode enviar áudios! Eu vou transcrever e ensinar vocabulário com texto + áudio automaticamente.\n\n📝 Que tipo de vocabulário você quer aprender hoje?\n\n💡 **Comandos úteis:** /menu | /idioma'
        };

        await client.sendText(user, mensagensModo[modo] || 'Modo selecionado! Vamos começar?');
      }

      estado.etapa = 4;
      contadorMensagens[user] = 0;
    }

    async function processarEstudo(client, user, estado, message, usuarioBanco) {
      if (!message.body || message.body.length === 0) return;

      // Verifica limites de tempo antes de processar
      const podeUsar = await verificarLimitesTempo(client, user, usuarioBanco, 2);
      if (!podeUsar) return;

      try {
        console.log(`🎓 Processando estudo: ${message.body}`);
        const resultado = await processarModoEstudo(estado, message.body, usuarioBanco);

        // Se a mensagem foi inválida, não continua o fluxo normal
        if (resultado.mensagemInvalida) {
          await client.sendText(user, resultado.resposta);
          await client.stopTyping(user);
          return;
        }

        lastResponses[user] = resultado.resposta;
        console.log(`💾 Salvando resposta para tradução/áudio: ${resultado.resposta.substring(0, 50)}...`);

        await client.sendText(user, resultado.resposta);

        // Envia áudio automaticamente para todos os modos EXCETO aula_guiada
        if (estado.modo !== 'aula_guiada') {
          try {
            const nomeArquivo = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const generoUsuario = estado.genero || 'feminino';
            const audioBuffer = await gerarAudioProfessor(
              resultado.resposta,
              estado.idioma,
              nomeArquivo,
              generoUsuario
            );
            const audioBase64 = Buffer.from(audioBuffer).toString('base64');
            await client.sendPttFromBase64(user, audioBase64);
            console.log(`🔊 Áudio automático enviado para modo ${estado.modo}`);
          } catch (audioError) {
            console.error('Erro ao gerar áudio automático:', audioError);
          }
        }

        if (resultado.imagemGerada) {
          try {
            await client.sendImage(user, resultado.imagemGerada.url, 'imagem-aula',
              `🖼️ Imagem da aula: ${resultado.imagemGerada.topico}`);

            if (sessoesAulaGuiada[user]) {
              sessoesAulaGuiada[user].adicionarImagemGerada(resultado.imagemGerada);
            }
          } catch (imgError) {
            console.error('Erro ao enviar imagem:', imgError);
          }
        }

        // Só mostra opções se a mensagem foi válida
        if (!resultado.mensagemInvalida) {
          await enviarOpcoesMensagem(client, user, estados[user].idioma, estados[user]?.modo === 'aula_guiada');
          await enviarLembreteRecursos(client, user, contadorMensagens[user]);
        }

        if (resultado.audioSolicitado) {
          aguardandoAudio[user] = {
            textoEsperado: resultado.audioSolicitado,
            timestamp: Date.now()
          };

          setTimeout(() => {
            if (aguardandoAudio[user]) {
              delete aguardandoAudio[user];
            }
          }, 5 * 60 * 1000);
        }

        // Só mostra opções de áudio para aula_guiada, tradução para todos
        if (!aguardandoAudio[user]) {
          await enviarOpcoesMensagem(client, user, estado.idioma, estado.modo === 'aula_guiada');
        }


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
• Etapas completadas: ${resultadoSessao.etapasCompletadas}/11
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

💡 **Comandos úteis:** /proxima | /menu | /idioma
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
            delete aguardandoAudio[user];
            estado.etapa = 3;
            estado.etapaAulaAtual = 'EXPLICACAO_INICIAL';

            setTimeout(() => {
              mostrarMenuPrincipal(client, user, estado);
            }, 3000);

          } else {
            await client.sendText(user, `⏱️ **Progresso da Sessão Interativa:**\n📝 Questões restantes: ${limites.questoesRestantes}\n⏰ Tempo restante: ${limites.tempoRestante} min\n🎯 Etapas completadas: ${limites.etapasCompletadas}/11\n\n💡 **Comandos úteis:** /menu | /idioma`);
          }
        }

        await atualizarStreak(user);

      } catch (error) {
        console.error('Erro ao processar estudo:', error);
        await client.sendText(user, 'Desculpe, houve um problema. Vamos tentar novamente!\n\n💡 **Comandos úteis:** /menu | /idioma');
      }
    }

    async function mostrarAjuda(client, user) {
      const textoAjuda = `
🆘 **Central de Ajuda - ONEDI IA**

**Comandos disponíveis:**
• */menu* - Voltar ao menu principal
• */idioma* - Trocar de idioma
• /progresso - Ver seu progresso detalhado
• /status - Ver status do seu plano
• /aula - Ver informações da aula atual
• /proxima - Avançar para a próxima aula
• /vocabulario - Revisar palavras aprendidas
• /nivel - Verificar seu nível atual
• /streak - Ver sua sequência de dias
• /personalizar - Personalizar seu plano
• /ajuda - Mostrar esta ajuda

**Sistema de Planos:**
🆓 **Teste Personalizado** - 10 perguntas adaptativas baseadas nos seus interesses
💎 **Planos Flexíveis** - Escolha de 1 a 4 idiomas

**🧪 Teste Personalizado:**
📚 **10 Perguntas Progressivas** - Do básico ao avançado
🎯 **Detecção de Interesses** - IA identifica seus temas favoritos
📈 **Adaptação Inteligente** - Dificuldade ajustada em tempo real
🔊 **Áudio Automático** - Cada resposta vem com áudio HD

**Modos de Estudo:**
📚 **Aula Guiada Interativa** - Sistema completo com:
   • Explicações bilíngues (idioma + português)
   • Exercícios de múltipla escolha
   • Geração de imagens educativas
   • Análise de pronúncia com IA
   • Correção gramatical inteligente
   • Progressão estruturada

💬 **Prática Livre** - Conversação natural + áudio automático
👨‍🏫 **Modo Professor** - Explicações detalhadas + áudio automático
📖 **Modo Vocabulário** - Aprendizado de palavras + áudio automático

**Recursos de IA Avançada:**
🖼️ **Geração de Imagens** - Imagens educativas personalizadas
🎤 **Análise de Pronúncia** - Feedback detalhado de fala
🔊 **Text-to-Speech Automático** - Áudio de alta qualidade (exceto aula guiada)
📝 **Correção Inteligente** - IA corrige e explica erros
🌐 **Tradução Instantânea** - Tradução contextual
🎙️ **Speech-to-Text** - Envie áudios em qualquer modo!

**Áudio Automático:**
🔊 **Nos modos Prática Livre, Professor e Vocabulário:**
• Recebo sua mensagem (texto ou áudio)
• Respondo com texto
• Envio áudio automaticamente
• Você pode solicitar tradução

🎤 **No modo Aula Guiada:**
• Áudio sob demanda via botão
• Exercícios de pronúncia específicos
• Análise detalhada de fala

**Como usar áudios:**
🎤 **Em qualquer modo de estudo:**
1. Grave um áudio com sua mensagem/pergunta
2. Eu vou transcrever automaticamente
3. Respondo como se fosse texto normal
4. Nos modos não-guiados, envio áudio automaticamente

**Troca de Idiomas:**
🌐 **Digite /idioma a qualquer momento para:**
• Ver seus idiomas disponíveis
• Trocar para outro idioma do seu plano
• Continuar estudando em outro idioma

**Dicas:**
• Estude todos os dias para manter sua sequência
• Use o áudio para melhorar a pronúncia
• Grave áudios claros para melhor análise
• Complete as aulas em sequência
• **Digite /menu sempre que quiser mudar de atividade**
• **Digite /idioma para trocar de idioma**
• **Digite /status para verificar seu tempo restante**

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
}, 60 * 1000);

setInterval(() => {
  for (const user in contadorMensagens) {
    if (contadorMensagens[user] > 100) {
      contadorMensagens[user] = 0;
    }
  }
}, 30 * 60 * 1000);

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Rejeição de promessa não tratada:', reason);
});

console.log('🔄 Iniciando sistema com teste personalizado...');
