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
| 4 | Seguir, curtir, comentar, feed | Pronta |
| 5 | Card de Stories, denúncia/bloqueio, Security Rules finais, PWA | Pronta |

## Estrutura

```
api/tmdb.js              Proxy do TMDB (lista branca, validação, cache de CDN)
public/                  Tudo que é servido (outputDirectory da Vercel)
  index.html             Início (Fase 1: "Em alta" por tipo)
  busca.html             Busca com filtros por tipo
  titulo.html            Página do título (?id=movie_603 / tv_1396) + editor de review
  regras.html            Regras da comunidade
  manifest.json, sw.js   PWA (instalação e cache offline)
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
    social.js            Busca de pessoas, seguir, curtir, comentar
    moderation.js        Denunciar e bloquear (dados + diálogo)
    share-card.js        Card de Stories (canvas → PNG)
    acoes-review.js      Barra de curtir/comentar/compartilhar/⋯
    *-regras.js          Regras puras (validação, montagem das escritas) — testadas
    ui.js, cartao-review.js, interesses.js   Componentes de interface
    feed.js, busca.js, titulo.js, titulo-comunidade.js, perfil.js, onboarding.js   Páginas
  icons/                 logo.svg + PNGs gerados (npm run icones)
  img/                   logo do TMDB e imagem de Open Graph
tests/unit/              Vitest (proxy, catálogo, perfil, reviews)
tests/rules/             @firebase/rules-unit-testing (emulador)
tests/e2e/               Playwright (Chromium, Firefox, WebKit) com TMDB simulado
.githooks/pre-commit     Sobe a versão do cache do sw.js sozinho
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

### Testar a Fase 4 manualmente (use duas contas Google)

1. Conta A: abra o perfil da conta B (`perfil.html?u=@dela` ou pela busca) → **Seguir** → contador de seguidores sobe; o botão vira "Seguindo".
2. Início → aba **Seguindo** mostra as reviews de B; **Em alta** mostra as recentes da comunidade, mais curtidas primeiro. Os chips filtram por tipo.
3. Curta uma review (coração fica amarelo, número sobe). Toque de novo para descurtir.
4. Toque no balão → escreva um comentário → **Enviar**. O contador sobe.
5. Apague: o autor apaga o próprio comentário; a dona da review apaga qualquer comentário dela. Terceiros não veem a lixeira.
6. Deslogado: curtir/comentar/seguir levam ao login e voltam para a mesma página.
7. No perfil, toque nos contadores: **Seguidores** e **Seguindo** abrem a lista de pessoas (tocar num nome abre o perfil); **Vistos** abre a aba "Já vi".

### Testar a Fase 5 manualmente

1. **Card para Stories:** em qualquer review, toque no ícone de compartilhar → no celular abre o menu de compartilhar com a imagem 1080x1920 (escolha Instagram → Stories); no computador a imagem é baixada. Review com spoiler não leva o texto para o card.
2. **Denunciar:** toque em **⋯** numa review (ou comentário) de outra pessoa → **Denunciar** → motivo → **Enviar denúncia**. Denunciar de novo o mesmo item mostra "Você já tinha denunciado".
3. **Bloquear:** **⋯** → **Bloquear @pessoa** → as reviews/comentários dela somem na hora. Com a conta bloqueada, tente curtir, comentar ou seguir quem bloqueou: o app recusa. No perfil da pessoa aparece **Desbloquear**.
4. **Regras:** link "Regras da comunidade" no rodapé.
5. **PWA:** no Chrome do Android, menu → **Instalar app** (ou "Adicionar à tela inicial"). No iPhone, Safari → Compartilhar → **Adicionar à Tela de Início**. Abre em tela cheia com o ícone do PósCréditos. Desligue a internet e reabra: as telas abrem (dados do Firebase precisam de conexão).

## Moderação: onde ver as denúncias

As denúncias ficam em `reports/` e **ninguém consegue ler pelo app** (só escrita). Para ver: Console do Firebase → *Realtime Database* → *Dados* → `reports`. Cada denúncia tem `reporterUid`, `targetType` (`review`/`comment`), `targetId` (para comentário: `reviewId~commentId`), `reason`, `details` e `createdAt`. Para remover um conteúdo, apague-o pelo console (a review em `reviews/{id}` junto com `titleReviews`, `userReviews` e o ajuste em `titleStats`; ou o comentário em `comments/{reviewId}/{id}` e `commentCount` −1).

## PWA e cache (importante a cada deploy)

- `public/sw.js` guarda os arquivos do app (lista `STATIC_ASSETS`) com **Cache First**: abre rápido e funciona offline. O catálogo (`/api/tmdb`) é **Network First**.
- Mudou HTML, CSS ou JS da lista? A versão em `CACHE_NAME` (`poscreditos-vN`) **precisa subir**, senão quem já abriu o app fica na versão antiga. O hook faz isso sozinho no commit — ative **uma vez** por clone:
  ```bash
  git config core.hooksPath .githooks
  ```
- Criou um arquivo novo em `public/` (HTML/CSS/JS/ícone)? Acrescente em `STATIC_ASSETS` no `sw.js`.

## App nativo (Capacitor, depois)

A base já evita APIs que quebram em WebView, com estas observações para quando empacotar:
- **Login com Google:** em WebView o popup/redirect do Firebase não funciona; usar o plugin `@capacitor-firebase/authentication` (login nativo) e passar a credencial ao Firebase JS.
- **Compartilhar o card:** usar `@capacitor/share` + `@capacitor/filesystem` (salvar o PNG e compartilhar o arquivo).
- **Service worker** não é usado dentro do app nativo (os arquivos já vêm no pacote).
- **Trailer do YouTube** precisa de `referrerpolicy` (já configurado) e do domínio do app no `server.hostname`.

## Testes automatizados

```bash
npm test             # Vitest: proxy, catálogo, perfil, reviews, social, moderação e card
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
- **Seguir:** `follows/{uid}/{alvo}`, `followers/{alvo}/{uid}` e os dois contadores no mesmo update; as regras exigem os quatro juntos e consistentes.
- **Curtidas:** `likes/{reviewId}/{uid}` + `likeCount ±1`. Como a chave é o uid de quem curte, cada +1 é amarrado a uma curtida real.
- **Comentários:** `comments/{reviewId}/{id}` (sem edição) + `commentCount ±1`. Apagam: quem escreveu ou a dona da review.
- **Feed "Em alta":** as 50 reviews mais recentes, ordenadas por curtidas. **"Seguindo":** as 5 últimas de cada pessoa seguida (até 50 pessoas), por data. Simples para o tamanho do MVP; com muita gente, vale um feed pré-montado por Cloud Function.
- **Limitação conhecida:** `commentCount` só anda de 1 em 1, mas (como os contadores próprios abaixo) não é amarrado a um comentário específico — dá para inflar de 1 em 1 sem comentar. Reviews excluídas deixam curtidas/comentários órfãos no banco (não aparecem em lugar nenhum).
- **Limitação conhecida:** os contadores próprios (`stats.reviews`/`stats.watched`) só andam de 1 em 1, mas as regras não conseguem ligar cada +1 a uma review/lista específica. Para recontar com 100% de garantia seria preciso uma Cloud Function (fora do escopo do MVP).

## Decisões da Fase 5

- **Card:** canvas 1080x1920 com as cores lidas dos tokens CSS (uma fonte só de verdade). As capas do TMDB liberam CORS, então o PNG pode ser exportado. Compartilha via Web Share API com arquivo; sem suporte, baixa.
- **Denúncias:** `reports/{uid}_{tipo}_{alvo}` — uma por pessoa por item, só escrita, motivo de uma lista fechada (`spoiler`, `ofensivo`, `assedio`, `spam`, `outro`) e detalhes opcionais até 300 caracteres.
- **Bloqueio:** `blocks/{uid}/{bloqueado}: true`, lido só pela própria pessoa. Além de esconder o conteúdo no app, as Security Rules impedem quem foi bloqueado de curtir, comentar e seguir quem bloqueou (desfazer curtida/follow antigos continua permitido).
