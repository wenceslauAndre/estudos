/*
 * importacao.js — Worker F. Define Estudos.importarConteudo(obj).
 * Importação de conteúdo (planos de estudo + flashcards) que SÓ ADICIONA dados:
 * nada do que já existe é apagado ou sobrescrito. Ver CONTRATO.md e FORMATO-IMPORTACAO.md.
 * Não depende de flashcards.js / estudar.js estarem carregados.
 */
(function () {
  "use strict";

  var FORMATO = "estudos-univesp-conteudo";
  var VERSAO = 1;

  function estudos() {
    var raiz = typeof window !== "undefined" ? window : null;
    if (!raiz || !raiz.Estudos) throw new Error("O módulo comum (js/comum.js) não foi carregado.");
    return raiz.Estudos;
  }

  function ehObjeto(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function aparar(v) {
    return typeof v === "string" ? v.trim() : "";
  }

  /* Chave de comparação: sem maiúsculas/minúsculas e com espaços colapsados. */
  function chaveTexto(v) {
    return aparar(v).toLowerCase().replace(/\s+/g, " ");
  }

  function descrever(v) {
    var s = aparar(v);
    return s.length > 40 ? s.slice(0, 40) + "…" : s;
  }

  /* Valida semana e matéria de um item. Devolve { semana, materia } ou { erro }. */
  function lerChave(E, item) {
    var codigo = typeof item.materia === "string" ? item.materia.trim().toUpperCase() : "";
    if (!codigo) return { erro: "matéria ausente — ignorado" };
    if (!E.materiaPorCodigo(codigo)) return { erro: 'matéria "' + descrever(item.materia) + '" desconhecida — ignorado' };
    var bruta = item.semana;
    var semana = (typeof bruta === "number" || (typeof bruta === "string" && bruta.trim() !== "")) ? E.semanaValida(bruta) : null;
    if (!semana) return { erro: "semana " + (bruta === undefined ? "ausente" : '"' + descrever(String(bruta)) + '"') + " fora do intervalo 1–" + E.SEMANAS.length + " — ignorado" };
    return { semana: semana, materia: codigo };
  }

  function validarEstrutura(obj) {
    if (!ehObjeto(obj)) {
      throw new Error("O arquivo não é um JSON de conteúdo válido (esperado um objeto com \"formato\", \"planos\" e/ou \"flashcards\").");
    }
    if (obj.app === "estudos-univesp") {
      throw new Error("Este arquivo é um backup, não um arquivo de conteúdo. Use o botão \"Importar backup\" para restaurá-lo.");
    }
    if (obj.formato !== FORMATO) {
      throw new Error("Formato não reconhecido: o campo \"formato\" deve ser \"" + FORMATO + "\". Veja FORMATO-IMPORTACAO.md.");
    }
    if (obj.versao !== undefined && obj.versao !== VERSAO) {
      throw new Error("Versão do formato não suportada (" + descrever(String(obj.versao)) + "). Este app entende a versão " + VERSAO + ".");
    }
    ["planos", "flashcards"].forEach(function (campo) {
      if (obj[campo] !== undefined && obj[campo] !== null && !Array.isArray(obj[campo])) {
        throw new Error("O campo \"" + campo + "\" deve ser uma lista (array).");
      }
    });
    var np = Array.isArray(obj.planos) ? obj.planos.length : 0;
    var nf = Array.isArray(obj.flashcards) ? obj.flashcards.length : 0;
    if (np + nf === 0) {
      throw new Error("O arquivo não contém planos nem flashcards para importar.");
    }
  }

  /* ---------- Planos ---------- */

  function planoEstavaVazio(p) {
    return !p.titulo.trim() && !p.resumo.trim() && p.topicos.length === 0 && p.links.length === 0;
  }

  function importarPlanos(E, lista, resultado) {
    var dados = E.lerPlanos();
    var tocados = {}; // "semana|materia" -> { plano, vazio, mudou }
    var algumMudou = false;

    lista.forEach(function (item, i) {
      var rotulo = "planos[" + i + "]";
      if (!ehObjeto(item)) {
        resultado.ignorados++;
        resultado.avisos.push(rotulo + ": item não é um objeto — ignorado");
        return;
      }
      var chave = lerChave(E, item);
      if (chave.erro) {
        resultado.ignorados++;
        resultado.avisos.push(rotulo + ": " + chave.erro);
        return;
      }

      var titulo = "";
      if (item.titulo !== undefined && item.titulo !== null) {
        if (typeof item.titulo === "string") titulo = item.titulo.trim();
        else resultado.avisos.push(rotulo + ": \"titulo\" deve ser texto — campo ignorado");
      }
      var resumo = "";
      if (item.resumo !== undefined && item.resumo !== null) {
        if (typeof item.resumo === "string") resumo = item.resumo.trim();
        else resultado.avisos.push(rotulo + ": \"resumo\" deve ser texto — campo ignorado");
      }

      var topicos = [];
      if (item.topicos !== undefined && item.topicos !== null) {
        if (!Array.isArray(item.topicos)) {
          resultado.avisos.push(rotulo + ": \"topicos\" deve ser uma lista — campo ignorado");
        } else {
          item.topicos.forEach(function (t, j) {
            var txt = typeof t === "string" ? t.trim() : (ehObjeto(t) ? aparar(t.texto) : "");
            if (txt) topicos.push(txt);
            else resultado.avisos.push(rotulo + ".topicos[" + j + "]: tópico vazio ou inválido — ignorado");
          });
        }
      }

      var links = [];
      if (item.links !== undefined && item.links !== null) {
        if (!Array.isArray(item.links)) {
          resultado.avisos.push(rotulo + ": \"links\" deve ser uma lista — campo ignorado");
        } else {
          item.links.forEach(function (l, j) {
            var url = E.urlSegura(typeof l === "string" ? l : (ehObjeto(l) ? l.url : ""));
            if (!url) {
              resultado.avisos.push(rotulo + ".links[" + j + "]: URL inválida (só http:// ou https:// são aceitos) — ignorado");
              return;
            }
            links.push({ titulo: ehObjeto(l) ? aparar(l.titulo) : "", url: url });
          });
        }
      }

      if (!titulo && !resumo && topicos.length === 0 && links.length === 0) {
        resultado.ignorados++;
        resultado.avisos.push(rotulo + ": plano sem título, resumo, tópicos nem links válidos — ignorado");
        return;
      }

      var id = chave.semana + "|" + chave.materia;
      var plano = dados.planos[String(chave.semana)][chave.materia];
      if (!tocados[id]) tocados[id] = { plano: plano, vazio: planoEstavaVazio(plano), mudou: false };
      var t = tocados[id];

      if (titulo && !plano.titulo.trim()) {
        plano.titulo = titulo;
        t.mudou = true;
      }

      if (resumo) {
        if (!plano.resumo.trim()) {
          plano.resumo = resumo;
          t.mudou = true;
        } else if (plano.resumo.indexOf(resumo) === -1) {
          plano.resumo = plano.resumo.replace(/\s+$/, "") + "\n\n" + resumo;
          t.mudou = true;
        }
      }

      var textos = {};
      plano.topicos.forEach(function (tp) { textos[chaveTexto(tp.texto)] = true; });
      topicos.forEach(function (txt) {
        var k = chaveTexto(txt);
        if (textos[k]) return;
        textos[k] = true;
        plano.topicos.push({ id: E.gerarId(), texto: txt, feito: false });
        t.mudou = true;
      });

      var urls = {};
      plano.links.forEach(function (l) { urls[l.url.toLowerCase()] = true; });
      links.forEach(function (l) {
        var k = l.url.toLowerCase();
        if (urls[k]) return;
        urls[k] = true;
        plano.links.push({ id: E.gerarId(), titulo: l.titulo || l.url, url: l.url });
        t.mudou = true;
      });
    });

    var agora = new Date().toISOString();
    Object.keys(tocados).forEach(function (id) {
      var t = tocados[id];
      if (!t.mudou) return;
      t.plano.atualizadoEm = agora;
      algumMudou = true;
      if (t.vazio) resultado.planos.criados++;
      else resultado.planos.atualizados++;
    });

    if (algumMudou && !E.salvarPlanos(dados)) {
      throw new Error("Não foi possível salvar os planos (armazenamento do navegador cheio ou bloqueado). Nada foi alterado nos flashcards.");
    }
  }

  /* ---------- Flashcards ---------- */

  /* Leitura tolerante: preserva cartões, historicoQuiz e quaisquer campos existentes. */
  function lerFlashcards(E) {
    var bruto = E.ler(E.CHAVES.flashcards, null);
    var dados;
    if (Array.isArray(bruto)) dados = { versao: 1, cartoes: bruto };
    else if (ehObjeto(bruto)) dados = bruto;
    else dados = { versao: 1 };
    if (!Array.isArray(dados.cartoes)) dados.cartoes = [];
    if (!Array.isArray(dados.historicoQuiz)) dados.historicoQuiz = [];
    if (dados.versao === undefined) dados.versao = 1;
    return dados;
  }

  function importarFlashcards(E, lista, resultado) {
    var dados = lerFlashcards(E);
    var existentes = {};
    var ids = {};
    dados.cartoes.forEach(function (c) {
      if (!ehObjeto(c)) return;
      if (typeof c.id === "string") ids[c.id] = true;
      existentes[c.materia + "|" + Number(c.semana) + "|" + chaveTexto(c.frente)] = true;
    });

    var agora = new Date().toISOString();
    var novos = 0;

    lista.forEach(function (item, i) {
      var rotulo = "flashcards[" + i + "]";
      if (!ehObjeto(item)) {
        resultado.ignorados++;
        resultado.avisos.push(rotulo + ": item não é um objeto — ignorado");
        return;
      }
      var chave = lerChave(E, item);
      if (chave.erro) {
        resultado.ignorados++;
        resultado.avisos.push(rotulo + ": " + chave.erro);
        return;
      }
      var frente = aparar(item.frente);
      var verso = aparar(item.verso);
      if (!frente || !verso) {
        resultado.ignorados++;
        resultado.avisos.push(rotulo + ": " + (!frente ? "\"frente\"" : "\"verso\"") + " vazio ou ausente — ignorado");
        return;
      }

      var dedup = chave.materia + "|" + chave.semana + "|" + chaveTexto(frente);
      if (existentes[dedup]) {
        resultado.flashcards.duplicados++;
        return;
      }
      existentes[dedup] = true;

      var cartao = {
        id: "",
        materia: chave.materia,
        semana: chave.semana,
        frente: frente,
        verso: verso
      };

      if (item.alternativas !== undefined && item.alternativas !== null && !(Array.isArray(item.alternativas) && item.alternativas.length === 0)) {
        var alts = E.normalizarAlternativas(item.alternativas);
        if (alts.length) cartao.alternativas = alts;
        else resultado.avisos.push(rotulo + ": alternativas inválidas (use 2 a " + E.MAX_ALTERNATIVAS + " textos distintos com exatamente 1 correta) — cartão importado sem alternativas");
      }

      if (item.explicacao !== undefined && item.explicacao !== null) {
        if (typeof item.explicacao !== "string") {
          resultado.avisos.push(rotulo + ": \"explicacao\" deve ser texto — campo ignorado");
        } else if (item.explicacao.trim()) {
          cartao.explicacao = item.explicacao.trim();
        }
      }

      var id;
      do { id = E.gerarId(); } while (ids[id]);
      ids[id] = true;
      cartao.id = id;
      cartao.acertos = 0;
      cartao.erros = 0;
      cartao.criadoEm = agora;
      cartao.ultimaRevisao = null;

      dados.cartoes.push(cartao);
      novos++;
    });

    resultado.flashcards.adicionados = novos;
    if (novos > 0 && !E.salvar(E.CHAVES.flashcards, dados)) {
      resultado.flashcards.adicionados = 0;
      throw new Error("Não foi possível salvar os flashcards (armazenamento do navegador cheio ou bloqueado).");
    }
  }

  /*
   * Importa conteúdo (ver CONTRATO.md). Só adiciona; nunca apaga nem sobrescreve.
   * Lança Error (mensagem em português) para arquivos inválidos.
   * Retorna { planos: { criados, atualizados }, flashcards: { adicionados, duplicados }, ignorados, avisos }.
   */
  function importarConteudo(obj) {
    var E = estudos();
    validarEstrutura(obj);

    var resultado = {
      planos: { criados: 0, atualizados: 0 },
      flashcards: { adicionados: 0, duplicados: 0 },
      ignorados: 0,
      avisos: []
    };

    if (Array.isArray(obj.planos) && obj.planos.length) importarPlanos(E, obj.planos, resultado);
    if (Array.isArray(obj.flashcards) && obj.flashcards.length) importarFlashcards(E, obj.flashcards, resultado);
    return resultado;
  }

  if (typeof window !== "undefined" && window.Estudos) window.Estudos.importarConteudo = importarConteudo;
  if (typeof module === "object" && module.exports) module.exports = { importarConteudo: importarConteudo };
})();
