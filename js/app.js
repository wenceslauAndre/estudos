/* app.js — tema, navegação, backup, importação de conteúdo. Ver CONTRATO.md */
(function () {
  "use strict";

  var E = window.Estudos;
  var CHAVE_PREF = (E && E.CHAVES && E.CHAVES.preferencias) || "estudos.preferencias.v1";

  function temaSalvo() {
    try {
      var p = JSON.parse(localStorage.getItem(CHAVE_PREF));
      if (p && p.tema === "claro") return "claro";
    } catch (e) { /* ignora */ }
    return "escuro";
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute("data-tema", tema);
    var b = document.getElementById("btn-tema");
    if (b) {
      b.textContent = tema === "claro" ? "🌙 Tema escuro" : "☀️ Tema claro";
      b.setAttribute("aria-pressed", tema === "claro" ? "true" : "false");
    }
  }

  aplicarTema(temaSalvo());

  function salvarTema(tema) {
    try {
      var p = {};
      try { p = JSON.parse(localStorage.getItem(CHAVE_PREF)) || {}; } catch (e) { p = {}; }
      p.tema = tema;
      if (E && typeof E.salvar === "function") E.salvar(CHAVE_PREF, p); // dispara estudos:salvo (sincroniza)
      else localStorage.setItem(CHAVE_PREF, JSON.stringify(p));
    } catch (e) { /* armazenamento indisponível */ }
  }

  var timerAviso = null;
  function elementoToast() {
    var el = document.getElementById("aviso-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "aviso-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    clearTimeout(timerAviso);
    return el;
  }

  function avisar(texto, erro, duracao) {
    var el = elementoToast();
    el.className = "aviso-toast" + (erro ? " erro" : "");
    el.textContent = texto;
    timerAviso = setTimeout(function () { el.className = "oculto"; }, duracao || 4000);
  }

  function plural(n, singular, pluralTxt) {
    return n + " " + (n === 1 ? singular : pluralTxt);
  }

  function resumirImportacao(r) {
    var partes = [];
    if (r.planos.criados) partes.push(plural(r.planos.criados, "plano novo", "planos novos"));
    if (r.planos.atualizados) partes.push(plural(r.planos.atualizados, "atualizado", "atualizados"));
    if (r.flashcards.adicionados) partes.push(plural(r.flashcards.adicionados, "flashcard", "flashcards"));
    var texto = partes.length ? "Importado: " + partes.join(", ") : "Nada de novo foi importado";
    var extras = [];
    if (r.flashcards.duplicados) extras.push(plural(r.flashcards.duplicados, "duplicado ignorado", "duplicados ignorados"));
    if (r.ignorados) extras.push(plural(r.ignorados, "item inválido ignorado", "itens inválidos ignorados"));
    if (extras.length) texto += " (" + extras.join("; ") + ")";
    return texto + ".";
  }

  /* Mostra o resultado da importação; com avisos, espera o usuário clicar em OK antes de recarregar. */
  function mostrarResultadoImportacao(r) {
    var temAvisos = r.avisos.length > 0;
    if (temAvisos && window.console) {
      console.group("Importação de conteúdo: " + plural(r.avisos.length, "aviso", "avisos"));
      r.avisos.forEach(function (a) { console.warn(a); });
      console.groupEnd();
    }
    var recarregar = function () { window.location.reload(); };
    if (!temAvisos) {
      avisar(resumirImportacao(r) + " Recarregando…");
      setTimeout(recarregar, 2500);
      return;
    }

    var el = elementoToast();
    el.className = "aviso-toast aviso-longo aviso-atencao";
    el.textContent = "";
    var titulo = document.createElement("p");
    titulo.className = "aviso-titulo";
    titulo.textContent = resumirImportacao(r);
    el.appendChild(titulo);
    var sub = document.createElement("p");
    sub.className = "aviso-sub";
    sub.textContent = plural(r.avisos.length, "aviso", "avisos") + ":";
    el.appendChild(sub);
    var lista = document.createElement("ul");
    lista.className = "aviso-lista";
    var LIMITE = 8;
    r.avisos.slice(0, LIMITE).forEach(function (a) {
      var li = document.createElement("li");
      li.textContent = a;
      lista.appendChild(li);
    });
    if (r.avisos.length > LIMITE) {
      var mais = document.createElement("li");
      mais.textContent = "…e mais " + (r.avisos.length - LIMITE) + " (veja o console do navegador).";
      lista.appendChild(mais);
    }
    el.appendChild(lista);
    var ok = document.createElement("button");
    ok.type = "button";
    ok.className = "botao botao-primario";
    ok.textContent = "OK";
    ok.addEventListener("click", recarregar);
    el.appendChild(ok);
    ok.focus();
  }

  function dataHoje() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function exportar() {
    try {
      var json = JSON.stringify(E.exportarTudo(), null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "estudos-backup-" + dataHoje() + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      avisar("Backup exportado com sucesso.");
    } catch (e) {
      avisar("Não foi possível exportar o backup.", true);
    }
  }

  function importarArquivo(arquivo) {
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onerror = function () { avisar("Não foi possível ler o arquivo.", true); };
    leitor.onload = function () {
      var backup;
      try {
        backup = JSON.parse(leitor.result);
      } catch (e) {
        avisar("Arquivo inválido: não é um JSON de backup.", true);
        return;
      }
      if (!window.confirm("Importar este backup vai SUBSTITUIR todos os dados atuais deste navegador. Deseja continuar?")) return;
      try {
        E.importarTudo(backup);
      } catch (e) {
        avisar("Backup inválido: " + (e && e.message ? e.message : "formato não reconhecido") + ".", true);
        return;
      }
      avisar("Backup importado. Recarregando…");
      setTimeout(function () { window.location.reload(); }, 400);
    };
    leitor.readAsText(arquivo);
  }

  function importarConteudoArquivo(arquivo) {
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onerror = function () { avisar("Não foi possível ler o arquivo.", true); };
    leitor.onload = function () {
      var obj;
      try {
        obj = JSON.parse(leitor.result);
      } catch (e) {
        avisar("Arquivo inválido: não é um JSON válido. Confira se a IA respondeu somente com JSON.", true, 7000);
        return;
      }
      var resultado;
      try {
        resultado = E.importarConteudo(obj);
      } catch (e) {
        avisar(e && e.message ? e.message : "Não foi possível importar o conteúdo.", true, 9000);
        return;
      }
      mostrarResultadoImportacao(resultado);
    };
    leitor.readAsText(arquivo);
  }

  function iniciar() {
    var pagina = document.body.getAttribute("data-pagina");
    var links = document.querySelectorAll(".navegacao a[data-pagina]");
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute("data-pagina") === pagina) links[i].setAttribute("aria-current", "page");
      else links[i].removeAttribute("aria-current");
    }

    aplicarTema(document.documentElement.getAttribute("data-tema") || "escuro");
    var bt = document.getElementById("btn-tema");
    if (bt) bt.addEventListener("click", function () {
      var novo = document.documentElement.getAttribute("data-tema") === "claro" ? "escuro" : "claro";
      aplicarTema(novo);
      salvarTema(novo);
    });

    var be = document.getElementById("btn-exportar");
    if (be) be.addEventListener("click", exportar);

    var arq = document.getElementById("arquivo-importar");
    var bi = document.getElementById("btn-importar");
    if (bi && arq) {
      bi.addEventListener("click", function () { arq.click(); });
      arq.addEventListener("change", function () {
        importarArquivo(arq.files && arq.files[0]);
        arq.value = "";
      });
    }

    var arqC = document.getElementById("arquivo-conteudo");
    var bc = document.getElementById("btn-importar-conteudo");
    if (bc && arqC) {
      bc.addEventListener("click", function () { arqC.click(); });
      arqC.addEventListener("change", function () {
        importarConteudoArquivo(arqC.files && arqC.files[0]);
        arqC.value = "";
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
