/*
 * Testes de js/nuvem.js — node puro, sem dependências.
 * Rodar: node testes/nuvem.test.js   (sai com código 1 se algum teste falhar)
 */
"use strict";

var assert = require("assert");
var path = require("path");
var N = require(path.join(__dirname, "..", "js", "nuvem.js"));

var PL = "estudos.planner.v1";
var FC = "estudos.flashcards.v1";
var PS = "estudos.planos.v1";
var PR = "estudos.preferencias.v1";

var testes = [];
function teste(nome, fn) { testes.push({ nome: nome, fn: fn }); }

function congelar(o) {
  if (o && typeof o === "object") { Object.freeze(o); Object.keys(o).forEach(function (k) { congelar(o[k]); }); }
  return o;
}

/* =========================================================================
 * mesclar — planner
 * ========================================================================= */

function planner(reg, extra) {
  var p = { versao: 1, semanas: { "1": { PES300: reg } } };
  if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
  return p;
}
function reg(atividade, conteudo, anotacoes) { return { atividade: atividade, conteudo: conteudo, anotacoes: anotacoes }; }

teste("planner: atividade e conteudo = OU lógico", function () {
  var r = N.mesclar(PL, planner(reg(true, false, "")), planner(reg(false, true, "")));
  assert.deepStrictEqual(r.semanas["1"].PES300, reg(true, true, ""));
  r = N.mesclar(PL, planner(reg(false, false, "")), planner(reg(false, false, "")));
  assert.deepStrictEqual(r.semanas["1"].PES300, reg(false, false, ""));
});

teste("planner: anotações iguais → mantém", function () {
  var r = N.mesclar(PL, planner(reg(false, false, "abc")), planner(reg(false, false, "abc")));
  assert.strictEqual(r.semanas["1"].PES300.anotacoes, "abc");
});

teste("planner: anotação vazia → fica a outra (dos dois lados)", function () {
  assert.strictEqual(N.mesclar(PL, planner(reg(false, false, "")), planner(reg(false, false, "nuvem"))).semanas["1"].PES300.anotacoes, "nuvem");
  assert.strictEqual(N.mesclar(PL, planner(reg(false, false, "local")), planner(reg(false, false, "  "))).semanas["1"].PES300.anotacoes, "local");
});

teste("planner: uma contém a outra → a maior", function () {
  assert.strictEqual(N.mesclar(PL, planner(reg(false, false, "ab")), planner(reg(false, false, "abcd"))).semanas["1"].PES300.anotacoes, "abcd");
  assert.strictEqual(N.mesclar(PL, planner(reg(false, false, "abcd")), planner(reg(false, false, "bc"))).semanas["1"].PES300.anotacoes, "abcd");
});

teste("planner: anotações diferentes → local + separador + nuvem (e é idempotente)", function () {
  var r = N.mesclar(PL, planner(reg(false, false, "L")), planner(reg(false, false, "N")));
  assert.strictEqual(r.semanas["1"].PES300.anotacoes, "L\n\n— (outro aparelho) —\nN");
  var de_novo = N.mesclar(PL, r, planner(reg(false, false, "N")));
  assert.strictEqual(de_novo.semanas["1"].PES300.anotacoes, r.semanas["1"].PES300.anotacoes);
});

teste("planner: semanas/matérias só de um lado entram; campos extras do local são mantidos", function () {
  var l = planner(reg(true, false, "x"), { semanaAberta: 3 });
  var n = { versao: 1, semanas: { "2": { ADM200: reg(false, true, "y") } }, semanaAberta: 5 };
  var r = N.mesclar(PL, l, n);
  assert.deepStrictEqual(r.semanas["1"].PES300, reg(true, false, "x"));
  assert.deepStrictEqual(r.semanas["2"].ADM200, reg(false, true, "y"));
  assert.strictEqual(r.semanaAberta, 3);
});

teste("mesclar não altera os argumentos", function () {
  var l = congelar(planner(reg(true, false, "L")));
  var n = congelar(planner(reg(false, true, "N")));
  N.mesclar(PL, l, n);
  var fl = congelar({ cartoes: [{ id: "a", acertos: 1, erros: 0 }], historicoQuiz: [{ data: "2026-01-02" }] });
  var fn = congelar({ cartoes: [{ id: "a", acertos: 5, erros: 0 }], historicoQuiz: [{ data: "2026-01-01" }] });
  N.mesclar(FC, fl, fn);
});

/* =========================================================================
 * mesclar — flashcards
 * ========================================================================= */

function cartao(id, acertos, erros, ultima, frente) {
  return { id: id, materia: "PES300", semana: 1, frente: frente || id, verso: "v", acertos: acertos, erros: erros,
           criadoEm: "2026-01-01T00:00:00Z", ultimaRevisao: ultima === undefined ? null : ultima };
}
function fc(cartoes, hist) { return { versao: 1, cartoes: cartoes, historicoQuiz: hist || [] }; }
function ids(d) { return d.cartoes.map(function (c) { return c.id; }); }

teste("flashcards: cartões = união por id (ordem: locais, depois só-da-nuvem)", function () {
  var r = N.mesclar(FC, fc([cartao("a", 0, 0), cartao("b", 0, 0)]), fc([cartao("c", 0, 0), cartao("a", 0, 0)]));
  assert.deepStrictEqual(ids(r), ["a", "b", "c"]);
});

