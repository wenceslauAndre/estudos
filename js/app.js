/* app.js — tema, navegação, backup. Ver CONTRATO.md */
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
      localStorage.setItem(CHAVE_PREF, JSON.stringify(p));
    } catch (e) { /* armazenamento indisponível */ }
  }

  var timerAviso = null;
  function avisar(texto, erro) {
    var el = document.getElementById("aviso-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "aviso-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.className = "aviso-toast" + (erro ? " erro" : "");
    el.textContent = texto;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(function () { el.className = "oculto"; }, 4000);
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
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
