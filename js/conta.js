/* conta.js — interface da conta (login), status de sincronização e diálogos. Ver CONTRATO.md */
(function () {
  "use strict";

  var E = window.Estudos;
  var nuvem = E && E.nuvem;
  var RODAPE_ORIGINAL = null;

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function msgErro(e) {
    return (e && e.message) ? e.message : "Algo deu errado. Tente novamente.";
  }

  function estado() {
    try { return nuvem.estado() || {}; } catch (e) { return {}; }
  }

  /* ---------- Diálogo (um só, reaproveitado) ---------- */
  var dlg = null;
  var dlgNativo = false;
  var aoFecharAtual = null; // chamado quando o diálogo some sem o fluxo terminar (Esc, fundo, substituição)
  var focoAnterior = null;

  function criarDialogo() {
    if (dlg) return dlg;
    dlgNativo = typeof HTMLDialogElement === "function" && typeof document.createElement("dialog").showModal === "function";
    dlg = document.createElement(dlgNativo ? "dialog" : "div");
    dlg.className = "conta-dialogo" + (dlgNativo ? "" : " conta-dialogo-simples");
    dlg.setAttribute("aria-labelledby", "conta-dialogo-titulo");
    if (!dlgNativo) { dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.hidden = true; }
    if (dlgNativo) {
      dlg.addEventListener("close", function () { if (!dialogoAberto()) terminarFechamento(); }); // Esc; o evento é assíncrono, não pode pegar um diálogo já reaberto
      dlg.addEventListener("click", function (ev) { if (ev.target === dlg) fecharDialogo(); }); // clique no fundo
    } else {
      dlg.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fecharDialogo(); });
    }
    document.body.appendChild(dlg);
    return dlg;
  }

  function dialogoAberto() {
    return dlg && (dlgNativo ? dlg.open : !dlg.hidden);
  }

  function terminarFechamento() {
    var cb = aoFecharAtual;
    aoFecharAtual = null;
    if (!dlgNativo && dlg) { dlg.hidden = true; }
    if (focoAnterior && focoAnterior.focus && document.contains(focoAnterior)) {
      try { focoAnterior.focus(); } catch (e) { /* ignora */ }
    }
    focoAnterior = null;
    if (cb) cb();
  }

  function fecharDialogo() {
    if (!dialogoAberto()) return;
    if (dlgNativo) dlg.close();
    terminarFechamento();
  }

  /* Abre o diálogo com o conteúdo `corpo` (elemento). `aoFechar` roda se for fechado sem concluir. */
  function abrirDialogo(titulo, corpo, aoFechar, focar) {
    criarDialogo();
    if (dialogoAberto()) {
      // substitui o conteúdo anterior (ex.: pergunta do primeiro login durante o "Entrar")
      var cb = aoFecharAtual;
      aoFecharAtual = null;
      if (cb) cb();
    } else {
      focoAnterior = document.activeElement;
    }
    aoFecharAtual = aoFechar || null;
    dlg.textContent = "";
    var caixa = el("div", "conta-dialogo-caixa");
    var h = el("h2", "conta-dialogo-titulo", titulo);
    h.id = "conta-dialogo-titulo";
    caixa.appendChild(h);
    caixa.appendChild(corpo);
    dlg.appendChild(caixa);
    if (!dialogoAberto()) {
      if (dlgNativo) dlg.showModal();
      else dlg.hidden = false;
    }
    if (focar) setTimeout(function () { try { focar.focus(); } catch (e) { /* ignora */ } }, 0);
    return caixa;
  }

  /* ---------- Campos e validação ---------- */
  function campo(rotulo, tipo, nome, auto) {
    var l = el("label", "conta-rotulo");
    l.appendChild(el("span", "conta-rotulo-texto", rotulo));
    var i = document.createElement("input");
    i.type = tipo;
    i.name = nome;
    i.className = "campo";
    i.required = true;
    i.setAttribute("autocomplete", auto);
    if (tipo === "email") { i.setAttribute("autocapitalize", "none"); i.spellcheck = false; }
    l.appendChild(i);
    return { rotulo: l, input: i };
  }

  function emailValido(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

  /* Formulário genérico. campos: [{rotulo,tipo,nome,auto}]; aoEnviar(valores) -> Promise<texto|void> */
  function montarFormulario(opcoes) {
    var form = el("form", "conta-form");
    form.noValidate = true;
    var inputs = {};
    opcoes.campos.forEach(function (c) {
      var f = campo(c.rotulo, c.tipo, c.nome, c.auto);
      inputs[c.nome] = f.input;
      form.appendChild(f.rotulo);
    });
    var msg = el("p", "conta-mensagem oculto");
    msg.setAttribute("role", "alert");
    form.appendChild(msg);
    var acoes = el("div", "conta-acoes");
    var enviar = el("button", "botao botao-primario", opcoes.rotuloEnviar);
    enviar.type = "submit";
    var cancelar = el("button", "botao", "Cancelar");
    cancelar.type = "button";
    cancelar.addEventListener("click", fecharDialogo);
    acoes.appendChild(cancelar);
    acoes.appendChild(enviar);
    form.appendChild(acoes);

    function mostrar(texto, erro) {
      msg.textContent = texto;
      msg.className = "conta-mensagem" + (erro ? " conta-erro" : " conta-ok");
      msg.setAttribute("role", erro ? "alert" : "status");
    }
    function ocupado(sim) {
      enviar.disabled = sim;
      cancelar.disabled = sim;
      for (var k in inputs) inputs[k].disabled = sim;
      enviar.textContent = sim ? "Aguarde..." : opcoes.rotuloEnviar;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = {};
      for (var k in inputs) v[k] = inputs[k].value;
      if (v.email != null) v.email = v.email.trim();
      var erro = opcoes.validar ? opcoes.validar(v) : "";
      if (erro) { mostrar(erro, true); return; }
      msg.className = "conta-mensagem oculto";
      ocupado(true);
      Promise.resolve().then(function () { return opcoes.aoEnviar(v); }).then(function (resultado) {
        if (!document.contains(form)) return;
        ocupado(false);
        if (resultado && resultado.mensagem) {
          mostrar(resultado.mensagem, false);
          if (resultado.limpar) for (var k in inputs) inputs[k].value = "";
        } else if (resultado && resultado.fechar) {
          aoFecharAtual = null;
          fecharDialogo();
        }
      }, function (e) {
        if (!document.contains(form)) return;
        ocupado(false);
        mostrar(msgErro(e), true);
      });
    });
    return { form: form, inputs: inputs };
  }

  function validarSenhas(v, confirmar) {
    if (!v.senha || v.senha.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
    if (confirmar && v.senha !== v.confirmar) return "As senhas não são iguais.";
    return "";
  }

  /* ---------- Diálogo de conta: Entrar / Criar conta / Esqueci a senha ---------- */
  var ABAS = [
    { id: "entrar", rotulo: "Entrar" },
    { id: "criar", rotulo: "Criar conta" },
    { id: "esqueci", rotulo: "Esqueci a senha" }
  ];

  function formAba(id) {
    var nu = function () {
      if (!nuvem) return Promise.reject(new Error("A sincronização não está disponível agora."));
      return Promise.resolve();
    };
    if (id === "entrar") {
      return montarFormulario({
        campos: [
          { rotulo: "E-mail", tipo: "email", nome: "email", auto: "email" },
          { rotulo: "Senha", tipo: "password", nome: "senha", auto: "current-password" }
        ],
        rotuloEnviar: "Entrar",
        validar: function (v) {
          if (!emailValido(v.email)) return "Informe um e-mail válido.";
          if (!v.senha) return "Informe a senha.";
          return "";
        },
        aoEnviar: function (v) {
          return nu().then(function () { return nuvem.entrar(v.email, v.senha); }).then(function () { return { fechar: true }; });
        }
      });
    }
    if (id === "criar") {
      return montarFormulario({
        campos: [
          { rotulo: "E-mail", tipo: "email", nome: "email", auto: "email" },
          { rotulo: "Senha (mínimo 6 caracteres)", tipo: "password", nome: "senha", auto: "new-password" },
          { rotulo: "Confirmar senha", tipo: "password", nome: "confirmar", auto: "new-password" }
        ],
        rotuloEnviar: "Criar conta",
        validar: function (v) {
          if (!emailValido(v.email)) return "Informe um e-mail válido.";
          return validarSenhas(v, true);
        },
        aoEnviar: function (v) {
          return nu().then(function () { return nuvem.criarConta(v.email, v.senha); }).then(function (r) {
            if (r && r.precisaConfirmar) {
              return { mensagem: "Enviamos um link de confirmação para " + v.email + ". Abra o e-mail e clique no link; depois volte e entre.", limpar: true };
            }
            return { fechar: true };
          });
        }
      });
    }
    return montarFormulario({
      campos: [{ rotulo: "E-mail", tipo: "email", nome: "email", auto: "email" }],
      rotuloEnviar: "Enviar link",
      validar: function (v) { return emailValido(v.email) ? "" : "Informe um e-mail válido."; },
      aoEnviar: function (v) {
        return nu().then(function () { return nuvem.esqueciSenha(v.email); }).then(function () {
          return { mensagem: "Se existir uma conta com esse e-mail, enviamos um link para definir uma nova senha.", limpar: true };
        });
      }
    });
  }

  function abrirConta(abaInicial) {
    var corpo = el("div", "conta-corpo");
    var abas = el("div", "conta-abas");
    abas.setAttribute("role", "tablist");
    var painel = el("div", "conta-painel");
    painel.setAttribute("role", "tabpanel");
    var botoes = {};

    function selecionar(id, focarCampo) {
      ABAS.forEach(function (a) {
        var ativa = a.id === id;
        botoes[a.id].setAttribute("aria-selected", ativa ? "true" : "false");
        botoes[a.id].tabIndex = ativa ? 0 : -1;
        botoes[a.id].className = "conta-aba" + (ativa ? " conta-aba-ativa" : "");
      });
      painel.textContent = "";
      var f = formAba(id);
      painel.appendChild(f.form);
      painel.setAttribute("aria-labelledby", "conta-aba-" + id);
      if (focarCampo) f.inputs.email.focus();
      return f;
    }

    ABAS.forEach(function (a, idx) {
      var b = el("button", "conta-aba", a.rotulo);
      b.type = "button";
      b.id = "conta-aba-" + a.id;
      b.setAttribute("role", "tab");
      b.addEventListener("click", function () { selecionar(a.id, true); });
      b.addEventListener("keydown", function (ev) {
        var d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        var n = ABAS[(idx + d + ABAS.length) % ABAS.length].id;
        selecionar(n, false);
        botoes[n].focus();
        ev.preventDefault();
      });
      botoes[a.id] = b;
      abas.appendChild(b);
    });
    corpo.appendChild(abas);
    corpo.appendChild(painel);
    abrirDialogo("Sua conta", corpo, null, null);
    var f = selecionar(abaInicial || "entrar", false);
    f.inputs.email.focus();
  }

  /* ---------- Nova senha (voltou do link "esqueci a senha") ---------- */
  function abrirNovaSenha() {
    var f = montarFormulario({
      campos: [
        { rotulo: "Nova senha (mínimo 6 caracteres)", tipo: "password", nome: "senha", auto: "new-password" },
        { rotulo: "Confirmar nova senha", tipo: "password", nome: "confirmar", auto: "new-password" }
      ],
      rotuloEnviar: "Salvar nova senha",
      validar: function (v) { return validarSenhas(v, true); },
      aoEnviar: function (v) {
        return nuvem.definirNovaSenha(v.senha).then(function () {
          return { mensagem: "Senha alterada com sucesso. Você já pode fechar esta janela.", limpar: true };
        });
      }
    });
    var corpo = el("div", "conta-corpo");
    corpo.appendChild(el("p", "conta-texto", "Escolha uma nova senha para a sua conta."));
    corpo.appendChild(f.form);
    abrirDialogo("Definir nova senha", corpo, null, f.inputs.senha);
  }

  /* ---------- Pergunta do primeiro login ---------- */
  var NOMES_DADOS = { planner: "Planner", flashcards: "Flashcards", planos: "Planos de estudo", preferencias: "Preferências" };

  function nomeDaChave(chave) {
    var m = /^estudos\.([^.]+)\./.exec(String(chave));
    var id = m ? m[1] : String(chave);
    return NOMES_DADOS[id] || id;
  }

  function listaDados(chaves) {
    if (!chaves || !chaves.length) return "nenhum dado";
    return chaves.map(nomeDaChave).join(", ");
  }

  function perguntarPrimeiroLogin(info) {
    info = info || {};
    return new Promise(function (resolver) {
      var feito = false;
      function responder(valor) {
        if (feito) return;
        feito = true;
        aoFecharAtual = null;
        resolver(valor);
        fecharDialogo();
      }
      var corpo = el("div", "conta-corpo");
      corpo.appendChild(el("p", "conta-texto", "Encontramos dados neste aparelho e também na sua conta. Escolha o que fazer:"));

      var resumo = el("dl", "conta-resumo");
      var dt1 = el("dt", null, "Neste aparelho");
      var dd1 = el("dd", null, listaDados(info.chavesLocais));
      var dt2 = el("dt", null, "Na nuvem");
      var dd2 = el("dd", null, listaDados(info.chavesNuvem));
      resumo.appendChild(dt1); resumo.appendChild(dd1);
      resumo.appendChild(dt2); resumo.appendChild(dd2);
      corpo.appendChild(resumo);

      var opcoes = [
        { id: "juntar", titulo: "Juntar os dois", classe: "botao-primario",
          desc: "Combina os dados deste aparelho com os da nuvem. Nada é perdido (recomendado)." },
        { id: "enviar", titulo: "Enviar os dados deste aparelho", classe: "botao-perigo",
          desc: "Atenção: substitui os dados da nuvem pelos deste aparelho." },
        { id: "nuvem", titulo: "Usar os dados da nuvem", classe: "botao-perigo",
          desc: "Atenção: substitui os dados deste aparelho pelos da nuvem." }
      ];
      var lista = el("div", "conta-opcoes");
      var primeiro = null;
      opcoes.forEach(function (o) {
        var b = el("button", "botao conta-opcao " + o.classe);
        b.type = "button";
        b.appendChild(el("span", "conta-opcao-titulo", o.titulo));
        b.appendChild(el("span", "conta-opcao-desc", o.desc));
        b.addEventListener("click", function () { responder(o.id); });
        if (!primeiro) primeiro = b;
        lista.appendChild(b);
      });
      corpo.appendChild(lista);
      var acoes = el("div", "conta-acoes");
      var cancelar = el("button", "botao", "Cancelar");
      cancelar.type = "button";
      cancelar.addEventListener("click", function () { responder(null); });
      acoes.appendChild(cancelar);
      corpo.appendChild(acoes);
      corpo.appendChild(el("p", "conta-dica", "Cancelar não sincroniza agora; perguntaremos de novo na próxima vez."));

      abrirDialogo("Sincronizar seus dados", corpo, function () { if (!feito) { feito = true; resolver(null); } }, primeiro);
    });
  }

  /* ---------- Cabeçalho ---------- */
  var area = null;
  var textosStatus = { salvo: "Salvo", salvando: "Salvando...", offline: "Offline", erro: "Erro" };

  function botaoEntrar(classe) {
    var b = el("button", classe, "Entrar");
    b.type = "button";
    b.addEventListener("click", function () { abrirConta("entrar"); });
    return b;
  }

  function renderCabecalho(est) {
    if (!area) return;
    area.textContent = "";
    if (!est.logado) {
      area.appendChild(botaoEntrar("botao conta-btn-entrar"));
      return;
    }
    var email = el("span", "conta-email", est.email || "");
    email.title = est.email || "";
    area.appendChild(email);
    if (est.status && est.status !== "desligado" && textosStatus[est.status]) {
      var st = el("span", "conta-status conta-status-" + est.status);
      st.setAttribute("role", "status");
      st.appendChild(el("span", "conta-ponto"));
      st.appendChild(el("span", "conta-status-texto", textosStatus[est.status]));
      var dica = {
        salvo: "Seus dados estão salvos na nuvem.",
        salvando: "Enviando alterações para a nuvem…",
        offline: "Sem conexão com a nuvem; as alterações ficam neste aparelho e serão enviadas depois." +
          (est.pendentes ? " Pendentes: " + est.pendentes + "." : ""),
        erro: est.erro || "Erro ao sincronizar."
      };
      st.title = dica[est.status];
      area.appendChild(st);
    }
    var sair = el("button", "botao conta-btn-sair", "Sair");
    sair.type = "button";
    sair.addEventListener("click", function () {
      sair.disabled = true;
      Promise.resolve().then(function () { return nuvem.sair(); }).then(null, function (e) {
        sair.disabled = false;
        avisar(msgErro(e), true);
      });
    });
    area.appendChild(sair);
  }

  /* ---------- Rodapé ---------- */
  function renderRodape(est) {
    var r = document.getElementById("rodape");
    if (!r) return;
    if (RODAPE_ORIGINAL === null) RODAPE_ORIGINAL = r.textContent;
    r.textContent = "";
    if (est.logado) {
      r.appendChild(document.createTextNode("Dados sincronizados na nuvem (" + (est.email || "") + "). "));
    } else {
      r.appendChild(document.createTextNode("Dados salvos só neste aparelho. Entre para salvar na nuvem. "));
      var l = el("button", "conta-link", "Entrar");
      l.type = "button";
      l.addEventListener("click", function () { abrirConta("entrar"); });
      r.appendChild(l);
      r.appendChild(document.createTextNode(" "));
    }
    r.appendChild(document.createTextNode("Faça backup com “Exportar backup”."));
  }

  /* ---------- Avisos ---------- */
  function avisar(texto, erro) {
    var t = document.getElementById("aviso-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "aviso-toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.className = "aviso-toast" + (erro ? " erro" : "");
    t.textContent = texto;
    setTimeout(function () { t.className = "oculto"; }, 4000);
  }

  var avisoAtualizada = null;
  function mostrarAtualizada() {
    if (avisoAtualizada && document.contains(avisoAtualizada)) return;
    var a = el("div", "conta-aviso");
    a.setAttribute("role", "status");
    a.appendChild(el("span", "conta-aviso-texto", "Dados atualizados de outro aparelho"));
    var rec = el("button", "botao botao-primario", "Recarregar");
    rec.type = "button";
    rec.addEventListener("click", function () { window.location.reload(); });
    var fechar = el("button", "botao", "Agora não");
    fechar.type = "button";
    fechar.addEventListener("click", function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      avisoAtualizada = null;
    });
    a.appendChild(rec);
    a.appendChild(fechar);
    document.body.appendChild(a);
    avisoAtualizada = a;
  }

  /* ---------- Início ---------- */
  function atualizar(est) {
    est = est || estado();
    renderCabecalho(est);
    renderRodape(est);
  }

  function iniciar() {
    area = document.getElementById("conta-area");
    if (!nuvem) {
      if (area) area.className = "oculto"; // sem nuvem: o app segue só local
      return;
    }
    try {
      if (typeof nuvem.definirPerguntaPrimeiroLogin === "function") nuvem.definirPerguntaPrimeiroLogin(perguntarPrimeiroLogin);
      if (typeof nuvem.aoMudar === "function") nuvem.aoMudar(atualizar);
    } catch (e) { /* mantém o app funcionando */ }
    atualizar();
    window.addEventListener("estudos:recuperar-senha", abrirNovaSenha);
    window.addEventListener("estudos:nuvem-atualizada", mostrarAtualizada);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