teste("flashcards: mesmo id → maior acertos+erros vence (dos dois lados)", function () {
  var r = N.mesclar(FC, fc([cartao("a", 1, 1, null, "local")]), fc([cartao("a", 2, 1, null, "nuvem")]));
  assert.strictEqual(r.cartoes[0].frente, "nuvem");
  r = N.mesclar(FC, fc([cartao("a", 3, 0, null, "local")]), fc([cartao("a", 1, 1, null, "nuvem")]));
  assert.strictEqual(r.cartoes[0].frente, "local");
});

teste("flashcards: empate em respostas → ultimaRevisao mais recente", function () {
  var r = N.mesclar(FC, fc([cartao("a", 1, 1, "2026-03-01T10:00:00Z", "local")]),
                        fc([cartao("a", 2, 0, "2026-03-02T10:00:00Z", "nuvem")]));
  assert.strictEqual(r.cartoes[0].frente, "nuvem");
  r = N.mesclar(FC, fc([cartao("a", 1, 1, "2026-03-05T10:00:00Z", "local")]),
                    fc([cartao("a", 2, 0, "2026-03-02T10:00:00Z", "nuvem")]));
  assert.strictEqual(r.cartoes[0].frente, "local");
  // null perde para data
  r = N.mesclar(FC, fc([cartao("a", 0, 0, null, "local")]), fc([cartao("a", 0, 0, "2026-03-02T10:00:00Z", "nuvem")]));
  assert.strictEqual(r.cartoes[0].frente, "nuvem");
});

teste("flashcards: empate total → local", function () {
  var r = N.mesclar(FC, fc([cartao("a", 1, 1, "2026-03-01T10:00:00Z", "local")]),
                        fc([cartao("a", 1, 1, "2026-03-01T10:00:00Z", "nuvem")]));
  assert.strictEqual(r.cartoes[0].frente, "local");
  r = N.mesclar(FC, fc([cartao("a", 0, 0, null, "local")]), fc([cartao("a", 0, 0, null, "nuvem")]));
  assert.strictEqual(r.cartoes[0].frente, "local");
});

teste("flashcards: historicoQuiz = união sem duplicatas (data+materia+semana+modo), ordenado por data", function () {
  var h1 = { data: "2026-02-01T10:00:00Z", materia: "PES300", semana: 1, acertos: 3, total: 5, modo: "quiz" };
  var h2 = { data: "2026-02-03T10:00:00Z", materia: "PES300", semana: 1, acertos: 4, total: 5 };
  var h3 = { data: "2026-02-02T10:00:00Z", materia: "ADM200", semana: 2, acertos: 1, total: 5, modo: "multipla" };
  var h1modoDif = { data: "2026-02-01T10:00:00Z", materia: "PES300", semana: 1, acertos: 2, total: 5, modo: "multipla" };
  var r = N.mesclar(FC, fc([], [h2, h1]), fc([], [h1, h3, h2, h1modoDif]));
  assert.strictEqual(r.historicoQuiz.length, 4);
  assert.deepStrictEqual(r.historicoQuiz.map(function (h) { return h.data; }),
    ["2026-02-01T10:00:00Z", "2026-02-01T10:00:00Z", "2026-02-02T10:00:00Z", "2026-02-03T10:00:00Z"]);
  // sem duplicatas exatas
  var chaves = r.historicoQuiz.map(function (h) { return [h.data, h.materia, h.semana, h.modo || ""].join("|"); });
  assert.strictEqual(new Set(chaves).size, chaves.length);
});

teste("flashcards: mesclar de novo com a nuvem não duplica nada", function () {
  var l = fc([cartao("a", 1, 0), cartao("b", 0, 0)], [{ data: "2026-01-01", materia: "PES300", semana: 1 }]);
  var n = fc([cartao("c", 0, 0)], [{ data: "2026-01-02", materia: "PES300", semana: 1 }]);
  var r = N.mesclar(FC, l, n);
  var r2 = N.mesclar(FC, r, n);
  assert.ok(N.iguais(r, r2));
  assert.strictEqual(r2.cartoes.length, 3);
  assert.strictEqual(r2.historicoQuiz.length, 2);
});

/* =========================================================================
 * mesclar — planos
 * ========================================================================= */

function plano(p) {
  return { versao: 1, planos: { "1": { PES300: p } } };
}
function pl(titulo, resumo, topicos, links, atualizadoEm) {
  return { titulo: titulo, resumo: resumo, topicos: topicos, links: links, atualizadoEm: atualizadoEm };
}
function top(id, texto, feito) { return { id: id, texto: texto, feito: feito === true }; }
function link(id, url) { return { id: id, titulo: url, url: url }; }

teste("planos: base = atualizadoEm mais recente (título/resumo da base)", function () {
  var l = pl("Título L", "Resumo L", [], [], "2026-01-01T00:00:00Z");
  var n = pl("Título N", "Resumo N", [], [], "2026-01-02T00:00:00Z");
  var r = N.mesclar(PS, plano(l), plano(n)).planos["1"].PES300;
  assert.strictEqual(r.titulo, "Título N");
  assert.strictEqual(r.resumo, "Resumo N");
  assert.strictEqual(r.atualizadoEm, "2026-01-02T00:00:00Z");
  r = N.mesclar(PS, plano(pl("L", "RL", [], [], "2026-01-05T00:00:00Z")), plano(n)).planos["1"].PES300;
  assert.strictEqual(r.titulo, "L");
});

teste("planos: empate de atualizadoEm (ou ambos null) → local é a base", function () {
  var r = N.mesclar(PS, plano(pl("L", "RL", [], [], null)), plano(pl("N", "RN", [], [], null))).planos["1"].PES300;
  assert.strictEqual(r.titulo, "L");
  r = N.mesclar(PS, plano(pl("L", "RL", [], [], "2026-01-01T00:00:00Z")), plano(pl("N", "RN", [], [], "2026-01-01T00:00:00Z"))).planos["1"].PES300;
  assert.strictEqual(r.resumo, "RL");
});

