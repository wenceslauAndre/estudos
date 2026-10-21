/*
 * comum.js — CONTRATO COMPARTILHADO (não editar nos workers).
 * Define matérias, semanas, chaves do localStorage e a API de armazenamento.
 * Script clássico (sem módulos) para funcionar abrindo o HTML direto (file://).
 */
(function () {
  "use strict";

  var MATERIAS = [
    { codigo: "PES300", nome: "Estatística e Probabilidade", cor: "#4f9cf9" },
    { codigo: "ADM200", nome: "Gestão da Inovação e Desenvolvimento de Produtos", cor: "#f5a524" },
    { codigo: "COM230", nome: "Programação Orientada a Objetos", cor: "#3ecf8e" }
  ];

  var SEMANAS = [];
  for (var i = 1; i <= 7; i++) SEMANAS.push({ numero: i, titulo: "Semana " + i });
  SEMANAS.push({ numero: 8, titulo: "Revisão final" });

  var CHAVES = {
    planner: "estudos.planner.v1",
    flashcards: "estudos.flashcards.v1",
    preferencias: "estudos.preferencias.v1",
    planos: "estudos.planos.v1"
  };

  var MIN_ALTERNATIVAS = 2;
  var MAX_ALTERNATIVAS = 5;

  var PREFIXO = "estudos.";

  function ler(chave, padrao) {
    try {
      var bruto = localStorage.getItem(chave);
      return bruto === null ? padrao : JSON.parse(bruto);
    } catch (e) {
      return padrao;
    }
  }

  function salvarSemEvento(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      console.error("Falha ao salvar", chave, e);
      return false;
    }
  }

  /* Avisa (ex.: js/nuvem.js) que uma chave estudos.* mudou. */
  function avisarSalvo(chave) {
    try {
      window.dispatchEvent(new CustomEvent("estudos:salvo", { detail: { chave: chave } }));
    } catch (e) { /* navegador sem CustomEvent: ignora */ }
  }

  function salvar(chave, valor) {
    var ok = salvarSemEvento(chave, valor);
    if (ok) avisarSalvo(chave);
    return ok;
  }

  function chavesLocais() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIXO) === 0) out.push(k);
      }
    } catch (e) { /* armazenamento indisponível */ }
    return out;
  }

  function exportarTudo() {
    var dados = {};
    chavesLocais().forEach(function (k) { dados[k] = ler(k, null); });
    return { app: "estudos-univesp", versao: 1, exportadoEm: new Date().toISOString(), dados: dados };
  }

  /* Lança Error com mensagem em português se o backup for inválido. */
  function importarTudo(backup) {
    if (!backup || backup.app !== "estudos-univesp" || typeof backup.dados !== "object" || backup.dados === null) {
      throw new Error("Arquivo de backup inválido.");
    }
    Object.keys(backup.dados).forEach(function (k) {
      if (k.indexOf(PREFIXO) === 0) salvar(k, backup.dados[k]);
    });
  }

  function materiaPorCodigo(codigo) {
    for (var i = 0; i < MATERIAS.length; i++) if (MATERIAS[i].codigo === codigo) return MATERIAS[i];
    return null;
  }

  /* ---------- Helpers compartilhados (v2: alternativas, planos, importação) ---------- */

  function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function texto(v) {
    return typeof v === "string" ? v.trim() : (v == null ? "" : String(v).trim());
  }

  function semanaValida(n) {
    n = Math.floor(Number(n));
    return n >= 1 && n <= SEMANAS.length ? n : null;
  }

  /* Só aceita http(s). Devolve a URL normalizada ou "" se for insegura/inválida. */
  function urlSegura(url) {
    url = texto(url);
    return /^https?:\/\/[^\s]+$/i.test(url) ? url : "";
  }

  /*
   * Alternativas de múltipla escolha: [{ texto, correta }].
   * Válido = 2 a 5 itens com texto, sem textos repetidos, exatamente 1 correta.
   * Devolve a lista limpa, ou [] se inválida (cartão então usa geração automática).
   */
  function normalizarAlternativas(lista) {
    if (!Array.isArray(lista)) return [];
    var vistos = {};
    var out = [];
    lista.forEach(function (a) {
      if (!a || typeof a !== "object") return;
      var t = texto(a.texto);
      var chave = t.toLowerCase();
      if (!t || vistos[chave]) return;
      vistos[chave] = true;
      out.push({ texto: t, correta: a.correta === true });
    });
    var corretas = out.filter(function (a) { return a.correta; }).length;
    if (out.length < MIN_ALTERNATIVAS || out.length > MAX_ALTERNATIVAS || corretas !== 1) return [];
    return out;
  }

  function planoVazio() {
    return { titulo: "", resumo: "", topicos: [], links: [], atualizadoEm: null };
  }

  /* Plano de estudo de uma semana×matéria (leitura tolerante). */
  function normalizarPlano(p) {
    var out = planoVazio();
    if (!p || typeof p !== "object") return out;
    out.titulo = texto(p.titulo);
    out.resumo = typeof p.resumo === "string" ? p.resumo : "";
    out.topicos = (Array.isArray(p.topicos) ? p.topicos : []).map(function (t) {
      if (typeof t === "string") t = { texto: t };
      if (!t || typeof t !== "object" || !texto(t.texto)) return null;
      return { id: typeof t.id === "string" && t.id ? t.id : gerarId(), texto: texto(t.texto), feito: t.feito === true };
    }).filter(Boolean);
    out.links = (Array.isArray(p.links) ? p.links : []).map(function (l) {
      if (typeof l === "string") l = { url: l };
      if (!l || typeof l !== "object") return null;
      var url = urlSegura(l.url);
      if (!url) return null;
      return { id: typeof l.id === "string" && l.id ? l.id : gerarId(), titulo: texto(l.titulo) || url, url: url };
    }).filter(Boolean);
    out.atualizadoEm = typeof p.atualizadoEm === "string" ? p.atualizadoEm : null;
    return out;
  }

  /* Lê estudos.planos.v1 completo: sempre devolve { versao, planos: { "1".."8": { COD: plano } } }. */
  function lerPlanos() {
    var bruto = ler(CHAVES.planos, null);
    var dados = { versao: 1, planos: {} };
    var origem = bruto && typeof bruto === "object" && bruto.planos && typeof bruto.planos === "object" ? bruto.planos : {};
    SEMANAS.forEach(function (s) {
      var k = String(s.numero);
      dados.planos[k] = {};
      MATERIAS.forEach(function (m) {
        var p = origem[k] && origem[k][m.codigo];
        dados.planos[k][m.codigo] = normalizarPlano(p);
      });
    });
    return dados;
  }

  function salvarPlanos(dados) {
    return salvar(CHAVES.planos, dados);
  }

  /*
   * Marca "Conteúdo estudado" no Planner para semana×matéria (nunca desmarca).
   * Preserva todos os outros dados do planner.
   */
  function marcarConteudoEstudado(semana, materia) {
    var s = semanaValida(semana);
    if (!s || !materiaPorCodigo(materia)) return false;
    var dados = ler(CHAVES.planner, null);
    if (!dados || typeof dados !== "object") dados = { versao: 1, semanas: {} };
    if (!dados.semanas || typeof dados.semanas !== "object") dados.semanas = {};
    var k = String(s);
    if (!dados.semanas[k] || typeof dados.semanas[k] !== "object") dados.semanas[k] = {};
    var item = dados.semanas[k][materia];
    if (!item || typeof item !== "object") item = { atividade: false, conteudo: false, anotacoes: "" };
    item.conteudo = true;
    dados.semanas[k][materia] = item;
    dados.versao = dados.versao || 1;
    return salvar(CHAVES.planner, dados);
  }

  /* Lê ?materia=PES300&semana=3 da URL atual. Valores inválidos viram null. */
  function parametrosFiltro() {
    var out = { materia: null, semana: null };
    try {
      var q = new URLSearchParams(window.location.search);
      if (materiaPorCodigo(q.get("materia"))) out.materia = q.get("materia");
      out.semana = semanaValida(q.get("semana"));
    } catch (e) { /* ignora */ }
    return out;
  }

  window.Estudos = {
    MATERIAS: MATERIAS,
    SEMANAS: SEMANAS,
    CHAVES: CHAVES,
    MIN_ALTERNATIVAS: MIN_ALTERNATIVAS,
    MAX_ALTERNATIVAS: MAX_ALTERNATIVAS,
    ler: ler,
    salvar: salvar,
    salvarSemEvento: salvarSemEvento,
    chavesLocais: chavesLocais,
    exportarTudo: exportarTudo,
    importarTudo: importarTudo,
    materiaPorCodigo: materiaPorCodigo,
    gerarId: gerarId,
    semanaValida: semanaValida,
    urlSegura: urlSegura,
    normalizarAlternativas: normalizarAlternativas,
    normalizarPlano: normalizarPlano,
    planoVazio: planoVazio,
    lerPlanos: lerPlanos,
    salvarPlanos: salvarPlanos,
    marcarConteudoEstudado: marcarConteudoEstudado,
    parametrosFiltro: parametrosFiltro
    /* importarConteudo(obj) é adicionado por js/importacao.js; nuvem por js/nuvem.js */
  };
})();
