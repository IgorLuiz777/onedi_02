import OpenAI from 'openai';
import { gerarAudioProfessor } from './audioService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const mensagemInicial = `🎉 **Bem-vindo ao Teste Personalizado da ONEDI, ${this.nome}!**

🤖 **Sua Experiência Personalizada de 10 Minutos**

🎯 **Como funciona:**
• Vou fazer 10 perguntas progressivas em ${this.idioma}
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

    // Envia resposta com áudio automático
    await this.enviarRespostaComAudio(client, user, proximaPergunta.feedback);

    // Envia próxima pergunta
    setTimeout(async () => {
      await this.enviarRespostaComAudio(client, user, proximaPergunta.pergunta);
    }, 2000);

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

✨ **O que você experimentou:**
🧠 **Inteligência Artificial Avançada** - Adaptação em tempo real
🎯 **Personalização Completa** - Conteúdo baseado nos seus interesses
📚 **Metodologia Estruturada** - Progressão pedagógica inteligente
🔊 **Recursos Multimídia** - Áudio automático e reconhecimento de voz

🚀 **Continue sua Jornada com a ONEDI!**

💎 **Planos Personalizados Disponíveis:**
• **1 Idioma** - R$ 29,90/mês
• **2 Idiomas** - R$ 49,90/mês
• **3 Idiomas** - R$ 69,90/mês
• **4 Idiomas** - R$ 89,90/mês

🌐 **Acesse nosso site oficial:**
👉 **https://onedi.com.br**

📱 **Ou entre em contato conosco:**
📞 WhatsApp: (31) 9 3796-3314
📧 Email: contato@onedi.com.br

🎬 **Veja como funciona na prática:**
👉 **Assista ao vídeo demonstrativo:** https://onedi.com.br/video-demo

🎁 **Oferta Especial para Você:**
Use o código **TESTE10** e ganhe 10% de desconto no primeiro mês!

💡 **Obrigado por experimentar a ONEDI - onde a IA encontra a educação!**`;

    // Envia mensagem final com áudio
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

// Gerenciador global de sessões de teste
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