teste("planos: base com título/resumo vazio usa os do outro", function () {
  var l = pl("Antigo", "Resumo antigo", [], [], "2026-01-01T00:00:00Z");
  var n = pl("", "  ", [], [], "2026-01-09T00:00:00Z");
  var r = N.mesclar(PS, plano(l), plano(n)).planos["1"].PES300;
  assert.strictEqual(r.titulo, "Antigo");
  assert.strictEqual(r.resumo, "Resumo antigo");
});

teste("planos: tópicos = união por id; mesmo id → texto da base, feito = OU", function () {
  var l = pl("", "", [top("t1", "texto L", true), top("t2", "só local")], [], "2026-01-01T00:00:00Z");
  var n = pl("", "", [top("t1", "texto N", false), top("t3", "só nuvem", true)], [], "2026-01-02T00:00:00Z");
  var r = N.mesclar(PS, plano(l), plano(n)).planos["1"].PES300;
  assert.deepStrictEqual(r.topicos.map(function (t) { return t.id; }).sort(), ["t1", "t2", "t3"]);
  var t1 = r.topicos.filter(function (t) { return t.id === "t1"; })[0];
  assert.strictEqual(t1.texto, "texto N"); // base = nuvem (mais recente)
  assert.strictEqual(t1.feito, true);      // OU
});

teste("planos: links = união por url", function () {
  var l = pl("", "", [], [link("a", "https://a.com"), link("b", "https://b.com")], null);
  var n = pl("", "", [], [link("x", "https://b.com"), link("c", "https://c.com")], null);
  var r = N.mesclar(PS, plano(l), plano(n)).planos["1"].PES300;
  assert.deepStrictEqual(r.links.map(function (x) { return x.url; }), ["https://a.com", "https://b.com", "https://c.com"]);
});

teste("planos: plano vazio de um lado + plano preenchido do outro → nada se perde", function () {
  var vazio = pl("", "", [], [], null);
  var cheio = pl("T", "R", [top("t1", "x")], [link("l1", "https://x.com")], "2026-01-01T00:00:00Z");
  var r = N.mesclar(PS, plano(vazio), plano(cheio)).planos["1"].PES300;
  assert.strictEqual(r.titulo, "T");
  assert.strictEqual(r.resumo, "R");
  assert.strictEqual(r.topicos.length, 1);
  assert.strictEqual(r.links.length, 1);
  r = N.mesclar(PS, plano(cheio), plano(vazio)).planos["1"].PES300;
  assert.strictEqual(r.titulo, "T");
  assert.strictEqual(r.topicos.length, 1);
});

teste("planos: semana×matéria só de um lado entra", function () {
  var l = { versao: 1, planos: { "1": { PES300: pl("A", "", [], [], null) } } };
  var n = { versao: 1, planos: { "2": { COM230: pl("B", "", [], [], null) } } };
  var r = N.mesclar(PS, l, n);
  assert.strictEqual(r.planos["1"].PES300.titulo, "A");
  assert.strictEqual(r.planos["2"].COM230.titulo, "B");
});

/* =========================================================================
 * mesclar — preferências, desconhecidas, inválidos
 * ========================================================================= */

teste("preferências e chave desconhecida: vence o local", function () {
  assert.deepStrictEqual(N.mesclar(PR, { tema: "claro" }, { tema: "escuro" }), { tema: "claro" });
  assert.deepStrictEqual(N.mesclar("estudos.outra.v9", { a: 1 }, { b: 2 }), { a: 1 });
});

teste("null/inválido de um lado → fica o outro", function () {
  var p = planner(reg(true, false, "x"));
  [PL, FC, PS, PR].forEach(function (k) {
    assert.deepStrictEqual(N.mesclar(k, null, p), p);
    assert.deepStrictEqual(N.mesclar(k, p, null), p);
    assert.deepStrictEqual(N.mesclar(k, undefined, p), p);
    assert.deepStrictEqual(N.mesclar(k, "lixo", p), p);
    assert.deepStrictEqual(N.mesclar(k, p, [1, 2]), p);
  });
});

teste("estrutura interna inválida não quebra (semanas/cartoes/planos ausentes)", function () {
  var r = N.mesclar(PL, { versao: 1 }, planner(reg(true, true, "n")));
  assert.deepStrictEqual(r.semanas["1"].PES300, reg(true, true, "n"));
  r = N.mesclar(FC, { versao: 1, cartoes: "x" }, fc([cartao("a", 0, 0)]));
  assert.deepStrictEqual(ids(r), ["a"]);
  r = N.mesclar(PS, { versao: 1, planos: null }, plano(pl("T", "", [], [], null)));
  assert.strictEqual(r.planos["1"].PES300.titulo, "T");
});

/* =========================================================================
 * Conciliação (tabela do contrato)
 * ========================================================================= */

function sit(o) {
  var base = { temLocal: true, temNuvem: true, nuvemValida: true, revisaoNuvem: 5, revisaoConhecida: 5, pendente: false, iguais: false };
  Object.keys(o).forEach(function (k) { base[k] = o[k]; });
  return N.decidirConciliacao(base);
}

teste("conciliação: revisão igual → nada; se pendente → envia", function () {
  assert.strictEqual(sit({ iguais: true }), "nada");
  assert.strictEqual(sit({ pendente: true }), "enviar");
});

