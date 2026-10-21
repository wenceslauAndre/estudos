/* estudar.js — página Estudar: planos de estudo por semana×matéria (ver CONTRATO.md) */
(function () {
  "use strict";

  var E = typeof window !== "undefined" && window.Estudos ? window.Estudos : null;

  /* ---------- Markdown simples (seguro: escapa o HTML antes de formatar) ---------- */

  function escapar(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function desescapar(s) {
    return s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  function urlSegura(url) {
    return E ? E.urlSegura(url) : "";
  }

  /* Formatação em linha sobre texto JÁ escapado; trechos prontos ficam em marcadores \u0000n\u0000. */
  function formatar(t, guarda) {
    function guardar(html) {
      guarda.push(html);
      return "\u0000" + (guarda.length - 1) + "\u0000";
    }
    t = t.replace(/`([^`]+)`/g, function (_, c) { return guardar("<code>" + c + "</code>"); });
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (completo, rotulo, url) {
      var seguro = urlSegura(desescapar(url));
      if (!seguro) return completo;
      return guardar('<a href="' + escapar(seguro) + '" target="_blank" rel="noopener noreferrer">' +
        formatar(rotulo, guarda) + "</a>");
    });
    t = t.replace(/\*\*(?=\S)(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*(?=[^\s*])([^*]*[^\s*])\*/g, "<em>$1</em>");
    t = t.replace(/(^|[^\w])_(?=[^\s_])([^_]*[^\s_])_(?!\w)/g, "$1<em>$2</em>");
    return t;
  }

  function emLinha(texto) {
    var guarda = [];
    var t = formatar(escapar(texto), guarda);
    var re = /\u0000(\d+)\u0000/;
    while (re.test(t)) t = t.replace(/\u0000(\d+)\u0000/g, function (_, n) { return guarda[Number(n)]; });
    return t;
  }

  function markdown(origem) {
    var texto = (origem == null ? "" : String(origem)).replace(/\u0000/g, "").replace(/\r\n?/g, "\n");
    var linhas = texto.split("\n");
    var saida = [];
    var par = [];
    var i = 0;
    var reItem = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/;

    function fecharParagrafo() {
      if (par.length) saida.push("<p>" + par.map(emLinha).join("<br>") + "</p>");
      par = [];
    }

    while (i < linhas.length) {
      var linha = linhas[i];
      var m;

      if (/^\s*```/.test(linha)) {
        fecharParagrafo();
        var codigo = [];
        i++;
        while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) codigo.push(linhas[i++]);
        i++;
        saida.push("<pre><code>" + escapar(codigo.join("\n")) + "</code></pre>");
        continue;
      }
      if (!linha.trim()) { fecharParagrafo(); i++; continue; }

      m = /^(#{1,3})\s+(.*\S)\s*$/.exec(linha);
      if (m) {
        fecharParagrafo();
        saida.push("<h" + m[1].length + ">" + emLinha(m[2]) + "</h" + m[1].length + ">");
        i++;
        continue;
      }

      m = reItem.exec(linha);
      if (m) {
        fecharParagrafo();
        var ordenada = m[2] !== undefined;
        var inicio = ordenada ? Number(m[2]) : 1;
        var itens = [];
        while (i < linhas.length) {
          var mi = reItem.exec(linhas[i]);
          if (!mi || (mi[2] !== undefined) !== ordenada) break;
          itens.push("<li>" + emLinha(mi[3]) + "</li>");
          i++;
        }
        if (ordenada) {
          saida.push("<ol" + (inicio !== 1 && inicio < 100000 ? ' start="' + inicio + '"' : "") + ">" + itens.join("") + "</ol>");
        } else {
          saida.push("<ul>" + itens.join("") + "</ul>");
        }
        continue;
      }

      par.push(linha.replace(/\s+$/, ""));
      i++;
    }
    fecharParagrafo();
    return saida.join("\n");
  }

  if (typeof module === "object" && module.exports) module.exports = { markdown: markdown };

  /* ---------- Página ---------- */

  var raiz = typeof document !== "undefined" ? document.getElementById("app-estudar") : null;
  if (!raiz || !E) return;

  var MATERIAS = E.MATERIAS;
  var SEMANAS = E.SEMANAS;

  var semana = 1;
  var materia = MATERIAS[0].codigo;
  var editando = false;
  var rascunho = null;
  var baseRascunho = "";
  var visaoAberta = true;
  var focoPendente = null;
  var contadorId = 0;
  var timerAviso = null;

  /* ---------- utilitários ---------- */

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function novoId(prefixo) {
    contadorId++;
    return "est-" + prefixo + "-" + contadorId;
  }

  function rotuloSemana(n) {
    return SEMANAS[n - 1].numero === 8 ? "Revisão final" : "Semana " + n;
  }

  function rotuloCurto(n) {
    return n === 8 ? "Rev." : "S" + n;
  }

  function aviso(msg, erro) {
    var n = document.getElementById("est-aviso");
    if (!n) {
      n = el("div");
      n.id = "est-aviso";
      n.setAttribute("role", "status");
      n.setAttribute("aria-live", "polite");
      document.body.appendChild(n);
    }
    n.className = "aviso-toast" + (erro ? " erro" : "");
    n.textContent = msg;
    n.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { n.hidden = true; }, 4000);
  }

  function planoDe(dados, s, m) {
    return dados.planos[String(s)][m];
  }

  function planoVazio(p) {
    return !p.titulo && !p.resumo.trim() && !p.topicos.length && !p.links.length;
  }

  function contagem(p) {
    var feitos = p.topicos.filter(function (t) { return t.feito; }).length;
    return { feitos: feitos, total: p.topicos.length };
  }

  function concluido(p) {
    var c = contagem(p);
    return c.total > 0 && c.feitos === c.total;
  }

  function barra(feitos, total, cor) {
    var b = el("div", "barra-progresso est-barra");
    b.setAttribute("role", "progressbar");
    b.setAttribute("aria-valuemin", "0");
    b.setAttribute("aria-valuemax", String(total));
    b.setAttribute("aria-valuenow", String(feitos));
    var s = el("span");
    s.style.width = (total ? Math.round((feitos / total) * 100) : 0) + "%";
    if (cor) s.style.background = cor;
    b.appendChild(s);
    return b;
  }

  /* ---------- seleção inicial e URL ---------- */

  function primeiroPendente(dados, soMateria) {
    for (var s = 1; s <= SEMANAS.length; s++) {
      for (var i = 0; i < MATERIAS.length; i++) {
        var cod = MATERIAS[i].codigo;
        if (soMateria && cod !== soMateria) continue;
        var p = planoDe(dados, s, cod);
        if (!planoVazio(p) && !concluido(p)) return { semana: s, materia: cod };
      }
    }
    return null;
  }

  function selecaoInicial() {
    var dados = E.lerPlanos();
    var f = E.parametrosFiltro();
    if (f.materia && f.semana) return { semana: f.semana, materia: f.materia };
    if (f.semana) return { semana: f.semana, materia: MATERIAS[0].codigo };
    var achado = primeiroPendente(dados, f.materia);
    if (achado) return achado;
    return { semana: 1, materia: f.materia || MATERIAS[0].codigo };
  }

  function atualizarUrl() {
    try {
      window.history.replaceState(null, "", "?materia=" + encodeURIComponent(materia) + "&semana=" + semana);
    } catch (e) { /* file:// ou ambiente sem history: ignora */ }
  }

  function instantaneo(r) {
    return JSON.stringify([
      r.titulo, r.resumo,
      r.topicos.map(function (t) { return t.texto; }),
      r.links.map(function (l) { return [l.titulo, l.url]; })
    ]);
  }

  /* Troca a seleção; devolve false se o usuário preferiu manter a edição em andamento. */
  function selecionar(s, m, foco) {
    if (editando) {
      if (instantaneo(rascunho) !== baseRascunho &&
          !window.confirm("Descartar as alterações não salvas deste plano?")) {
        return false;
      }
      editando = false;
      rascunho = null;
    }
    semana = s;
    materia = m;
    atualizarUrl();
    focoPendente = foco || null;
    render();
    return true;
  }

  /* ---------- ações sobre o plano ---------- */

  function alternarTopico(id, feito) {
    var dados = E.lerPlanos();
    var p = planoDe(dados, semana, materia);
    var alvo = p.topicos.filter(function (t) { return t.id === id; })[0];
    if (!alvo) { render(); return; }
    alvo.feito = feito;
    if (!E.salvarPlanos(dados)) {
      aviso("Não foi possível salvar (armazenamento indisponível).", true);
      render();
      return;
    }
    focoPendente = '[data-topico="' + id + '"]';
    if (feito && concluido(p) && E.marcarConteudoEstudado(semana, materia)) {
      aviso("Conteúdo estudado marcado no Planner ✔");
    }
    render();
  }

  function limparPlano() {
    if (!window.confirm("Limpar o plano de " + rotuloSemana(semana) + " · " + materia + "? Título, resumo, tópicos e links serão apagados.")) return;
    var dados = E.lerPlanos();
    dados.planos[String(semana)][materia] = E.planoVazio();
    if (!E.salvarPlanos(dados)) { aviso("Não foi possível salvar (armazenamento indisponível).", true); return; }
    aviso("Plano limpo.");
    render();
  }

  function iniciarEdicao() {
    var p = planoDe(E.lerPlanos(), semana, materia);
    rascunho = {
      titulo: p.titulo,
      resumo: p.resumo,
      topicos: p.topicos.map(function (t) { return { id: t.id, texto: t.texto, feito: t.feito }; }),
      links: p.links.map(function (l) { return { id: l.id, titulo: l.titulo, url: l.url }; })
    };
    baseRascunho = instantaneo(rascunho);
    editando = true;
    focoPendente = "#est-f-titulo";
    render();
  }

  function cancelarEdicao() {
    editando = false;
    rascunho = null;
    render();
  }

  /* ---------- renderização: partes ---------- */

  function renderSeletor() {
    var sec = el("section", "cartao est-seletor");
    sec.setAttribute("aria-label", "Seleção de semana e matéria");

    var gSemana = el("div", "est-grupo");
    var idSel = novoId("semana");
    var lab = el("label", "est-rotulo", "Semana");
    lab.setAttribute("for", idSel);
    var sel = el("select", "campo est-select");
    sel.id = idSel;
    sel.setAttribute("data-seletor", "semana");
    SEMANAS.forEach(function (s) {
      var o = el("option", "", s.numero === 8 ? "8 · Revisão final" : "Semana " + s.numero);
      o.value = String(s.numero);
      if (s.numero === semana) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      if (!selecionar(Number(sel.value), materia, '[data-seletor="semana"]')) sel.value = String(semana);
    });
    gSemana.appendChild(lab);
    gSemana.appendChild(sel);

    var gMat = el("div", "est-grupo est-grupo-materias");
    var legenda = el("span", "est-rotulo", "Matéria");
    legenda.id = novoId("lmat");
    var botoes = el("div", "est-materias");
    botoes.setAttribute("role", "group");
    botoes.setAttribute("aria-labelledby", legenda.id);
    MATERIAS.forEach(function (m) {
      var b = el("button", "est-materia" + (m.codigo === materia ? " est-materia-ativa" : ""));
      b.type = "button";
      b.style.setProperty("--acento", m.cor);
      b.setAttribute("aria-pressed", m.codigo === materia ? "true" : "false");
      b.title = m.nome;
      b.appendChild(el("span", "est-materia-ponto"));
      b.appendChild(el("span", "est-materia-codigo", m.codigo));
      b.addEventListener("click", function () {
        if (m.codigo === materia) return;
        selecionar(semana, m.codigo, '[data-materia="' + m.codigo + '"]');
      });
      b.setAttribute("data-materia", m.codigo);
      botoes.appendChild(b);
    });
    gMat.appendChild(legenda);
    gMat.appendChild(botoes);

    sec.appendChild(gSemana);
    sec.appendChild(gMat);
    return sec;
  }

  function renderVisao(dados) {
    var det = el("details", "cartao est-visao");
    if (visaoAberta) det.open = true;
    det.addEventListener("toggle", function () { visaoAberta = det.open; });
    det.appendChild(el("summary", "est-visao-titulo", "Visão geral das semanas"));

    var grade = el("div", "est-grade");
    grade.appendChild(el("span", "est-grade-canto"));
    MATERIAS.forEach(function (m) {
      var c = el("span", "est-grade-cab", m.codigo);
      c.style.color = m.cor;
      grade.appendChild(c);
    });

    SEMANAS.forEach(function (s) {
      var rot = el("span", "est-grade-semana", rotuloCurto(s.numero));
      rot.title = rotuloSemana(s.numero);
      grade.appendChild(rot);
      MATERIAS.forEach(function (m) {
        var p = planoDe(dados, s.numero, m.codigo);
        var c = contagem(p);
        var vazio = planoVazio(p);
        var ativo = s.numero === semana && m.codigo === materia;
        var b = el("button", "est-celula" + (ativo ? " est-celula-ativa" : ""));
        b.type = "button";
        b.style.setProperty("--acento", m.cor);
        if (ativo) b.setAttribute("aria-current", "true");
        var descricao;
        if (vazio) {
          b.appendChild(el("span", "est-celula-texto est-celula-vazia", "—"));
          descricao = "sem plano";
        } else if (c.total) {
          b.appendChild(el("span", "est-celula-texto", concluido(p) ? "✔ " + c.feitos + "/" + c.total : c.feitos + "/" + c.total));
          b.appendChild(barra(c.feitos, c.total, m.cor));
          descricao = c.feitos + " de " + c.total + " tópicos concluídos";
        } else {
          b.appendChild(el("span", "est-celula-texto", "Plano"));
          descricao = "plano sem tópicos";
        }
        b.setAttribute("aria-label", rotuloSemana(s.numero) + ", " + m.codigo + ": " + descricao);
        b.addEventListener("click", function () {
          selecionar(s.numero, m.codigo, "#est-titulo-plano");
        });
        grade.appendChild(b);
      });
    });
    det.appendChild(grade);
    return det;
  }

  function cabecalhoPlano(m, p, extra) {
    var cab = el("header", "est-plano-cab");
    var linha = el("div", "est-plano-ident");
    var pilula = el("span", "est-pilula", m.codigo);
    pilula.style.setProperty("--acento", m.cor);
    linha.appendChild(pilula);
    linha.appendChild(el("span", "est-plano-contexto", rotuloSemana(semana) + " · " + m.nome));
    cab.appendChild(linha);
    var h = el("h2", "est-plano-titulo", p.titulo || "Plano sem título");
    h.id = "est-titulo-plano";
    h.tabIndex = -1;
    if (!p.titulo) h.classList.add("est-sem-titulo");
    cab.appendChild(h);
    if (extra) cab.appendChild(extra);
    return cab;
  }

  function renderVisualizacao(dados) {
    var m = E.materiaPorCodigo(materia);
    var p = planoDe(dados, semana, materia);
    var sec = el("section", "cartao est-plano");
    sec.id = "est-plano";
    sec.style.setProperty("--acento", m.cor);
    sec.setAttribute("aria-label", "Plano de estudo");

    var acoes = el("div", "est-acoes");
    var btnEditar = el("button", "botao botao-primario", planoVazio(p) ? "Criar plano" : "Editar plano");
    btnEditar.type = "button";
    btnEditar.addEventListener("click", iniciarEdicao);
    acoes.appendChild(btnEditar);

    var fc = el("a", "botao", "Revisar com flashcards");
    fc.href = "flashcards.html?materia=" + encodeURIComponent(materia) + "&semana=" + semana;
    acoes.appendChild(fc);

    if (!planoVazio(p)) {
      var btnLimpar = el("button", "botao botao-perigo", "Limpar plano");
      btnLimpar.type = "button";
      btnLimpar.addEventListener("click", limparPlano);
      acoes.appendChild(btnLimpar);
    }

    if (planoVazio(p)) {
      sec.appendChild(cabecalhoPlano(m, p));
      sec.appendChild(el("p", "est-vazio", "Nenhum plano para esta semana. Crie um ou use Importar conteúdo."));
      sec.appendChild(acoes);
      return sec;
    }

    sec.appendChild(cabecalhoPlano(m, p, acoes));

    if (p.resumo.trim()) {
      var resumo = el("div", "est-md est-resumo");
      resumo.innerHTML = markdown(p.resumo); /* seguro: markdown() escapa todo o texto antes de formatar */
      sec.appendChild(resumo);
    }

    var c = contagem(p);
    var blocoTop = el("section", "est-bloco");
    var hTop = el("h3", "est-bloco-titulo", "Tópicos");
    blocoTop.appendChild(hTop);
    if (c.total) {
      var prog = el("div", "est-progresso");
      var txt = el("span", "est-progresso-texto", c.feitos + "/" + c.total + " concluídos");
      prog.appendChild(txt);
      prog.appendChild(barra(c.feitos, c.total, m.cor));
      blocoTop.appendChild(prog);
      var ul = el("ul", "est-topicos");
      p.topicos.forEach(function (t) {
        var li = el("li", "est-topico" + (t.feito ? " est-topico-feito" : ""));
        var lab = el("label", "est-check");
        var cb = el("input");
        cb.type = "checkbox";
        cb.checked = t.feito;
        cb.setAttribute("data-topico", t.id);
        cb.addEventListener("change", function () { alternarTopico(t.id, cb.checked); });
        lab.appendChild(cb);
        lab.appendChild(el("span", "est-check-texto", t.texto));
        li.appendChild(lab);
        ul.appendChild(li);
      });
      blocoTop.appendChild(ul);
    } else {
      blocoTop.appendChild(el("p", "est-nota", "Este plano ainda não tem tópicos. Use “Editar plano” para adicionar."));
    }
    sec.appendChild(blocoTop);

    if (p.links.length) {
      var blocoLinks = el("section", "est-bloco");
      blocoLinks.appendChild(el("h3", "est-bloco-titulo", "Links"));
      var lista = el("ul", "est-links");
      p.links.forEach(function (l) {
        var url = E.urlSegura(l.url);
        if (!url) return;
        var li = el("li", "est-link");
        var a = el("a", "", l.titulo || url);
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        li.appendChild(a);
        lista.appendChild(li);
      });
      blocoLinks.appendChild(lista);
      sec.appendChild(blocoLinks);
    }

    if (p.atualizadoEm) {
      var d = new Date(p.atualizadoEm);
      if (!isNaN(d.getTime())) {
        sec.appendChild(el("p", "est-nota est-atualizado", "Atualizado em " + d.toLocaleString("pt-BR")));
      }
    }
    return sec;
  }

  /* ---------- edição ---------- */

  function campoRotulado(rotulo, controle, dica) {
    var id = controle.id || novoId("c");
    controle.id = id;
    var g = el("div", "est-campo");
    var lab = el("label", "est-rotulo", rotulo);
    lab.setAttribute("for", id);
    g.appendChild(lab);
    if (dica) {
      var d = el("p", "est-dica", dica);
      d.id = id + "-dica";
      controle.setAttribute("aria-describedby", d.id);
      g.appendChild(d);
    }
    g.appendChild(controle);
    return g;
  }

  function renderTopicosEdicao(lista) {
    lista.textContent = "";
    rascunho.topicos.forEach(function (t, i) {
      var li = el("li", "est-linha-edicao");
      var inp = el("input", "campo");
      inp.type = "text";
      inp.value = t.texto;
      inp.maxLength = 300;
      inp.setAttribute("aria-label", "Tópico " + (i + 1));
      inp.addEventListener("input", function () { t.texto = inp.value; });
      var rem = el("button", "botao botao-perigo est-remover", "Remover");
      rem.type = "button";
      rem.setAttribute("aria-label", "Remover tópico " + (i + 1) + ": " + t.texto);
      rem.addEventListener("click", function () {
        rascunho.topicos.splice(i, 1);
        renderTopicosEdicao(lista);
        var prox = lista.querySelectorAll("input")[Math.min(i, rascunho.topicos.length - 1)];
        var alvo = prox || document.getElementById("est-f-novo-topico");
        if (alvo) alvo.focus();
      });
      li.appendChild(inp);
      li.appendChild(rem);
      lista.appendChild(li);
    });
  }

  function renderLinksEdicao(lista) {
    lista.textContent = "";
    rascunho.links.forEach(function (l, i) {
      var li = el("li", "est-linha-edicao est-linha-link");
      var info = el("span", "est-link-info");
      info.appendChild(el("strong", "", l.titulo || l.url));
      info.appendChild(el("span", "est-link-url", l.url));
      var rem = el("button", "botao botao-perigo est-remover", "Remover");
      rem.type = "button";
      rem.setAttribute("aria-label", "Remover link " + (l.titulo || l.url));
      rem.addEventListener("click", function () {
        rascunho.links.splice(i, 1);
        renderLinksEdicao(lista);
        var alvo = document.getElementById("est-f-novo-link-url");
        if (alvo) alvo.focus();
      });
      li.appendChild(info);
      li.appendChild(rem);
      lista.appendChild(li);
    });
  }

  function renderEdicao(dados) {
    var m = E.materiaPorCodigo(materia);
    var original = planoDe(dados, semana, materia);
    var sec = el("section", "cartao est-plano est-edicao");
    sec.id = "est-plano";
    sec.style.setProperty("--acento", m.cor);
    sec.setAttribute("aria-label", "Edição do plano");

    var cab = el("header", "est-plano-cab");
    var ident = el("div", "est-plano-ident");
    var pilula = el("span", "est-pilula", m.codigo);
    pilula.style.setProperty("--acento", m.cor);
    ident.appendChild(pilula);
    ident.appendChild(el("span", "est-plano-contexto", rotuloSemana(semana) + " · " + m.nome));
    cab.appendChild(ident);
    var h = el("h2", "est-plano-titulo", planoVazio(original) ? "Novo plano" : "Editar plano");
    h.id = "est-titulo-plano";
    cab.appendChild(h);
    sec.appendChild(cab);

    var form = el("form", "est-form");
    form.noValidate = true;

    var titulo = el("input", "campo");
    titulo.type = "text";
    titulo.id = "est-f-titulo";
    titulo.maxLength = 200;
    titulo.value = rascunho.titulo;
    titulo.addEventListener("input", function () { rascunho.titulo = titulo.value; });
    form.appendChild(campoRotulado("Título", titulo));

    var resumo = el("textarea", "campo est-resumo-campo");
    resumo.id = "est-f-resumo";
    resumo.rows = 8;
    resumo.value = rascunho.resumo;
    form.appendChild(campoRotulado("Resumo (Markdown)", resumo,
      "Recursos: # Título, ## Subtítulo, ### Seção · listas com - ou * e numeradas com 1. · **negrito** · *itálico* ou _itálico_ · `código` · bloco de código entre ``` · [texto](https://link)."));

    var previa = el("div", "est-previa");
    var tituloPrevia = el("h3", "est-bloco-titulo", "Prévia");
    tituloPrevia.id = "est-previa-titulo";
    var corpoPrevia = el("div", "est-md");
    corpoPrevia.setAttribute("aria-live", "off");
    corpoPrevia.setAttribute("aria-labelledby", "est-previa-titulo");
    function atualizarPrevia() {
      if (rascunho.resumo.trim()) corpoPrevia.innerHTML = markdown(rascunho.resumo); /* seguro: escapado */
      else corpoPrevia.innerHTML = '<p class="est-nota">Nada para mostrar ainda.</p>';
    }
    resumo.addEventListener("input", function () {
      rascunho.resumo = resumo.value;
      atualizarPrevia();
    });
    atualizarPrevia();
    previa.appendChild(tituloPrevia);
    previa.appendChild(corpoPrevia);
    form.appendChild(previa);

    /* tópicos */
    var fsTop = el("fieldset", "est-fieldset");
    fsTop.appendChild(el("legend", "est-rotulo", "Tópicos"));
    var listaTop = el("ul", "est-lista-edicao");
    renderTopicosEdicao(listaTop);
    fsTop.appendChild(listaTop);
    var addTop = el("div", "est-linha-edicao");
    var novoTop = el("input", "campo");
    novoTop.type = "text";
    novoTop.id = "est-f-novo-topico";
    novoTop.maxLength = 300;
    novoTop.placeholder = "Novo tópico";
    novoTop.setAttribute("aria-label", "Novo tópico");
    function adicionarTopico() {
      var t = novoTop.value.trim();
      if (!t) return false;
      rascunho.topicos.push({ id: E.gerarId(), texto: t, feito: false });
      novoTop.value = "";
      renderTopicosEdicao(listaTop);
      return true;
    }
    var btnTop = el("button", "botao", "Adicionar tópico");
    btnTop.type = "button";
    btnTop.addEventListener("click", function () { adicionarTopico(); novoTop.focus(); });
    novoTop.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); adicionarTopico(); }
    });
    addTop.appendChild(novoTop);
    addTop.appendChild(btnTop);
    fsTop.appendChild(addTop);
    form.appendChild(fsTop);

    /* links */
    var fsLinks = el("fieldset", "est-fieldset");
    fsLinks.appendChild(el("legend", "est-rotulo", "Links"));
    var listaLinks = el("ul", "est-lista-edicao");
    renderLinksEdicao(listaLinks);
    fsLinks.appendChild(listaLinks);

    var addLink = el("div", "est-novo-link");
    var novoTit = el("input", "campo");
    novoTit.type = "text";
    novoTit.id = "est-f-novo-link-titulo";
    novoTit.maxLength = 200;
    novoTit.placeholder = "Título do link";
    novoTit.setAttribute("aria-label", "Título do novo link");
    var novoUrl = el("input", "campo");
    novoUrl.type = "text";
    novoUrl.id = "est-f-novo-link-url";
    novoUrl.inputMode = "url";
    novoUrl.placeholder = "https://…";
    novoUrl.setAttribute("aria-label", "URL do novo link");
    var erroLink = el("p", "est-erro oculto");
    erroLink.id = "est-erro-link";
    erroLink.setAttribute("role", "alert");
    novoUrl.setAttribute("aria-describedby", "est-erro-link");
    function mostrarErroLink(msg) {
      erroLink.textContent = msg || "";
      erroLink.classList.toggle("oculto", !msg);
      novoUrl.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    function adicionarLink() {
      var tit = novoTit.value.trim();
      var url = novoUrl.value.trim();
      if (!tit && !url) { mostrarErroLink(""); return true; }
      var segura = E.urlSegura(url);
      if (!segura) {
        mostrarErroLink("URL inválida: use um endereço que comece com http:// ou https://.");
        novoUrl.focus();
        return false;
      }
      mostrarErroLink("");
      rascunho.links.push({ id: E.gerarId(), titulo: tit || segura, url: segura });
      novoTit.value = "";
      novoUrl.value = "";
      renderLinksEdicao(listaLinks);
      return true;
    }
    var btnLink = el("button", "botao", "Adicionar link");
    btnLink.type = "button";
    btnLink.addEventListener("click", function () { if (adicionarLink()) novoTit.focus(); });
    [novoTit, novoUrl].forEach(function (inp) {
      inp.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); adicionarLink(); }
      });
    });
    addLink.appendChild(novoTit);
    addLink.appendChild(novoUrl);
    addLink.appendChild(btnLink);
    fsLinks.appendChild(addLink);
    fsLinks.appendChild(erroLink);
    form.appendChild(fsLinks);

    /* ações */
    var acoes = el("div", "est-acoes");
    var salvarBtn = el("button", "botao botao-primario", "Salvar plano");
    salvarBtn.type = "submit";
    var cancelar = el("button", "botao", "Cancelar");
    cancelar.type = "button";
    cancelar.addEventListener("click", cancelarEdicao);
    acoes.appendChild(salvarBtn);
    acoes.appendChild(cancelar);
    form.appendChild(acoes);

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!adicionarLink()) return;
      adicionarTopico();
      var dadosAtuais = E.lerPlanos();
      dadosAtuais.planos[String(semana)][materia] = E.normalizarPlano({
        titulo: rascunho.titulo,
        resumo: rascunho.resumo,
        topicos: rascunho.topicos,
        links: rascunho.links,
        atualizadoEm: new Date().toISOString()
      });
      if (!E.salvarPlanos(dadosAtuais)) {
        aviso("Não foi possível salvar (armazenamento indisponível).", true);
        return;
      }
      editando = false;
      rascunho = null;
      focoPendente = "#est-titulo-plano";
      aviso("Plano salvo.");
      render();
    });

    sec.appendChild(form);
    return sec;
  }

  /* ---------- render geral ---------- */

  function render() {
    var dados = E.lerPlanos();
    raiz.textContent = "";
    var topo = el("div", "est-topo");
    topo.appendChild(el("h1", "est-titulo", "Estudar"));
    topo.appendChild(el("p", "est-subtitulo", "Plano de estudo por semana e matéria: resumo, tópicos para marcar e links úteis."));
    raiz.appendChild(topo);
    raiz.appendChild(renderSeletor());
    raiz.appendChild(renderVisao(dados));
    raiz.appendChild(editando ? renderEdicao(dados) : renderVisualizacao(dados));

    if (focoPendente) {
      var alvo = raiz.querySelector(focoPendente);
      focoPendente = null;
      if (alvo) alvo.focus();
    }
  }

  var inicial = selecaoInicial();
  semana = inicial.semana;
  materia = inicial.materia;
  atualizarUrl();
  render();
})();
