# PósCréditos

> A conversa começa quando o filme acaba.

Comunidade brasileira de reviews de filmes, séries, animes e doramas.
Stack: HTML/CSS/JS puros (ES modules) + Firebase (Auth + Realtime Database) + Vercel (estático + Serverless Function como proxy do TMDB). PWA agora, Capacitor depois.

## Status das fases

| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Estrutura, tokens, logo, proxy `/api/tmdb`, busca, página do título com "onde assistir" | Pronta |
| 2 | Login com Google, perfil, @username único, onboarding | Pendente |
| 3 | Reviews, notas, spoiler, edição/exclusão, listas pessoais | Pendente |
| 4 | Seguir, curtir, comentar, feed | Pendente |
| 5 | Card de Stories, denúncia/bloqueio, Security Rules finais, PWA | Pendente |

## Estrutura

```
api/tmdb.js              Proxy do TMDB (lista branca, validação, cache de CDN)
public/                  Tudo que é servido (outputDirectory da Vercel)
  index.html             Início (Fase 1: "Em alta" por tipo)
  busca.html             Busca com filtros por tipo
  titulo.html            Página do título (?id=movie_603 / tv_1396)
  css/                   tokens.css, base.css, componentes.css
  js/                    tmdb.js (catálogo), ui.js (helpers de interface), feed.js, busca.js, titulo.js
  icons/                 logo.svg + PNGs gerados (npm run icones)
  img/                   logo do TMDB e imagem de Open Graph
tests/unit/              Vitest (proxy e funções de catálogo)
tests/rules/             @firebase/rules-unit-testing (emulador)
tests/e2e/               Playwright (Chromium, Firefox, WebKit) com TMDB simulado
tools/gerar-icones.mjs   Gera ícones do PWA e og-image a partir do SVG
database.rules.json      Security Rules (Fase 1: banco fechado)
```

## Pré-requisitos

- Node.js 20+
- Vercel CLI: `npm i -g vercel`
- Firebase CLI + Java 11+ (só para `npm run test:rules`): `npm i -g firebase-tools`

## Configurar a chave do TMDB

A chave **nunca** vai para `public/`. Ela só existe no ambiente da função `/api/tmdb`.

1. Crie a chave em <https://www.themoviedb.org/settings/api> (pode usar a "Chave da API" v3 ou o "Token de Leitura da API" v4; o proxy aceita as duas).
2. **Local:** copie `.env.example` para `.env.local` e preencha `TMDB_API_KEY=...`. O `vercel dev` lê esse arquivo. Ele já está no `.gitignore`.
3. **Produção:** Vercel → seu projeto → *Settings → Environment Variables* → adicione `TMDB_API_KEY` marcando *Production*, *Preview* e *Development*. Depois faça um novo deploy (variável nova só vale em deploy novo).
   - Pela CLI: `vercel env add TMDB_API_KEY`

## Rodar localmente

```bash
npm install
npx playwright install          # só na primeira vez (navegadores dos testes)
vercel link                     # na primeira vez: liga a pasta a um projeto da Vercel
vercel dev                      # http://localhost:3000
```

Na primeira execução o `vercel dev` pergunta as configurações do projeto: aceite os padrões (o `vercel.json` já define `outputDirectory: public`).

### Testar a Fase 1 manualmente

1. Abra `http://localhost:3000` → deve aparecer "Em alta na semana" com pôsteres. Troque os chips (Filmes, Séries, Animes, Doramas).
2. Toque em **Buscar** → digite `frieren` → resultados aparecem enquanto digita, com selo ANIME e chips por tipo com contagem.
3. Abra um resultado → capa, pôster, sinopse com "Ler mais", trailer (só carrega o YouTube ao tocar), elenco, semelhantes.
4. Em **Onde assistir**: serviços do Brasil com categoria (Assinatura, Aluguel, Compra), crédito "Dados de streaming: JustWatch".
5. Rodapé: logo do TMDB + aviso de atribuição.
6. Teste o proxy direto:
   - `http://localhost:3000/api/tmdb?path=/movie/603` → JSON em português
   - `http://localhost:3000/api/tmdb?path=/account` → `400 Endpoint não permitido`
7. Navegue só com teclado (Tab/Shift+Tab/Enter): foco amarelo visível em tudo.

## Testes automatizados

```bash
npm test             # Vitest: proxy + funções de catálogo
npm run test:rules   # Security Rules no emulador do Realtime Database
npm run test:e2e     # Playwright em Chromium, Firefox e WebKit (TMDB simulado, sem rede)
npm run test:tudo    # os três em sequência
```

## Publicar na Vercel

```bash
vercel          # deploy de preview
vercel --prod   # produção
```

Depois do primeiro deploy de produção, troque `https://poscreditos.vercel.app` pelo domínio real em: tags Open Graph dos HTML, `public/robots.txt` e `public/sitemap.xml`.

## Decisões da Fase 1

- **Logo:** referência C ("reticências"): círculo amarelo `#F5B700` com três pontos escuros subindo na diagonal + wordmark `PÓS·CRÉDITOS` em caixa alta com o ponto amarelo. Fonte única em `public/icons/logo.svg`; depois de alterar, rode `npm run icones`.
- **Classificação de tipo:** anime = Animação (16) + idioma `ja`. Dorama = série em `ko`, `zh`, `cn` (cantonês no TMDB) ou `ja` que não seja animação, reality, talk show, notícias ou documentário.
- **Imagens:** `w342` em listas e no pôster da página do título; `w780` no fundo (backdrop) da página do título; `w185` nas fotos do elenco; `w92` nos logos dos serviços.
- **Onde assistir:** usa `results.BR` com assinatura, grátis, grátis com anúncios, aluguel e compra; o mesmo serviço em várias categorias vira um item só.
- **Segurança:** CSP sem `unsafe-inline` (possível porque não há nenhum script/estilo inline), `X-Frame-Options: DENY`, proxy com lista branca de endpoints e parâmetros.
- **Ícones:** traçados do [Lucide](https://lucide.dev) (licença ISC).
# PosCredito
