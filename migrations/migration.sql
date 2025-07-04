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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Novos campos para sistema de planos
  plano_id INTEGER DEFAULT NULL,
  status_plano VARCHAR(20) DEFAULT 'teste_gratuito', -- teste_gratuito, ativo, expirado, cancelado
  data_inicio_plano TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_fim_plano TIMESTAMP DEFAULT NULL,
  tempo_teste_usado INTEGER DEFAULT 0, -- em minutos
  limite_teste_minutos INTEGER DEFAULT 10,
  idiomas_disponiveis TEXT[] DEFAULT ARRAY[]::TEXT[], -- array de idiomas disponíveis
  idioma_teste VARCHAR(50) DEFAULT NULL -- idioma usado no teste gratuito
);

-- Tabela de planos
CREATE TABLE IF NOT EXISTS planos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  preco DECIMAL(10,2) NOT NULL,
  quantidade_idiomas INTEGER NOT NULL,
  duracao_dias INTEGER NOT NULL, -- duração em dias
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- Tabela de histórico de aulas
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

-- Tabela de histórico de pagamentos
CREATE TABLE IF NOT EXISTS historico_pagamentos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  plano_id INTEGER REFERENCES planos(id),
  valor DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL, -- pendente, aprovado, cancelado, estornado
  metodo_pagamento VARCHAR(50),
  transaction_id VARCHAR(200),
  data_pagamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_vencimento TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserir planos padrão
INSERT INTO planos (nome, descricao, preco, quantidade_idiomas, duracao_dias) VALUES
('Básico', 'Acesso a 1 idioma por 30 dias', 29.90, 1, 30),
('Intermediário', 'Acesso a 2 idiomas por 30 dias', 49.90, 2, 30),
('Avançado', 'Acesso a 3 idiomas por 30 dias', 69.90, 3, 30),
('Premium', 'Acesso a todos os idiomas por 30 dias', 89.90, 999, 30)
ON CONFLICT DO NOTHING;

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON usuarios(telefone);
CREATE INDEX IF NOT EXISTS idx_usuarios_plano ON usuarios(plano_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_status_plano ON usuarios(status_plano);
CREATE INDEX IF NOT EXISTS idx_progresso_usuario ON progresso_licoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_vocabulario_usuario ON vocabulario_usuario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_vocabulario_revisao ON vocabulario_usuario(proxima_revisao);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes_estudo(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_usuario ON historico_aulas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_aula ON historico_aulas(aula_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_usuario ON historico_pagamentos(usuario_id);

-- Adiciona colunas se não existirem
DO $$
BEGIN
  -- Adiciona plano_id se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'plano_id'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN plano_id INTEGER DEFAULT NULL;
  END IF;

  -- Adiciona status_plano se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'status_plano'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN status_plano VARCHAR(20) DEFAULT 'teste_gratuito';
  END IF;

  -- Adiciona data_inicio_plano se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'data_inicio_plano'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN data_inicio_plano TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  END IF;

  -- Adiciona data_fim_plano se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'data_fim_plano'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN data_fim_plano TIMESTAMP DEFAULT NULL;
  END IF;

  -- Adiciona tempo_teste_usado se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'tempo_teste_usado'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN tempo_teste_usado INTEGER DEFAULT 0;
  END IF;

  -- Adiciona limite_teste_minutos se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'limite_teste_minutos'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN limite_teste_minutos INTEGER DEFAULT 10;
  END IF;

  -- Adiciona idiomas_disponiveis se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'idiomas_disponiveis'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN idiomas_disponiveis TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;

  -- Adiciona idioma_teste se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'idioma_teste'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN idioma_teste VARCHAR(50) DEFAULT NULL;
  END IF;

  -- Adiciona aula_atual se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'aula_atual'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN aula_atual INTEGER DEFAULT 1;
  END IF;
END $$;
