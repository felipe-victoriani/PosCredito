# PósCréditos

> A conversa começa quando o filme acaba.

Comunidade brasileira de reviews de filmes, séries, animes e doramas.
Stack: HTML/CSS/JS puros (ES modules) + Firebase (Auth + Realtime Database) + Vercel (estático + Serverless Function como proxy do TMDB). PWA agora, Capacitor depois.

## Status das fases

| Fase | Conteúdo | Status |
|---|---|---|
| 1 | Estrutura, tokens, logo, proxy `/api/tmdb`, busca, página do título com "onde assistir" | Pronta |
| 2 | Login com Google, perfil, @username único, onboarding, busca de pessoas | Pronta |
| 3 | Reviews, notas, spoiler, edição/exclusão, listas pessoais | Pronta |
| 4 | Seguir, curtir, comentar, feed | Pendente |
| 5 | Card de Stories, denúncia/bloqueio, Security Rules finais, PWA | Pendente |

## Estrutura

```
api/tmdb.js              Proxy do TMDB (lista branca, validação, cache de CDN)
public/                  Tudo que é servido (outputDirectory da Vercel)
  index.html             Início (Fase 1: "Em alta" por tipo)
  busca.html             Busca com filtros por tipo
  titulo.html            Página do título (?id=movie_603 / tv_1396) + editor de review
  perfil.html            Entrar com Google, perfil próprio/público (?u=@), abas de reviews e listas
  onboarding.html        Cadastro em 3 passos (@, interesses, bio)
  css/                   tokens.css, base.css, componentes.css
  js/
    firebase-config.js   Config pública do app Web do Firebase
    firebase.js          Inicialização + funções do SDK (versão do SDK só aqui)
    auth.js              Login, sessão, leitura/criação/edição de perfil
    tmdb.js              Cliente do proxy + funções puras de catálogo
    reviews.js           Publicar/editar/excluir e listar reviews
    lists.js             Quero ver, Já vi, Favoritos
    social.js            Busca de pessoas (Fase 4: seguir, curtir, comentar)
    *-regras.js          Regras puras (validação, montagem das escritas) — testadas
    ui.js, cartao-review.js, interesses.js   Componentes de interface
    feed.js, busca.js, titulo.js, titulo-comunidade.js, perfil.js, onboarding.js   Páginas
  icons/                 logo.svg + PNGs gerados (npm run icones)
  img/                   logo do TMDB e imagem de Open Graph
tests/unit/              Vitest (proxy, catálogo, perfil, reviews)
tests/rules/             @firebase/rules-unit-testing (emulador)
tests/e2e/               Playwright (Chromium, Firefox, WebKit) com TMDB simulado
tools/gerar-icones.mjs   Gera ícones do PWA e og-image a partir do SVG
database.rules.json      Security Rules do Realtime Database
```

## Configurar o Firebase

1. Console do Firebase → projeto `poscredito-c849d`.
2. *Authentication → Sign-in method* → ativar **Google**.
3. *Authentication → Settings → Domínios autorizados* → adicionar `poscredito.vercel.app` (o `localhost` já vem).
4. *Realtime Database* criado em `us-central1`; o endereço está em `public/js/firebase-config.js`.
5. **Publicar as regras** sempre que `database.rules.json` mudar (o arquivo no repositório não vale sozinho):
   ```bash
   firebase deploy --only database
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

### Testar as Fases 2 e 3 manualmente

1. **Perfil → Entrar com Google** → onboarding: escolha o @ (aparece "disponível"/"em uso"), interesses e bio → cai no perfil.
2. Engrenagem → **Editar perfil** → mude nome/bio/interesses → "Perfil atualizado".
3. **Buscar** → digite o começo do seu @ → chip **Pessoas** → abre o perfil público.
4. Abra um título → **Avaliar** → toque na metade de uma estrela (meia nota), escolha "Assisti", escreva, marque spoiler → **Publicar**.
   - A nota da comunidade atualiza, a review aparece com o texto borrado ("Contém spoiler · Mostrar"), o botão vira "Sua nota 4,5" e **Já vi** fica ativo.
5. Toque de novo → **Editar review** → mude a nota → **Salvar**. Depois **Excluir review** → confirme → a média volta.
6. Teste **Quero ver**, **Já vi** e o ❤ (Favorito). Marcar "Já vi" tira de "Quero ver".
7. No perfil: abas **Reviews**, **Favoritos**, **Já vi**, **Quero ver**; contador **Vistos**.
8. Deslogado, toque em **Avaliar** → vai para o login e, depois de entrar, volta ao título com o editor aberto.
9. Botão **+** da barra → busca → escolher título → abre o editor direto.

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

Depois do primeiro deploy de produção, troque `https://poscredito.vercel.app` pelo domínio real em: tags Open Graph dos HTML, `public/robots.txt` e `public/sitemap.xml`.