teste("conciliação: nuvem mais nova e sem pendência → baixa", function () {
  assert.strictEqual(sit({ revisaoNuvem: 6 }), "baixar");
});

teste("conciliação: nuvem mais nova e com pendência → mescla", function () {
  assert.strictEqual(sit({ revisaoNuvem: 6, pendente: true }), "mesclar");
});

teste("conciliação: chave só local → envia; só na nuvem → baixa", function () {
  assert.strictEqual(sit({ temNuvem: false, nuvemValida: false, revisaoNuvem: null }), "enviar");
  assert.strictEqual(sit({ temLocal: false }), "baixar");
  assert.strictEqual(sit({ temLocal: false, revisaoConhecida: null }), "baixar");
});

teste("conciliação: casos extras (decisões documentadas no topo do nuvem.js)", function () {
  assert.strictEqual(sit({ revisaoNuvem: 6, iguais: true, pendente: true }), "registrar");
  assert.strictEqual(sit({ revisaoConhecida: null }), "mesclar");      // aparelho nunca viu a chave
  assert.strictEqual(sit({ iguais: false }), "enviar");                 // mesma revisão, local mudou por fora
  assert.strictEqual(sit({ nuvemValida: false }), "enviar");            // nuvem com lixo → local substitui
  assert.strictEqual(sit({ temLocal: false, nuvemValida: false }), "nada");
  assert.strictEqual(sit({ temLocal: false, temNuvem: false }), "nada");
});

teste("planoConciliacao aplica a tabela por chave", function () {
  var locais = {};
  locais[PL] = planner(reg(true, false, "L"));           // pendente, nuvem mais nova → mescla
  locais[FC] = fc([cartao("a", 0, 0)]);                  // sem pendência, nuvem mais nova → baixa
  locais[PR] = { tema: "claro" };                        // só local → envia
  var nuvem = {};
  nuvem[PL] = { valor: planner(reg(false, true, "N")), revisao: 4 };
  nuvem[FC] = { valor: fc([cartao("b", 0, 0)]), revisao: 9 };
  nuvem[PS] = { valor: plano(pl("T", "", [], [], null)), revisao: 2 };  // só nuvem → baixa
  var meta = {};
  meta[PL] = { revisao: 3, pendente: true };
  meta[FC] = { revisao: 8, pendente: false };
  var p = N.planoConciliacao(locais, nuvem, meta);
  assert.deepStrictEqual(p.salvar[PL].semanas["1"].PES300, reg(true, true, "L\n\n— (outro aparelho) —\nN"));
  assert.deepStrictEqual(p.chaves[PL], { revisao: 4, pendente: true });
  assert.deepStrictEqual(p.salvar[FC], nuvem[FC].valor);
  assert.deepStrictEqual(p.chaves[FC], { revisao: 9, pendente: false });
  assert.ok(!(PR in p.salvar));
  assert.deepStrictEqual(p.chaves[PR], { revisao: null, pendente: true });
  assert.deepStrictEqual(p.salvar[PS], nuvem[PS].valor);
  assert.deepStrictEqual(p.chaves[PS], { revisao: 2, pendente: false });
});

teste("planoConciliacao: valor local corrompido conta como ausente (baixa da nuvem)", function () {
  var locais = {}; locais[FC] = null;
  var nuvem = {}; nuvem[FC] = { valor: fc([cartao("a", 0, 0)]), revisao: 1 };
  var meta = {}; meta[FC] = { revisao: 1, pendente: false };
  var p = N.planoConciliacao(locais, nuvem, meta);
  assert.deepStrictEqual(p.salvar[FC], nuvem[FC].valor);
});

/* =========================================================================
 * Primeiro login
 * ========================================================================= */

teste("primeiro login: decisão automática", function () {
  assert.strictEqual(N.decidirPrimeiroLogin([], [PL, FC]), "nuvem");
  assert.strictEqual(N.decidirPrimeiroLogin([PR], [PL]), "nuvem");
  assert.strictEqual(N.decidirPrimeiroLogin([PL], []), "enviar");
  assert.strictEqual(N.decidirPrimeiroLogin([PL], [PR]), "enviar");
  assert.strictEqual(N.decidirPrimeiroLogin([PL], [FC]), "perguntar");
  assert.strictEqual(N.decidirPrimeiroLogin([], []), "nuvem");
});

function cenarioPrimeiro() {
  var locais = {}, nuvem = {};
  locais[PL] = planner(reg(true, false, "L"));
  locais[PR] = { tema: "claro" };                                      // só local
  nuvem[PL] = { valor: planner(reg(false, true, "N")), revisao: 7 };
  nuvem[FC] = { valor: fc([cartao("n", 0, 0)]), revisao: 2 };          // só nuvem
  return { locais: locais, nuvem: nuvem };
}

teste("primeiro login 'enviar': local substitui; só-da-nuvem é apagado da nuvem", function () {
  var c = cenarioPrimeiro();
  var p = N.planoPrimeiroLogin("enviar", c.locais, c.nuvem, true);
  assert.deepStrictEqual(p.salvar, {});
  assert.deepStrictEqual(p.apagarNuvem, [FC]);
  assert.deepStrictEqual(p.chaves[PL], { revisao: 7, pendente: true });
  assert.deepStrictEqual(p.chaves[PR], { revisao: null, pendente: true });
});

teste("primeiro login 'nuvem': nuvem substitui; só-local é removido do aparelho", function () {
  var c = cenarioPrimeiro();
  var p = N.planoPrimeiroLogin("nuvem", c.locais, c.nuvem, true);
  assert.deepStrictEqual(p.salvar[PL], c.nuvem[PL].valor);
  assert.deepStrictEqual(p.salvar[FC], c.nuvem[FC].valor);
  assert.deepStrictEqual(p.remover, [PR]);
  assert.deepStrictEqual(p.chaves[PL], { revisao: 7, pendente: false });
  assert.deepStrictEqual(p.apagarNuvem, []);
});

