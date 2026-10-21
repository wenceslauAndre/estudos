# Formato de importação de conteúdo

Este documento descreve o arquivo JSON que o botão **Importar conteúdo** (no cabeçalho do app) aceita.
Ele serve para você e também para uma IA (ChatGPT, Claude etc.) que vá gerar o arquivo a partir de aulas, slides ou transcrições.
No fim há um **[prompt pronto](#prompt-pronto)** para colar na IA.

## Para que serve (e a diferença para o backup)

| | **Importar conteúdo** | **Importar backup** |
|---|---|---|
| O que faz | **Adiciona** planos de estudo e flashcards | **Substitui** todos os dados do navegador |
| Apaga algo? | Nunca | Sim, tudo o que existe hoje |
| Arquivo | `{"formato": "estudos-univesp-conteudo", …}` | `{"app": "estudos-univesp", …}` (gerado por *Exportar backup*) |
| Uso típico | Trazer o conteúdo de uma aula já organizado | Mudar de navegador/computador ou restaurar cópia |

Se você escolher um arquivo de backup em "Importar conteúdo", o app avisa e orienta a usar "Importar backup".

## Estrutura

```json
{
  "formato": "estudos-univesp-conteudo",
  "versao": 1,
  "planos": [ … ],
  "flashcards": [ … ]
}
```

### Raiz

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `formato` | texto | sim | Exatamente `"estudos-univesp-conteudo"`. |
| `versao` | número | recomendado | `1`. Outra versão é rejeitada. |
| `planos` | lista | não* | Lista de planos de estudo. |
| `flashcards` | lista | não* | Lista de flashcards. |

\* Pelo menos um dos dois precisa ter itens; um arquivo sem planos e sem flashcards é rejeitado.

### Item de `planos` (um por semana × matéria)

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `semana` | número | sim | Inteiro de **1 a 8**. A semana **8** é a **Revisão final**. |
| `materia` | texto | sim | Código da matéria: `PES300` (Estatística e Probabilidade), `ADM200` (Gestão da Inovação e Desenvolvimento de Produtos) ou `COM230` (Programação Orientada a Objetos). |
| `titulo` | texto | não | Título curto do tema da semana. |
| `resumo` | texto | não | Resumo em **Markdown** (veja abaixo). Quebras de linha como `\n`. |
| `topicos` | lista de textos | não | Tópicos objetivos para o usuário marcar como estudados. Ex.: `"Calcular média e mediana"`. |
| `links` | lista de objetos | não | Cada um com `titulo` (texto) e `url` (texto). **Só `http://` ou `https://`**; outros links são descartados. |

O plano precisa ter pelo menos um de: `titulo`, `resumo`, `topicos` ou `links`; senão é ignorado.

### Item de `flashcards`

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `semana` | número | sim | Inteiro de 1 a 8 (8 = Revisão final). |
| `materia` | texto | sim | `PES300`, `ADM200` ou `COM230`. |
| `frente` | texto | sim | A pergunta. Não pode ser vazia. |
| `verso` | texto | sim | A resposta. Não pode ser vazia. |
| `explicacao` | texto | não | Explicação curta mostrada depois de responder. |
| `alternativas` | lista | não | Para múltipla escolha. **2 a 5** itens `{"texto": "…", "correta": true/false}`, textos **diferentes** entre si e **exatamente uma** com `"correta": true`. Se estiver inválida, o cartão entra **sem** alternativas (e o app gera as alternativas sozinho) e você recebe um aviso. |

Dica: a alternativa correta deve ter o mesmo sentido do `verso`.

### Markdown aceito no `resumo`

| Recurso | Como escrever |
|---|---|
| Títulos | `# Título`, `## Subtítulo`, `### Subsubtítulo` |
| Lista com marcadores | linhas começando com `- ` |
| Lista numerada | linhas começando com `1. `, `2. ` … |
| Negrito | `**texto**` |
| Itálico | `*texto*` |
| Código em linha | `` `código` `` |
| Bloco de código | linha com três crases, o código, e outra linha com três crases (pode indicar a linguagem, ex.: ` ```java `) |
| Link | `[texto](https://…)` (só http/https) |

HTML não é interpretado (aparece como texto). Tabelas, imagens e listas aninhadas não são suportadas.
No JSON, o resumo é **uma única string**: quebras de linha viram `\n` e aspas viram `\"`.

## Como a mesclagem funciona

A importação **só adiciona**. Nada do que você já tem é apagado ou sobrescrito: tópicos já marcados como feitos, cartões com acertos/erros, histórico de quiz, anotações e planos continuam como estão.

**Planos** (para a mesma semana × matéria):

- `titulo`: só é preenchido se o plano ainda não tiver título.
- `resumo`: se o plano não tem resumo, usa o importado; se já tem, o importado é **anexado depois de uma linha em branco** (a menos que o texto já esteja contido nele).
- `topicos`: entram os que ainda não existem (comparação sem diferenciar maiúsculas/minúsculas nem espaços extras), todos como "não feitos".
- `links`: entram os de URL ainda não cadastrada.
- Um plano que estava totalmente vazio conta como **criado**; um plano que já tinha conteúdo e recebeu algo novo conta como **atualizado**.

**Flashcards**:

- Entram como cartões novos (`acertos` e `erros` zerados).
- É **duplicado** (e ignorado) o cartão com a mesma matéria + semana + `frente` de um já existente ou de outro do mesmo arquivo (sem diferenciar maiúsculas/minúsculas nem espaços extras).

Por isso é seguro importar o mesmo arquivo duas vezes: na segunda vez nada é adicionado.

Ao terminar, o app mostra um resumo, por exemplo: *"Importado: 3 planos novos, 2 atualizados, 12 flashcards (1 duplicado ignorado)"*, e lista os avisos (itens ignorados ou corrigidos, cada um com a posição, como `flashcards[3]: matéria "MAT101" desconhecida — ignorado`; a contagem começa em 0). Depois a página é recarregada.

## Exemplo completo

Um exemplo maior, com as três matérias, está em [`exemplos/importacao-exemplo.json`](exemplos/importacao-exemplo.json). Um trecho válido:

```json
{
  "formato": "estudos-univesp-conteudo",
  "versao": 1,
  "planos": [
    {
      "semana": 1,
      "materia": "COM230",
      "titulo": "Classes, objetos e encapsulamento",
      "resumo": "## Conceitos básicos\nNa **POO**, o programa é feito de objetos com *atributos* e *métodos*.\n\n- **Classe**: molde do objeto.\n- **Objeto**: instância criada com `new`.\n\n### Exemplo em Java\n```java\npublic class Pessoa {\n    private String nome;\n\n    public Pessoa(String nome) {\n        this.nome = nome;\n    }\n}\n```",
      "topicos": [
        "Diferenciar classe de objeto",
        "Escrever uma classe com atributos privados e construtor"
      ],
      "links": [
        { "titulo": "Java Tutorials: o que é uma classe?", "url": "https://docs.oracle.com/javase/tutorial/java/concepts/class.html" }
      ]
    },
    {
      "semana": 2,
      "materia": "PES300",
      "titulo": "Medidas de dispersão",
      "resumo": "## Variância e desvio padrão\n1. **Variância**: média dos quadrados dos desvios.\n2. **Desvio padrão**: raiz quadrada da variância.",
      "topicos": ["Calcular variância e desvio padrão"],
      "links": []
    }
  ],
  "flashcards": [
    {
      "semana": 1,
      "materia": "COM230",
      "frente": "Qual é a diferença entre classe e objeto?",
      "verso": "Classe é o molde; objeto é uma instância concreta criada a partir dele."
    },
    {
      "semana": 1,
      "materia": "COM230",
      "frente": "Em Java, qual é a função de um construtor?",
      "verso": "Inicializar o objeto no momento em que ele é criado com new.",
      "alternativas": [
        { "texto": "Inicializar o objeto no momento em que ele é criado com new", "correta": true },
        { "texto": "Destruir o objeto e liberar a memória", "correta": false },
        { "texto": "Herdar métodos de outra classe", "correta": false },
        { "texto": "Declarar uma constante da classe", "correta": false }
      ],
      "explicacao": "O construtor tem o mesmo nome da classe e não declara tipo de retorno."
    }
  ]
}
```

## Erros comuns

| Problema | Como resolver |
|---|---|
| "Arquivo inválido: não é um JSON válido" | A IA incluiu texto antes/depois do JSON, comentários (`//`), vírgula sobrando no fim de uma lista ou aspas simples. Peça "somente JSON válido" ou valide em um validador de JSON. |
| Aspas ou quebras de linha dentro de textos | Dentro de um texto JSON use `\"` para aspas e `\n` para quebra de linha; uma quebra de linha "de verdade" dentro de uma string quebra o JSON. |
| "Este arquivo é um backup" | Você escolheu um arquivo do *Exportar backup*. Use **Importar backup** (que substitui os dados). |
| "Formato não reconhecido" | Falta `"formato": "estudos-univesp-conteudo"` ou está escrito diferente. |
| `matéria "…" desconhecida` | Use só `PES300`, `ADM200` ou `COM230` (maiúsculas). |
| Semana fora do intervalo | Use inteiros de 1 a 8; para a revisão final use `8`. |
| "alternativas inválidas" | Precisa de 2 a 5 alternativas, sem textos repetidos e exatamente uma `"correta": true`. |
| Link ignorado | A URL precisa começar com `http://` ou `https://`. |
| Cartão aparece como duplicado | Já existe cartão com a mesma matéria, semana e frente. Mude a frente se for realmente outra pergunta. |
| `"semana": "1"` ou `"semana": 1.5` | Use número inteiro simples: `1`. |

## Como importar no app

1. Salve o JSON em um arquivo com extensão `.json` (por exemplo `aula-semana-1.json`), em UTF-8.
2. Em qualquer página do app (Planner, Estudar ou Flashcards), clique em **Importar conteúdo** no cabeçalho.
3. Escolha o arquivo. O app mostra o resumo da importação (e os avisos, se houver) e recarrega a página.
4. Veja os planos na página **Estudar** e os cartões em **Flashcards**.

Faça um **Exportar backup** antes de importar muito conteúdo: é opcional, pois a importação não apaga nada, mas é uma boa prática.

## Prompt pronto

Copie o bloco abaixo, substitua os trechos entre colchetes `[...]` e cole na IA. Salve a resposta (somente o JSON) como arquivo `.json`.

````text
Você é um assistente que transforma material de aula em um arquivo JSON para importar em um app de estudos. Responda SOMENTE com JSON válido: sem comentários, sem texto antes ou depois, sem envolver a resposta em bloco de código (nada de crases em volta do JSON), sem vírgulas sobrando e sem aspas simples.

CONTEXTO
- Matéria: [MATÉRIA: PES300 | ADM200 | COM230]  (PES300 = Estatística e Probabilidade; ADM200 = Gestão da Inovação e Desenvolvimento de Produtos; COM230 = Programação Orientada a Objetos)
- Semana: [SEMANA: 1–8]  (de 1 a 7 são as semanas de aula; 8 = Revisão final)
- Quantidade de flashcards: [QUANTIDADE DE FLASHCARDS]
- Idioma: português do Brasil.

CONTEÚDO DE ORIGEM
[COLE AQUI O CONTEÚDO DA AULA/SLIDES/TRANSCRIÇÃO]

ESQUEMA (use exatamente estes nomes de campos)
{
  "formato": "estudos-univesp-conteudo",
  "versao": 1,
  "planos": [
    {
      "semana": <inteiro 1 a 8>,
      "materia": "<PES300 | ADM200 | COM230>",
      "titulo": "<título curto do tema da semana>",
      "resumo": "<resumo em Markdown, em uma única string>",
      "topicos": ["<tópico objetivo 1>", "<tópico objetivo 2>"],
      "links": [ { "titulo": "<nome do link>", "url": "https://..." } ]
    }
  ],
  "flashcards": [
    {
      "semana": <inteiro 1 a 8>,
      "materia": "<PES300 | ADM200 | COM230>",
      "frente": "<pergunta>",
      "verso": "<resposta correta, curta e direta>",
      "explicacao": "<explicação curta, opcional>",
      "alternativas": [
        { "texto": "<alternativa correta>", "correta": true },
        { "texto": "<alternativa errada plausível>", "correta": false }
      ]
    }
  ]
}

REGRAS
1. Gere um único plano para a matéria e a semana informadas (no array "planos") e a quantidade pedida de flashcards (no array "flashcards"). "semana" é número inteiro (sem aspas); "materia" é exatamente um dos três códigos, em maiúsculas.
2. "resumo": Markdown em uma única string. Pode usar títulos (#, ##, ###), listas com "- " e numeradas com "1. ", **negrito**, *itálico*, `código`, blocos de código delimitados por três crases (pode indicar a linguagem, como java) e links [texto](https://...). Não use HTML, tabelas, imagens nem listas aninhadas. Seja organizado e fiel ao conteúdo de origem; não invente fatos.
3. "topicos": de 3 a 6 itens objetivos, começando com verbo de ação (por exemplo, "Calcular a média e a mediana"). Cada tópico é um texto simples.
4. "links": apenas links reais e estáveis que você tenha certeza que existem, começando com http:// ou https:// (documentação oficial, Wikipédia, Univesp). Se não tiver certeza, use "links": [].
5. Flashcards: perguntas claras e autocontidas; "verso" correto, curto e direto; "explicacao" de uma ou duas frases (pode omitir o campo). Varie os tipos de pergunta (definição, aplicação, cálculo, comparação).
6. "alternativas" (múltipla escolha): inclua em cerca de metade dos flashcards. Cada lista tem de 2 a 5 itens, com textos diferentes entre si, plausíveis e de tamanho parecido, e EXATAMENTE UMA com "correta": true, com o mesmo sentido do "verso". Nos demais flashcards, omita o campo "alternativas".
7. Escape corretamente o JSON: aspas duplas dentro de textos viram \", barras invertidas viram \\, e quebras de linha dentro de strings viram \n (nunca quebre uma linha de verdade no meio de uma string). Nada de comentários nem vírgula após o último item.
8. Não inclua campos que não estão no esquema.

MINI-EXEMPLO (apenas para mostrar o formato; o seu conteúdo deve vir do material de origem)
{"formato":"estudos-univesp-conteudo","versao":1,"planos":[{"semana":1,"materia":"PES300","titulo":"Medidas de posição","resumo":"## Média e mediana\n- **Média**: soma dos valores dividida por n.\n- **Mediana**: valor central dos dados ordenados.","topicos":["Calcular média e mediana"],"links":[{"titulo":"Estatística descritiva (Wikipédia)","url":"https://pt.wikipedia.org/wiki/Estat%C3%ADstica_descritiva"}]}],"flashcards":[{"semana":1,"materia":"PES300","frente":"Qual medida de posição é menos sensível a valores extremos?","verso":"A mediana.","explicacao":"Ela depende só da posição central dos dados ordenados.","alternativas":[{"texto":"A mediana","correta":true},{"texto":"A média aritmética","correta":false},{"texto":"A amplitude total","correta":false}]},{"semana":1,"materia":"PES300","frente":"Como se calcula a média aritmética?","verso":"Soma de todos os valores dividida pela quantidade de valores."}]}

Agora gere o JSON completo e responda somente com ele.
````
