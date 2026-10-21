# Contrato do App de Estudos (BTI Univesp) — v3 (nuvem)

HTML, CSS e JavaScript puro. Sem frameworks, sem build, sem npm, sem servidor próprio, sem ES modules
(scripts clássicos; o app deve abrir com duplo clique no `index.html` via file:// e no GitHub Pages
`https://wenceslauandre.github.io/estudos/`). Toda a interface em português.
Única dependência externa: supabase-js v2 via CDN (carregada sob demanda por `js/nuvem.js`).

## Páginas

| Página | `<main>` | Scripts (nesta ordem) |
|---|---|---|
| `index.html` (Planner) | `#app-planner` | comum → config → nuvem → conta → importacao → app → planner |
| `estudar.html` (Estudar) | `#app-estudar` | comum → config → nuvem → conta → importacao → app → estudar |
| `flashcards.html` (Flashcards) | `#app-flashcards` | comum → config → nuvem → conta → importacao → app → flashcards-exemplos → flashcards |

CSS: `base.css` → `conta.css` → CSS da página.

Navegação (já no cabeçalho das 3 páginas): Planner · Estudar · Flashcards.
Botões do cabeçalho: tema, Exportar backup, Importar backup (`#btn-importar` + `#arquivo-importar`),
**Importar conteúdo** (`#btn-importar-conteudo` + `#arquivo-conteudo`).

## Donos dos arquivos (rodada 3 — nuvem)

| Arquivo | Dono |
|---|---|
| `js/comum.js`, `js/config.js`, `CONTRATO.md`, `<script>`/`<link>`/`<main>`/nav dos HTML | Coordenador — **ninguém edita** |
| `js/nuvem.js`, `supabase/schema.sql`, `testes/nuvem.test.js` | Worker G (sincronização) |
| `js/conta.js`, `css/conta.css`, `js/app.js`, região CABEÇALHO/RODAPÉ dos HTML (pode adicionar elementos, mantendo os ids existentes) | Worker H (login e interface da conta) |
| `js/planner.js`, `js/estudar.js`, `js/flashcards*.js`, `js/importacao.js`, demais CSS | ninguém nesta rodada |

Envolva cada arquivo JS numa IIFE; só exponha globais listadas aqui.
Para testes em node, `if (typeof module === "object" && module.exports) module.exports = {...}` é permitido.

## API compartilhada (`window.Estudos`, em `js/comum.js`)

Já existia: `MATERIAS`, `SEMANAS` (1..8, 8 = "Revisão final"), `CHAVES`, `ler`, `salvar`,
`exportarTudo`, `importarTudo` (backup que SUBSTITUI), `materiaPorCodigo`.

Novo na v2:
- `CHAVES.planos` = `"estudos.planos.v1"`
- `MIN_ALTERNATIVAS` = 2, `MAX_ALTERNATIVAS` = 5
- `gerarId()` — id string única
- `semanaValida(n)` → número 1..8 ou `null`
- `urlSegura(url)` → a URL se for `http://`/`https://`, senão `""`. **Todo link exibido passa por aqui.**
- `normalizarAlternativas(lista)` → `[{ texto, correta }]` limpa, ou `[]` se inválida
  (válida = 2 a 5 itens com texto, sem texto repetido, exatamente 1 `correta: true`)
- `planoVazio()`, `normalizarPlano(p)` → plano no formato abaixo (aceita tópicos como string e links como string)
- `lerPlanos()` → `{ versao: 1, planos: { "1".."8": { PES300|ADM200|COM230: plano } } }` sempre completo
- `salvarPlanos(dados)`
- `marcarConteudoEstudado(semana, materia)` — põe `conteudo: true` no Planner sem mexer no resto. **Nunca desmarca.**
- `parametrosFiltro()` → `{ materia: "PES300"|null, semana: 1..8|null }` lidos de `?materia=&semana=` na URL
- `importarConteudo(obj)` — **definido por `js/importacao.js`** (ver abaixo)