teste("primeiro login 'juntar': mescla por chave e marca para envio", function () {
  var c = cenarioPrimeiro();
  var p = N.planoPrimeiroLogin("juntar", c.locais, c.nuvem, true);
  assert.deepStrictEqual(p.salvar[PL].semanas["1"].PES300, reg(true, true, "L\n\n— (outro aparelho) —\nN"));
  assert.deepStrictEqual(p.chaves[PL], { revisao: 7, pendente: true });
  assert.deepStrictEqual(p.salvar[FC], c.nuvem[FC].valor);
  assert.deepStrictEqual(p.chaves[FC], { revisao: 2, pendente: false });
  assert.deepStrictEqual(p.chaves[PR], { revisao: null, pendente: true });
  assert.deepStrictEqual(p.remover, []);
  assert.deepStrictEqual(p.apagarNuvem, []);
});

teste("primeiro login automático não apaga nada", function () {
  var c = cenarioPrimeiro();
  var p = N.planoPrimeiroLogin("nuvem", c.locais, c.nuvem, false);
  assert.deepStrictEqual(p.remover, []);
  assert.deepStrictEqual(p.chaves[PR], { revisao: null, pendente: true });
  p = N.planoPrimeiroLogin("enviar", c.locais, c.nuvem, false);
  assert.deepStrictEqual(p.apagarNuvem, []);
  assert.deepStrictEqual(p.salvar[FC], c.nuvem[FC].valor);
});

/* =========================================================================
 * Motor com cliente Supabase falso
 * ========================================================================= */

function criarArmazenamento() {
  var m = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    chaves: function () { return Object.keys(m); },
    _m: m
  };
}

function criarEstudos(arm) {
  return {
    ler: function (k, padrao) { var b = arm.getItem(k); if (b === null) return padrao; try { return JSON.parse(b); } catch (e) { return padrao; } },
    salvarSemEvento: function (k, v) { arm.setItem(k, JSON.stringify(v)); return true; },
    chavesLocais: function () { return arm.chaves().filter(function (k) { return k.indexOf("estudos.") === 0; }); }
  };
}

/* Banco falso: tabela estudos_dados com o mesmo comportamento do gatilho (revisao). */
function criarBanco() {
  var banco = { linhas: [], falharRede: false, erro: null, antes: null, ops: [] };
  function casa(linha, filtros) {
    return filtros.every(function (f) { return linha[f[0]] === f[1]; });
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  banco.executar = function (q) {
    banco.ops.push(q.op);
    if (banco.antes) banco.antes(q);
    if (banco.falharRede) return { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
    if (banco.erro) return { data: null, error: banco.erro, status: 403 };
    var achadas = banco.linhas.filter(function (l) { return casa(l, q.filtros); });
    if (q.op === "select") return { data: clone(achadas), error: null, status: 200 };
    if (q.op === "insert") {
      var ja = banco.linhas.some(function (l) { return l.user_id === q.dados.user_id && l.chave === q.dados.chave; });
      if (ja) return { data: null, error: { code: "23505", message: "duplicate key value" }, status: 409 };
      var nova = { user_id: q.dados.user_id, chave: q.dados.chave, valor: clone(q.dados.valor), revisao: 1, dispositivo: q.dados.dispositivo };
      banco.linhas.push(nova);
      return { data: q.retornar ? [clone(nova)] : null, error: null, status: 201 };
    }
    if (q.op === "update") {
      achadas.forEach(function (l) { l.valor = clone(q.dados.valor); l.dispositivo = q.dados.dispositivo; l.revisao += 1; });
      return { data: q.retornar ? clone(achadas) : null, error: null, status: 200 };
    }
    if (q.op === "delete") {
      banco.linhas = banco.linhas.filter(function (l) { return achadas.indexOf(l) === -1; });
      return { data: null, error: null, status: 204 };
    }
    throw new Error("op desconhecida");
  };
  banco.linha = function (u, k) { return banco.linhas.filter(function (l) { return l.user_id === u && l.chave === k; })[0]; };
  banco.cliente = {
    from: function () {
      var q = { op: "select", filtros: [], dados: null, retornar: false };
      var b = {
        select: function () { if (q.op !== "select") q.retornar = true; return b; },
        insert: function (d) { q.op = "insert"; q.dados = d; return b; },
        update: function (d) { q.op = "update"; q.dados = d; return b; },
        delete: function () { q.op = "delete"; return b; },
        eq: function (c, v) { q.filtros.push([c, v]); return b; },
        then: function (ok, falha) {
          return Promise.resolve().then(function () { return banco.executar(q); }).then(ok, falha);
        }
      };
      return b;
    },
    auth: {
      onAuthStateChange: function (cb) { banco.cbAuth = cb; return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { return Promise.resolve({ error: null }); }
    }
  };
  return banco;
}

var timersTeste = {
  setTimeout: function (f, ms) { return setTimeout(f, ms); },
  clearTimeout: function (id) { clearTimeout(id); },
  setInterval: function () { return 1; },   // sem intervalo nos testes
  clearInterval: function () {}
};

function criarMotor(opts) {
  opts = opts || {};
  var arm = opts.arm || criarArmazenamento();
  var sessao = opts.sessao || criarArmazenamento();
  var banco = opts.banco || criarBanco();
  var eventos = [];
  var recargas = { n: 0 };
  var motor = N.criarNuvem({
    Estudos: criarEstudos(arm),
    armazenamento: arm,
    sessao: sessao,
    config: { supabaseUrl: "https://x.supabase.co", supabaseChave: "pub", siteUrl: "https://site/" },
    carregarSdk: opts.carregarSdk || function () { return Promise.resolve({ createClient: function () { return banco.cliente; } }); },
    emitir: function (nome) { eventos.push(nome); },
    recarregar: function () { recargas.n++; },
    urlRetorno: function () { return "https://site/"; },
    online: function () { return true; },
    timers: timersTeste,
    debounceMs: 0
  });
  return { motor: motor, arm: arm, sessao: sessao, banco: banco, eventos: eventos, recargas: recargas };
}

function gravar(arm, k, v) { arm.setItem(k, JSON.stringify(v)); }
function ler(arm, k) { return JSON.parse(arm.getItem(k)); }
function meta(arm) { return JSON.parse(arm.getItem("estudos-sync.meta.v1")); }
function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms || 5); }); }

