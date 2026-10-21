/*
 * nuvem.js — sincronização do localStorage (chaves "estudos.*") com o Supabase.
 * Define window.Estudos.nuvem (API no CONTRATO.md, seção "Sincronização com a nuvem").
 *
 * Organização do arquivo:
 *   1. Lógica pura (sem navegador, testada em node): mesclar, decidirConciliacao,
 *      decidirPrimeiroLogin, planoConciliacao, planoPrimeiroLogin.
 *   2. criarNuvem(ambiente): o motor de sincronização (I/O). Recebe tudo o que
 *      usa do navegador (localStorage, supabase-js, eventos, timers) por parâmetro,
 *      para poder ser testado em node com um cliente Supabase falso.
 *   3. Inicialização no navegador (só roda se existir window/document).
 *
 * Decisões tomadas onde o contrato não detalha:
 *   - Estado inicial (antes do supabase-js carregar): disponivel=false,
 *     status "desligado", carregando=true. Se o carregamento falhar: status "offline".
 *     Tenta carregar de novo no evento "online" ou quando o usuário pede (entrar etc.).
 *   - estado() traz também `erro` (mensagem, em "erro" e "offline") e `carregando`.
 *   - aoMudar(fn) só chama fn quando o estado muda (não chama na hora do registro).
 *   - Edições feitas deslogado também ficam marcadas como pendentes no meta; se o
 *     mesmo usuário entrar de novo, elas são enviadas (com mesclagem se preciso).
 *   - Conciliação, casos que a tabela não cobre:
 *       * revisão igual, sem pendência, mas local diferente da nuvem → envia
 *         (o local mudou sem passar pelo evento; a nuvem não mudou, então o local é o mais novo);
 *       * revisão desconhecida (aparelho nunca viu a chave) e os dois lados com
 *         dados diferentes → mescla (na dúvida, junta);
 *       * local e nuvem iguais → só registra a revisão e limpa a pendência;
 *       * valor da nuvem que não é objeto → ignorado (se houver local, o local o substitui).
 *   - Primeiro login: "sem dados relevantes" vale para os dois lados (só a chave de
 *     preferências não conta). Nos casos automáticos nada é apagado:
 *       * local vazio → aplica a nuvem e envia as chaves que só existem no aparelho;
 *       * nuvem vazia → envia o local e baixa as chaves que só existem na nuvem.
 *     Apagar chaves só acontece nas escolhas explícitas "enviar"/"nuvem" da pergunta.
 *   - Se o usuário cancelar a pergunta, nada sincroniza nesta abertura (status
 *     "offline", erro explicando). sincronizarAgora() pergunta de novo.
 *   - Recarregar uma vez: vale para a abertura e para o login feito com a página aberta
 *     (os scripts das páginas guardam os dados em memória e regravariam a versão velha).
 *     A trava "estudos-sync.recarregado" (sessionStorage) é limpa quando uma
 *     sincronização inicial termina sem mudar nada. Com a trava ativa, dispara
 *     "estudos:nuvem-atualizada" em vez de recarregar.
 *   - Download no foco, novas tentativas e conflitos no envio: nunca recarregam;
 *     se mudaram dados locais, disparam "estudos:nuvem-atualizada".
 *   - Chave apagada do aparelho com pendência: a pendência é descartada
 *     (apagar não é propagado para a nuvem, exceto na escolha "enviar" do primeiro login).
 *   - sair(): tenta enviar pendências por até 5 s e faz signOut({ scope: "local" })
 *     (só este aparelho sai; os outros continuam logados).
 *   - Status de download (abertura/foco) não mostra "Salvando...".
 *   - Erros 502/503/504 e status 0 contam como "sem rede" (tenta de novo depois).
 */