Novo na v3:
- `salvar(chave, valor)` e `importarTudo` disparam, após gravar com sucesso, o evento
  `window` → `CustomEvent("estudos:salvo", { detail: { chave } })`. **Toda escrita de dado `estudos.*`
  deve passar por `Estudos.salvar`** (o app.js passa a gravar o tema por ele).
- `salvarSemEvento(chave, valor)` — grava sem disparar o evento (uso exclusivo do `nuvem.js`
  ao aplicar dados vindos da nuvem, para não reenviar o que acabou de baixar).
- `chavesLocais()` → lista das chaves `estudos.*` presentes no localStorage.
- `nuvem` — **definido por `js/nuvem.js`** (ver "Sincronização com a nuvem").

## Formatos no localStorage

```js
// "estudos.planner.v1" (inalterado)
{ versao: 1, semanas: { "1": { "PES300": { atividade: false, conteudo: false, anotacoes: "" }, ... }, ... "8": {...} } }

// "estudos.flashcards.v1" — cartão ganha 2 campos OPCIONAIS (cartões antigos continuam válidos)
{ versao: 1,
  cartoes: [{ id, materia: "PES300", semana: 1, frente: "", verso: "",
              alternativas: [{ texto: "…", correta: true }, { texto: "…", correta: false }],  // opcional, 0 ou 2–5
              explicacao: "",                                                              // opcional
              acertos: 0, erros: 0, criadoEm: "ISO", ultimaRevisao: "ISO"|null }],
  historicoQuiz: [{ data, materia, semana, acertos, total, modo?: "quiz"|"multipla" }] }

// "estudos.planos.v1" — NOVO: um plano por semana×matéria
{ versao: 1, planos: {
    "1": { "PES300": { titulo: "", resumo: "markdown", topicos: [{ id, texto, feito: false }],
                       links: [{ id, titulo, url }], atualizadoEm: "ISO"|null },
           "ADM200": {...}, "COM230": {...} },
    ... "8": {...} } }

// "estudos.preferencias.v1" (inalterado)
{ tema: "escuro" | "claro" }
```

### Regras de múltipla escolha
- `verso` continua sendo a resposta mostrada no modo Flashcard/Quiz.
- Se o cartão tem `alternativas` válidas (`normalizarAlternativas` não vazio), usa-as.
- Senão, gera automaticamente: correta = `verso`; erradas = `verso` de **outros cartões da mesma matéria**
  (qualquer semana), sem repetir o texto da correta (comparação sem maiúsc./espaços), até 3 erradas
  (total até 4). Se não houver ao menos 1 errada disponível, o cartão não entra no modo múltipla escolha.
- Alternativas sempre embaralhadas na exibição. Acerto/erro atualiza os mesmos `acertos`/`erros`/`ultimaRevisao`.

### Regras de "Estudar"
- Ao marcar um tópico e todos os tópicos daquela semana×matéria ficarem `feito: true` (e houver ≥ 1),
  chamar `Estudos.marcarConteudoEstudado(semana, materia)` e avisar o usuário.
- "Revisar com flashcards" abre `flashcards.html?materia=COD&semana=N`; a página de flashcards
  deve aplicar esse filtro ao abrir (via `Estudos.parametrosFiltro()`).
- `estudar.html?materia=COD&semana=N` também abre direto naquele plano.

## Formato de importação de conteúdo (`Estudos.importarConteudo`)

Arquivo JSON que **adiciona** conteúdo (não substitui; é diferente do backup):

```json
{
  "formato": "estudos-univesp-conteudo",
  "versao": 1,
  "planos": [
    { "semana": 1, "materia": "PES300", "titulo": "…", "resumo": "markdown…",
      "topicos": ["tópico 1", "tópico 2"],
      "links": [{ "titulo": "Videoaula", "url": "https://…" }] }
  ],
  "flashcards": [
    { "semana": 1, "materia": "PES300", "frente": "pergunta", "verso": "resposta",
      "explicacao": "opcional",
      "alternativas": [{ "texto": "…", "correta": true }, { "texto": "…", "correta": false }] }
  ]
}
```