/* Liga o motor e loga o usuário u1; espera a sincronização inicial. */
function logar(ctx, uid) {
  return ctx.motor.iniciar().then(function () {
    ctx.motor._interno.tratarAuth("INITIAL_SESSION", { user: { id: uid || "u1", email: "a@b.c" } });
    return ctx.motor._interno.ocioso();
  });
}

function prepararSincronizado(ctx, valorFc, rev) {
  gravar(ctx.arm, FC, valorFc);
  ctx.banco.linhas.push({ user_id: "u1", chave: FC, valor: JSON.parse(JSON.stringify(valorFc)), revisao: rev, dispositivo: "x" });
  var m = { usuario: "u1", dispositivo: "este", chaves: {} };
  m.chaves[FC] = { revisao: rev, pendente: false };
  gravar(ctx.arm, "estudos-sync.meta.v1", m);
}

teste("motor: require em node sem window não lança e estado inicial é desligado", function () {
  assert.strictEqual(typeof globalThis.window, "undefined");
  var ctx = criarMotor();
  var e = ctx.motor.api.estado();
  assert.strictEqual(e.disponivel, false);
  assert.strictEqual(e.logado, false);
  assert.strictEqual(e.status, "desligado");
});

teste("motor: falha ao carregar supabase-js → disponivel=false, status offline", function () {
  var ctx = criarMotor({ carregarSdk: function () { return Promise.reject(new Error("rede")); } });
  return ctx.motor.iniciar().then(function () {
    var e = ctx.motor.api.estado();
    assert.strictEqual(e.disponivel, false);
    assert.strictEqual(e.status, "offline");
    assert.ok(/aparelho/.test(e.erro));
    return ctx.motor.api.entrar("a@b.c", "123456").then(function () { assert.fail("devia falhar"); }, function (err) {
      assert.ok(err instanceof Error);
      assert.ok(/nuvem/.test(err.message));
    });
  });
});

teste("envio: conflito (update com 0 linhas) → baixa, mescla, salva local e reenvia", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  return logar(ctx).then(function () {
    assert.strictEqual(ctx.motor.api.estado().status, "salvo");
    assert.strictEqual(ctx.recargas.n, 0);
    // Outro aparelho grava a revisão 2 com o cartão b.
    var l = ctx.banco.linha("u1", FC);
    l.valor = fc([cartao("a", 0, 0), cartao("b", 0, 0)]);
    l.revisao = 2;
    // Este aparelho adiciona o cartão c.
    gravar(ctx.arm, FC, fc([cartao("a", 0, 0), cartao("c", 0, 0)]));
    ctx.motor.aoSalvar(FC);
    assert.strictEqual(ctx.motor.api.estado().pendentes, 1);
    return esperar(10).then(ctx.motor._interno.ocioso);
  }).then(function () {
    var l = ctx.banco.linha("u1", FC);
    assert.deepStrictEqual(ids(l.valor).sort(), ["a", "b", "c"]);
    assert.strictEqual(l.revisao, 3);
    assert.deepStrictEqual(ids(ler(ctx.arm, FC)).sort(), ["a", "b", "c"]);
    assert.deepStrictEqual(meta(ctx.arm).chaves[FC], { revisao: 3, pendente: false });
    assert.ok(ctx.eventos.indexOf("estudos:nuvem-atualizada") !== -1);
    assert.strictEqual(ctx.motor.api.estado().status, "salvo");
    assert.strictEqual(ctx.motor.api.estado().pendentes, 0);
  });
});

teste("envio: insert com 23505 (outro aparelho criou a chave antes) → conflito tratado", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  return logar(ctx).then(function () {
    gravar(ctx.arm, PR, { tema: "claro" });
    ctx.banco.antes = function (q) {
      if (q.op === "insert" && q.dados.chave === PR && !ctx.banco.linha("u1", PR)) {
        ctx.banco.linhas.push({ user_id: "u1", chave: PR, valor: { tema: "escuro" }, revisao: 1 });
      }
    };
    ctx.motor.aoSalvar(PR);
    return esperar(10).then(ctx.motor._interno.ocioso);
  }).then(function () {
    var l = ctx.banco.linha("u1", PR);
    assert.deepStrictEqual(l.valor, { tema: "claro" }); // preferências: vence o local
    assert.strictEqual(l.revisao, 2);
    assert.deepStrictEqual(meta(ctx.arm).chaves[PR], { revisao: 2, pendente: false });
  });
});

