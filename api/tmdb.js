// =====================================================================
// /api/tmdb — proxy da API do TMDB (Vercel Serverless Function)
// ---------------------------------------------------------------------
// - A chave fica SOMENTE em process.env.TMDB_API_KEY (nunca no front).
// - Só aceita uma lista branca de endpoints e de parâmetros.
// - Força language=pt-BR e region=BR em toda chamada.
// - Responde com cache de CDN (s-maxage=3600 + stale-while-revalidate).
// Uso no front: /api/tmdb?path=/search/multi&query=duna&page=1
// =====================================================================

const TMDB_BASE = 'https://api.themoviedb.org/3';

// Tempo máximo esperando o TMDB antes de desistir (ms)
const TIMEOUT_MS = 8000;

// Validadores de cada parâmetro aceito (todos recebem string)
const VALIDADORES = {
  // Texto de busca: 1 a 100 caracteres úteis
  query: (v) => v.trim().length >= 1 && v.length <= 100,
  // Página: inteiro de 1 a 500 (limite do próprio TMDB)
  page: (v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 500,
  // Só os blocos extras que o app usa na página do título
  append_to_response: (v) =>
    v.split(',').every((p) => ['credits', 'videos', 'similar', 'recommendations'].includes(p)),
  // Idiomas dos vídeos (ex.: "pt,en,null") — necessário para achar trailer
  include_video_language: (v) => /^([a-z]{2}|null)(,([a-z]{2}|null)){0,4}$/.test(v),
  // Ordenações permitidas no /discover
  sort_by: (v) =>
    ['popularity.desc', 'vote_average.desc', 'primary_release_date.desc', 'first_air_date.desc'].includes(v),
  // Listas de IDs de gênero separados por vírgula (E) ou barra vertical (OU)
  with_genres: (v) => /^\d{1,6}([,|]\d{1,6}){0,9}$/.test(v),
  without_genres: (v) => /^\d{1,6}([,|]\d{1,6}){0,9}$/.test(v),
  // Idioma original em ISO 639-1 (ex.: "ja", "ko")
  with_original_language: (v) => /^[a-z]{2}(\|[a-z]{2}){0,4}$/.test(v),
  // Mínimo de votos (evita títulos obscuros no /discover)
  'vote_count.gte': (v) => /^\d{1,5}$/.test(v),
};

// Lista branca de rotas: regex do caminho + parâmetros aceitos + extras forçados
const ROTAS = [
  { padrao: /^\/search\/multi$/, params: ['query', 'page'], obrigatorios: ['query'], extras: { include_adult: 'false' } },
  { padrao: /^\/(movie|tv)\/\d{1,9}$/, params: ['append_to_response', 'include_video_language'] },
  { padrao: /^\/(movie|tv)\/\d{1,9}\/watch\/providers$/, params: [] },
  { padrao: /^\/trending\/(all|movie|tv)\/(day|week)$/, params: ['page'] },
  {
    padrao: /^\/discover\/(movie|tv)$/,
    params: ['page', 'sort_by', 'with_genres', 'without_genres', 'with_original_language', 'vote_count.gte'],
    extras: { include_adult: 'false', watch_region: 'BR' },
  },
  { padrao: /^\/genre\/(movie|tv)\/list$/, params: [] },
];

// Erro de validação: vira resposta 400 com mensagem segura para o cliente
export class ErroValidacao extends Error {}

/**
 * Valida a query recebida e monta a requisição para o TMDB.
 * Função pura (sem rede) para poder ser testada com Vitest.
 * @param {Record<string, string|string[]>} query - req.query da Vercel
 * @param {string} chave - TMDB_API_KEY (v3) ou token de leitura v4
 * @returns {{ url: string, headers: Record<string,string> }}
 */
export function montarRequisicao(query, chave) {
  const { path: caminho, ...resto } = query ?? {};

  // O caminho precisa ser string simples e bater com alguma rota liberada
  if (typeof caminho !== 'string') throw new ErroValidacao('Parâmetro "path" ausente');
  const rota = ROTAS.find((r) => r.padrao.test(caminho));
  if (!rota) throw new ErroValidacao('Endpoint não permitido');

  const url = new URL(TMDB_BASE + caminho);

  // Copia só os parâmetros aceitos pela rota, validando cada um
  for (const [nome, valor] of Object.entries(resto)) {
    if (!rota.params.includes(nome)) throw new ErroValidacao(`Parâmetro não permitido: ${nome}`);
    // Parâmetro repetido (?page=1&page=2) chega como array: recusamos
    if (typeof valor !== 'string' || !VALIDADORES[nome](valor)) {
      throw new ErroValidacao(`Valor inválido para ${nome}`);
    }
    url.searchParams.set(nome, valor);
  }

  // Confere parâmetros obrigatórios (ex.: query na busca)
  for (const nome of rota.obrigatorios ?? []) {
    if (!url.searchParams.has(nome)) throw new ErroValidacao(`Parâmetro obrigatório: ${nome}`);
  }

  // Sempre português do Brasil + região Brasil, mais extras da rota
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'BR');
  for (const [nome, valor] of Object.entries(rota.extras ?? {})) url.searchParams.set(nome, valor);

  // Chave v4 (JWT, começa com "eyJ") vai no header; chave v3 vai na URL
  const headers = { accept: 'application/json' };
  if (chave.startsWith('eyJ')) headers.authorization = `Bearer ${chave}`;
  else url.searchParams.set('api_key', chave);

  return { url: url.toString(), headers };
}

// Handler da Vercel (Node.js runtime)
export default async function handler(req, res) {
  // Proxy é somente leitura
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  // Sem chave configurada: erro genérico pro cliente, detalhe só no log
  const chave = process.env.TMDB_API_KEY;
  if (!chave) {
    console.error('[api/tmdb] TMDB_API_KEY não configurada no ambiente');
    return res.status(500).json({ erro: 'Serviço indisponível' });
  }

  // Valida entrada antes de qualquer chamada externa
  let destino;
  try {
    destino = montarRequisicao(req.query, chave);
  } catch (erro) {
    if (erro instanceof ErroValidacao) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({ erro: erro.message });
    }
    throw erro; // erro de programação: deixa estourar
  }

  try {
    const resposta = await fetch(destino.url, {
      headers: destino.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 404 do TMDB vira 404 (título inexistente); o resto vira 502
    if (!resposta.ok) {
      const status = resposta.status === 404 ? 404 : 502;
      console.error(`[api/tmdb] TMDB respondeu ${resposta.status} para ${req.query.path}`);
      res.setHeader('Cache-Control', status === 404 ? 'public, s-maxage=600' : 'no-store');
      return res.status(status).json({ erro: status === 404 ? 'Não encontrado' : 'Falha ao consultar o catálogo' });
    }

    const dados = await resposta.json();
    // Cache na CDN da Vercel por 1h, servindo versão antiga enquanto revalida
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(dados);
  } catch (erro) {
    // Timeout ou falha de rede até o TMDB
    console.error('[api/tmdb] falha de rede:', erro?.name, erro?.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(504).json({ erro: 'Catálogo demorou para responder' });
  }
}
