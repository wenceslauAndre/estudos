/*
 * flashcards-exemplos.js — Worker B. Ver CONTRATO.md.
 * Cartões de exemplo carregados por flashcards.js somente quando a chave
 * Estudos.CHAVES.flashcards ainda não existe no localStorage.
 * Cada item tem só { materia, semana, frente, verso }; id, contadores e datas
 * são preenchidos por flashcards.js.
 */
(function () {
  "use strict";

  window.FLASHCARDS_EXEMPLOS = [
    /* ---------- PES300 — Estatística e Probabilidade ---------- */
    {
      materia: "PES300", semana: 1,
      frente: "Como se calcula a média aritmética de um conjunto de dados?",
      verso: "Soma de todos os valores dividida pela quantidade de valores: x̄ = (Σxᵢ) / n."
    },
    {
      materia: "PES300", semana: 1,
      frente: "Qual a diferença entre média, mediana e moda?",
      verso: "Média: soma dos valores dividida por n. Mediana: valor central dos dados ordenados (com n par, média dos dois centrais). Moda: valor que mais se repete."
    },
    {
      materia: "PES300", semana: 2,
      frente: "Como se calcula a variância amostral e por que se divide por n − 1?",
      verso: "s² = Σ(xᵢ − x̄)² / (n − 1). Dividir por n − 1 (correção de Bessel) torna o estimador não viesado. A variância populacional divide por N: σ² = Σ(xᵢ − μ)² / N."
    },
    {
      materia: "PES300", semana: 2,
      frente: "O que é o desvio padrão e qual sua vantagem sobre a variância?",
      verso: "É a raiz quadrada da variância (s = √s²). Fica na mesma unidade dos dados, o que facilita interpretar a dispersão em torno da média."
    },
    {
      materia: "PES300", semana: 3,
      frente: "Qual a definição clássica (de Laplace) de probabilidade?",
      verso: "P(A) = número de casos favoráveis / número de casos possíveis, válida quando todos os resultados do espaço amostral são equiprováveis. Sempre 0 ≤ P(A) ≤ 1."
    },
    {
      materia: "PES300", semana: 4,
      frente: "O que é probabilidade condicional P(A|B)?",
      verso: "É a probabilidade de A ocorrer sabendo que B ocorreu: P(A|B) = P(A ∩ B) / P(B), com P(B) > 0."
    },
    {
      materia: "PES300", semana: 5,
      frente: "Quando dois eventos A e B são independentes?",
      verso: "Quando P(A ∩ B) = P(A) · P(B). Equivalentemente, P(A|B) = P(A): saber que B ocorreu não muda a probabilidade de A."
    },
    {
      materia: "PES300", semana: 6,
      frente: "Quais são a média e a variância de uma variável binomial X ~ B(n, p)?",
      verso: "E(X) = n · p e Var(X) = n · p · (1 − p), onde n é o número de ensaios independentes e p a probabilidade de sucesso em cada um."
    },
    {
      materia: "PES300", semana: 8,
      frente: "O que diz a regra empírica 68–95–99,7 da distribuição normal?",
      verso: "Cerca de 68% dos valores ficam a até 1 desvio padrão da média, 95% a até 2 e 99,7% a até 3 desvios padrão."
    },

    /* ---------- ADM200 — Gestão da Inovação e Desenvolvimento de Produtos ---------- */
    {
      materia: "ADM200", semana: 1,
      frente: "Qual a diferença entre inovação incremental e inovação radical?",
      verso: "Incremental: melhorias contínuas em produtos ou processos já existentes, com menor risco. Radical: rompe com o que existe, cria novos produtos, mercados ou tecnologias, com alto risco e incerteza."
    },
    {
      materia: "ADM200", semana: 1,
      frente: "Quais tipos de inovação o Manual de Oslo (3ª ed., 2005) define?",
      verso: "Inovação de produto, de processo, de marketing e organizacional. A 4ª edição (2018) reagrupa em inovação de produto e inovação de processo de negócio."
    },
    {
      materia: "ADM200", semana: 2,
      frente: "O que é inovação disruptiva, segundo Clayton Christensen?",
      verso: "Inovação que começa atendendo clientes ignorados pelos líderes (base do mercado ou não consumidores) com uma oferta mais simples e barata e, ao melhorar, acaba deslocando as empresas estabelecidas."
    },
    {
      materia: "ADM200", semana: 3,
      frente: "O que é o funil de inovação?",
      verso: "Modelo em que muitas ideias entram pela boca larga do funil e passam por etapas sucessivas de triagem e avaliação (geração de ideias, seleção, desenvolvimento, lançamento); só as mais promissoras chegam ao mercado."
    },
    {
      materia: "ADM200", semana: 4,
      frente: "Como funciona o modelo Stage-Gate (Robert Cooper)?",
      verso: "O desenvolvimento é dividido em estágios (conjuntos de atividades) separados por portões de decisão, onde o projeto é avaliado por critérios definidos e recebe: seguir, matar, segurar ou reciclar (go/kill/hold/recycle)."
    },
    {
      materia: "ADM200", semana: 5,
      frente: "O que é um MVP (Produto Mínimo Viável)?",
      verso: "A versão mais simples de um produto que permite testar hipóteses com clientes reais e aprender com o menor esforço possível, dentro do ciclo construir–medir–aprender do Lean Startup (Eric Ries)."
    },
    {
      materia: "ADM200", semana: 6,
      frente: "Qual a diferença entre inovação fechada e inovação aberta?",
      verso: "Fechada: a inovação depende só de P&D interno e sigiloso. Aberta (Henry Chesbrough): a empresa usa ideias e conhecimentos internos e externos — parcerias, startups, universidades, licenciamento — para inovar."
    },
    {
      materia: "ADM200", semana: 8,
      frente: "Quais são as etapas típicas do design thinking?",
      verso: "Empatia (entender o usuário), definição do problema, ideação, prototipagem e teste — de forma iterativa e centrada nas pessoas."
    },

    /* ---------- COM230 — Programação Orientada a Objetos ---------- */
    {
      materia: "COM230", semana: 1,
      frente: "Qual a diferença entre classe e objeto?",
      verso: "Classe é o modelo que define atributos (estado) e métodos (comportamento). Objeto é uma instância concreta dessa classe, criada em tempo de execução (ex.: new Conta())."
    },
    {
      materia: "COM230", semana: 2,
      frente: "O que é encapsulamento?",
      verso: "Ocultar o estado interno do objeto (atributos private) e expor apenas operações públicas controladas (métodos, getters/setters), protegendo a consistência dos dados."
    },
    {
      materia: "COM230", semana: 2,
      frente: "O que é um construtor?",
      verso: "Método especial, com o mesmo nome da classe e sem tipo de retorno, executado quando o objeto é criado para inicializar seus atributos. Pode ser sobrecarregado."
    },
    {
      materia: "COM230", semana: 3,
      frente: "O que é herança?",
      verso: "Mecanismo em que uma subclasse herda atributos e métodos de uma superclasse (extends, em Java), representando a relação \"é um\" e permitindo reuso e especialização."
    },
    {
      materia: "COM230", semana: 4,
      frente: "O que é polimorfismo?",
      verso: "Capacidade de tratar objetos de classes diferentes por um mesmo tipo (superclasse ou interface), com cada objeto executando sua própria versão do método — a escolha acontece em tempo de execução."
    },
    {
      materia: "COM230", semana: 5,
      frente: "Qual a diferença entre sobrecarga e sobrescrita de métodos?",
      verso: "Sobrecarga (overloading): mesmo nome com parâmetros diferentes, resolvida em compilação. Sobrescrita (overriding): a subclasse redefine um método herdado com a mesma assinatura (@Override), resolvida em execução."
    },
    {
      materia: "COM230", semana: 6,
      frente: "Classe abstrata x interface em Java: qual a diferença?",
      verso: "Classe abstrata não pode ser instanciada, pode ter atributos e métodos concretos, e uma classe só estende uma. Interface define um contrato (métodos abstratos; default e static desde o Java 8) e uma classe pode implementar várias."
    },
    {
      materia: "COM230", semana: 8,
      frente: "Quais são os modificadores de acesso em Java e seu alcance?",
      verso: "public: qualquer classe. protected: mesmo pacote e subclasses. Padrão (sem modificador): só o mesmo pacote. private: apenas a própria classe."
    }
  ];
})();