teste("envio: conflito repetido mais de 3 vezes → status erro, pendência mantida", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  return logar(ctx).then(function () {
    var n = 0;
    ctx.banco.antes = function (q) {
      if (q.op === "update") { // outro aparelho sempre grava logo antes
        var l = ctx.banco.linha("u1", FC);
        l.revisao += 1;
        l.valor = fc([cartao("o" + (n++), 0, 0)]);
      }
    };
    gravar(ctx.arm, FC, fc([cartao("a", 0, 0), cartao("c", 0, 0)]));
    ctx.motor.aoSalvar(FC);
    return esperar(10).then(ctx.motor._interno.ocioso);
  }).then(function () {
    var e = ctx.motor.api.estado();
    assert.strictEqual(e.status, "erro");
    assert.ok(/outro aparelho/.test(e.erro));
    assert.strictEqual(e.pendentes, 1);
  });
});

teste("envio: erro de rede → offline, pendência mantida; volta no evento online", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  return logar(ctx).then(function () {
    ctx.banco.falharRede = true;
    gravar(ctx.arm, FC, fc([cartao("a", 1, 0)]));
    ctx.motor.aoSalvar(FC);
    return esperar(10).then(ctx.motor._interno.ocioso);
  }).then(function () {
    var e = ctx.motor.api.estado();
    assert.strictEqual(e.status, "offline");
    assert.strictEqual(e.pendentes, 1);
    assert.strictEqual(meta(ctx.arm).chaves[FC].pendente, true);
    assert.strictEqual(ctx.banco.linha("u1", FC).revisao, 1);
    ctx.banco.falharRede = false;
    ctx.motor.aoFicarOnline();
    return ctx.motor._interno.ocioso();
  }).then(function () {
    var e = ctx.motor.api.estado();
    assert.strictEqual(e.status, "salvo");
    assert.strictEqual(e.pendentes, 0);
    assert.strictEqual(ctx.banco.linha("u1", FC).revisao, 2);
    assert.strictEqual(ctx.banco.linha("u1", FC).valor.cartoes[0].acertos, 1);
  });
});

teste("envio: erro que não é de rede (RLS) → status erro com mensagem em português", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  return logar(ctx).then(function () {
    ctx.banco.erro = { code: "42501", message: "new row violates row-level security policy" };
    ctx.motor.aoSalvar(FC);
    return esperar(10).then(ctx.motor._interno.ocioso);
  }).then(function () {
    var e = ctx.motor.api.estado();
    assert.strictEqual(e.status, "erro");
    assert.ok(/permissão/.test(e.erro));
    assert.strictEqual(e.pendentes, 1);
  });
});

teste("abertura: nuvem mais nova → aplica com salvarSemEvento e recarrega uma vez só", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  var l = ctx.banco.linha("u1", FC);
  l.valor = fc([cartao("a", 0, 0), cartao("b", 0, 0)]);
  l.revisao = 2;
  return logar(ctx).then(function () {
    assert.strictEqual(ctx.recargas.n, 1);
    assert.deepStrictEqual(ids(ler(ctx.arm, FC)), ["a", "b"]);
    assert.strictEqual(meta(ctx.arm).chaves[FC].revisao, 2);
    // "Recarregou" e a nuvem mudou de novo: não recarrega outra vez, dispara o evento.
    var l2 = ctx.banco.linha("u1", FC);
    l2.valor = fc([cartao("a", 0, 0), cartao("b", 0, 0), cartao("c", 0, 0)]);
    l2.revisao = 3;
    var ctx2 = criarMotor({ arm: ctx.arm, sessao: ctx.sessao, banco: ctx.banco });
    return logar(ctx2).then(function () {
      assert.strictEqual(ctx2.recargas.n, 0);
      assert.ok(ctx2.eventos.indexOf("estudos:nuvem-atualizada") !== -1);
      // Abertura sem mudanças limpa a trava.
      var ctx3 = criarMotor({ arm: ctx.arm, sessao: ctx.sessao, banco: ctx.banco });
      return logar(ctx3).then(function () {
        assert.strictEqual(ctx3.recargas.n, 0);
        assert.strictEqual(ctx.sessao.getItem("estudos-sync.recarregado"), null);
      });
    });
  });
});

teste("abertura: nuvem com valor inválido não é aplicada", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  var l = ctx.banco.linha("u1", FC);
  l.valor = [1, 2, 3];
  l.revisao = 2;
  return logar(ctx).then(function () {
    assert.deepStrictEqual(ids(ler(ctx.arm, FC)), ["a"]);
    assert.strictEqual(ctx.recargas.n, 0);
    assert.deepStrictEqual(ctx.banco.linha("u1", FC).valor, fc([cartao("a", 0, 0)])); // local substituiu o lixo
  });
});

teste("primeiro login: pergunta recebe as chaves; 'enviar' apaga só-da-nuvem", function () {
  var ctx = criarMotor();
  gravar(ctx.arm, PL, planner(reg(true, false, "L")));
  ctx.banco.linhas.push({ user_id: "u1", chave: FC, valor: fc([cartao("n", 0, 0)]), revisao: 4 });
  var recebido = null;
  ctx.motor.api.definirPerguntaPrimeiroLogin(function (info) { recebido = info; return Promise.resolve("enviar"); });
  return logar(ctx).then(function () {
    assert.deepStrictEqual(recebido, { chavesLocais: [PL], chavesNuvem: [FC] });
    assert.strictEqual(ctx.banco.linha("u1", FC), undefined);
    assert.deepStrictEqual(ctx.banco.linha("u1", PL).valor, planner(reg(true, false, "L")));
    assert.strictEqual(meta(ctx.arm).usuario, "u1");
    assert.strictEqual(ctx.motor.api.estado().status, "salvo");
  });
});

