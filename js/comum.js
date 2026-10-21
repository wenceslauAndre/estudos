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
    preferencias: "estudos.preferencias.v1"
  };

  var PREFIXO = "estudos.";

  function ler(chave, padrao) {
    try {
      var bruto = localStorage.getItem(chave);
      return bruto === null ? padrao : JSON.parse(bruto);
    } catch (e) {
      return padrao;
    }
  }

  function salvar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      console.error("Falha ao salvar", chave, e);
      return false;
    }
  }

  function exportarTudo() {
    var dados = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIXO) === 0) dados[k] = ler(k, null);
    }
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

  window.Estudos = {
    MATERIAS: MATERIAS,
    SEMANAS: SEMANAS,
    CHAVES: CHAVES,
    ler: ler,
    salvar: salvar,
    exportarTudo: exportarTudo,
    importarTudo: importarTudo,
    materiaPorCodigo: materiaPorCodigo
  };
})();