`planos` e `flashcards` são ambos opcionais (pelo menos um presente). `importarConteudo(obj)`:
- Lança `Error` (mensagem em português) se `formato` ≠ `"estudos-univesp-conteudo"`; se o arquivo
  for um backup (`app: "estudos-univesp"`), a mensagem orienta a usar "Importar backup".
- Itens inválidos (matéria desconhecida, semana fora de 1..8, frente/verso vazios) são **ignorados** e contados em `avisos`.
- Planos — mescla no plano existente da semana×matéria: `titulo` só preenche se o atual estiver vazio;
  `resumo`: se vazio usa o importado, senão anexa o importado após uma linha em branco (se ainda não contido);
  `topicos`: adiciona os que não existem (comparando texto sem maiúsc./espaços), com `feito: false`;
  `links`: adiciona os de URL nova (só http/https via `urlSegura`).
- Flashcards — adiciona como cartões novos (`acertos: 0, erros: 0`), ignorando duplicata
  (mesma matéria + semana + frente, sem maiúsc./espaços). `alternativas` inválidas são descartadas
  (o cartão entra sem elas, com aviso). Se a chave de flashcards ainda não existir, cria só com os
  importados (os cartões de exemplo não são adicionados nesse caso).
- Retorna `{ planos: { criados, atualizados }, flashcards: { adicionados, duplicados }, ignorados, avisos: ["…"] }`.
- `app.js` chama, mostra o resumo ao usuário e recarrega a página.

## Sincronização com a nuvem (Supabase)

### Configuração (`js/config.js`, global `window.EstudosConfig`)
```js
{ supabaseUrl: "https://lozpiqgfmmakcxotvgct.supabase.co",   // base, SEM /rest/v1
  supabaseChave: "sb_publishable_…",                         // chave pública (pode ir pro git)
  supabaseJsUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js",
  siteUrl: "https://wenceslauandre.github.io/estudos/" }     // destino dos e-mails (confirmação/senha)
```

### Tabela `public.estudos_dados` (uma linha por usuário × chave do localStorage)

| coluna | tipo | observação |
|---|---|---|
| `user_id` | uuid | PK, default `auth.uid()`, FK `auth.users` com `on delete cascade` |
| `chave` | text | PK, ex. `"estudos.flashcards.v1"`; `check` começa com `estudos.` e ≤ 100 caracteres |
| `valor` | jsonb | exatamente o JSON que está no localStorage |
| `revisao` | bigint | começa em 1; trigger soma 1 a cada `update` (ignora o valor enviado) |
| `atualizado_em` | timestamptz | trigger põe `now()` em insert/update |
| `dispositivo` | text | id aleatório do aparelho que gravou por último (informativo) |

RLS ativado, com políticas select/insert/update/delete restritas a `user_id = (select auth.uid())`,
e permissões só para o papel `authenticated` (o papel `anon` não acessa a tabela).
Limite de tamanho: `valor` até ~1 MB (`check (pg_column_size(valor) < 1048576)`).

### Estado local da sincronização (fora do prefixo `estudos.`, logo não vai pra nuvem nem pro backup)
```js
// "estudos-sync.meta.v1"
{ usuario: "uuid" | null,          // dono dos dados locais já sincronizados
  dispositivo: "id aleatório",
  chaves: { "estudos.flashcards.v1": { revisao: 7,      // última revisão da nuvem que este aparelho conhece
                                       pendente: true } } }  // alterado localmente e ainda não enviado
```

### Fluxo
1. **Abrir o app**: as páginas renderizam na hora a partir do localStorage (offline-first).
   Depois o `nuvem.js` carrega o supabase-js da CDN (injeta `<script async>`); se falhar, status `"offline"` e tudo segue local.
