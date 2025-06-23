import gtts from 'node-gtts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeamento de idiomas para códigos do Google TTS
const idiomasCodigos = {
  'inglês': 'en',
  'ingles': 'en',
  'espanhol': 'es',
  'francês': 'fr',
  'frances': 'fr',
  'mandarim': 'zh'
};

// Função para gerar áudio de texto
export async function gerarAudio(texto, idioma, nomeArquivo) {
  return new Promise((resolve, reject) => {
    const codigoIdioma = idiomasCodigos[idioma.toLowerCase()] || 'en';
    const audioDir = path.join(__dirname, '..', 'temp', 'audio');
    
    // Criar diretório se não existir
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    
    const caminhoArquivo = path.join(audioDir, `${nomeArquivo}.mp3`);
    
    gtts(codigoIdioma)
      .stream(texto)
      .pipe(fs.createWriteStream(caminhoArquivo))
      .on('finish', () => {
        resolve(caminhoArquivo);
      })
      .on('error', (err) => {
        console.error('Erro ao gerar áudio:', err);
        reject(err);
      });
  });
}

// Função para limpar arquivos de áudio antigos
export function limparAudiosAntigos() {
  const audioDir = path.join(__dirname, '..', 'temp', 'audio');
  
  if (fs.existsSync(audioDir)) {
    const arquivos = fs.readdirSync(audioDir);
    const agora = Date.now();
    const umDiaEmMs = 24 * 60 * 60 * 1000;
    
    arquivos.forEach(arquivo => {
      const caminhoArquivo = path.join(audioDir, arquivo);
      const stats = fs.statSync(caminhoArquivo);
      
      if (agora - stats.mtime.getTime() > umDiaEmMs) {
        fs.unlinkSync(caminhoArquivo);
      }
    });
  }
}

// Limpar arquivos antigos a cada hora
setInterval(limparAudiosAntigos, 60 * 60 * 1000);