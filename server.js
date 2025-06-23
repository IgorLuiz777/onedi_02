import wppconnect from '@wppconnect-team/wppconnect';
import dotenv from 'dotenv';
import {
  consultarUsuario,
  salvarUsuario,
  atualizarStreak
} from './src/database.js';
import {
  detectarGenero,
  enviarMensagemCompleta,
  processarComandoEspecial,
  mostrarMenuPrincipal,
  mostrarProgresso,
  normalizarTexto,
  validarIdioma,
  validarModoEstudo,
  calcularNivel
} from './src/messageHandler.js';
import {
  processarModoEstudo,
  iniciarRevisaoVocabulario,
  SessaoAulaGuiada
} from './src/studyModes.js';

dotenv.config();

// Armazenar estados dos usuários em memória
const estados = {};
const sessoesAulaGuiada = {};

wppconnect
  .create({
    session: 'sessionName',
    headless: true,
    multiDevice: true,
  })
  .then((client) => {
    console.log('🚀 Conectado ao WhatsApp!');
    console.log('📚 Sistema de Ensino de Idiomas Ativo');

    client.onMessage(async (message) => {
      const user = message.from;

      // Filtros de segurança
      if (user !== '5511980483504@c.us') return;
      if (message.isGroupMsg || user.endsWith('@status') || user === 'status@broadcast') return;

      console.log(`📱 Mensagem de ${user}: ${message.body}`);

      try {
        // Verificar comandos especiais
        const comando = processarComandoEspecial(message.body);
        if (comando) {
          await processarComando(client, user, comando);
          return;
        }

        // Consultar usuário no banco
        let usuarioBanco = await consultarUsuario(user);

        // Inicializar estado se necessário
        if (!estados[user]) {
          if (usuarioBanco) {
            // Usuário existente - restaurar estado
            estados[user] = {
              nome: usuarioBanco.nome,
              genero: usuarioBanco.genero,
              idioma: usuarioBanco.idioma,
              professor: usuarioBanco.professor,
              etapa: 3, // Vai direto para seleção de modo
              nivel: usuarioBanco.nivel,
              pontuacao: usuarioBanco.pontuacao,
              streak: usuarioBanco.streak_dias
            };

            // Atualizar streak
            const novoStreak = await atualizarStreak(user);
            estados[user].streak = novoStreak;

            // Mostrar menu principal
            await mostrarMenuPrincipal(client, user, estados[user]);
            return;
          } else {
            // Novo usuário
            estados[user] = { etapa: 0 };
          }
        }

        const estado = estados[user];

        // Fluxo de cadastro inicial
        if (estado.etapa === 0) {
          await iniciarCadastro(client, user, estado);
          return;
        }

        if (estado.etapa === 1) {
          await processarNome(client, user, estado, message.body);
          return;
        }

        if (estado.etapa === 2) {
          await processarIdioma(client, user, estado, message);
          return;
        }

        // Substituir chamada na etapa 3:
        if (estado.etapa === 3) {
          await processarSelecaoModoEstudo(client, user, estado, message);
          return;
        }

        if (estado.etapa === 4) {
          await processarEstudo(client, user, estado, message, usuarioBanco);
          return;
        }

      } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        await client.sendText(user, 'Desculpe, ocorreu um erro. Tente novamente ou digite /menu para voltar ao início.');
      }
    });

    // Função para processar comandos especiais
    async function processarComando(client, user, comando) {
      const usuarioBanco = await consultarUsuario(user);
      if (!usuarioBanco) {
        await client.sendText(user, 'Você precisa se cadastrar primeiro. Envie qualquer mensagem para começar!');
        return;
      }

      switch (comando) {
        case 'menu_principal':
          await mostrarMenuPrincipal(client, user, usuarioBanco);
          break;
        case 'ver_progresso':
          await mostrarProgresso(client, user, usuarioBanco);
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

    // Função para iniciar cadastro
    async function iniciarCadastro(client, user, estado) {
      await client.sendText(user, '👋 Olá! Bem-vindo à ONEDI, sua escola de idiomas inteligente!\n\n📝 Para começar, qual é o seu nome?');
      estado.etapa = 1;
    }

    // Função para processar nome
    async function processarNome(client, user, estado, nome) {
      estado.nome = nome.trim();

      // Detectar gênero
      const genero = await detectarGenero(estado.nome);
      estado.genero = genero;

      // Definir professor baseado no gênero
      const nomeAssistente = genero === 'masculino' ? 'Isaias' : 'Rute';
      estado.professor = nomeAssistente;

      await client.sendText(user, `Prazer em conhecê-lo, ${estado.nome}! 👨‍🏫👩‍🏫\n\nMeu nome é ${nomeAssistente} e serei seu professor de idiomas!`);

      // Mostrar opções de idiomas
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

    // Função para processar seleção de idioma
    async function processarIdioma(client, user, estado, message) {
      const idiomaInput = message.selectedRowId || message.body.trim();
      const idioma = validarIdioma(idiomaInput);

      if (!idioma) {
        await client.sendText(user, '❌ Por favor, selecione um idioma válido clicando no botão.');
        return;
      }

      estado.idioma = idioma;

      // Salvar usuário no banco
      await salvarUsuario(user, {
        nome: estado.nome,
        genero: estado.genero,
        idioma: estado.idioma,
        professor: estado.professor,
        etapa: 3,
        nivel: 'iniciante',
        pontuacao: 0,
        streak_dias: 1
      });

      await client.sendText(user, `🎉 Excelente! Você escolheu aprender ${idioma}.\n\nAgora vamos começar sua jornada de aprendizado!`);

      // Mostrar modos de estudo
      await mostrarMenuPrincipal(client, user, estado);
      estado.etapa = 3;
    }

    // Função para processar seleção de modo de estudo
    async function processarSelecaoModoEstudo(client, user, estado, message) {
      const modoInput = message.selectedRowId || message.body.trim().split('\n')[0];
      const modo = validarModoEstudo(modoInput);

      if (!modo) {
        await client.sendText(user, '❌ Por favor, selecione um modo de estudo válido.');
        return;
      }

      estado.modo = modoInput.includes('_') ? modoInput : modoInput.toLowerCase().replace(' ', '_');

      // Mensagens específicas para cada modo
      const mensagensModo = {
        'aula_guiada': '📚 Modo Aula Guiada ativado!\n\nVou te guiar passo a passo. Você tem 30 minutos ou 20 questões por sessão.\n\nVamos começar? Envie qualquer mensagem!',
        'pratica_livre': '💬 Modo Prática Livre ativado!\n\nVamos ter uma conversa natural. Eu vou corrigir seus erros e te ajudar a melhorar.\n\nSobre o que você gostaria de conversar?',
        'modo_professor': '👨‍🏫 Modo Professor ativado!\n\nEstou aqui para explicar qualquer dúvida detalhadamente.\n\nQual tópico você gostaria que eu explicasse?',
        'modo_vocabulario': '📖 Modo Vocabulário ativado!\n\nVou te ensinar palavras novas e revisar as que você já aprendeu.\n\nQue tipo de vocabulário você quer aprender hoje?'
      };

      await client.sendText(user, mensagensModo[estado.modo] || 'Modo selecionado! Vamos começar?');

      // Inicializar sessão de aula guiada se necessário
      if (estado.modo === 'aula_guiada') {
        const usuarioBanco = await consultarUsuario(user);
        sessoesAulaGuiada[user] = new SessaoAulaGuiada(usuarioBanco.id, estado.idioma);
      }

      estado.etapa = 4;
    }

    // Função para processar estudo
    async function processarEstudo(client, user, estado, message, usuarioBanco) {
      if (!message.body || message.body.length === 0) return;

      try {
        // Processar mensagem baseada no modo de estudo
        const resultado = await processarModoEstudo(estado, message.body, usuarioBanco);

        // Enviar resposta completa (texto + áudio + tradução)
        await enviarMensagemCompleta(
          client,
          user,
          resultado.resposta,
          estado.idioma,
          resultado.incluirTraducao,
          resultado.incluirAudio
        );

        // Controle especial para aula guiada
        if (estado.modo === 'aula_guiada' && sessoesAulaGuiada[user]) {
          const sessao = sessoesAulaGuiada[user];
          sessao.incrementarQuestao(true); // Assumir resposta correta por simplicidade

          const limites = sessao.verificarLimites();

          if (limites.atingiuLimite) {
            const resultadoSessao = await sessao.finalizarSessao();

            await client.sendText(user, `
🎉 *Sessão Concluída!*

📊 *Resultado:*
• Questões respondidas: ${resultadoSessao.questoesRespondidas}
• Questões corretas: ${resultadoSessao.questoesCorretas}
• Aproveitamento: ${resultadoSessao.aproveitamento}%
• Pontos ganhos: ${resultadoSessao.pontosGanhos}
• Tempo de estudo: ${resultadoSessao.duracaoMinutos} minutos

Parabéns pelo seu progresso! 🚀
            `);

            // Atualizar pontuação do usuário
            const novaPontuacao = (usuarioBanco.pontuacao || 0) + resultadoSessao.pontosGanhos;
            const novoNivel = calcularNivel(novaPontuacao);

            await salvarUsuario(user, {
              ...estado,
              pontuacao: novaPontuacao,
              nivel: novoNivel,
              etapa: 3
            });

            // Limpar sessão
            delete sessoesAulaGuiada[user];
            estado.etapa = 3;

            // Mostrar menu novamente
            setTimeout(() => {
              mostrarMenuPrincipal(client, user, estado);
            }, 2000);

          } else {
            await client.sendText(user, `⏱️ Questões restantes: ${limites.questoesRestantes} | Tempo restante: ${limites.tempoRestante} min`);
          }
        }

        // Atualizar streak
        await atualizarStreak(user);

      } catch (error) {
        console.error('Erro ao processar estudo:', error);
        await client.sendText(user, 'Desculpe, houve um problema. Vamos tentar novamente!');
      }
    }

    // Função para mostrar ajuda
    async function mostrarAjuda(client, user) {
      const textoAjuda = `
🆘 *Central de Ajuda - ONEDI*

*Comandos disponíveis:*
• /menu - Voltar ao menu principal
• /progresso - Ver seu progresso
• /vocabulario - Revisar palavras aprendidas
• /nivel - Verificar seu nível atual
• /streak - Ver sua sequência de dias
• /ajuda - Mostrar esta ajuda

*Modos de Estudo:*
📚 *Aula Guiada* - Lições estruturadas
💬 *Prática Livre* - Conversação natural
👨‍🏫 *Modo Professor* - Explicações detalhadas
📖 *Modo Vocabulário* - Aprendizado de palavras

*Dicas:*
• Estude todos os dias para manter sua sequência
• Use o áudio para melhorar a pronúncia
• Leia as traduções para entender melhor
• Pratique diferentes modos de estudo

Precisa de mais ajuda? Entre em contato conosco! 📞
      `;

      await client.sendText(user, textoAjuda);
    }

  })
  .catch((error) => {
    console.error('❌ Erro ao conectar:', error);
  });

// Tratamento de erros globais
process.on('uncaughtException', (err) => {
  console.error('❌ Erro não tratado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Rejeição de promessa não tratada:', reason);
});

console.log('🔄 Iniciando sistema...');
