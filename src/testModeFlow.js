import OpenAI from 'openai';
import { gerarAudioProfessor } from './audioService.js';
import { adicionarVocabulario } from './database.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Função para validar mensagem no modo teste
async function validarMensagemTeste(mensagem, idioma) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um validador para teste de ${idioma}.

          Analise se a resposta do usuário faz sentido ou é apenas caracteres aleatórios.

          CRITÉRIOS PARA RESPOSTA VÁLIDA:
          - Contém palavras reais em qualquer idioma
          - Expressa uma ideia, mesmo que simples
          - Pode ter erros (isso é normal no aprendizado)
          - Tentativa genuína de responder

          CRITÉRIOS PARA RESPOSTA INVÁLIDA:
          - Apenas caracteres aleatórios
          - Sequências sem sentido
          - Spam de caracteres

          Responda APENAS:
          VÁLIDA - se faz sentido
          INVÁLIDA - se é aleatório`
        },
        {
          role: 'user',
          content: `Resposta: "${mensagem}"`
        }
      ],
      temperature: 0.1,
      max_tokens: 50
    });

    return completion.choices[0].message.content.trim() === 'VÁLIDA';

  } catch (error) {
    console.error('Erro ao validar mensagem teste:', error);
    return true; // Em caso de erro, considera válida
  }
}

// Função para corrigir e dar feedback
async function corrigirResposta(resposta, idioma, perguntaContexto) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Você é um professor especialista em ${idioma} dando feedback construtivo.

          INSTRUÇÕES:
          - Analise a resposta do usuário
          - Identifique erros gramaticais, vocabulário ou estrutura
          - Forneça correções específicas e didáticas
          - Seja encorajador e positivo
          - Explique o "porquê" das correções
          - Use emojis para tornar amigável

          FORMATO DA RESPOSTA:
          ✅ **Pontos Positivos:** [o que está correto]

          🔧 **Correções Sugeridas:**
          • [erro específico] → [correção] (explicação)

          💡 **Versão Melhorada:** [frase corrigida]

          🎯 **Dica:** [dica específica para melhorar]`
        },
        {
          role: 'user',
          content: `Idioma: ${idioma}
          Contexto da pergunta: ${perguntaContexto}
          Resposta do usuário: "${resposta}"

          Forneça feedback construtivo e correções.`
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return completion.choices[0].message.content;

  } catch (error) {
    console.error('Erro ao corrigir resposta:', error);
    return '✅ **Boa tentativa!** Continue praticando para melhorar ainda mais!';
  }
}

