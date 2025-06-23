import fs from 'fs';

export function mp3ToBase64(caminhoArquivo) {
  return fs.readFileSync(caminhoArquivo, { encoding: 'base64' });
}
