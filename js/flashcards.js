/*
 * flashcards.js — Worker B. Ver CONTRATO.md.
 * Modo Flashcard, Quiz e gerenciamento de cartões, renderizados em <main id="app-flashcards">.
 * Script clássico (sem módulos). Textos do usuário sempre via textContent.
 */
(function () {
  "use strict";

  /* ================= Lógica pura (sem DOM; testável em node) ================= */

  var TOTAL_SEMANAS = 8;
  var LIMITE_HISTORICO = 50;

  function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function inteiroNaoNegativo(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? n : 0;
  }

  /*
   * Peso de sorteio: peso = max(1, 1 + erros*2 - min(acertos, erros)).
   * Cada erro soma 2; cada acerto "desconta" 1, mas só até o número de erros,
   * então um cartão nunca fica abaixo do peso de um cartão novo (1).
   */
  function peso(cartao) {
    var a = inteiroNaoNegativo(cartao.acertos);
    var e = inteiroNaoNegativo(cartao.erros);
    return Math.max(1, 1 + e * 2 - Math.min(a, e));
  }

  /* Índice sorteado com probabilidade proporcional ao peso. rng() ∈ [0, 1). */
  function indicePonderado(cartoes, rng) {
    var total = 0;
    for (var i = 0; i < cartoes.length; i++) total += peso(cartoes[i]);
    var r = rng() * total;
    for (var j = 0; j < cartoes.length; j++) {
      r -= peso(cartoes[j]);
      if (r < 0) return j;
    }
    return cartoes.length - 1;
  }

  /* Um cartão ponderado; evita repetir `excluirId` quando há alternativa. */
  function sortearPonderado(cartoes, rng, excluirId) {
    if (!cartoes.length) return null;
    var pool = cartoes;
    if (excluirId && cartoes.length > 1) {
      pool = cartoes.filter(function (c) { return c.id !== excluirId; });
    }
    return pool[indicePonderado(pool, rng)];
  }

  /* Até n cartões ponderados, sem repetição (sorteio sem reposição). */
  function amostraPonderada(cartoes, n, rng) {
    var restantes = cartoes.slice();
    var resultado = [];
    while (resultado.length < n && restantes.length) {
      resultado.push(restantes.splice(indicePonderado(restantes, rng), 1)[0]);
    }
    return resultado;
  }

  function novoCartao(base, agoraIso) {
    return {
      id: gerarId(),
      materia: base.materia,
      semana: base.semana,
      frente: base.frente,
      verso: base.verso,
      acertos: 0,
      erros: 0,
      criadoEm: agoraIso,
      ultimaRevisao: null
    };
  }

  /* Leitura tolerante: completa campos faltantes sem descartar o que existe. */
  function normalizarDados(bruto, codigoPadrao) {
    var agora = new Date().toISOString();
    var dados = {};
    if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
      Object.keys(bruto).forEach(function (k) { dados[k] = bruto[k]; });
    }
    dados.versao = dados.versao || 1;

    var ids = {};
    dados.cartoes = (Array.isArray(dados.cartoes) ? dados.cartoes : [])
      .filter(function (c) { return c && typeof c === "object"; })
      .map(function (c) {
        var semana = Math.floor(Number(c.semana));
        var id = typeof c.id === "string" && c.id && !ids[c.id] ? c.id : gerarId();
        while (ids[id]) id = gerarId();
        ids[id] = true;
        var out = {};
        Object.keys(c).forEach(function (k) { out[k] = c[k]; });
        out.id = id;
        out.materia = typeof c.materia === "string" && c.materia ? c.materia : codigoPadrao;
        out.semana = semana >= 1 && semana <= TOTAL_SEMANAS ? semana : 1;
        out.frente = typeof c.frente === "string" ? c.frente : String(c.frente == null ? "" : c.frente);
        out.verso = typeof c.verso === "string" ? c.verso : String(c.verso == null ? "" : c.verso);
        out.acertos = inteiroNaoNegativo(c.acertos);
        out.erros = inteiroNaoNegativo(c.erros);
        out.criadoEm = typeof c.criadoEm === "string" ? c.criadoEm : agora;
        out.ultimaRevisao = typeof c.ultimaRevisao === "string" ? c.ultimaRevisao : null;
        return out;
      });

    dados.historicoQuiz = (Array.isArray(dados.historicoQuiz) ? dados.historicoQuiz : [])
      .filter(function (h) {
        return h && typeof h === "object" && isFinite(Number(h.acertos)) && isFinite(Number(h.total));
      });
    return dados;
  }

  if (typeof module === "object" && module && module.exports) {
    module.exports = {
      peso: peso,
      sortearPonderado: sortearPonderado,
      amostraPonderada: amostraPonderada,
      normalizarDados: normalizarDados,
      gerarId: gerarId
    };
    return;
  }

  /* ================= Interface ================= */

  var E = window.Estudos;
  var raiz = document.getElementById("app-flashcards");
  if (!E || !raiz) return;

  var CHAVE = E.CHAVES.flashcards;
  var TAMANHOS_QUIZ = [5, 10, 20];

  var estado = {
    dados: null,
    aba: "estudar",
    filtro: { materia: "todas", semana: "todas" },
    estudo: { atualId: null, virado: false, acertos: 0, erros: 0 },
    quiz: null,
    quizTamanho: 10,
    form: null,
    mensagem: null,
    focar: null
  };

  var elConteudo, elAnuncio;

  /* ---------- Utilidades ---------- */

  function el(tag, opcoes, filhos) {
    var n = document.createElement(tag);
    var valor;
    opcoes = opcoes || {};
    Object.keys(opcoes).forEach(function (k) {
      var v = opcoes[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "classe") n.className = v;
      else if (k === "texto") n.textContent = v;
      else if (k === "valor") valor = v;
      else if (k === "estilo") Object.keys(v).forEach(function (p) { n.style.setProperty(p, v[p]); });
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    (filhos || []).forEach(function (f) {
      if (f === null || f === undefined || f === false) return;
      n.appendChild(typeof f === "string" ? document.createTextNode(f) : f);
    });
    if (valor !== undefined) n.value = valor;
    return n;
  }

  function botao(texto, classe, aoClicar, extra) {
    var op = { type: "button", classe: "botao" + (classe ? " " + classe : ""), texto: texto, onclick: aoClicar };
    if (extra) Object.keys(extra).forEach(function (k) { op[k] = extra[k]; });
    return el("button", op);
  }

  function plural(n, singular, pluralTxt) {
    return n + " " + (n === 1 ? singular : pluralTxt);
  }

  function agoraIso() { return new Date().toISOString(); }

  function formatarData(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return d.toISOString();
    }
  }

  function nomeMateria(codigo) {
    var m = E.materiaPorCodigo(codigo);
    return m ? m.codigo + " — " + m.nome : String(codigo);
  }

  function tituloSemana(numero) {
    for (var i = 0; i < E.SEMANAS.length; i++) if (E.SEMANAS[i].numero === numero) return E.SEMANAS[i].titulo;
    return "Semana " + numero;
  }

  function descreverFiltro(f) {
    var m = f.materia === "todas" ? "Todas as matérias" : f.materia;
    var s = f.semana === "todas" ? "todas as semanas" : tituloSemana(f.semana);
    return m + " · " + s;
  }

  function corMateria(codigo) {
    var m = E.materiaPorCodigo(codigo);
    return m ? m.cor : null;
  }

  function trecho(txt, max) {
    txt = String(txt).replace(/\s+/g, " ").trim();
    return txt.length > max ? txt.slice(0, max - 1) + "…" : txt;
  }

  function anunciar(texto) {
    elAnuncio.textContent = "";
    setTimeout(function () { elAnuncio.textContent = texto; }, 30);
  }

  /* ---------- Dados ---------- */

  function carregar() {
    var bruto = E.ler(CHAVE, null);
    if (bruto === null) {
      var agora = agoraIso();
      var exemplos = Array.isArray(window.FLASHCARDS_EXEMPLOS) ? window.FLASHCARDS_EXEMPLOS : [];
      estado.dados = normalizarDados({
        versao: 1,
        cartoes: exemplos.map(function (c) { return novoCartao(c, agora); }),
        historicoQuiz: []
      }, E.MATERIAS[0].codigo);
      salvar();
    } else {
      estado.dados = normalizarDados(bruto, E.MATERIAS[0].codigo);
    }
  }

  function salvar() {
    if (!E.salvar(CHAVE, estado.dados)) {
      anunciar("Não foi possível salvar os dados neste navegador.");
    }
  }

  function buscarCartao(id) {
    var cs = estado.dados.cartoes;
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i];
    return null;
  }

  function filtrar(cartoes, f) {
    return cartoes.filter(function (c) {
      return (f.materia === "todas" || c.materia === f.materia) &&
        (f.semana === "todas" || c.semana === f.semana);
    });
  }

  function cartoesFiltrados() { return filtrar(estado.dados.cartoes, estado.filtro); }

  function registrarResposta(cartao, acertou) {
    if (acertou) cartao.acertos += 1; else cartao.erros += 1;
    cartao.ultimaRevisao = agoraIso();
    salvar();
  }

  /* ---------- Render principal ---------- */

  function montarEsqueleto() {
    raiz.textContent = "";
    elAnuncio = el("div", { classe: "fc-sr", "aria-live": "polite", role: "status" });
    elConteudo = el("div", { classe: "fc-conteudo" });
    raiz.appendChild(el("div", { classe: "fc-app" }, [
      el("div", { classe: "fc-topo" }, [
        el("h1", { classe: "fc-titulo", texto: "Flashcards e Quiz" }),
        el("p", { classe: "fc-subtitulo", texto: "Revise os conteúdos com cartões. Os que você mais erra aparecem com mais frequência." })
      ]),
      elConteudo,
      elAnuncio
    ]));
  }

  function render() {
    var frag = document.createDocumentFragment();
    frag.appendChild(renderFiltros());
    frag.appendChild(renderAbas());
    var painel = el("section", { classe: "fc-painel", id: "fc-painel", "aria-label": rotuloAba(estado.aba) });
    if (estado.aba === "estudar") renderEstudar(painel);
    else if (estado.aba === "quiz") renderQuiz(painel);
    else renderGerenciar(painel);
    frag.appendChild(painel);
    elConteudo.textContent = "";
    elConteudo.appendChild(frag);

    if (estado.focar) {
      var alvo = elConteudo.querySelector(estado.focar);
      estado.focar = null;
      if (alvo) alvo.focus();
    }
  }

  function renderFiltros() {
    var selMateria = el("select", {
      classe: "campo", id: "fc-filtro-materia", valor: estado.filtro.materia,
      onchange: function (ev) { mudarFiltro("materia", ev.target.value); }
    }, [el("option", { value: "todas", texto: "Todas as matérias" })].concat(
      E.MATERIAS.map(function (m) { return el("option", { value: m.codigo, texto: m.codigo + " — " + m.nome }); })
    ));
    var selSemana = el("select", {
      classe: "campo", id: "fc-filtro-semana", valor: String(estado.filtro.semana),
      onchange: function (ev) { mudarFiltro("semana", ev.target.value === "todas" ? "todas" : Number(ev.target.value)); }
    }, [el("option", { value: "todas", texto: "Todas as semanas" })].concat(
      E.SEMANAS.map(function (s) { return el("option", { value: String(s.numero), texto: s.titulo }); })
    ));
    var qtd = cartoesFiltrados().length;
    return el("div", { classe: "cartao fc-filtros", role: "group", "aria-label": "Filtros" }, [
      el("div", { classe: "fc-filtro" }, [el("label", { "for": "fc-filtro-materia", texto: "Matéria" }), selMateria]),
      el("div", { classe: "fc-filtro" }, [el("label", { "for": "fc-filtro-semana", texto: "Semana" }), selSemana]),
      el("p", { classe: "fc-filtros-total", texto: plural(qtd, "cartão no filtro", "cartões no filtro") })
    ]);
  }

  function mudarFiltro(campo, valor) {
    estado.filtro[campo] = valor;
    estado.estudo.atualId = null;
    estado.estudo.virado = false;
    estado.mensagem = null;
    render();
  }

  function rotuloAba(aba) {
    return { estudar: "Modo Flashcard", quiz: "Quiz", gerenciar: "Gerenciar cartões" }[aba];
  }

  function renderAbas() {
    var nav = el("nav", { classe: "fc-abas", "aria-label": "Modos" });
    ["estudar", "quiz", "gerenciar"].forEach(function (aba) {
      var ativa = estado.aba === aba;
      nav.appendChild(botao(rotuloAba(aba), "fc-aba" + (ativa ? " fc-aba-ativa botao-primario" : ""), function () {
        irParaAba(aba);
      }, { "aria-pressed": ativa ? "true" : "false", "aria-controls": "fc-painel" }));
    });
    return nav;
  }

  function irParaAba(aba) {
    estado.aba = aba;
    estado.mensagem = null;
    render();
  }

  function renderVazio(painel) {
    var semNada = estado.dados.cartoes.length === 0;
    var filtrado = estado.filtro.materia !== "todas" || estado.filtro.semana !== "todas";
    painel.appendChild(el("div", { classe: "cartao fc-vazio" }, [
      el("div", { classe: "fc-vazio-icone", "aria-hidden": "true", texto: "🗂️" }),
      el("h2", { texto: semNada ? "Você ainda não tem cartões" : "Nenhum cartão neste filtro" }),
      el("p", {
        texto: semNada
          ? "Crie seu primeiro cartão com uma pergunta na frente e a resposta no verso."
          : "Não há cartões para " + descreverFiltro(estado.filtro) + ". Mude o filtro ou crie um cartão novo."
      }),
      el("div", { classe: "fc-acoes" }, [
        filtrado && !semNada ? botao("Mostrar todos os cartões", "", function () {
          estado.filtro = { materia: "todas", semana: "todas" };
          estado.estudo.atualId = null;
          render();
        }) : null,
        botao("Criar cartão", "botao-primario", function () {
          estado.form = formPadrao();
          estado.aba = "gerenciar";
          estado.focar = "#fc-form-frente";
          render();
        })
      ])
    ]));
  }

  function metaCartao(c) {
    var cor = corMateria(c.materia);
    return el("div", { classe: "fc-meta" }, [
      el("span", { classe: "fc-etiqueta", texto: c.materia, title: nomeMateria(c.materia), estilo: cor ? { "--fc-cor-materia": cor } : null }),
      el("span", { texto: tituloSemana(c.semana) }),
      el("span", { classe: "fc-placar" }, [
        el("span", { classe: "fc-placar-acerto", texto: "✔ " + c.acertos }), " ",
        el("span", { classe: "fc-placar-erro", texto: "✘ " + c.erros })
      ])
    ]);
  }

  /* ---------- Modo Flashcard ---------- */

  function cartaoAtualEstudo(deck) {
    var atual = estado.estudo.atualId ? buscarCartao(estado.estudo.atualId) : null;
    if (!atual || deck.indexOf(atual) === -1) {
      atual = sortearPonderado(deck, Math.random, null);
      estado.estudo.atualId = atual.id;
      estado.estudo.virado = false;
    }
    return atual;
  }

  function renderEstudar(painel) {
    var deck = cartoesFiltrados();
    if (!deck.length) { renderVazio(painel); return; }
    var c = cartaoAtualEstudo(deck);
    var virado = estado.estudo.virado;

    var carta = el("div", {
      classe: "fc-carta" + (virado ? " fc-virada" : ""),
      role: "button", tabindex: "0", id: "fc-carta",
      "aria-label": rotuloCarta(virado),
      onclick: virarCarta,
      onkeydown: function (ev) { if (ev.key === "Enter") { ev.preventDefault(); virarCarta(); } }
    }, [
      el("div", { classe: "fc-carta-interior" }, [
        el("div", { classe: "fc-face fc-face-frente", "aria-hidden": virado ? "true" : "false" }, [
          el("span", { classe: "fc-face-rotulo", texto: "Pergunta" }),
          el("p", { classe: "fc-face-texto", texto: c.frente })
        ]),
        el("div", { classe: "fc-face fc-face-verso", "aria-hidden": virado ? "false" : "true" }, [
          el("span", { classe: "fc-face-rotulo", texto: "Resposta" }),
          el("p", { classe: "fc-face-texto", texto: c.verso })
        ])
      ])
    ]);

    var s = estado.estudo;
    painel.appendChild(metaCartao(c));
    painel.appendChild(carta);
    painel.appendChild(el("p", { classe: "fc-dica", texto: "Clique no cartão ou pressione Espaço para virar." }));
    painel.appendChild(el("div", { classe: "fc-acoes fc-acoes-avaliar" }, [
      botao("Virar", "", virarCarta, { id: "fc-btn-virar" }),
      botao("Errei", "botao-perigo", function () { avaliarEstudo(false); }, { id: "fc-btn-errei", disabled: !virado }),
      botao("Acertei", "botao-primario", function () { avaliarEstudo(true); }, { id: "fc-btn-acertei", disabled: !virado }),
      botao("Pular", "fc-botao-discreto", pularCartao, { disabled: deck.length < 2 })
    ]));
    painel.appendChild(el("p", { classe: "fc-dica fc-atalhos" }, [
      "Atalhos: ", el("kbd", { texto: "Espaço" }), " vira · ",
      el("kbd", { texto: "→" }), " ou ", el("kbd", { texto: "1" }), " acertei · ",
      el("kbd", { texto: "←" }), " ou ", el("kbd", { texto: "2" }), " errei"
    ]));
    painel.appendChild(el("p", {
      classe: "fc-sessao",
      texto: "Nesta sessão: " + plural(s.acertos, "acerto", "acertos") + " · " + plural(s.erros, "erro", "erros")
    }));
  }

  function rotuloCarta(virado) {
    return virado ? "Cartão mostrando a resposta. Ative para ver a pergunta." : "Cartão mostrando a pergunta. Ative para ver a resposta.";
  }

  /* Vira sem re-renderizar, para a transição CSS acontecer. */
  function virarCarta() {
    var carta = elConteudo.querySelector("#fc-carta");
    if (!carta) return;
    var virado = !estado.estudo.virado;
    estado.estudo.virado = virado;
    carta.classList.toggle("fc-virada", virado);
    carta.setAttribute("aria-label", rotuloCarta(virado));
    carta.querySelector(".fc-face-frente").setAttribute("aria-hidden", virado ? "true" : "false");
    carta.querySelector(".fc-face-verso").setAttribute("aria-hidden", virado ? "false" : "true");
    elConteudo.querySelector("#fc-btn-acertei").disabled = !virado;
    elConteudo.querySelector("#fc-btn-errei").disabled = !virado;
    if (virado) anunciar("Resposta: " + buscarCartao(estado.estudo.atualId).verso);
  }

  function avaliarEstudo(acertou) {
    var c = buscarCartao(estado.estudo.atualId);
    if (!c || !estado.estudo.virado) return;
    registrarResposta(c, acertou);
    if (acertou) estado.estudo.acertos += 1; else estado.estudo.erros += 1;
    proximoCartao(c.id);
    anunciar((acertou ? "Acerto registrado." : "Erro registrado.") + " Próximo cartão.");
  }

  function pularCartao() { proximoCartao(estado.estudo.atualId); }

  function proximoCartao(idAnterior) {
    var prox = sortearPonderado(cartoesFiltrados(), Math.random, idAnterior);
    estado.estudo.atualId = prox ? prox.id : null;
    estado.estudo.virado = false;
    estado.focar = "#fc-carta";
    render();
  }

  /* ---------- Quiz ---------- */

  function iniciarQuiz() {
    var deck = cartoesFiltrados();
    if (!deck.length) return;
    var n = estado.quizTamanho === "todos" ? deck.length : Math.min(estado.quizTamanho, deck.length);
    estado.quiz = {
      filtro: { materia: estado.filtro.materia, semana: estado.filtro.semana },
      // Cópia do texto: o quiz segue mesmo se o cartão for editado/excluído no meio.
      perguntas: amostraPonderada(deck, n, Math.random).map(function (c) {
        return { id: c.id, materia: c.materia, semana: c.semana, frente: c.frente, verso: c.verso };
      }),
      indice: 0,
      acertos: 0,
      revelado: false,
      erradas: [],
      terminado: false
    };
    estado.focar = "#fc-quiz-pergunta";
    render();
  }

  function quizAtivo() { return estado.quiz && !estado.quiz.terminado; }

  function renderQuiz(painel) {
    var q = estado.quiz;
    if (q && !q.terminado) renderQuizPergunta(painel, q);
    else if (q && q.terminado) renderQuizResultado(painel, q);
    else renderQuizInicio(painel);
  }

  function renderQuizInicio(painel) {
    var deck = cartoesFiltrados();
    if (!deck.length) {
      renderVazio(painel);
    } else {
      var sel = el("select", {
        classe: "campo", id: "fc-quiz-tamanho", valor: String(estado.quizTamanho),
        onchange: function (ev) {
          estado.quizTamanho = ev.target.value === "todos" ? "todos" : Number(ev.target.value);
          render();
        }
      }, TAMANHOS_QUIZ.map(function (t) {
        return el("option", { value: String(t), texto: t + " cartões" });
      }).concat([el("option", { value: "todos", texto: "Todos" })]));
      var n = estado.quizTamanho === "todos" ? deck.length : Math.min(estado.quizTamanho, deck.length);
      painel.appendChild(el("div", { classe: "cartao fc-quiz-inicio" }, [
        el("h2", { texto: "Novo quiz" }),
        el("p", { texto: "Leia a pergunta, pense na resposta, revele e avalie-se com sinceridade. Cartões com mais erros têm mais chance de cair." }),
        el("div", { classe: "fc-filtro" }, [el("label", { "for": "fc-quiz-tamanho", texto: "Quantidade" }), sel]),
        el("p", {
          classe: "fc-dica",
          texto: "Este quiz terá " + plural(n, "pergunta", "perguntas") + " de " + descreverFiltro(estado.filtro) +
            (n < (estado.quizTamanho === "todos" ? n : estado.quizTamanho) ? " (todos os disponíveis no filtro)." : ".")
        }),
        el("div", { classe: "fc-acoes" }, [botao("Começar quiz", "botao-primario", iniciarQuiz, { id: "fc-btn-comecar" })])
      ]));
    }
    painel.appendChild(renderHistorico());
  }

  function renderQuizPergunta(painel, q) {
    var p = q.perguntas[q.indice];
    var total = q.perguntas.length;
    var pct = Math.round((q.indice / total) * 100);

    painel.appendChild(el("div", { classe: "fc-quiz-cabecalho" }, [
      el("span", { texto: "Pergunta " + (q.indice + 1) + " de " + total }),
      el("span", { classe: "fc-quiz-pontos", texto: "Pontuação: " + q.acertos + " / " + q.indice })
    ]));
    painel.appendChild(el("div", {
      classe: "barra-progresso", role: "progressbar", "aria-label": "Progresso do quiz",
      "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(q.indice)
    }, [el("span", { estilo: { width: pct + "%" } })]));
    painel.appendChild(el("p", { classe: "fc-dica", texto: "Quiz: " + descreverFiltro(q.filtro) }));

    var corpo = el("div", {
      classe: "cartao fc-quiz-pergunta" + (q.revelado ? " fc-quiz-revelado" : ""),
      id: "fc-quiz-pergunta", tabindex: "-1"
    }, [
      metaCartao(buscarCartao(p.id) || { materia: p.materia, semana: p.semana, acertos: 0, erros: 0 }),
      el("span", { classe: "fc-face-rotulo", texto: "Pergunta" }),
      el("p", { classe: "fc-face-texto", texto: p.frente })
    ]);
    if (q.revelado) {
      corpo.appendChild(el("div", { classe: "fc-quiz-resposta" }, [
        el("span", { classe: "fc-face-rotulo", texto: "Resposta" }),
        el("p", { classe: "fc-face-texto", texto: p.verso })
      ]));
    }
    painel.appendChild(corpo);

    painel.appendChild(el("div", { classe: "fc-acoes fc-acoes-avaliar" }, q.revelado ? [
      botao("Errei", "botao-perigo", function () { avaliarQuiz(false); }, { id: "fc-btn-q-errei" }),
      botao("Acertei", "botao-primario", function () { avaliarQuiz(true); }, { id: "fc-btn-q-acertei" })
    ] : [
      botao("Revelar resposta", "botao-primario", revelarQuiz, { id: "fc-btn-revelar" })
    ]));
    painel.appendChild(el("p", { classe: "fc-dica fc-atalhos" }, [
      "Atalhos: ", el("kbd", { texto: "Espaço" }), " revela · ",
      el("kbd", { texto: "→" }), "/", el("kbd", { texto: "1" }), " acertei · ",
      el("kbd", { texto: "←" }), "/", el("kbd", { texto: "2" }), " errei"
    ]));
    painel.appendChild(el("div", { classe: "fc-acoes" }, [
      botao("Encerrar quiz", "fc-botao-discreto", function () {
        if (window.confirm("Encerrar o quiz agora? O resultado desta sessão não será salvo.")) {
          estado.quiz = null;
          render();
        }
      })
    ]));
  }

  function revelarQuiz() {
    if (!quizAtivo() || estado.quiz.revelado) return;
    estado.quiz.revelado = true;
    estado.focar = "#fc-quiz-pergunta";
    render();
    anunciar("Resposta: " + estado.quiz.perguntas[estado.quiz.indice].verso);
  }

  function avaliarQuiz(acertou) {
    var q = estado.quiz;
    if (!quizAtivo() || !q.revelado) return;
    var p = q.perguntas[q.indice];
    var c = buscarCartao(p.id);
    if (c) registrarResposta(c, acertou);
    if (acertou) q.acertos += 1; else q.erradas.push(p);
    q.indice += 1;
    q.revelado = false;
    if (q.indice >= q.perguntas.length) {
      finalizarQuiz(q);
      estado.focar = "#fc-btn-novo-quiz";
      anunciar("Quiz concluído: " + q.acertos + " de " + q.perguntas.length + " acertos.");
    } else {
      estado.focar = "#fc-quiz-pergunta";
      anunciar((acertou ? "Acertou." : "Errou.") + " Pontuação " + q.acertos + " de " + q.indice + ".");
    }
    render();
  }

  function finalizarQuiz(q) {
    q.terminado = true;
    var h = estado.dados.historicoQuiz;
    h.push({
      data: agoraIso(),
      materia: q.filtro.materia,
      semana: q.filtro.semana,
      acertos: q.acertos,
      total: q.perguntas.length
    });
    if (h.length > LIMITE_HISTORICO) h.splice(0, h.length - LIMITE_HISTORICO);
    salvar();
  }

  function renderQuizResultado(painel, q) {
    var total = q.perguntas.length;
    var pct = total ? Math.round((q.acertos / total) * 100) : 0;
    var frase = pct >= 80 ? "Excelente! Você domina este conteúdo."
      : pct >= 50 ? "Bom trabalho! Continue revisando os que errou."
      : "Vale revisar esses conteúdos com calma.";
    var bloco = el("div", { classe: "cartao fc-resultado" }, [
      el("h2", { texto: "Resultado do quiz" }),
      el("p", { classe: "fc-resultado-numero" }, [
        el("strong", { texto: q.acertos + " de " + total }), " acertos (" + pct + "%)"
      ]),
      el("div", { classe: "barra-progresso", "aria-hidden": "true" }, [el("span", { estilo: { width: pct + "%" } })]),
      el("p", { texto: frase })
    ]);
    if (q.erradas.length) {
      bloco.appendChild(el("h3", { texto: "Para revisar" }));
      bloco.appendChild(el("ul", { classe: "fc-lista-revisar" }, q.erradas.map(function (p) {
        return el("li", {}, [
          el("strong", { texto: p.frente }),
          el("span", { classe: "fc-texto-suave", texto: p.verso })
        ]);
      })));
    }
    bloco.appendChild(el("div", { classe: "fc-acoes" }, [
      botao("Novo quiz", "botao-primario", function () { estado.quiz = null; render(); }, { id: "fc-btn-novo-quiz" }),
      botao("Ir para o modo Flashcard", "", function () { estado.quiz = null; irParaAba("estudar"); })
    ]));
    painel.appendChild(bloco);
    painel.appendChild(renderHistorico());
  }

  function renderHistorico() {
    var ultimos = estado.dados.historicoQuiz.slice(-5).reverse();
    var sec = el("div", { classe: "cartao fc-historico" }, [el("h3", { texto: "Últimos resultados" })]);
    if (!ultimos.length) {
      sec.appendChild(el("p", { classe: "fc-texto-suave", texto: "Nenhum quiz realizado ainda." }));
      return sec;
    }
    sec.appendChild(el("ul", { classe: "fc-historico-lista" }, ultimos.map(function (h) {
      var total = Number(h.total) || 0;
      var acertos = Number(h.acertos) || 0;
      var pct = total ? Math.round((acertos / total) * 100) : 0;
      var semana = h.semana === "todas" || h.semana == null ? "todas" : Number(h.semana);
      return el("li", {}, [
        el("span", { classe: "fc-historico-data", texto: formatarData(h.data) }),
        el("span", { classe: "fc-historico-filtro", texto: descreverFiltro({ materia: h.materia || "todas", semana: semana }) }),
        el("strong", { classe: "fc-historico-nota", texto: acertos + "/" + total + " (" + pct + "%)" })
      ]);
    })));
    return sec;
  }

  /* ---------- Gerenciar cartões ---------- */

  function formPadrao() {
    return {
      id: null,
      materia: estado.filtro.materia !== "todas" ? estado.filtro.materia : E.MATERIAS[0].codigo,
      semana: estado.filtro.semana !== "todas" ? estado.filtro.semana : 1,
      frente: "",
      verso: "",
      erros: {}
    };
  }

  function campoErro(id, msg) {
    return msg ? el("p", { classe: "fc-erro-campo", id: id + "-erro", texto: msg }) : null;
  }

  function renderGerenciar(painel) {
    if (!estado.form) estado.form = formPadrao();
    var f = estado.form;
    var editando = !!f.id;

    function atualizar(campo) {
      return function (ev) { f[campo] = campo === "semana" ? Number(ev.target.value) : ev.target.value; };
    }

    var form = el("form", {
      classe: "cartao fc-form", novalidate: true, "aria-labelledby": "fc-form-titulo",
      onsubmit: function (ev) { ev.preventDefault(); salvarForm(); }
    }, [
      el("h2", { id: "fc-form-titulo", texto: editando ? "Editar cartão" : "Novo cartão" }),
      el("div", { classe: "fc-form-linha" }, [
        el("div", { classe: "fc-filtro" }, [
          el("label", { "for": "fc-form-materia", texto: "Matéria *" }),
          el("select", {
            classe: "campo", id: "fc-form-materia", required: true, valor: f.materia, onchange: atualizar("materia"),
            "aria-invalid": f.erros.materia ? "true" : null, "aria-describedby": f.erros.materia ? "fc-form-materia-erro" : null
          }, E.MATERIAS.map(function (m) { return el("option", { value: m.codigo, texto: m.codigo + " — " + m.nome }); })),
          campoErro("fc-form-materia", f.erros.materia)
        ]),
        el("div", { classe: "fc-filtro" }, [
          el("label", { "for": "fc-form-semana", texto: "Semana *" }),
          el("select", {
            classe: "campo", id: "fc-form-semana", required: true, valor: String(f.semana), onchange: atualizar("semana"),
            "aria-invalid": f.erros.semana ? "true" : null, "aria-describedby": f.erros.semana ? "fc-form-semana-erro" : null
          }, E.SEMANAS.map(function (s) { return el("option", { value: String(s.numero), texto: s.titulo }); })),
          campoErro("fc-form-semana", f.erros.semana)
        ])
      ]),
      el("div", { classe: "fc-filtro" }, [
        el("label", { "for": "fc-form-frente", texto: "Frente (pergunta) *" }),
        el("textarea", {
          classe: "campo", id: "fc-form-frente", rows: "3", maxlength: "500", required: true, valor: f.frente,
          oninput: atualizar("frente"),
          "aria-invalid": f.erros.frente ? "true" : null, "aria-describedby": f.erros.frente ? "fc-form-frente-erro" : null
        }),
        campoErro("fc-form-frente", f.erros.frente)
      ]),
      el("div", { classe: "fc-filtro" }, [
        el("label", { "for": "fc-form-verso", texto: "Verso (resposta) *" }),
        el("textarea", {
          classe: "campo", id: "fc-form-verso", rows: "4", maxlength: "2000", required: true, valor: f.verso,
          oninput: atualizar("verso"),
          "aria-invalid": f.erros.verso ? "true" : null, "aria-describedby": f.erros.verso ? "fc-form-verso-erro" : null
        }),
        campoErro("fc-form-verso", f.erros.verso)
      ]),
      el("div", { classe: "fc-acoes" }, [
        el("button", { type: "submit", classe: "botao botao-primario", texto: editando ? "Salvar alterações" : "Criar cartão" }),
        editando || f.frente || f.verso ? botao(editando ? "Cancelar edição" : "Limpar", "", function () {
          estado.form = formPadrao();
          estado.mensagem = null;
          render();
        }) : null
      ])
    ]);
    painel.appendChild(form);

    if (estado.mensagem) {
      painel.appendChild(el("p", { classe: "fc-mensagem", texto: estado.mensagem }));
    }

    var lista = cartoesFiltrados().slice().sort(compararCartoes);
    painel.appendChild(el("h2", { classe: "fc-lista-titulo", texto: "Cartões (" + lista.length + ")" }));
    if (!lista.length) {
      painel.appendChild(el("div", { classe: "cartao fc-vazio fc-vazio-compacto" }, [
        el("p", {
          texto: estado.dados.cartoes.length
            ? "Nenhum cartão para " + descreverFiltro(estado.filtro) + "."
            : "Nenhum cartão cadastrado. Use o formulário acima para criar o primeiro."
        })
      ]));
      return;
    }
    painel.appendChild(el("ul", { classe: "fc-lista" }, lista.map(renderItem)));
  }

  function compararCartoes(a, b) {
    var ordem = function (cod) {
      for (var i = 0; i < E.MATERIAS.length; i++) if (E.MATERIAS[i].codigo === cod) return i;
      return E.MATERIAS.length;
    };
    return ordem(a.materia) - ordem(b.materia) || a.semana - b.semana ||
      String(a.criadoEm).localeCompare(String(b.criadoEm));
  }

  function renderItem(c) {
    var cor = corMateria(c.materia);
    var curto = trecho(c.frente, 40);
    return el("li", {
      classe: "cartao fc-item" + (estado.form && estado.form.id === c.id ? " fc-item-editando" : ""),
      estilo: cor ? { "--fc-cor-materia": cor } : null
    }, [
      metaCartao(c),
      el("p", { classe: "fc-item-frente", texto: c.frente }),
      el("p", { classe: "fc-item-verso", texto: c.verso }),
      el("div", { classe: "fc-acoes" }, [
        botao("Editar", "", function () { editarCartao(c.id); }, { "aria-label": "Editar cartão: " + curto }),
        botao("Excluir", "botao-perigo", function () { excluirCartao(c.id); }, { "aria-label": "Excluir cartão: " + curto })
      ])
    ]);
  }

  function editarCartao(id) {
    var c = buscarCartao(id);
    if (!c) return;
    estado.form = { id: c.id, materia: c.materia, semana: c.semana, frente: c.frente, verso: c.verso, erros: {} };
    estado.mensagem = null;
    estado.focar = "#fc-form-frente";
    render();
    var form = elConteudo.querySelector(".fc-form");
    if (form && form.scrollIntoView) form.scrollIntoView({ block: "start" });
  }

  function excluirCartao(id) {
    var c = buscarCartao(id);
    if (!c) return;
    if (!window.confirm("Excluir o cartão \"" + trecho(c.frente, 80) + "\"?\nEsta ação não pode ser desfeita.")) return;
    estado.dados.cartoes = estado.dados.cartoes.filter(function (x) { return x.id !== id; });
    salvar();
    if (estado.form && estado.form.id === id) estado.form = formPadrao();
    if (estado.estudo.atualId === id) estado.estudo.atualId = null;
    estado.mensagem = "Cartão excluído.";
    anunciar(estado.mensagem);
    render();
  }

  function validar(f) {
    var erros = {};
    if (!E.materiaPorCodigo(f.materia)) erros.materia = "Escolha uma matéria.";
    if (!(f.semana >= 1 && f.semana <= TOTAL_SEMANAS)) erros.semana = "Escolha uma semana de 1 a 8.";
    if (!String(f.frente).trim()) erros.frente = "Escreva a pergunta da frente do cartão.";
    if (!String(f.verso).trim()) erros.verso = "Escreva a resposta do verso do cartão.";
    return erros;
  }

  function salvarForm() {
    var f = estado.form;
    f.erros = validar(f);
    var campos = ["materia", "semana", "frente", "verso"].filter(function (k) { return f.erros[k]; });
    if (campos.length) {
      estado.mensagem = null;
      estado.focar = "#fc-form-" + campos[0];
      render();
      anunciar("Corrija os campos destacados: " + campos.map(function (k) { return f.erros[k]; }).join(" "));
      return;
    }
    var dadosCartao = { materia: f.materia, semana: f.semana, frente: f.frente.trim(), verso: f.verso.trim() };
    var cartao;
    if (f.id && (cartao = buscarCartao(f.id))) {
      Object.keys(dadosCartao).forEach(function (k) { cartao[k] = dadosCartao[k]; });
      estado.mensagem = "Cartão atualizado.";
    } else {
      cartao = novoCartao(dadosCartao, agoraIso());
      while (buscarCartao(cartao.id)) cartao.id = gerarId();
      estado.dados.cartoes.push(cartao);
      estado.mensagem = "Cartão criado.";
    }
    salvar();
    if (filtrar([cartao], estado.filtro).length === 0) {
      estado.mensagem += " Ele não aparece na lista porque está fora do filtro atual.";
    }
    // Mantém matéria/semana para facilitar criar vários cartões seguidos.
    estado.form = { id: null, materia: f.materia, semana: f.semana, frente: "", verso: "", erros: {} };
    estado.focar = "#fc-form-frente";
    render();
    anunciar(estado.mensagem);
  }

  /* ---------- Teclado ---------- */

  function aoTeclar(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
    var t = ev.target;
    var tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    // Espaço num botão comum deve acionar o próprio botão.
    var emBotao = tag === "BUTTON" || tag === "A";
    var k = ev.key;
    var sim = k === "ArrowRight" || k === "1";
    var nao = k === "ArrowLeft" || k === "2";
    var espaco = k === " " || k === "Spacebar";

    if (estado.aba === "estudar" && elConteudo.querySelector("#fc-carta")) {
      if (espaco && !emBotao) { ev.preventDefault(); virarCarta(); }
      else if ((sim || nao) && estado.estudo.virado) { ev.preventDefault(); avaliarEstudo(sim); }
    } else if (estado.aba === "quiz" && quizAtivo()) {
      if (espaco && !emBotao && !estado.quiz.revelado) { ev.preventDefault(); revelarQuiz(); }
      else if ((sim || nao) && estado.quiz.revelado) { ev.preventDefault(); avaliarQuiz(sim); }
    }
  }

  /* ---------- Início ---------- */

  function iniciar() {
    carregar();
    montarEsqueleto();
    render();
    document.addEventListener("keydown", aoTeclar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