// Função para extrair vocabulário da resposta
async function extrairVocabularioTeste(resposta, usuarioId, idioma) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Extraia 2-3 palavras importantes desta resposta em ${idioma} e forneça traduções em português.

          Formato: palavra1:tradução1|palavra2:tradução2|palavra3:tradução3
          Máximo 3 palavras.`
        },
        {
          role: 'user',
          content: resposta
        }
      ],
      temperature: 0.3,
      max_tokens: 100
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
    console.error('Erro ao extrair vocabulário do teste:', error);
  }
}

export class TestModeFlow {
  constructor(usuarioId, idioma, nome, genero) {
    this.usuarioId = usuarioId;
    this.idioma = idioma;
    this.nome = nome;
    this.genero = genero;
    this.perguntaAtual = 0;
    this.maxPerguntas = 10;
    this.interessesDetectados = [];
    this.nivelAtual = 'básico';
    this.historico = [];
    this.threadId = null;
  }

  async iniciarTeste() {
    const mensagemInicial = `🎉 **Bem-vindo ao Teste Gratuito Personalizado da ONEDI, ${this.nome}!**

  🤖 **Sua Experiência Exclusiva de Idiomas**

  🎯 **Como funciona:**
  • Vou fazer perguntas progressivas em ${this.idioma}
  • Cada pergunta será personalizada com base nos seus interesses
  • O nível aumentará gradualmente (básico → intermediário → avançado)
  • Vou detectar automaticamente seus temas favoritos

  ✨ **Recursos que você vai experimentar:**
  🔊 **Áudio HD** - Cada resposta minha virá com áudio automático
  🧠 **IA Adaptativa** - Perguntas personalizadas em tempo real
  📈 **Progressão Inteligente** - Dificuldade ajustada ao seu desempenho
  🎤 **Speech-to-Text** - Pode responder por áudio também!

  🚀 **Vamos começar sua jornada personalizada!**

  💡 **Dica:** Responda naturalmente - vou adaptar as próximas perguntas aos seus interesses!`;

    return {
      mensagem: mensagemInicial,
      pergunta: 1,
      nivel: 'básico'
    };
  }

  async processarResposta(resposta, client, user) {
    // Valida se a resposta faz sentido
    const respostaValida = await validarMensagemTeste(resposta, this.idioma);

    if (!respostaValida) {
      const mensagemErro = `❌ **Resposta não compreendida**\n\n🧪 **Teste Personalizado:** Detectei que sua resposta pode conter apenas caracteres aleatórios.\n\n💡 **Por favor, responda com palavras reais em ${this.idioma} ou português.**\n\n📝 **Exemplo:** "I like music" ou "Eu gosto de música"\n\n🎯 **Tente novamente com uma resposta que faça sentido!**`;

      await this.enviarRespostaComAudio(client, user, mensagemErro);
      return {
        pergunta: this.perguntaAtual,
        nivel: this.nivelAtual,
        interesses: this.interessesDetectados,
        continuar: true,
        respostaInvalida: true
      };
    }

    // Gera correção e feedback da resposta
    const ultimaPergunta = this.historico.length > 0 ?
      this.historico[this.historico.length - 1]?.pergunta || 'pergunta anterior' :
      'pergunta anterior';

    const correcao = await corrigirResposta(resposta, this.idioma, ultimaPergunta);

    // Extrai vocabulário da resposta
    await extrairVocabularioTeste(resposta, this.usuarioId, this.idioma);

    // Detecta interesses na resposta
    await this.detectarInteresses(resposta);

    // Salva no histórico
    this.historico.push({
      pergunta: this.perguntaAtual,
      resposta: resposta,
      nivel: this.nivelAtual,
      timestamp: new Date()
    });

    // Incrementa pergunta
    this.perguntaAtual++;

    // Verifica se terminou o teste
    if (this.perguntaAtual > this.maxPerguntas) {
      return await this.finalizarTeste(client, user);
    }

    // Gera próxima pergunta personalizada
    const proximaPergunta = await this.gerarProximaPergunta();

    // Envia correção/feedback primeiro
    await this.enviarRespostaComAudio(client, user, `📝 **Feedback da sua resposta:**\n\n${correcao}`);

    // Depois envia feedback geral
    setTimeout(async () => {
      await this.enviarRespostaComAudio(client, user, proximaPergunta.feedback);
    }, 3000);

    // Envia próxima pergunta
    setTimeout(async () => {
      await this.enviarRespostaComAudio(client, user, proximaPergunta.pergunta);
    }, 6000);

    return {
      pergunta: this.perguntaAtual,
      nivel: this.nivelAtual,
      interesses: this.interessesDetectados,
      continuar: true
    };
  }

  async detectarInteresses(resposta) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Analise a resposta do usuário e identifique até 3 interesses/temas principais mencionados.

            Categorias possíveis:
            - Trabalho/Carreira (business, job, work, career)
            - Viagens (travel, countries, places, vacation)
            - Tecnologia (technology, computers, internet, apps)
            - Esportes (sports, football, basketball, gym, fitness)
            - Música (music, songs, instruments, concerts)
            - Comida (food, cooking, restaurants, cuisine)
            - Família (family, children, parents, relationships)
            - Estudos (education, school, university, learning)
            - Entretenimento (movies, TV, games, books)
            - Saúde (health, medicine, wellness, exercise)
            - Arte (art, painting, drawing, creativity)
            - Natureza (nature, animals, environment, outdoors)

            Responda apenas com os interesses detectados separados por vírgula.
            Exemplo: trabalho, tecnologia, viagens`
          },
          {
            role: 'user',
            content: resposta
          }
        ],
        temperature: 0.3,
        max_tokens: 50
      });

      const novosInteresses = completion.choices[0].message.content
        .split(',')
        .map(interesse => interesse.trim().toLowerCase())
        .filter(interesse => interesse.length > 2);

      // Adiciona novos interesses sem duplicar
      novosInteresses.forEach(interesse => {
        if (!this.interessesDetectados.includes(interesse)) {
          this.interessesDetectados.push(interesse);
        }
      });

    } catch (error) {
      console.error('Erro ao detectar interesses:', error);
    }
  }

  async gerarProximaPergunta() {
    // Determina nível baseado na pergunta atual
    if (this.perguntaAtual <= 3) {
      this.nivelAtual = 'básico';
    } else if (this.perguntaAtual <= 7) {
      this.nivelAtual = 'intermediário';
    } else {
      this.nivelAtual = 'avançado';
    }

    const interessesTexto = this.interessesDetectados.length > 0
      ? this.interessesDetectados.join(', ')
      : 'temas gerais';

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `Você está conduzindo um teste personalizado de ${this.idioma} para ${this.nome}.

            CONTEXTO:
            - Pergunta atual: ${this.perguntaAtual}/10
            - Nível atual: ${this.nivelAtual}
            - Interesses detectados: ${interessesTexto}
            - Idioma: ${this.idioma}

            INSTRUÇÕES:
            1. Gere um FEEDBACK positivo e encorajador sobre a resposta anterior (se não for a primeira pergunta)
            2. Crie uma PERGUNTA personalizada baseada nos interesses detectados
            3. A pergunta deve ser apropriada para o nível atual (${this.nivelAtual})
            4. Use vocabulário e estruturas adequadas ao nível
            5. Torne a pergunta interessante e relevante aos interesses do usuário

            NÍVEIS:
            - Básico: Perguntas simples, presente, vocabulário básico
            - Intermediário: Estruturas mais complexas, passado/futuro, opinões
            - Avançado: Discussões abstratas, subjuntivo, argumentação

            FORMATO DA RESPOSTA:
            FEEDBACK: [feedback positivo sobre resposta anterior - apenas se não for pergunta 1]

            PERGUNTA: [pergunta personalizada em ${this.idioma}]

            TRADUÇÃO: [tradução da pergunta em português]

            DICA: [dica útil sobre vocabulário ou gramática]`
          },
          {
            role: 'user',
            content: `Gere a pergunta ${this.perguntaAtual} personalizada para os interesses: ${interessesTexto}

            Histórico das últimas respostas:
            ${this.historico.slice(-2).map(h => `P${h.pergunta}: ${h.resposta}`).join('\n')}`
          }
        ],
        temperature: 0.7,
        max_tokens: 300,
        ...(this.threadId ? { thread_id: this.threadId } : {})
      });

      const resposta = completion.choices[0].message.content;

      // Salva thread_id para manter contexto
      if (!this.threadId && completion.thread_id) {
        this.threadId = completion.thread_id;
      }

      // Separa feedback e pergunta
      const partes = resposta.split('PERGUNTA:');
      const feedback = partes[0].replace('FEEDBACK:', '').trim();
      const perguntaCompleta = partes[1] || resposta;

      return {
        feedback: feedback || `✅ **Excelente resposta!** Vamos continuar...`,
        pergunta: `📚 **Pergunta ${this.perguntaAtual}/10** (Nível: ${this.nivelAtual})\n\n${perguntaCompleta.trim()}`
      };

    } catch (error) {
      console.error('Erro ao gerar pergunta:', error);
      return {
        feedback: '✅ Ótima resposta! Vamos continuar...',
        pergunta: `📚 **Pergunta ${this.perguntaAtual}/10**\n\nConte-me sobre seus hobbies favoritos em ${this.idioma}.`
      };
    }
  }

  async enviarRespostaComAudio(client, user, texto) {
    try {
      // Envia texto
      await client.sendText(user, texto);

      // Gera e envia áudio automaticamente
      const nomeArquivo = `test_audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const audioBuffer = await gerarAudioProfessor(
        texto,
        this.idioma,
        nomeArquivo,
        this.genero
      );

      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      await client.sendPttFromBase64(user, audioBase64);

    } catch (error) {
      console.error('Erro ao enviar resposta com áudio:', error);
      // Se falhar o áudio, pelo menos envia o texto
      await client.sendText(user, texto);
    }
  }

  async finalizarTeste(client, user) {
    const interessesResumo = this.interessesDetectados.length > 0
      ? this.interessesDetectados.slice(0, 3).join(', ')
      : 'diversos temas';

    const mensagemFinal = `🎉 **Parabéns, ${this.nome}! Teste Concluído!**

🏆 **Sua Jornada Personalizada foi Incrível!**

📊 **Resumo da sua Experiência:**
• ✅ **10 perguntas** respondidas com sucesso
• 🎯 **Interesses detectados:** ${interessesResumo}
• 📈 **Progressão:** Básico → Intermediário → Avançado
• 🤖 **IA Adaptativa:** Perguntas personalizadas em tempo real
• 🔊 **Áudio HD:** Text-to-speech de alta qualidade
• 🎤 **Speech-to-Text:** Reconhecimento de voz avançado

🚀 **Continue sua Jornada com a ONEDI!**
💎 **Planos Personalizados Disponíveis!**

🌐 **Acesse nosso site oficial:**
👉 **https://onedi-lp.vercel.app/**

💡 **Para personalizar seu plano, digite /personalizar**

💡 **Obrigado por experimentar a ONEDI - onde a IA encontra a educação!**`;

    await this.enviarRespostaComAudio(client, user, mensagemFinal);

    return {
      testeConcluido: true,
      interessesDetectados: this.interessesDetectados,
      perguntasRespondidas: this.maxPerguntas,
      nivelFinal: this.nivelAtual
    };
  }

  getProgresso() {
    return {
      perguntaAtual: this.perguntaAtual,
      totalPerguntas: this.maxPerguntas,
      porcentagem: Math.round((this.perguntaAtual / this.maxPerguntas) * 100),
      nivel: this.nivelAtual,
      interesses: this.interessesDetectados
    };
  }
}

export const sessoesTesteModo = new Map();

export function iniciarTesteModo(usuarioId, idioma, nome, genero) {
  const sessao = new TestModeFlow(usuarioId, idioma, nome, genero);
  sessoesTesteModo.set(usuarioId, sessao);
  return sessao;
}

export function obterSessaoTeste(usuarioId) {
  return sessoesTesteModo.get(usuarioId);
}

export function finalizarSessaoTeste(usuarioId) {
  sessoesTesteModo.delete(usuarioId);
}