(function () {
  "use strict";

  var PREFIXO = "estudos.";
  var CHAVE_META = "estudos-sync.meta.v1";
  var CHAVE_TRAVA = "estudos-sync.recarregado";
  var TABELA = "estudos_dados";
  var SEPARADOR = "\n\n— (outro aparelho) —\n";
  var K_PLANNER = "estudos.planner.v1";
  var K_FLASHCARDS = "estudos.flashcards.v1";
  var K_PLANOS = "estudos.planos.v1";
  var K_PREFERENCIAS = "estudos.preferencias.v1";

  var DEBOUNCE_MS = 1500;
  var INTERVALO_MS = 30000;
  var FOCO_MIN_MS = 30000;
  var MAX_CONFLITOS = 3;
  var TEMPO_SDK_MS = 20000;
  var TEMPO_SAIR_MS = 5000;

  /* =====================================================================
   * 1. LÓGICA PURA
   * ===================================================================== */

  function temPropria(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function ehObjeto(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function ehChaveEstudos(k) { return typeof k === "string" && k.indexOf(PREFIXO) === 0; }
  function clonar(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function textoDe(v) { return typeof v === "string" ? v : ""; }
  function vazio(v) { return textoDe(v).trim() === ""; }

  function estender(destino, origem) {
    Object.keys(origem).forEach(function (k) { destino[k] = origem[k]; });
    return destino;
  }

  /* Comparação profunda; ordem das chaves de objeto não importa (o jsonb reordena). */
  function iguais(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var i;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) if (!iguais(a[i], b[i])) return false;
      return true;
    }
    var ka = Object.keys(a).filter(function (k) { return a[k] !== undefined; });
    var kb = Object.keys(b).filter(function (k) { return b[k] !== undefined; });
    if (ka.length !== kb.length) return false;
    for (i = 0; i < ka.length; i++) {
      if (!temPropria(b, ka[i]) || !iguais(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }

  function tempo(iso) {
    var t = typeof iso === "string" ? Date.parse(iso) : NaN;
    return isNaN(t) ? -Infinity : t;
  }

  function numero(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function idDe(item) {
    if (!ehObjeto(item)) return null;
    if (typeof item.id === "string" && item.id !== "") return item.id;
    if (typeof item.id === "number") return String(item.id);
    return null;
  }

  function uniaoChaves(a, b) {
    var out = Object.keys(a);
    Object.keys(b).forEach(function (k) { if (!temPropria(a, k)) out.push(k); });
    return out;
  }

  /* Junta dois mapas { k: objeto }: objeto nos dois → fn(local, nuvem); senão o que for válido. */
  function mesclarMapa(a, b, fn) {
    var ma = ehObjeto(a) ? a : {};
    var mb = ehObjeto(b) ? b : {};
    var out = {};
    uniaoChaves(ma, mb).forEach(function (k) {
      var x = ma[k], y = mb[k];
      if (ehObjeto(x) && ehObjeto(y)) out[k] = fn(x, y);
      else if (ehObjeto(x)) out[k] = clonar(x);
      else if (ehObjeto(y)) out[k] = clonar(y);
      else out[k] = clonar(x !== undefined ? x : y);
    });
    return out;
  }

  /* Anotações: iguais → mantém; uma vazia → a outra; uma contém a outra → a maior; senão concatena. */
  function juntarTexto(local, nuvem) {
    var a = textoDe(local), b = textoDe(nuvem);
    if (a === b) return a;
    if (vazio(a)) return b;
    if (vazio(b)) return a;
    if (a.indexOf(b) !== -1) return a;
    if (b.indexOf(a) !== -1) return b;
    return a + SEPARADOR + b;
  }

  /* ---- estudos.planner.v1 ---- */
  function mesclarRegistroPlanner(a, b) {
    var r = estender(clonar(b), clonar(a));
    r.atividade = a.atividade === true || b.atividade === true;
    r.conteudo = a.conteudo === true || b.conteudo === true;
    r.anotacoes = juntarTexto(a.anotacoes, b.anotacoes);
    return r;
  }

  function mesclarPlanner(l, n) {
    var out = estender(clonar(n), clonar(l));
    out.semanas = mesclarMapa(l.semanas, n.semanas, function (sa, sb) {
      return mesclarMapa(sa, sb, mesclarRegistroPlanner);
    });
    return out;
  }

  /* ---- estudos.flashcards.v1 ---- */
  /* Fica o cartão com mais respostas; empate: ultimaRevisao mais recente; empate: o primeiro (local). */
  function escolherCartao(a, b) {
    var sa = numero(a.acertos) + numero(a.erros);
    var sb = numero(b.acertos) + numero(b.erros);
    if (sb > sa) return clonar(b);
    if (sa > sb) return a;
    if (tempo(b.ultimaRevisao) > tempo(a.ultimaRevisao)) return clonar(b);
    return a;
  }

  function chaveHistorico(h) {
    return JSON.stringify([
      h.data == null ? "" : String(h.data),
      h.materia == null ? "" : String(h.materia),
      h.semana == null ? "" : String(h.semana),
      h.modo == null ? "" : String(h.modo)
    ]);
  }

  function mesclarFlashcards(l, n) {
    var out = estender(clonar(n), clonar(l));

    var cartoes = [];
    var posicao = {};
    function adicionar(c) {
      if (!ehObjeto(c)) return;
      var id = idDe(c);
      if (id === null) {
        // Sem id (não deveria acontecer): entra se não houver cópia idêntica.
        for (var i = 0; i < cartoes.length; i++) if (iguais(cartoes[i], c)) return;
        cartoes.push(clonar(c));
        return;
      }
      var k = "#" + id;
      if (temPropria(posicao, k)) cartoes[posicao[k]] = escolherCartao(cartoes[posicao[k]], c);
      else { posicao[k] = cartoes.length; cartoes.push(clonar(c)); }
    }
    lista(l.cartoes).forEach(adicionar);
    lista(n.cartoes).forEach(adicionar);

    // Mesmo conteúdo com ids diferentes (cartões de exemplo criados em cada aparelho,
    // ou o mesmo arquivo importado nos dois): fica um só, pela mesma regra do mesmo id.
    // Chave = matéria + semana + frente sem maiúsculas/espaços (igual à importação).
    var porConteudo = {};
    var unicos = [];
    cartoes.forEach(function (c) {
      var frente = textoDe(c.frente).replace(/\s+/g, " ").trim().toLowerCase();
      if (!frente) { unicos.push(c); return; }
      var k = JSON.stringify([textoDe(c.materia), textoDe(c.semana), frente]);
      if (temPropria(porConteudo, k)) unicos[porConteudo[k]] = escolherCartao(unicos[porConteudo[k]], c);
      else { porConteudo[k] = unicos.length; unicos.push(c); }
    });
    out.cartoes = unicos;

    var vistos = {};
    var hist = [];
    lista(l.historicoQuiz).concat(lista(n.historicoQuiz)).forEach(function (h) {
      if (!ehObjeto(h)) return;
      var k = chaveHistorico(h);
      if (temPropria(vistos, k)) return;
      vistos[k] = true;
      hist.push(clonar(h));
    });
    out.historicoQuiz = hist
      .map(function (h, i) { return { h: h, i: i, t: tempo(h.data), s: textoDe(h.data) }; })
      .sort(function (x, y) {
        if (x.t !== y.t) return x.t < y.t ? -1 : 1;
        if (x.s !== y.s) return x.s < y.s ? -1 : 1;
        return x.i - y.i;
      })
      .map(function (x) { return x.h; });
    return out;
  }

  /* ---- estudos.planos.v1 ---- */
  function urlDe(link) {
    if (typeof link === "string") return link;
    if (ehObjeto(link) && typeof link.url === "string") return link.url;
    return null;
  }

  function mesclarPlano(a, b) {
    // a = local, b = nuvem. Base = atualizadoEm mais recente (empate: local).
    var nuvemEhBase = tempo(b.atualizadoEm) > tempo(a.atualizadoEm);
    var base = nuvemEhBase ? b : a;
    var outro = nuvemEhBase ? a : b;
    var r = estender(clonar(outro), clonar(base));

    if (vazio(base.titulo) && !vazio(outro.titulo)) r.titulo = outro.titulo;
    if (vazio(base.resumo) && !vazio(outro.resumo)) r.resumo = outro.resumo;

    // Tópicos: união por id; mesmo id → texto da base, feito = OU.
    var topicos = [];
    var posicao = {};
    function addTopico(t) {
      var id = idDe(t);
      if (id === null) {
        if (t === null || t === undefined) return;
        for (var i = 0; i < topicos.length; i++) if (iguais(topicos[i], t)) return;
        topicos.push(clonar(t));
        return;
      }
      var k = "#" + id;
      if (temPropria(posicao, k)) {
        var atual = topicos[posicao[k]];
        if (ehObjeto(atual)) atual.feito = atual.feito === true || t.feito === true;
      } else {
        posicao[k] = topicos.length;
        topicos.push(clonar(t));
      }
    }
    lista(base.topicos).forEach(addTopico);
    lista(outro.topicos).forEach(addTopico);
    if (Array.isArray(base.topicos) || Array.isArray(outro.topicos)) r.topicos = topicos;

    // Links: união por url.
    var links = [];
    var urls = {};
    lista(base.links).concat(lista(outro.links)).forEach(function (lk) {
      var url = urlDe(lk);
      if (url === null) {
        if (lk === null || lk === undefined) return;
        for (var i = 0; i < links.length; i++) if (iguais(links[i], lk)) return;
        links.push(clonar(lk));
        return;
      }
      if (temPropria(urls, "#" + url)) return;
      urls["#" + url] = true;
      links.push(clonar(lk));
    });
    if (Array.isArray(base.links) || Array.isArray(outro.links)) r.links = links;

    return r;
  }

  function mesclarPlanos(l, n) {
    var out = estender(clonar(n), clonar(l));
    out.planos = mesclarMapa(l.planos, n.planos, function (sa, sb) {
      return mesclarMapa(sa, sb, mesclarPlano);
    });
    return out;
  }

  /*
   * mesclar(chave, local, nuvem) — função pura (não altera os argumentos).
   * Regras no CONTRATO.md ("Regra de mesclagem"). Valor que não é objeto = inválido.
   */
  function mesclar(chave, local, nuvem) {
    var lv = ehObjeto(local), nv = ehObjeto(nuvem);
    if (!lv && !nv) return clonar(local !== undefined && local !== null ? local : nuvem);
    if (!lv) return clonar(nuvem);
    if (!nv) return clonar(local);
    if (chave === K_PLANNER) return mesclarPlanner(local, nuvem);
    if (chave === K_FLASHCARDS) return mesclarFlashcards(local, nuvem);
    if (chave === K_PLANOS) return mesclarPlanos(local, nuvem);
    return clonar(local); // preferências e chaves desconhecidas: vence o local
  }

  /*
   * Decide o que fazer com UMA chave ao baixar da nuvem (tabela "Conciliação ao baixar").
   * s = { temLocal, temNuvem, nuvemValida, revisaoNuvem, revisaoConhecida, pendente, iguais }
   * Devolve:
   *   "nada"      — nada a fazer (só registra a revisão da nuvem, se houver)
   *   "registrar" — local e nuvem iguais: registra a revisão e limpa a pendência
   *   "enviar"    — envia o local (insert se não há nuvem; update senão)
   *   "baixar"    — local = nuvem
   *   "mesclar"   — local = mesclar(local, nuvem) e envia o resultado
   */
  function decidirConciliacao(s) {
    if (!s.temLocal && !s.temNuvem) return "nada";
    if (s.temLocal && !s.temNuvem) return "enviar";
    if (!s.temLocal) return s.nuvemValida ? "baixar" : "nada";
    if (!s.nuvemValida) return "enviar";
    var conhecida = typeof s.revisaoConhecida === "number" ? s.revisaoConhecida : null;
    if (conhecida !== null && conhecida === s.revisaoNuvem) {
      return s.pendente || !s.iguais ? "enviar" : "nada";
    }
    // A nuvem tem uma revisão que este aparelho não conhece.
    if (s.iguais) return "registrar";
    if (s.pendente || conhecida === null) return "mesclar";
    return "baixar";
  }

  /*
   * Primeiro login no aparelho (ou troca de usuário).
   * Devolve "nuvem" (local sem dados relevantes), "enviar" (nuvem sem dados relevantes)
   * ou "perguntar". Só a chave de preferências não conta como dado relevante.
   */
  function decidirPrimeiroLogin(chavesLocais, chavesNuvem) {
    function relevantes(ks) {
      return lista(ks).filter(function (k) { return ehChaveEstudos(k) && k !== K_PREFERENCIAS; });
    }
    if (!relevantes(chavesLocais).length) return "nuvem";
    if (!relevantes(chavesNuvem).length) return "enviar";
    return "perguntar";
  }

  function novoPlano() { return { salvar: {}, remover: [], apagarNuvem: [], chaves: {} }; }

  /*
   * Plano da conciliação normal (mesmo usuário).
   * locais: { chave: valor }  nuvem: { chave: { valor, revisao } }  metaChaves: meta.chaves
   * Devolve { salvar: {chave: valor}, remover: [], apagarNuvem: [], chaves: {chave: {revisao, pendente}} }.
   */
  function planoConciliacao(locais, nuvem, metaChaves) {
    var plano = novoPlano();
    metaChaves = ehObjeto(metaChaves) ? metaChaves : {};
    uniaoChaves(locais, nuvem).forEach(function (k) {
      if (!ehChaveEstudos(k)) return;
      var temLocal = temPropria(locais, k) && ehObjeto(locais[k]); // local corrompido = ausente
      var linha = temPropria(nuvem, k) ? nuvem[k] : null;
      var info = ehObjeto(metaChaves[k]) ? metaChaves[k] : {};
      var valido = !!linha && ehObjeto(linha.valor);
      var acao = decidirConciliacao({
        temLocal: temLocal,
        temNuvem: !!linha,
        nuvemValida: valido,
        revisaoNuvem: linha ? linha.revisao : null,
        revisaoConhecida: info.revisao,
        pendente: info.pendente === true,
        iguais: temLocal && valido && iguais(locais[k], linha.valor)
      });
      var rev = linha ? linha.revisao : null;
      if (acao === "nada") {
        if (linha) plano.chaves[k] = { revisao: rev, pendente: info.pendente === true };
      } else if (acao === "registrar") {
        plano.chaves[k] = { revisao: rev, pendente: false };
      } else if (acao === "enviar") {
        plano.chaves[k] = { revisao: rev, pendente: true };
      } else if (acao === "baixar") {
        plano.salvar[k] = clonar(linha.valor);
        plano.chaves[k] = { revisao: rev, pendente: false };
      } else if (acao === "mesclar") {
        var m = mesclar(k, locais[k], linha.valor);
        if (!iguais(m, locais[k])) plano.salvar[k] = m;
        plano.chaves[k] = { revisao: rev, pendente: !iguais(m, linha.valor) };
      }
    });
    return plano;
  }

  /*
   * Plano do primeiro login. escolha: "enviar" | "nuvem" | "juntar".
   * estrito = true quando o usuário escolheu na pergunta: "enviar" apaga da nuvem as
   * chaves só-da-nuvem e "nuvem" remove do aparelho as chaves só-locais.
   * estrito = false (casos automáticos): nada é apagado.
   */
  function planoPrimeiroLogin(escolha, locais, nuvem, estrito) {
    var plano = novoPlano();
    uniaoChaves(locais, nuvem).forEach(function (k) {
      if (!ehChaveEstudos(k)) return;
      var existeLocal = temPropria(locais, k) && locais[k] !== undefined;
      var temLocal = existeLocal && ehObjeto(locais[k]); // local corrompido = ausente
      var linha = temPropria(nuvem, k) ? nuvem[k] : null;
      var valido = !!linha && ehObjeto(linha.valor);
      var rev = linha ? linha.revisao : null;

      if (temLocal && linha) {
        var resultado;
        if (escolha === "enviar") resultado = clonar(locais[k]);
        else if (escolha === "nuvem") resultado = valido ? clonar(linha.valor) : clonar(locais[k]);
        else resultado = mesclar(k, locais[k], linha.valor);
        if (!iguais(resultado, locais[k])) plano.salvar[k] = resultado;
        plano.chaves[k] = { revisao: rev, pendente: !(valido && iguais(resultado, linha.valor)) };
      } else if (temLocal) {
        if (escolha === "nuvem" && estrito) plano.remover.push(k);
        else plano.chaves[k] = { revisao: null, pendente: true };
      } else if (linha) {
        if (escolha === "enviar" && estrito && !existeLocal) {
          plano.apagarNuvem.push(k);
        } else {
          if (valido) plano.salvar[k] = clonar(linha.valor);
          plano.chaves[k] = { revisao: rev, pendente: false };
        }
      }
    });
    return plano;
  }

  /* =====================================================================
   * 2. MOTOR DE SINCRONIZAÇÃO (I/O)
   *
   * ambiente = {
   *   Estudos,                    // { ler, salvarSemEvento, chavesLocais }
   *   armazenamento,              // tipo localStorage (getItem/setItem/removeItem)
   *   sessao,                     // tipo sessionStorage
   *   config,                     // EstudosConfig
   *   carregarSdk(),              // Promise do namespace supabase-js ({ createClient })
   *   emitir(nome),               // dispara evento em window
   *   recarregar(),               // location.reload()
   *   urlRetorno(),               // URL para os e-mails de confirmação/senha
   *   online(),                   // navigator.onLine
   *   timers, agora(), debounceMs // opcionais (testes)
   * }
   * ===================================================================== */

  function criarNuvem(amb) {
    var E = amb.Estudos;
    var arm = amb.armazenamento;
    var cfg = amb.config || {};
    var timers = amb.timers || {
      setTimeout: function (f, ms) { return setTimeout(f, ms); },
      clearTimeout: function (id) { clearTimeout(id); },
      setInterval: function (f, ms) { return setInterval(f, ms); },
      clearInterval: function (id) { clearInterval(id); }
    };
    var agora = amb.agora || function () { return Date.now(); };
    var debounceMs = typeof amb.debounceMs === "number" ? amb.debounceMs : DEBOUNCE_MS;

    var est = { disponivel: false, carregando: false, logado: false, email: null, status: "desligado", erro: null };
    var cliente = null;
    var carregandoSdk = null;
    var uid = null;
    var sincronizado = false;     // conciliação inicial deste usuário concluída
    var inicialEmAndamento = false;
    var adiado = false;           // usuário cancelou a pergunta do primeiro login
    var ouvintes = [];
    var pergunta = null;
    var fila = Promise.resolve();
    var debounceId = null;
    var intervaloId = null;
    var ultimaBaixa = 0;
    var ultimaAssinatura = "";

    /* ---------- estado e avisos ---------- */

    function lerMeta() {
      var m = null;
      try { m = JSON.parse(arm.getItem(CHAVE_META)); } catch (e) { m = null; }
      if (!ehObjeto(m)) m = {};
      if (typeof m.usuario !== "string") m.usuario = null;
      if (!ehObjeto(m.chaves)) m.chaves = {};
      if (typeof m.dispositivo !== "string" || !m.dispositivo) {
        m.dispositivo = agora().toString(36) + Math.random().toString(36).slice(2, 10);
        gravarMeta(m);
      }
      return m;
    }

    function gravarMeta(m) {
      try { arm.setItem(CHAVE_META, JSON.stringify(m)); } catch (e) { /* sem armazenamento */ }
    }

    /* Sempre lê–altera–grava de uma vez (outras abas e eventos também mexem no meta). */
    function alterarMeta(fn) {
      var m = lerMeta();
      fn(m);
      gravarMeta(m);
      return m;
    }

    function infoChave(m, k) {
      if (!ehObjeto(m.chaves[k])) m.chaves[k] = { revisao: null, pendente: false };
      return m.chaves[k];
    }

    function listaPendentes() {
      var m = lerMeta();
      return Object.keys(m.chaves).filter(function (k) {
        return ehChaveEstudos(k) && ehObjeto(m.chaves[k]) && m.chaves[k].pendente === true;
      });
    }

    function estado() {
      return {
        disponivel: est.disponivel,
        logado: est.logado,
        email: est.email,
        status: est.status,
        pendentes: listaPendentes().length,
        erro: est.erro,
        carregando: est.carregando
      };
    }

    function notificar() {
      var e = estado();
      var assinatura = JSON.stringify(e);
      if (assinatura === ultimaAssinatura) return;
      ultimaAssinatura = assinatura;
      ouvintes.slice().forEach(function (fn) {
        try { fn(estado()); } catch (err) { if (typeof console !== "undefined") console.error(err); }
      });
    }

    function mudarStatus(status, erro) {
      est.status = status;
      est.erro = erro || null;
      notificar();
    }

    function emitir(nome) {
      try { if (amb.emitir) amb.emitir(nome); } catch (e) { /* ignora */ }
    }

    /* ---------- erros ---------- */

    var MSG_REDE = "Sem conexão com a nuvem. Suas alterações ficam salvas neste aparelho e serão enviadas quando a conexão voltar.";

    function ehRede(err, status) {
      var msg = err && (err.message || String(err)) || "";
      var nome = err && err.name || "";
      if (status === 0 || status === 502 || status === 503 || status === 504) return true;
      if (nome === "AuthRetryableFetchError") return true;
      if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timeout/i.test(msg)) return true;
      try { if (amb.online && amb.online() === false) return true; } catch (e) { /* ignora */ }
      return false;
    }

    function erroDaNuvem(err, status) {
      err = err || {};
      var codigo = err.code ? String(err.code) : "";
      var msg;
      var rede = ehRede(err, status);
      if (rede) msg = MSG_REDE;
      else if (codigo === "23505") msg = "Conflito ao salvar na nuvem.";
      else if (codigo === "42501" || status === 403) msg = "A nuvem recusou o acesso aos dados (permissão). Saia e entre de novo na conta.";
      else if (codigo === "PGRST301" || codigo === "PGRST303" || status === 401) msg = "Sua sessão expirou. Saia e entre de novo na conta.";
      else if (codigo === "23514" || status === 413) msg = "Dados grandes demais para salvar na nuvem (limite de 1 MB por item).";
      else msg = "Erro ao sincronizar com a nuvem" + (err.message ? ": " + err.message : ".");
      var e = new Error(msg);
      e.rede = rede;
      e.codigo = codigo;
      e.original = err;
      return e;
    }

    function erroAuth(err) {
      err = err || {};
      var codigo = err.code ? String(err.code) : "";
      var texto = err.message || "";
      var msg;
      if (ehRede(err, err.status)) msg = "Sem conexão com a internet. Tente de novo quando estiver online.";
      else if (codigo === "invalid_credentials" || /invalid login credentials/i.test(texto)) msg = "E-mail ou senha incorretos.";
      else if (codigo === "email_not_confirmed" || /email not confirmed/i.test(texto)) msg = "Confirme seu e-mail antes de entrar: abra o link que enviamos para a sua caixa de entrada.";
      else if (codigo === "user_already_exists" || codigo === "email_exists" || /already (been )?registered/i.test(texto)) msg = "Este e-mail já está cadastrado. Use “Entrar” ou “Esqueci a senha”.";
      else if (codigo === "weak_password" || /password should/i.test(texto)) msg = "Senha fraca: use pelo menos 6 caracteres, misturando letras e números.";
      else if (codigo === "same_password") msg = "A nova senha precisa ser diferente da atual.";
      else if (/rate_limit/.test(codigo) || err.status === 429) msg = "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
      else if (codigo === "email_address_invalid" || codigo === "validation_failed" || /invalid.*email|validate email/i.test(texto)) msg = "E-mail inválido.";
      else if (codigo === "email_address_not_authorized") msg = "O servidor não pode enviar e-mail para este endereço (limite do e-mail padrão do Supabase).";
      else if (codigo === "signup_disabled") msg = "A criação de contas está desativada no momento.";
      else if (/session_not_found|session_expired|refresh_token/.test(codigo) || /auth session missing/i.test(texto)) msg = "Sua sessão expirou. Entre de novo.";
      else msg = "Não foi possível concluir" + (texto ? " (" + texto + ")." : ".");
      var e = new Error(msg);
      e.codigo = codigo;
      e.original = err;
      return e;
    }

    function tratarErro(e) {
      if (e && e.rede) mudarStatus("offline", e.message);
      else mudarStatus("erro", (e && e.message) || "Erro ao sincronizar com a nuvem.");
    }

    /* ---------- carregamento do supabase-js ---------- */

    function iniciar() {
      return obterCliente().then(null, function () { /* já refletido no estado */ });
    }

    function obterCliente() {
      if (cliente) return Promise.resolve(cliente);
      if (carregandoSdk) return carregandoSdk;
      if (!cfg.supabaseUrl || !cfg.supabaseChave) {
        est.disponivel = false;
        mudarStatus("offline", "A nuvem não está configurada neste app.");
        return Promise.reject(new Error("A nuvem não está configurada neste app."));
      }
      est.carregando = true;
      notificar();
      carregandoSdk = Promise.resolve()
        .then(function () { return amb.carregarSdk(); })
        .then(function (sb) {
          if (!sb || typeof sb.createClient !== "function") throw new Error("supabase-js inválido");
          cliente = sb.createClient(cfg.supabaseUrl, cfg.supabaseChave, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
          });
          est.disponivel = true;
          est.carregando = false;
          carregandoSdk = null;
          if (est.status === "offline") est.status = "desligado";
          est.erro = null;
          notificar();
          cliente.auth.onAuthStateChange(function (evento, sessao) {
            // Não chamar o supabase de dentro do callback (trava interna do supabase-js).
            timers.setTimeout(function () { tratarAuth(evento, sessao); }, 0);
          });
          return cliente;
        })
        .then(null, function () {
          var msg = "Não foi possível carregar a nuvem (sem internet?). Seus dados continuam salvos neste aparelho.";
          carregandoSdk = null;
          est.disponivel = false;
          est.carregando = false;
          mudarStatus("offline", msg);
          throw new Error(msg);
        });
      return carregandoSdk;
    }

    /* ---------- sessão ---------- */

    function tratarAuth(evento, sessao) {
      if (evento === "PASSWORD_RECOVERY") emitir("estudos:recuperar-senha");
      var user = sessao && sessao.user;
      if (user && user.id) {
        est.logado = true;
        est.email = user.email || null;
        if (uid !== user.id) {
          uid = user.id;
          sincronizado = false;
          adiado = false;
          iniciarTimers();
          // Login ao abrir ou com a página aberta: os dois podem recarregar uma vez.
          naFila(function () { return sincronizarInicial("abertura"); });
        }
        notificar();
      } else if (evento === "INITIAL_SESSION" || evento === "SIGNED_OUT") {
        uid = null;
        sincronizado = false;
        adiado = false;
        est.logado = false;
        est.email = null;
        pararTimers();
        mudarStatus("desligado");
      }
    }

    /* ---------- fila (uma operação de rede por vez) ---------- */

    function naFila(fn) {
      var p = fila.then(function () { return fn(); });
      fila = p.then(null, function () { /* erro já tratado por quem chamou */ });
      return p;
    }

    /* Espera a fila esvaziar (inclui o que for enfileirado enquanto isso). */
    function ocioso() {
      var atual = fila;
      return atual.then(function () { return atual === fila ? undefined : ocioso(); });
    }

    /* ---------- leitura/aplicação local ---------- */

    function lerLocais() {
      var out = {};
      lista(E.chavesLocais()).forEach(function (k) {
        if (ehChaveEstudos(k)) out[k] = E.ler(k, null);
      });
      return out;
    }

    function aplicarPlano(plano, novoUsuario) {
      var mudou = false;
      Object.keys(plano.salvar).forEach(function (k) {
        if (E.salvarSemEvento(k, plano.salvar[k])) mudou = true;
      });
      plano.remover.forEach(function (k) {
        try { arm.removeItem(k); mudou = true; } catch (e) { /* ignora */ }
      });
      alterarMeta(function (m) {
        if (novoUsuario) { m.usuario = novoUsuario; m.chaves = {}; }
        Object.keys(plano.chaves).forEach(function (k) { m.chaves[k] = plano.chaves[k]; });
        plano.remover.forEach(function (k) { delete m.chaves[k]; });
      });
      return mudou;
    }

    function recarregarUmaVez() {
      var trava = null;
      try { trava = amb.sessao.getItem(CHAVE_TRAVA); } catch (e) { trava = "1"; }
      if (trava) { emitir("estudos:nuvem-atualizada"); return false; }
      try { amb.sessao.setItem(CHAVE_TRAVA, "1"); } catch (e) { emitir("estudos:nuvem-atualizada"); return false; }
      if (amb.recarregar) amb.recarregar();
      return true;
    }

    function limparTrava() {
      try { amb.sessao.removeItem(CHAVE_TRAVA); } catch (e) { /* ignora */ }
    }

    /* ---------- rede ---------- */

    function consultar(req) {
      return Promise.resolve(req).then(function (r) {
        if (r && r.error) throw erroDaNuvem(r.error, r.status);
        return r || {};
      }, function (err) {
        throw err && err.rede !== undefined ? err : erroDaNuvem(err);
      });
    }

    function baixarLinhas() {
      return consultar(cliente.from(TABELA).select("chave,valor,revisao").eq("user_id", uid))
        .then(function (r) {
          var mapa = {};
          lista(r.data).forEach(function (linha) {
            if (linha && ehChaveEstudos(linha.chave)) {
              mapa[linha.chave] = { valor: linha.valor, revisao: Number(linha.revisao) };
            }
          });
          return mapa;
        });
    }

    function apagarDaNuvem(chaves, u) {
      var p = Promise.resolve();
      chaves.forEach(function (k) {
        p = p.then(function () {
          if (u !== uid) return;
          return consultar(cliente.from(TABELA).delete().eq("user_id", u).eq("chave", k));
        });
      });
      return p;
    }

    /* ---------- conciliação ---------- */

    var CANCELADO = {};

    function perguntar(chL, chN) {
      if (typeof pergunta !== "function") return Promise.resolve(null);
      try {
        return Promise.resolve(pergunta({ chavesLocais: chL.slice(), chavesNuvem: chN.slice() }))
          .then(null, function () { return null; });
      } catch (e) {
        return Promise.resolve(null);
      }
    }

    function primeiroLogin(nuvem, u) {
      var chL = Object.keys(lerLocais());
      var chN = Object.keys(nuvem);
      var decisao = decidirPrimeiroLogin(chL, chN);
      var escolhaP = decisao === "perguntar"
        ? perguntar(chL, chN).then(function (esc) { return { escolha: esc, estrito: true }; })
        : Promise.resolve({ escolha: decisao, estrito: false });
      return escolhaP.then(function (r) {
        if (u !== uid) return CANCELADO;
        if (r.escolha !== "enviar" && r.escolha !== "nuvem" && r.escolha !== "juntar") {
          adiado = true;
          mudarStatus("offline", "Sincronização adiada: escolha o que fazer com os dados deste aparelho para ativar a nuvem.");
          return CANCELADO;
        }
        var plano = planoPrimeiroLogin(r.escolha, lerLocais(), nuvem, r.estrito);
        return apagarDaNuvem(plano.apagarNuvem, u).then(function () {
          if (u !== uid) return CANCELADO;
          return aplicarPlano(plano, u);
        });
      });
    }

    /* Primeira sincronização deste usuário nesta página (ou nova tentativa dela). */
    function sincronizarInicial(motivo) {
      var u = uid;
      if (!u || !cliente || sincronizado) return Promise.resolve();
      inicialEmAndamento = true;
      ultimaBaixa = agora();
      mudarStatus(est.status === "offline" || est.status === "erro" ? est.status : "salvando", est.erro);
      return baixarLinhas()
        .then(function (nuvem) {
          if (u !== uid) return CANCELADO;
          if (lerMeta().usuario !== u) return primeiroLogin(nuvem, u);
          return aplicarPlano(planoConciliacao(lerLocais(), nuvem, lerMeta().chaves));
        })
        .then(function (mudou) {
          inicialEmAndamento = false;
          if (mudou === CANCELADO || u !== uid) return;
          sincronizado = true;
          if (mudou) {
            if (motivo === "abertura") { if (recarregarUmaVez()) return; }
            else emitir("estudos:nuvem-atualizada");
          } else if (motivo === "abertura") {
            limparTrava();
          }
          return enviarPendentes();
        })
        .then(null, function (e) {
          inicialEmAndamento = false;
          if (u === uid) tratarErro(e);
        });
    }

    /* Download depois da sincronização inicial (foco/sincronizarAgora): nunca recarrega. */
    function baixarEConciliar() {
      var u = uid;
      ultimaBaixa = agora();
      return baixarLinhas().then(function (nuvem) {
        if (u !== uid) return;
        var mudou = aplicarPlano(planoConciliacao(lerLocais(), nuvem, lerMeta().chaves));
        if (mudou) emitir("estudos:nuvem-atualizada");
        return enviarPendentes();
      }).then(null, function (e) {
        if (u === uid) tratarErro(e);
      });
    }

    /* ---------- envio ---------- */

    function erroConflito() {
      var e = new Error("Não foi possível salvar na nuvem: os dados mudaram em outro aparelho várias vezes seguidas. Tentaremos de novo.");
      e.rede = false;
      return e;
    }

    function enviarChave(k, u) {
      var conflitos = 0;

      function descartar() {
        alterarMeta(function (m) { infoChave(m, k).pendente = false; });
      }

      function tentar() {
        if (u !== uid) return Promise.resolve();
        var bruto = null;
        try { bruto = arm.getItem(k); } catch (e) { bruto = null; }
        var valor = null;
        try { valor = bruto === null ? null : JSON.parse(bruto); } catch (e) { valor = null; }
        if (!ehObjeto(valor)) { descartar(); return Promise.resolve(); }

        var meta = lerMeta();
        var info = ehObjeto(meta.chaves[k]) ? meta.chaves[k] : {};
        var rev = typeof info.revisao === "number" ? info.revisao : null;
        var tabela = cliente.from(TABELA);
        var req = rev === null
          ? tabela.insert({ user_id: u, chave: k, valor: valor, dispositivo: meta.dispositivo }).select("revisao")
          : tabela.update({ valor: valor, dispositivo: meta.dispositivo })
              .eq("user_id", u).eq("chave", k).eq("revisao", rev).select("revisao");

        return consultar(req).then(function (r) {
          var linhas = lista(r.data);
          if (!linhas.length) return conflito(); // update não achou a revisão esperada
          var nova = Number(linhas[0].revisao);
          var mesmoValor = false;
          try { mesmoValor = arm.getItem(k) === bruto; } catch (e) { mesmoValor = true; }
          alterarMeta(function (m) {
            var c = infoChave(m, k);
            c.revisao = nova;
            // Se o usuário mudou o dado durante o envio, continua pendente.
            c.pendente = !mesmoValor;
          });
        }, function (e) {
          if (e && e.codigo === "23505") return conflito(); // insert: outro aparelho criou antes
          throw e;
        });
      }

      function conflito() {
        conflitos++;
        if (conflitos > MAX_CONFLITOS) return Promise.reject(erroConflito());
        return consultar(cliente.from(TABELA).select("chave,valor,revisao").eq("user_id", u).eq("chave", k))
          .then(function (r) {
            if (u !== uid) return;
            var linha = lista(r.data)[0];
            if (!linha) {
              alterarMeta(function (m) { infoChave(m, k).revisao = null; });
              return tentar();
            }
            var local = E.ler(k, null);
            var resultado = ehObjeto(linha.valor) ? mesclar(k, local, linha.valor) : local;
            if (!iguais(resultado, local)) {
              E.salvarSemEvento(k, resultado);
              emitir("estudos:nuvem-atualizada");
            }
            var jaIgual = ehObjeto(linha.valor) && iguais(resultado, linha.valor);
            alterarMeta(function (m) {
              var c = infoChave(m, k);
              c.revisao = Number(linha.revisao);
              c.pendente = !jaIgual;
            });
            if (jaIgual) return;
            return tentar();
          });
      }

      return tentar();
    }

    function enviarPendentes() {
      var u = uid;
      if (!u || !cliente || !sincronizado || adiado) return Promise.resolve();
      var chaves = listaPendentes();
      if (!chaves.length) {
        if (est.status !== "salvo") mudarStatus("salvo");
        return Promise.resolve();
      }
      mudarStatus("salvando");
      var p = Promise.resolve();
      chaves.forEach(function (k) {
        p = p.then(function () { return enviarChave(k, u); });
      });
      return p.then(function () {
        if (u !== uid) return;
        mudarStatus(listaPendentes().length ? "salvando" : "salvo");
      }, function (e) {
        if (u === uid) tratarErro(e);
      });
    }

    /* ---------- gatilhos (eventos do navegador) ---------- */

    function agendarEnvio() {
      if (debounceId !== null) timers.clearTimeout(debounceId);
      debounceId = timers.setTimeout(function () {
        debounceId = null;
        naFila(function () { return enviarPendentes(); });
      }, debounceMs);
    }

    function aoSalvar(chave) {
      if (!ehChaveEstudos(chave)) return;
      alterarMeta(function (m) { infoChave(m, chave).pendente = true; });
      if (uid && sincronizado && !adiado) {
        if (est.status === "salvo") mudarStatus("salvando");
        else notificar();
        agendarEnvio();
      } else {
        notificar();
      }
    }

    function tentarDeNovo() {
      if (!uid || adiado) return;
      if (!sincronizado) {
        if (!inicialEmAndamento) naFila(function () { return sincronizarInicial("retentativa"); });
      } else if (listaPendentes().length) {
        naFila(function () { return enviarPendentes(); });
      }
    }

    function aoFicarOnline() {
      if (!cliente) { if (!carregandoSdk) iniciar(); return; }
      tentarDeNovo();
    }

    function aoFocar() {
      if (!uid || adiado || !cliente) return;
      if (!sincronizado) { tentarDeNovo(); return; }
      if (agora() - ultimaBaixa >= FOCO_MIN_MS) {
        ultimaBaixa = agora();
        naFila(baixarEConciliar);
      } else if (listaPendentes().length) {
        naFila(function () { return enviarPendentes(); });
      }
    }

    function iniciarTimers() {
      if (intervaloId !== null) return;
      intervaloId = timers.setInterval(function () {
        if (!uid || adiado) return;
        if (!sincronizado || listaPendentes().length) tentarDeNovo();
      }, INTERVALO_MS);
    }

    function pararTimers() {
      if (intervaloId !== null) { timers.clearInterval(intervaloId); intervaloId = null; }
      if (debounceId !== null) { timers.clearTimeout(debounceId); debounceId = null; }
    }

    /* ---------- API pública ---------- */

    function limparEmail(email) { return typeof email === "string" ? email.trim() : ""; }

    function exigir(cond, msg) {
      if (!cond) throw new Error(msg);
    }

    function validarSenha(senha) {
      exigir(typeof senha === "string" && senha.length >= 6, "A senha precisa ter pelo menos 6 caracteres.");
    }

    function urlRetorno() {
      try { if (amb.urlRetorno) return amb.urlRetorno(); } catch (e) { /* ignora */ }
      return cfg.siteUrl;
    }

    function resultadoAuth(r) {
      if (r && r.error) throw erroAuth(r.error);
      return (r && r.data) || {};
    }

    function criarConta(email, senha) {
      return Promise.resolve().then(function () {
        email = limparEmail(email);
        exigir(email, "Informe o e-mail.");
        validarSenha(senha);
        return obterCliente();
      }).then(function (c) {
        return c.auth.signUp({ email: email, password: senha, options: { emailRedirectTo: urlRetorno() } });
      }).then(function (r) {
        var d = resultadoAuth(r);
        // Com confirmação ligada, e-mail já cadastrado volta como usuário sem identidades.
        if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) {
          throw new Error("Este e-mail já está cadastrado. Use “Entrar” ou “Esqueci a senha”.");
        }
        if (d.session) tratarAuth("SIGNED_IN", d.session);
        return { precisaConfirmar: !d.session };
      });
    }

    function entrar(email, senha) {
      return Promise.resolve().then(function () {
        email = limparEmail(email);
        exigir(email && typeof senha === "string" && senha, "Informe e-mail e senha.");
        return obterCliente();
      }).then(function (c) {
        return c.auth.signInWithPassword({ email: email, password: senha });
      }).then(function (r) {
        var d = resultadoAuth(r);
        if (d.session) tratarAuth("SIGNED_IN", d.session);
        return estado();
      });
    }

    function sair() {
      if (!cliente) {
        tratarAuth("SIGNED_OUT", null);
        return Promise.resolve(estado());
      }
      var envio = (uid && sincronizado && listaPendentes().length)
        ? Promise.race([
            naFila(function () { return enviarPendentes(); }),
            new Promise(function (ok) { timers.setTimeout(ok, TEMPO_SAIR_MS); })
          ])
        : Promise.resolve();
      return envio.then(null, function () { /* sai mesmo assim */ })
        .then(function () { return cliente.auth.signOut({ scope: "local" }); })
        .then(null, function (e) { return { error: e }; })
        .then(function (r) {
          if (r && r.error && typeof console !== "undefined") console.warn("signOut:", r.error);
          // Mantém os dados locais e meta.usuario (o mesmo usuário não é perguntado de novo).
          tratarAuth("SIGNED_OUT", null);
          return estado();
        });
    }

    function esqueciSenha(email) {
      return Promise.resolve().then(function () {
        email = limparEmail(email);
        exigir(email, "Informe o e-mail.");
        return obterCliente();
      }).then(function (c) {
        return c.auth.resetPasswordForEmail(email, { redirectTo: urlRetorno() });
      }).then(function (r) { resultadoAuth(r); });
    }

    function definirNovaSenha(senha) {
      return Promise.resolve().then(function () {
        validarSenha(senha);
        return obterCliente();
      }).then(function (c) {
        return c.auth.updateUser({ password: senha });
      }).then(function (r) { resultadoAuth(r); });
    }

    function sincronizarAgora() {
      return obterCliente().then(function () {
        exigir(uid, "Entre na sua conta para sincronizar.");
        adiado = false;
        return naFila(function () {
          if (!sincronizado) return sincronizarInicial("manual");
          return baixarEConciliar();
        });
      }).then(function () {
        if (est.status === "offline" || est.status === "erro") {
          throw new Error(est.erro || "Não foi possível sincronizar agora.");
        }
        return estado();
      });
    }

    function aoMudar(fn) {
      if (typeof fn !== "function") return function () {};
      ouvintes.push(fn);
      return function () {
        var i = ouvintes.indexOf(fn);
        if (i !== -1) ouvintes.splice(i, 1);
      };
    }

    function definirPerguntaPrimeiroLogin(fn) {
      pergunta = typeof fn === "function" ? fn : null;
    }

    return {
      api: {
        estado: estado,
        aoMudar: aoMudar,
        criarConta: criarConta,
        entrar: entrar,
        sair: sair,
        esqueciSenha: esqueciSenha,
        definirNovaSenha: definirNovaSenha,
        definirPerguntaPrimeiroLogin: definirPerguntaPrimeiroLogin,
        sincronizarAgora: sincronizarAgora
      },
      iniciar: iniciar,
      aoSalvar: aoSalvar,
      aoFicarOnline: aoFicarOnline,
      aoFocar: aoFocar,
      // Só para testes:
      _interno: {
        tratarAuth: tratarAuth,
        enviarPendentes: function () { return naFila(function () { return enviarPendentes(); }); },
        ocioso: ocioso,
        lerMeta: lerMeta,
        pararTimers: pararTimers
      }
    };
  }

  /* =====================================================================
   * 3. NAVEGADOR
   * ===================================================================== */

  /* localStorage/sessionStorage podem lançar (modo privado, cookies bloqueados). */
  function armazenamentoSeguro(obter) {
    var memoria = {};
    function real() { try { return obter() || null; } catch (e) { return null; } }
    return {
      getItem: function (k) {
        var s = real();
        try { if (s) return s.getItem(k); } catch (e) { /* cai na memória */ }
        return temPropria(memoria, k) ? memoria[k] : null;
      },
      setItem: function (k, v) {
        var s = real();
        try { if (s) { s.setItem(k, v); return; } } catch (e) { /* cai na memória */ }
        memoria[k] = String(v);
      },
      removeItem: function (k) {
        var s = real();
        try { if (s) s.removeItem(k); } catch (e) { /* ignora */ }
        delete memoria[k];
      }
    };
  }

  function carregarScript(url) {
    return new Promise(function (ok, falha) {
      if (window.supabase && typeof window.supabase.createClient === "function") { ok(window.supabase); return; }
      var s = document.createElement("script");
      var terminou = false;
      var limite = setTimeout(function () { fim(false); }, TEMPO_SDK_MS);
      function fim(sucesso) {
        if (terminou) return;
        terminou = true;
        clearTimeout(limite);
        if (sucesso && window.supabase && typeof window.supabase.createClient === "function") ok(window.supabase);
        else {
          if (s.parentNode) s.parentNode.removeChild(s);
          falha(new Error("Falha ao carregar o supabase-js"));
        }
      }
      s.async = true;
      s.src = url;
      s.onload = function () { fim(true); };
      s.onerror = function () { fim(false); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function iniciarNoNavegador() {
    var Estudos = window.Estudos || (window.Estudos = {});
    var cfg = window.EstudosConfig || {};
    var motor = criarNuvem({
      Estudos: Estudos,
      armazenamento: armazenamentoSeguro(function () { return window.localStorage; }),
      sessao: armazenamentoSeguro(function () { return window.sessionStorage; }),
      config: cfg,
      carregarSdk: function () { return carregarScript(cfg.supabaseJsUrl); },
      emitir: function (nome) { window.dispatchEvent(new CustomEvent(nome)); },
      recarregar: function () { window.location.reload(); },
      urlRetorno: function () {
        var loc = window.location;
        if (loc.protocol === "file:" || !/^https?:$/.test(loc.protocol)) return cfg.siteUrl;
        return loc.origin + loc.pathname;
      },
      online: function () { return !window.navigator || window.navigator.onLine !== false; }
    });
    Estudos.nuvem = motor.api;

    window.addEventListener("estudos:salvo", function (ev) {
      motor.aoSalvar(ev && ev.detail && ev.detail.chave);
    });
    window.addEventListener("online", motor.aoFicarOnline);
    window.addEventListener("focus", motor.aoFocar);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") motor.aoFocar();
    });

    motor.iniciar();
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    iniciarNoNavegador();
  }

  if (typeof module === "object" && module.exports) {
    module.exports = {
      mesclar: mesclar,
      decidirConciliacao: decidirConciliacao,
      decidirPrimeiroLogin: decidirPrimeiroLogin,
      planoConciliacao: planoConciliacao,
      planoPrimeiroLogin: planoPrimeiroLogin,
      iguais: iguais,
      juntarTexto: juntarTexto,
      criarNuvem: criarNuvem,
      SEPARADOR: SEPARADOR
    };
  }
})();