2. **Logado ao abrir** (sessão salva pelo supabase-js): baixa todas as linhas do usuário e concilia (regras abaixo).
   Se algum dado local mudou por causa da nuvem, recarrega a página **uma vez** (trava em `sessionStorage`
   `estudos-sync.recarregado`) para mostrar os dados novos.
3. **Ao alterar algo** (`estudos:salvo`): marca a chave como `pendente` e agenda envio com debounce de 1,5 s.
4. **Envio** de cada chave pendente = gravação condicional (controle otimista):
   - chave nunca enviada → `insert`; se já existir (conflito 23505) → trata como conflito.
   - senão → `update … where chave = X and revisao = <revisao conhecida>`; se 0 linhas afetadas → **conflito**:
     baixa a linha atual, `mesclar`, salva local, e tenta de novo (até 3 vezes).
   - sucesso → guarda a nova `revisao`, limpa `pendente`.
5. **Sem internet / erro de rede**: status `"offline"`, mantém `pendente`; tenta de novo no evento `online`,
   ao voltar o foco para a aba e a cada 30 s enquanto houver pendências.
6. **Ao voltar o foco da aba** (no máx. 1 vez a cada 30 s): baixa de novo; se algo mudou e foi aplicado,
   dispara o evento `estudos:nuvem-atualizada` (o `conta.js` mostra "Dados atualizados de outro aparelho — Recarregar").

### Conciliação ao baixar (por chave)
| situação | resultado |
|---|---|
| nuvem.revisao == revisão conhecida | nada a baixar; se `pendente`, envia |
| nuvem mais nova e local **sem** pendência | local = nuvem |
| nuvem mais nova e local **com** pendência (editei nos dois aparelhos) | local = `mesclar(chave, local, nuvem)`, depois envia |
| chave só local | envia (insert) |
| chave só na nuvem | baixa |

### Primeiro login num aparelho (ou login com outro usuário: `meta.usuario` ≠ usuário atual)
- Local sem dados relevantes (nenhuma chave `estudos.*` além de `preferencias`) → usa a nuvem.
- Nuvem vazia → envia tudo do local.
- Os dois com dados → pergunta (via `Estudos.nuvem.definirPerguntaPrimeiroLogin`):
  - `"enviar"`: os dados locais substituem os da nuvem (chaves que só existem na nuvem são apagadas da nuvem);
  - `"nuvem"`: os dados da nuvem substituem os locais (chaves `estudos.*` só locais são removidas do aparelho);
  - `"juntar"`: para cada chave, `mesclar(chave, local, nuvem)` e envia o resultado.
  - Cancelar = não sincroniza agora (continua logado, status `"offline"`, pergunta de novo na próxima abertura).

### Regra de mesclagem `mesclar(chave, local, nuvem)` (função pura, testada em node)
Nada se perde por padrão: na dúvida, junta.
- **`estudos.planner.v1`**: por semana×matéria, `atividade` e `conteudo` = OU lógico;
  `anotacoes`: iguais → mantém; uma vazia → a outra; uma contém a outra → a maior;
  diferentes → `local + "\n\n— (outro aparelho) —\n" + nuvem`.
- **`estudos.flashcards.v1`**: `cartoes` = união por `id`; mesmo `id` nos dois → fica a versão com
  maior `acertos + erros` (empate: a com `ultimaRevisao` mais recente; empate: local).
  `historicoQuiz` = união sem duplicatas (mesmo `data` + `materia` + `semana` + `modo`), ordenado por `data`.
- **`estudos.planos.v1`**: por semana×matéria, base = plano com `atualizadoEm` mais recente (empate: local);
  `topicos` = união por `id` (mesmo id: `feito` = OU, texto da base); `links` = união por `url`;
  `titulo`/`resumo` da base, mas se a base estiver vazia usa os do outro.
- **`estudos.preferencias.v1`** e qualquer chave desconhecida: vence o local.
- Valores inválidos/`null` de um lado → fica o outro.

