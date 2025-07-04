import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://onedi_user:02d045be-63a3-41e3-8d1f-1e395bf4b595@85.31.60.213:5433/onedi',
  ssl: false,
});

export async function salvarUsuario(telefone, dados) {
  const {
    nome, genero, idioma, professor, etapa, nivel, pontuacao, streak_dias, aula_atual,
    plano_id, status_plano, idiomas_disponiveis, idioma_teste
  } = dados;

  const query = `
    INSERT INTO usuarios (
      telefone, nome, genero, idioma, professor, etapa, nivel, pontuacao,
      streak_dias, aula_atual, plano_id, status_plano, idiomas_disponiveis,
      idioma_teste, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
    ON CONFLICT (telefone) DO UPDATE SET
      nome = EXCLUDED.nome,
      genero = EXCLUDED.genero,
      idioma = EXCLUDED.idioma,
      professor = EXCLUDED.professor,
      etapa = EXCLUDED.etapa,
      nivel = COALESCE(EXCLUDED.nivel, usuarios.nivel),
      pontuacao = COALESCE(EXCLUDED.pontuacao, usuarios.pontuacao),
      streak_dias = COALESCE(EXCLUDED.streak_dias, usuarios.streak_dias),
      aula_atual = COALESCE(EXCLUDED.aula_atual, usuarios.aula_atual),
      plano_id = COALESCE(EXCLUDED.plano_id, usuarios.plano_id),
      status_plano = COALESCE(EXCLUDED.status_plano, usuarios.status_plano),
      idiomas_disponiveis = COALESCE(EXCLUDED.idiomas_disponiveis, usuarios.idiomas_disponiveis),
      idioma_teste = COALESCE(EXCLUDED.idioma_teste, usuarios.idioma_teste),
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  const result = await pool.query(query, [
    telefone, nome, genero, idioma, professor, etapa,
    nivel || 'iniciante', pontuacao || 0, streak_dias || 0, aula_atual || 1,
    plano_id || null, status_plano || 'teste_gratuito',
    idiomas_disponiveis || [], idioma_teste || null
  ]);

  return result.rows[0];
}

export async function consultarUsuario(telefone) {
  const result = await pool.query(
    'SELECT * FROM usuarios WHERE telefone = $1',
    [telefone]
  );
  return result.rows[0];
}

export async function verificarStatusPlano(telefone) {
  const query = `
    SELECT
      u.*,
      p.nome as nome_plano,
      p.quantidade_idiomas,
      p.duracao_dias,
      CASE
        WHEN u.status_plano = 'teste_gratuito' THEN u.limite_teste_minutos - u.tempo_teste_usado
        WHEN u.status_plano = 'ativo' AND u.data_fim_plano > CURRENT_TIMESTAMP THEN -1
        ELSE 0
      END as tempo_restante_minutos
    FROM usuarios u
    LEFT JOIN planos p ON u.plano_id = p.id
    WHERE u.telefone = $1
  `;

  const result = await pool.query(query, [telefone]);
  return result.rows[0];
}

export async function atualizarTempoTeste(telefone, minutosUsados) {
  const query = `
    UPDATE usuarios
    SET tempo_teste_usado = tempo_teste_usado + $2,
        ultima_atividade = CURRENT_TIMESTAMP
    WHERE telefone = $1
    RETURNING tempo_teste_usado, limite_teste_minutos
  `;

  const result = await pool.query(query, [telefone, minutosUsados]);
  return result.rows[0];
}

export async function ativarPlano(telefone, planoId, idiomasEscolhidos) {
  const query = `
    UPDATE usuarios
    SET plano_id = $2,
        status_plano = 'ativo',
        data_inicio_plano = CURRENT_TIMESTAMP,
        data_fim_plano = CURRENT_TIMESTAMP + INTERVAL '30 days',
        idiomas_disponiveis = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE telefone = $1
    RETURNING *
  `;

  const result = await pool.query(query, [telefone, planoId, idiomasEscolhidos]);
  return result.rows[0];
}

export async function verificarAcessoIdioma(telefone, idioma) {
  const usuario = await verificarStatusPlano(telefone);

  if (!usuario) return { acesso: false, motivo: 'Usuario não encontrado' };

  // Se está em teste gratuito
  if (usuario.status_plano === 'teste_gratuito') {
    if (usuario.tempo_restante_minutos <= 0) {
      return { acesso: false, motivo: 'Teste gratuito expirado' };
    }

    // No teste, pode usar qualquer idioma, mas só um por vez
    if (usuario.idioma_teste && usuario.idioma_teste !== idioma) {
      return {
        acesso: false,
        motivo: `Teste limitado ao idioma ${usuario.idioma_teste}`
      };
    }

    return { acesso: true, tipo: 'teste', tempo_restante: usuario.tempo_restante_minutos };
  }

  // Se tem plano ativo
  if (usuario.status_plano === 'ativo') {
    if (usuario.data_fim_plano && new Date(usuario.data_fim_plano) < new Date()) {
      return { acesso: false, motivo: 'Plano expirado' };
    }

    if (!usuario.idiomas_disponiveis || !usuario.idiomas_disponiveis.includes(idioma)) {
      return { acesso: false, motivo: 'Idioma não incluído no seu plano' };
    }

    return { acesso: true, tipo: 'plano', plano: usuario.nome_plano };
  }

  return { acesso: false, motivo: 'Status de plano inválido' };
}

export async function obterPlanos() {
  const query = 'SELECT * FROM planos WHERE ativo = true ORDER BY quantidade_idiomas ASC';
  const result = await pool.query(query);
  return result.rows;
}

export async function registrarPagamento(usuarioId, planoId, valor, transactionId, metodoPagamento) {
  const query = `
    INSERT INTO historico_pagamentos (
      usuario_id, plano_id, valor, status, metodo_pagamento,
      transaction_id, data_vencimento
    )
    VALUES ($1, $2, $3, 'pendente', $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days')
    RETURNING *
  `;

  const result = await pool.query(query, [
    usuarioId, planoId, valor, metodoPagamento, transactionId
  ]);
  return result.rows[0];
}

export async function confirmarPagamento(transactionId) {
  const query = `
    UPDATE historico_pagamentos
    SET status = 'aprovado', data_pagamento = CURRENT_TIMESTAMP
    WHERE transaction_id = $1
    RETURNING *
  `;

  const result = await pool.query(query, [transactionId]);
  return result.rows[0];
}

export async function definirIdiomaTestе(telefone, idioma) {
  const query = `
    UPDATE usuarios
    SET idioma_teste = $2, idioma = $2
    WHERE telefone = $1
    RETURNING *
  `;

  const result = await pool.query(query, [telefone, idioma]);
  return result.rows[0];
}

export async function atualizarAulaAtual(telefone, aulaId) {
  const query = `
    UPDATE usuarios
    SET aula_atual = $2, updated_at = CURRENT_TIMESTAMP
    WHERE telefone = $1
    RETURNING aula_atual
  `;

  const result = await pool.query(query, [telefone, aulaId]);
  return result.rows[0]?.aula_atual;
}

export async function salvarHistoricoAula(usuarioId, aulaId, topico, conteudo, nivel) {
  const query = `
    INSERT INTO historico_aulas (usuario_id, aula_id, topico, conteudo, nivel)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (usuario_id, aula_id) DO UPDATE SET
      tempo_gasto = historico_aulas.tempo_gasto + 2,
      data_conclusao = CASE
        WHEN historico_aulas.completada THEN historico_aulas.data_conclusao
        ELSE NULL
      END
  `;

  await pool.query(query, [usuarioId, aulaId, topico, conteudo, nivel]);
}

export async function marcarAulaCompleta(usuarioId, aulaId) {
  const query = `
    UPDATE historico_aulas
    SET completada = true, data_conclusao = CURRENT_TIMESTAMP
    WHERE usuario_id = $1 AND aula_id = $2
  `;

  await pool.query(query, [usuarioId, aulaId]);
}

export async function obterHistoricoAulas(usuarioId, limite = 10) {
  const query = `
    SELECT * FROM historico_aulas
    WHERE usuario_id = $1
    ORDER BY aula_id DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [usuarioId, limite]);
  return result.rows;
}

