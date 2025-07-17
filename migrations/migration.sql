-- Schema do banco de dados para o sistema de ensino

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  telefone VARCHAR(50) UNIQUE NOT NULL,
  nome VARCHAR(100) NOT NULL,
  genero VARCHAR(20) NOT NULL,
  idioma VARCHAR(50) NOT NULL,
  professor VARCHAR(50) NOT NULL,
  etapa INTEGER DEFAULT 0,
  nivel VARCHAR(20) DEFAULT 'iniciante',
  pontuacao INTEGER DEFAULT 0,
  streak_dias INTEGER DEFAULT 0,
  aula_atual INTEGER DEFAULT 1,
  ultima_atividade TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de progresso por lição
CREATE TABLE IF NOT EXISTS progresso_licoes (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  licao_id VARCHAR(100) NOT NULL,
  modo_estudo VARCHAR(50) NOT NULL,
  questoes_respondidas INTEGER DEFAULT 0,
  questoes_corretas INTEGER DEFAULT 0,
  tempo_gasto INTEGER DEFAULT 0, -- em minutos
  completada BOOLEAN DEFAULT FALSE,
  data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_conclusao TIMESTAMP NULL,
  UNIQUE(usuario_id, licao_id, modo_estudo)
);

-- Tabela de vocabulário aprendido
CREATE TABLE IF NOT EXISTS vocabulario_usuario (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  palavra VARCHAR(200) NOT NULL,
  traducao VARCHAR(200) NOT NULL,
  idioma VARCHAR(50) NOT NULL,
  nivel_conhecimento INTEGER DEFAULT 1, -- 1-5
  proxima_revisao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  vezes_vista INTEGER DEFAULT 1,
  vezes_acertada INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(usuario_id, palavra, idioma)
);

-- Tabela de sessões de estudo
CREATE TABLE IF NOT EXISTS sessoes_estudo (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  modo_estudo VARCHAR(50) NOT NULL,
  duracao_minutos INTEGER DEFAULT 0,
  questoes_respondidas INTEGER DEFAULT 0,
  questoes_corretas INTEGER DEFAULT 0,
  pontos_ganhos INTEGER DEFAULT 0,
  data_sessao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de histórico de aulas (nova)
CREATE TABLE IF NOT EXISTS historico_aulas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  aula_id INTEGER NOT NULL,
  topico VARCHAR(200) NOT NULL,
  conteudo TEXT NOT NULL,
  nivel VARCHAR(20) NOT NULL,
  completada BOOLEAN DEFAULT FALSE,
  tempo_gasto INTEGER DEFAULT 0,
  data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_conclusao TIMESTAMP NULL,
  UNIQUE(usuario_id, aula_id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON usuarios(telefone);
CREATE INDEX IF NOT EXISTS idx_progresso_usuario ON progresso_licoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_vocabulario_usuario ON vocabulario_usuario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_vocabulario_revisao ON vocabulario_usuario(proxima_revisao);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes_estudo(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_usuario ON historico_aulas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_aula ON historico_aulas(aula_id);

-- Adiciona coluna aula_atual se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'aula_atual'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN aula_atual INTEGER DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'interesses_detectados'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN interesses_detectados TEXT[];
    ALTER TABLE usuarios ADD COLUMN perguntas_teste_respondidas INTEGER DEFAULT 0;
    ALTER TABLE usuarios ADD COLUMN nivel_teste_final VARCHAR(20);
    ALTER TABLE usuarios ADD COLUMN teste_personalizado_concluido BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS idioma_teste VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS interesses_detectados TEXT[];
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perguntas_teste_respondidas INTEGER DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nivel_teste_final VARCHAR(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS teste_personalizado_concluido BOOLEAN DEFAULT FALSE;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_id INTEGER;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS status_plano VARCHAR(30) DEFAULT 'teste_gratuito';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS idiomas_disponiveis TEXT[];
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS limite_teste_minutos INTEGER DEFAULT 30;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tempo_teste_usado INTEGER DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_inicio_plano TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS data_fim_plano TIMESTAMP;
