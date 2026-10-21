# Contrato do App de Estudos (BTI Univesp)

HTML, CSS e JavaScript puro. Sem frameworks, sem build, sem ES modules (scripts clássicos,
o app deve abrir com duplo clique no `index.html` via file://). Toda a interface em português.

## Donos dos arquivos

| Arquivo | Dono |
|---|---|
| `js/comum.js`, `CONTRATO.md` | Coordenador — **ninguém edita** |
| `index.html`, `flashcards.html` | Worker C só pode editar entre os comentários CABEÇALHO/RODAPÉ e o `<head>` (meta/favicon). Workers A e B **não editam** HTML. |
| `css/base.css`, `js/app.js` | Worker C |
| `css/planner.css`, `js/planner.js` | Worker A |
| `css/flashcards.css`, `js/flashcards.js`, `js/flashcards-exemplos.js` | Worker B |

Ordem de carregamento: `comum.js` → `app.js` → (`flashcards-exemplos.js`) → `planner.js` | `flashcards.js`.
Os módulos A e B renderizam tudo via JS dentro de `<main id="app-planner">` / `<main id="app-flashcards">`.
Envolva cada arquivo JS numa IIFE; só exponha globais quando listado aqui.

## API compartilhada (`window.Estudos`, em `js/comum.js`)

- `MATERIAS`: `[{ codigo: "PES300"|"ADM200"|"COM230", nome, cor }]`
- `SEMANAS`: `[{ numero: 1..8, titulo }]` — semana 8 = "Revisão final"
- `CHAVES`: `{ planner, flashcards, preferencias }`
- `ler(chave, padrao)`, `salvar(chave, valor)`
- `exportarTudo()` → `{ app: "estudos-univesp", versao: 1, exportadoEm, dados: { <chave>: valor } }`
- `importarTudo(backup)` — lança `Error` se inválido. Após importar, `app.js` recarrega a página.
- `materiaPorCodigo(codigo)`

## Formatos no localStorage

```js
// Estudos.CHAVES.planner = "estudos.planner.v1"
{ versao: 1, semanas: {
    "1": { "PES300": { atividade: false, conteudo: false, anotacoes: "" }, "ADM200": {...}, "COM230": {...} },
    ... até "8"
} }
// Estudos.CHAVES.flashcards = "estudos.flashcards.v1"
{ versao: 1,
  cartoes: [{ id: "string única", materia: "PES300", semana: 1, frente: "", verso: "",
              acertos: 0, erros: 0, criadoEm: "ISO", ultimaRevisao: "ISO"|null }],
  historicoQuiz: [{ data: "ISO", materia: "PES300"|"todas", semana: 1|"todas", acertos: 3, total: 5 }] }
// Estudos.CHAVES.preferencias = "estudos.preferencias.v1"
{ tema: "escuro" | "claro" }
```

Leitura tolerante: se a chave não existir ou estiver incompleta, cada módulo preenche os padrões
(ex.: semanas/matérias faltantes) sem apagar o que existe.

## Visual

Use só as variáveis CSS de `css/base.css` (`--cor-fundo`, `--cor-superficie`, `--cor-superficie-2`,
`--cor-borda`, `--cor-texto`, `--cor-texto-suave`, `--cor-destaque`, `--cor-sucesso`, `--cor-erro`,
`--cor-aviso`, `--raio`, `--espaco`, `--fonte`). Nada de cores fixas fora delas (exceto `MATERIAS[i].cor`).
O tema é controlado por `data-tema` no `<html>` (Worker C). Prefixe classes do seu módulo
(`.planner-…`, `.fc-…`) para evitar colisão. Responsivo até 360px de largura.

Classes utilitárias que o Worker C fornece em `base.css` (podem ser usadas por A e B):
`.botao`, `.botao-primario`, `.botao-perigo`, `.cartao` (painel/superfície), `.campo` (input/textarea/select),
`.barra-progresso` + `.barra-progresso > span` (largura = %), `.oculto`.