export async function salvarProgressoLicao(usuarioId, licaoId, modoEstudo, dados) {
  const { questoesRespondidas, questoesCorretas, tempoGasto, completada } = dados;

  const query = `
    INSERT INTO progresso_licoes (usuario_id, licao_id, modo_estudo, questoes_respondidas, questoes_corretas, tempo_gasto, completada, data_conclusao)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (usuario_id, licao_id, modo_estudo) DO UPDATE SET
      questoes_respondidas = progresso_licoes.questoes_respondidas + EXCLUDED.questoes_respondidas,
      questoes_corretas = progresso_licoes.questoes_corretas + EXCLUDED.questoes_corretas,
      tempo_gasto = progresso_licoes.tempo_gasto + EXCLUDED.tempo_gasto,
      completada = EXCLUDED.completada,
      data_conclusao = EXCLUDED.data_conclusao
  `;

  await pool.query(query, [
    usuarioId, licaoId, modoEstudo, questoesRespondidas, questoesCorretas,
    tempoGasto, completada, completada ? new Date() : null
  ]);
}

export async function adicionarVocabulario(usuarioId, palavra, traducao, idioma) {
  const query = `
    INSERT INTO vocabulario_usuario (usuario_id, palavra, traducao, idioma, proxima_revisao)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '1 day')
    ON CONFLICT (usuario_id, palavra, idioma) DO UPDATE SET
      vezes_vista = vocabulario_usuario.vezes_vista + 1,
      proxima_revisao = CASE
        WHEN vocabulario_usuario.nivel_conhecimento < 5
        THEN CURRENT_TIMESTAMP + INTERVAL '1 day' * vocabulario_usuario.nivel_conhecimento
        ELSE CURRENT_TIMESTAMP + INTERVAL '7 days'
      END
  `;

  await pool.query(query, [usuarioId, palavra, traducao, idioma]);
}

