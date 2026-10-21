/* planner.js — planner de 7 semanas + revisão final (ver CONTRATO.md) */
(function () {
  "use strict";

  var raiz = document.getElementById("app-planner");
  if (!raiz || !window.Estudos) return;

  var E = window.Estudos;
  var MATERIAS = E.MATERIAS;
  var SEMANAS = E.SEMANAS;
  var CHAVE = E.CHAVES.planner;
  var ATRASO_SALVAR = 400;

  /* ---------- dados ---------- */

  function ehObjeto(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  /* Preenche o que falta sem apagar o que já existe (inclusive campos extras). */
  function normalizar(bruto) {
    var dados = ehObjeto(bruto) ? bruto : {};
    dados.versao = 1;
    if (!ehObjeto(dados.semanas)) dados.semanas = {};
    SEMANAS.forEach(function (s) {
      var chave = String(s.numero);
      if (!ehObjeto(dados.semanas[chave])) dados.semanas[chave] = {};
      MATERIAS.forEach(function (m) {
        var reg = dados.semanas[chave][m.codigo];
        if (!ehObjeto(reg)) reg = dados.semanas[chave][m.codigo] = {};
        reg.atividade = reg.atividade === true;
        reg.conteudo = reg.conteudo === true;
        if (typeof reg.anotacoes !== "string") reg.anotacoes = "";
      });
    });
    return dados;
  }

  var dados = normalizar(E.ler(CHAVE, null));
  var semanaAberta = Number(dados.semanaAberta);
  if (!SEMANAS.some(function (s) { return s.numero === semanaAberta; })) semanaAberta = 1;

  function salvar() {
    dados.semanaAberta = semanaAberta;
    E.salvar(CHAVE, dados);
  }

  function registro(semana, codigo) {
    return dados.semanas[String(semana)][codigo];
  }

  function contar(semanas, materias) {
    var feitos = 0, total = 0;
    semanas.forEach(function (s) {
      materias.forEach(function (m) {
        var r = registro(s.numero, m.codigo);
        total += 2;
        if (r.atividade) feitos++;
        if (r.conteudo) feitos++;
      });
    });
    return total ? Math.round((feitos / total) * 100) : 0;
  }

  var pctGeral = function () { return contar(SEMANAS, MATERIAS); };
  var pctMateria = function (m) { return contar(SEMANAS, [m]); };
  var pctSemana = function (s) { return contar([s], MATERIAS); };

  /* ---------- DOM ---------- */

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function barra(pct, cor) {
    var b = el("div", "barra-progresso planner-barra");
    b.setAttribute("role", "progressbar");
    b.setAttribute("aria-valuemin", "0");
    b.setAttribute("aria-valuemax", "100");
    var s = el("span");
    if (cor) s.style.background = cor;
    b.appendChild(s);
    atualizarBarra(b, pct);
    return b;
  }

  function atualizarBarra(b, pct) {
    b.setAttribute("aria-valuenow", String(pct));
    b.firstChild.style.width = pct + "%";
  }

  /* Registros de elementos que mudam com os dados: { barra, texto, calc }. */
  var vivos = [];

  function indicador(rotulo, calc, cor, classe) {
    var caixa = el("div", "planner-indicador" + (classe ? " " + classe : ""));
    var topo = el("div", "planner-indicador-topo");
    var nome = el("span", "planner-indicador-nome", rotulo);
    if (cor) nome.style.setProperty("--acento", cor);
    var texto = el("span", "planner-indicador-pct");
    topo.appendChild(nome);
    topo.appendChild(texto);
    var b = barra(0, cor);
    b.setAttribute("aria-label", rotulo);
    caixa.appendChild(topo);
    caixa.appendChild(b);
    var v = { barra: b, texto: texto, calc: calc };
    vivos.push(v);
    atualizarVivo(v);
    return caixa;
  }

  function atualizarVivo(v) {
    var pct = v.calc();
    v.texto.textContent = pct + "%";
    atualizarBarra(v.barra, pct);
  }

  function atualizarTudo() {
    vivos.forEach(atualizarVivo);
    atualizarAbas();
  }

  var abas = [];

  function atualizarAbas() {
    abas.forEach(function (a) {
      var sel = a.semana.numero === semanaAberta;
      a.botao.setAttribute("aria-selected", sel ? "true" : "false");
      a.botao.setAttribute("tabindex", sel ? "0" : "-1");
      a.botao.classList.toggle("planner-aba-ativa", sel);
      a.pct.textContent = pctSemana(a.semana) + "%";
    });
  }

  function rotuloSemana(s) {
    return s.numero === 8 ? s.titulo : "Semana " + s.numero;
  }

  /* ---------- construção ---------- */

  var painelSemana;

  function montar() {
    raiz.textContent = "";
    vivos = [];
    abas = [];

    raiz.appendChild(el("h1", "planner-titulo", "Planner de estudos"));

    /* Progresso geral e por matéria */
    var progresso = el("section", "cartao planner-progresso");
    progresso.setAttribute("aria-labelledby", "planner-h-progresso");
    var h = el("h2", "planner-subtitulo", "Progresso");
    h.id = "planner-h-progresso";
    progresso.appendChild(h);
    progresso.appendChild(indicador("Geral", pctGeral, null, "planner-indicador-geral"));
    var grade = el("div", "planner-materias-progresso");
    MATERIAS.forEach(function (m) {
      grade.appendChild(indicador(m.codigo + " · " + m.nome, function () { return pctMateria(m); }, m.cor));
    });
    progresso.appendChild(grade);
    raiz.appendChild(progresso);

    /* Resumo das 8 semanas */
    var resumo = el("section", "cartao planner-resumo");
    resumo.setAttribute("aria-labelledby", "planner-h-resumo");
    var h2 = el("h2", "planner-subtitulo", "Resumo das semanas");
    h2.id = "planner-h-resumo";
    resumo.appendChild(h2);
    var lista = el("div", "planner-resumo-grade");
    SEMANAS.forEach(function (s) {
      var b = el("button", "planner-resumo-item");
      b.type = "button";
      b.setAttribute("aria-label", "Abrir " + rotuloSemana(s));
      b.appendChild(indicador(rotuloSemana(s), function () { return pctSemana(s); }));
      b.addEventListener("click", function () {
        abrirSemana(s.numero, true);
        painelSemana.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      lista.appendChild(b);
    });
    resumo.appendChild(lista);
    raiz.appendChild(resumo);

    /* Abas de semana */
    var nav = el("div", "planner-abas");
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Semanas");
    SEMANAS.forEach(function (s, i) {
      var b = el("button", "planner-aba");
      b.type = "button";
      b.id = "planner-aba-" + s.numero;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "planner-painel");
      b.appendChild(el("span", "planner-aba-nome", s.numero === 8 ? "Revisão final" : "Sem. " + s.numero));
      var pct = el("span", "planner-aba-pct");
      b.appendChild(pct);
      b.addEventListener("click", function () { abrirSemana(s.numero, false); });
      b.addEventListener("keydown", function (ev) {
        var alvo = null;
        if (ev.key === "ArrowRight") alvo = (i + 1) % SEMANAS.length;
        else if (ev.key === "ArrowLeft") alvo = (i + SEMANAS.length - 1) % SEMANAS.length;
        else if (ev.key === "Home") alvo = 0;
        else if (ev.key === "End") alvo = SEMANAS.length - 1;
        if (alvo === null) return;
        ev.preventDefault();
        abrirSemana(SEMANAS[alvo].numero, false);
        abas[alvo].botao.focus();
      });
      nav.appendChild(b);
      abas.push({ semana: s, botao: b, pct: pct });
    });
    raiz.appendChild(nav);

    painelSemana = el("section", "planner-painel");
    painelSemana.id = "planner-painel";
    painelSemana.setAttribute("role", "tabpanel");
    raiz.appendChild(painelSemana);

    renderSemana();
    atualizarAbas();
  }

  /* Cada semana × matéria: checkboxes e anotações. */

  function renderSemana() {
    /* descarta indicadores do painel anterior (os do painel são só os de dentro dele) */
    vivos = vivos.filter(function (v) { return !painelSemana.contains(v.barra); });
    painelSemana.textContent = "";

    var s = SEMANAS.filter(function (x) { return x.numero === semanaAberta; })[0];
    painelSemana.setAttribute("aria-labelledby", "planner-aba-" + s.numero);

    var cab = el("div", "planner-painel-cab");
    cab.appendChild(el("h2", "planner-subtitulo", s.numero === 8 ? s.titulo : s.titulo));
    cab.appendChild(indicador("Progresso da semana", function () { return pctSemana(s); }, null, "planner-indicador-semana"));
    painelSemana.appendChild(cab);

    var grade = el("div", "planner-cartoes");
    MATERIAS.forEach(function (m) {
      var reg = registro(s.numero, m.codigo);
      var base = "planner-" + s.numero + "-" + m.codigo;

      var cartao = el("article", "cartao planner-cartao");
      cartao.style.setProperty("--acento", m.cor);
      cartao.setAttribute("aria-labelledby", base + "-t");

      var t = el("h3", "planner-cartao-titulo");
      t.id = base + "-t";
      t.appendChild(el("span", "planner-codigo", m.codigo));
      t.appendChild(document.createTextNode(" " + m.nome));
      cartao.appendChild(t);

      [["atividade", "Atividade feita"], ["conteudo", "Conteúdo estudado"]].forEach(function (par) {
        var rot = el("label", "planner-check");
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = reg[par[0]];
        cb.addEventListener("change", function () {
          reg[par[0]] = cb.checked;
          salvar();
          atualizarTudo();
        });
        rot.appendChild(cb);
        rot.appendChild(el("span", "", par[1]));
        cartao.appendChild(rot);
      });

      var lblNota = el("label", "planner-nota-rotulo", "Anotações");
      lblNota.setAttribute("for", base + "-n");
      var ta = el("textarea", "campo planner-nota");
      ta.id = base + "-n";
      ta.rows = 4;
      ta.placeholder = "Escreva suas anotações…";
      ta.value = reg.anotacoes;
      var timer = null;
      ta.addEventListener("input", function () {
        reg.anotacoes = ta.value;
        clearTimeout(timer);
        timer = setTimeout(salvar, ATRASO_SALVAR);
      });
      ta.addEventListener("blur", function () {
        clearTimeout(timer);
        reg.anotacoes = ta.value;
        salvar();
      });
      cartao.appendChild(lblNota);
      cartao.appendChild(ta);
      grade.appendChild(cartao);
    });
    painelSemana.appendChild(grade);
  }

  function abrirSemana(numero) {
    if (numero === semanaAberta) return;
    semanaAberta = numero;
    salvar();
    renderSemana();
    atualizarTudo();
  }

  /* Garante que anotações pendentes não se percam ao fechar a página. */
  window.addEventListener("pagehide", salvar);

  montar();
})();
