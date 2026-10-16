// Servidor estático mínimo para os testes E2E (serve a pasta public/).
// O /api/tmdb é interceptado pelo Playwright com dados fixos, então os
// testes não dependem da chave do TMDB nem de rede.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const RAIZ = resolve('public');
const PORTA = Number(process.env.PORTA ?? 4173);

// Tipos de arquivo servidos
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

createServer(async (req, res) => {
  // Remove query string e impede sair da pasta public/ (../)
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const arquivo = normalize(join(RAIZ, caminho === '/' ? 'index.html' : caminho));
  if (!arquivo.startsWith(RAIZ)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const conteudo = await readFile(arquivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(conteudo);
  } catch {
    res.writeHead(404).end('Não encontrado');
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`Servidor de teste em http://127.0.0.1:${PORTA}`));