teste("primeiro login: 'nuvem' remove só-locais; cancelar não sincroniza", function () {
  var ctx = criarMotor();
  gravar(ctx.arm, PL, planner(reg(true, false, "L")));
  ctx.banco.linhas.push({ user_id: "u1", chave: FC, valor: fc([cartao("n", 0, 0)]), revisao: 4 });
  ctx.motor.api.definirPerguntaPrimeiroLogin(function () { return Promise.resolve(null); });
  return logar(ctx).then(function () {
    var e = ctx.motor.api.estado();
    assert.strictEqual(e.status, "offline");
    assert.strictEqual(e.logado, true);
    assert.strictEqual(meta(ctx.arm).usuario, null);
    assert.strictEqual(ctx.banco.linhas.length, 1);
    assert.ok(ctx.arm.getItem(PL) !== null);
    // sincronizarAgora pergunta de novo
    ctx.motor.api.definirPerguntaPrimeiroLogin(function () { return Promise.resolve("nuvem"); });
    return ctx.motor.api.sincronizarAgora();
  }).then(function (e) {
    assert.strictEqual(e.status, "salvo");
    assert.strictEqual(ctx.arm.getItem(PL), null);
    assert.deepStrictEqual(ids(ler(ctx.arm, FC)), ["n"]);
    assert.strictEqual(meta(ctx.arm).usuario, "u1");
    assert.strictEqual(ctx.banco.linhas.length, 1);
  });
});

teste("primeiro login: local sem dados relevantes → usa a nuvem sem perguntar", function () {
  var ctx = criarMotor();
  gravar(ctx.arm, PR, { tema: "claro" });
  ctx.banco.linhas.push({ user_id: "u1", chave: FC, valor: fc([cartao("n", 0, 0)]), revisao: 4 });
  var perguntou = false;
  ctx.motor.api.definirPerguntaPrimeiroLogin(function () { perguntou = true; return Promise.resolve(null); });
  return logar(ctx).then(function () {
    assert.strictEqual(perguntou, false);
    assert.deepStrictEqual(ids(ler(ctx.arm, FC)), ["n"]);
    assert.strictEqual(ctx.recargas.n, 1); // dados mudaram → recarrega antes de enviar
    assert.strictEqual(meta(ctx.arm).chaves[PR].pendente, true);
    // Depois da recarga, a chave só-local é enviada.
    var ctx2 = criarMotor({ arm: ctx.arm, sessao: ctx.sessao, banco: ctx.banco });
    return logar(ctx2);
  }).then(function () {
    assert.deepStrictEqual(ctx.banco.linha("u1", PR).valor, { tema: "claro" });
    assert.strictEqual(meta(ctx.arm).chaves[PR].pendente, false);
  });
});

teste("sair: mantém dados locais e meta.usuario; status desligado", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  return logar(ctx).then(function () {
    return ctx.motor.api.sair();
  }).then(function (e) {
    assert.strictEqual(e.logado, false);
    assert.strictEqual(e.status, "desligado");
    assert.strictEqual(meta(ctx.arm).usuario, "u1");
    assert.deepStrictEqual(ids(ler(ctx.arm, FC)), ["a"]);
  });
});

teste("edição deslogado fica pendente e é enviada quando o mesmo usuário entra", function () {
  var ctx = criarMotor();
  prepararSincronizado(ctx, fc([cartao("a", 0, 0)]), 1);
  gravar(ctx.arm, FC, fc([cartao("a", 0, 0), cartao("off", 0, 0)]));
  ctx.motor.aoSalvar(FC);
  assert.strictEqual(ctx.motor.api.estado().pendentes, 1);
  return logar(ctx).then(function () {
    assert.deepStrictEqual(ids(ctx.banco.linha("u1", FC).valor), ["a", "off"]);
    assert.strictEqual(ctx.motor.api.estado().pendentes, 0);
    assert.strictEqual(ctx.recargas.n, 0);
  });
});

teste("PASSWORD_RECOVERY dispara estudos:recuperar-senha", function () {
  var ctx = criarMotor();
  ctx.motor._interno.tratarAuth("PASSWORD_RECOVERY", { user: { id: "u1", email: "a@b.c" } });
  assert.ok(ctx.eventos.indexOf("estudos:recuperar-senha") !== -1);
  return ctx.motor._interno.ocioso();
});

teste("aoMudar avisa mudanças e pode ser cancelado", function () {
  var ctx = criarMotor();
  var vistos = [];
  var cancelar = ctx.motor.api.aoMudar(function (e) { vistos.push(e.status); });
  ctx.motor.aoSalvar(FC); // muda pendentes
  assert.strictEqual(vistos.length, 1);
  cancelar();
  ctx.motor.aoSalvar(PL);
  assert.strictEqual(vistos.length, 1);
  ctx.motor.aoSalvar("outra-coisa"); // ignorada (não é estudos.*)
  assert.strictEqual(ctx.motor.api.estado().pendentes, 2);
});

/* ========================================================================= */

var falhas = 0;
(function rodar(i) {
  if (i >= testes.length) {
    console.log("\n" + (testes.length - falhas) + "/" + testes.length + " testes passaram.");
    process.exitCode = falhas ? 1 : 0;
    return;
  }
  var t = testes[i];
  Promise.resolve().then(t.fn).then(function () {
    console.log("ok   - " + t.nome);
  }, function (e) {
    falhas++;
    console.log("FALHA - " + t.nome + "\n       " + (e && e.stack || e));
  }).then(function () { rodar(i + 1); });
})(0);