export async function buscarPalavrasRevisao(usuarioId, limite = 10) {
  const query = `
    SELECT * FROM vocabulario_usuario
    WHERE usuario_id = $1 AND proxima_revisao <= CURRENT_TIMESTAMP
    ORDER BY proxima_revisao ASC
    LIMIT $2
  `;

  const result = await pool.query(query, [usuarioId, limite]);
  return result.rows;
}

export async function registrarSessaoEstudo(usuarioId, modoEstudo, dados) {
  const { duracaoMinutos, questoesRespondidas, questoesCorretas, pontosGanhos } = dados;

  const query = `
    INSERT INTO sessoes_estudo (usuario_id, modo_estudo, duracao_minutos, questoes_respondidas, questoes_corretas, pontos_ganhos)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;

  await pool.query(query, [usuarioId, modoEstudo, duracaoMinutos, questoesRespondidas, questoesCorretas, pontosGanhos]);
}

export async function atualizarStreak(telefone) {
  const query = `
    UPDATE usuarios
    SET streak_dias = CASE
      WHEN DATE(ultima_atividade) = CURRENT_DATE - INTERVAL '1 day' THEN streak_dias + 1
      WHEN DATE(ultima_atividade) = CURRENT_DATE THEN streak_dias
      ELSE 1
    END,
    ultima_atividade = CURRENT_TIMESTAMP
    WHERE telefone = $1
    RETURNING streak_dias
  `;

  const result = await pool.query(query, [telefone]);
  return result.rows[0]?.streak_dias || 1;
}

export { pool };