## Decisões da Fase 1

- **Logo:** referência C ("reticências"): círculo amarelo `#F5B700` com três pontos escuros subindo na diagonal + wordmark `PÓS·CRÉDITOS` em caixa alta com o ponto amarelo. Fonte única em `public/icons/logo.svg`; depois de alterar, rode `npm run icones`.
- **Classificação de tipo:** anime = Animação (16) + idioma `ja`. Dorama = série em `ko`, `zh`, `cn` (cantonês no TMDB) ou `ja` que não seja animação, reality, talk show, notícias ou documentário.
- **Imagens:** `w342` em listas e no pôster da página do título; `w780` no fundo (backdrop) da página do título; `w185` nas fotos do elenco; `w92` nos logos dos serviços.
- **Onde assistir:** usa `results.BR` com assinatura, grátis, grátis com anúncios, aluguel e compra; o mesmo serviço em várias categorias vira um item só.
- **Segurança:** CSP sem `unsafe-inline` (possível porque não há nenhum script/estilo inline), `X-Frame-Options: DENY`, proxy com lista branca de endpoints e parâmetros.
- **Ícones:** traçados do [Lucide](https://lucide.dev) (licença ISC).

## Decisões das Fases 2 e 3 (modelo de dados)

- **@ com ponto:** chaves do Realtime Database não aceitam `.`, então `marina.cine` é guardado em `usernames/marina,cine`. O @ é imutável.
- **Perfil e @ juntos:** `users/{uid}` e `usernames/{chave}` são gravados num único update; as regras exigem que um aponte para o outro.
- **Interesses** como mapa (`interests: { tipos: { anime: true }, generos: { terror: true } }`) em vez de array, para validar cada chave nas regras.
- **Uma review por pessoa por título:** id = `{uid}_{mediaKey}`. Reassistiu → edita e muda o status.
- **Nota média sem `runTransaction`:** a review, os índices (`titleReviews`, `userReviews`) e `titleStats` vão no mesmo update multi-path; as regras conferem que a soma mudou exatamente pela diferença da nota de quem escreve. Em concorrência, a escrita é recusada e o app tenta de novo (até 3 vezes). Assim é atômico e ninguém infla a média.
- **Índices** `titleReviews`/`userReviews` guardam o `createdAt` como valor (paginação com `orderByValue` + `limitToLast`).
- **Dados do título copiados** (nome, pôster, tipo, ano) na review e nos itens de lista, para o perfil e o feed não chamarem o TMDB a cada item.
- **"Já vi" automático:** publicar review com "Assisti"/"Reassisti" coloca o título em "Já vi" (e tira de "Quero ver"). Contador "Vistos" = `stats.watched`.
- **Limitação conhecida:** os contadores próprios (`stats.reviews`/`stats.watched`) só andam de 1 em 1, mas as regras não conseguem ligar cada +1 a uma review/lista específica. Para recontar com 100% de garantia seria preciso uma Cloud Function (fora do escopo do MVP).
# PosCredito