**Limitação conhecida**: como a mesclagem é por união, um cartão/tópico **apagado** num aparelho pode
voltar se, ao mesmo tempo, o outro aparelho tiver alterações pendentes nessa mesma chave.
Sem edição simultânea (o caso normal: usar um aparelho, depois o outro) não há mesclagem — vale a versão mais nova.

### API `window.Estudos.nuvem` (`js/nuvem.js`)
Todas as funções assíncronas devolvem Promise; erros são `Error` com mensagem em português pronta para o usuário.
- `estado()` → `{ disponivel: bool, logado: bool, email: string|null, status: "desligado"|"salvando"|"salvo"|"offline"|"erro", pendentes: n }`
  (`"desligado"` = não logado; `"erro"` = falha que não é de rede, ex. RLS — mensagem em `estado().erro`)
- `aoMudar(fn)` → registra `fn(estado)`; chamado a cada mudança de login/status. Devolve função para cancelar.
- `criarConta(email, senha)` → `{ precisaConfirmar: bool }` (true se o Supabase exigir confirmação por e-mail)
- `entrar(email, senha)`, `sair()`, `esqueciSenha(email)`, `definirNovaSenha(senha)`
- `definirPerguntaPrimeiroLogin(fn)` → `fn({ chavesLocais: [...], chavesNuvem: [...] })` deve devolver
  Promise de `"enviar"|"nuvem"|"juntar"|null` (null = cancelar). Registrada pelo `conta.js`.
- `sincronizarAgora()` → baixa e envia pendências.
- Eventos em `window`: `estudos:nuvem-atualizada` (dados da nuvem aplicados com a página aberta),
  `estudos:recuperar-senha` (usuário voltou do link "esqueci a senha" → `conta.js` pede a nova senha).
- Para testes em node, `nuvem.js` exporta via `module.exports` ao menos `{ mesclar }` e a função de conciliação pura.

### Interface da conta (`js/conta.js` + `css/conta.css`)
- Cabeçalho: deslogado → botão **Entrar**; logado → e-mail (abreviado no celular), indicador de status
  (`Salvo` / `Salvando...` / `Offline`, com `title` explicando) e botão **Sair**.
- Deslogado: aviso discreto no rodapé "Dados salvos só neste aparelho. Entre para salvar na nuvem." (com link Entrar).
- Diálogo (`<dialog>` ou modal acessível, fecha com Esc) com abas Entrar / Criar conta / Esqueci a senha;
  diálogo de nova senha; diálogo da escolha do primeiro login (3 opções + cancelar, explicando cada uma).
- Se `nuvem` estiver indisponível (CDN fora/offline), o botão Entrar mostra a mensagem do erro em vez de quebrar.

## Visual

Use só as variáveis CSS de `css/base.css` (`--cor-fundo`, `--cor-superficie`, `--cor-superficie-2`,
`--cor-borda`, `--cor-texto`, `--cor-texto-suave`, `--cor-destaque`, `--cor-sucesso`, `--cor-erro`,
`--cor-aviso`, `--raio`, `--espaco`, `--fonte`) e `MATERIAS[i].cor`. Prefixe classes
(`.planner-…`, `.fc-…`, `.est-…`). Responsivo até 360px.
Utilitárias em `base.css`: `.botao`, `.botao-primario`, `.botao-perigo`, `.cartao`, `.campo`,
`.barra-progresso > span`, `.oculto`.

## Segurança
Texto vindo do usuário, de arquivo importado ou da nuvem nunca vai para `innerHTML` sem escapar.
Só a chave pública (publishable/anon) fica no código; a proteção dos dados é o RLS. Nunca usar a chave `service_role`/secret no front.
Senha nunca é guardada pelo app (só a sessão do supabase-js, que ele mesmo mantém no localStorage em chave `sb-…`).
O renderizador de Markdown escapa HTML antes de aplicar a formatação e só gera links via `urlSegura`.
