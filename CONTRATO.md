# Contrato do App de Estudos (BTI Univesp) — v2

HTML, CSS e JavaScript puro. Sem frameworks, sem build, sem ES modules (scripts clássicos,
o app deve abrir com duplo clique no `index.html` via file://). Toda a interface em português.

## Páginas

| Página | `<main>` | Scripts (nesta ordem) |
|---|---|---|
| `index.html` (Planner) | `#app-planner` | comum → importacao → app → planner |
| `estudar.html` (Estudar) | `#app-estudar` | comum → importacao → app → estudar |
| `flashcards.html` (Flashcards) | `#app-flashcards` | comum → importacao → app → flashcards-exemplos → flashcards |

Navegação (já no cabeçalho das 3 páginas): Planner · Estudar · Flashcards.
Botões do cabeçalho: tema, Exportar backup, Importar backup (`#btn-importar` + `#arquivo-importar`),
**Importar conteúdo** (`#btn-importar-conteudo` + `#arquivo-conteudo`).

## Donos dos arquivos (rodada 2)

| Arquivo | Dono |
|---|---|
| `js/comum.js`, `CONTRATO.md`, `<script>`/`<link>`/`<main>`/nav dos HTML | Coordenador — **ninguém edita** |
| `js/flashcards.js`, `js/flashcards-exemplos.js`, `css/flashcards.css` | Worker D (Flashcards com alternativas) |
| `js/estudar.js`, `css/estudar.css` | Worker E (página Estudar) |
| `js/importacao.js`, `js/app.js`, `css/base.css`, `FORMATO-IMPORTACAO.md`, `exemplos/importacao-exemplo.json`, região CABEÇALHO/RODAPÉ dos HTML (só estilo/rotulagem, mantendo ids) | Worker F (Importação de conteúdo) |
| `js/planner.js`, `css/planner.css` | ninguém nesta rodada |

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

## Visual

Use só as variáveis CSS de `css/base.css` (`--cor-fundo`, `--cor-superficie`, `--cor-superficie-2`,
`--cor-borda`, `--cor-texto`, `--cor-texto-suave`, `--cor-destaque`, `--cor-sucesso`, `--cor-erro`,
`--cor-aviso`, `--raio`, `--espaco`, `--fonte`) e `MATERIAS[i].cor`. Prefixe classes
(`.planner-…`, `.fc-…`, `.est-…`). Responsivo até 360px.
Utilitárias em `base.css`: `.botao`, `.botao-primario`, `.botao-perigo`, `.cartao`, `.campo`,
`.barra-progresso > span`, `.oculto`.

## Segurança
Texto vindo do usuário ou de arquivo importado nunca vai para `innerHTML` sem escapar.
O renderizador de Markdown escapa HTML antes de aplicar a formatação e só gera links via `urlSegura`.
