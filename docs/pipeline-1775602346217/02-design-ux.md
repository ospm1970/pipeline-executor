# 📄 Documentação da Etapa: UX Design
**Pipeline ID:** pipeline-1775602346217  
**Data/Hora:** 2026-04-07 22:53:40 (UTC)

## 🎯 Resumo da Etapa
Nesta etapa de UX Design, foram definidas as especificações detalhadas da interface e experiência do usuário para a aplicação que solicita três palavras em português e gera uma frase motivacional usando a API do ChatGPT. O objetivo foi garantir uma interação intuitiva, acessível e responsiva, alinhada às user stories e requisitos técnicos previamente levantados. O design contempla a jornada dos diferentes perfis de usuários, a arquitetura da informação, a estrutura visual e a usabilidade conforme as diretrizes WCAG 2.1 nível AA.

## 📥 Entradas Processadas
Foram utilizadas como base para o design as seguintes informações recebidas:

- **User Stories:** Sete histórias de usuários envolvendo inserção e validação das palavras, geração e exibição da frase, autenticação, manutenção do código e acessibilidade.
- **Requisitos Técnicos:** Implementação em React e NestJS, validações, tratamento de erros, tempo máximo de resposta, proteção da API, testes, responsividade e deploy em nuvem.
- **Critérios de Aceitação:** Validação do formulário, frase gerada em português contendo as palavras, tempo máximo de resposta, acessibilidade, cobertura de testes e monitoramento.
- **Riscos Identificados:** Possíveis falhas da API, latência, segurança da chave API e desafios de acessibilidade.

## ⚙️ Ações Executadas
- Definição das **personas** principais para guiar a experiência (usuário comum, administrador e desenvolvedor).
- Mapeamento dos **fluxos principais** (jornada do usuário final, administrador e desenvolvedor).
- Identificação dos **pontos de atrito** para mitigar problemas de usabilidade e performance.
- Planejamento da **arquitetura da informação**, incluindo hierarquia, navegação e categorização dos elementos da interface.
- Especificação da **estrutura do layout**, adotando layout de coluna única centralizada com responsividade para mobile, tablet e desktop.
- Desenvolvimento do **design system** com tipografia, paleta de cores acessível, espaçamentos modulados e componentes reutilizáveis.
- Definição das diretrizes de **acessibilidade** para conformidade WCAG 2.1 nível AA, incluindo navegação por teclado, suporte a leitores de tela e contraste de cor.
- Elaboração dos estados de interação (default, hover, active, disabled, error), animações e feedback visual durante carregamento e erro.
- Organização da exibição do conteúdo, incluindo mensagens de erro próximas aos campos, indicador de carregamento e área destacada para a frase gerada.

## 📤 Artefatos Gerados

### 1. Jornada do Usuário

| Persona                   | Descrição                                                                                   |
|--------------------------|---------------------------------------------------------------------------------------------|
| Usuário comum            | Busca inspiração rápida, prefere interface simples e direta.                                |
| Administrador do sistema | Controla segurança e monitora chamadas à API do ChatGPT.                                   |
| Desenvolvedor            | Foca em manutenção, testes e escalabilidade.                                               |

### Fluxos Principais

- Usuário acessa → visualiza formulário com 3 campos → insere palavras → submete → indicador de carregamento → recebe frase motivacional → frase exibida destacada → opção de nova busca.
- Administrador acessa painel externo → verifica logs e segurança da API → ajusta configurações.
- Desenvolvedor executa testes unitários → valida funcionalidades → atualiza documentação.

### Pontos de Atrito Identificados

- Validação de exatamente três palavras.
- Tempo de resposta e feedback visual claro.
- Possíveis incoerências na frase gerada.
- Acessibilidade para usuários com necessidades especiais.
- Proteção da chave API.

---

### 2. Arquitetura da Informação

- **Hierarquia:** Aplicação single-page com sequência linear: título → instruções → formulário → botão → carregamento → resultado → mensagens de erro.
- **Navegação:**  
  - Home (única view principal)  
  - Painel administrativo (acesso restrito)  
  - Links institucionais no rodapé (política de privacidade, termos de uso)
- **Categorias:**  
  - Entrada de dados: formulário com três campos.  
  - Processamento: indicador visual.  
  - Resultado: área destacada da frase motivacional.  
  - Mensagens: validação e erros próximos aos campos.

---

### 3. Layout e Componentes

- **Tipo:** Layout de coluna única, centrado.
- **Componentes:**  
  - Header com título da aplicação.  
  - Instruções curtas para o usuário.  
  - Formulário com três campos de texto (horizontal no desktop, vertical em mobile/tablet).  
  - Botão de envio abaixo do formulário.  
  - Indicador de carregamento (spinner azul) abaixo do botão.  
  - Área de resultado destacada para frase.  
  - Rodapé com links institucionais.

- **Responsividade:**  
  - Mobile: campos empilhados verticalmente, espaçamento generoso.  
  - Tablet: campos alinhados horizontalmente se possível, botão próximo.  
  - Desktop: campos alinhados em linha centralizada, botão ao lado ou abaixo, área de resultado em destaque.

---

### 4. Design System

| Aspecto       | Detalhes                                                                                                    |
|---------------|------------------------------------------------------------------------------------------------------------|
| Tipografia    | Fonte sans-serif moderna (Inter ou Roboto), tamanhos escaláveis: Título 32px, subtítulos 24px, texto 16px. |
| Cores         | Azul escuro (#1E3A8A), azul claro (#3B82F6), branco (#FFFFFF), cinza claro (#E5E7EB), vermelho (#EF4444), verde (#10B981). |
| Espaçamento   | Modular baseado em múltiplos de 4px: 8px, 16px, 24px, 32px.                                                |
| Componentes   | Inputs com bordas arredondadas (6px), padding 12px, foco azul com sombra; Botões azul claro com hover; Spinner azul; Caixa de resultado com fundo azul claro; Mensagens de erro em vermelho. |

---

### 5. Acessibilidade (WCAG 2.1 Nível AA)

- Navegação por teclado com tabulação lógica e foco visível.
- Labels explícitos para campos via HTML/aria-label.
- Mensagens dinâmicas anunciadas via aria-live.
- Status de carregamento informado para leitores de tela.
- Contraste mínimo 4.5:1 entre texto e fundo para todos os elementos.

---

### 6. Interações e Estados

| Estado    | Descrição                                                                                                    |
|-----------|--------------------------------------------------------------------------------------------------------------|
| Default   | Bordas cinza clara, texto padrão.                                                                            |
| Hover     | Bordas e fundo do botão escurecem suavemente, cursor pointer.                                                |
| Active    | Botão escurecido, ligeira depressão visual.                                                                  |
| Disabled  | Opacidade reduzida, cursor não interativo.                                                                   |
| Error     | Bordas e texto em vermelho, mensagem de erro exibida abaixo dos campos.                                      |

- Animações suaves de 200ms em hover e active.
- Spinner animado durante carregamento.
- Frase gerada aparece com efeito fade-in de 300ms.
- Durante carregamento, inputs e botão ficam desabilitados.
- Área de resultado oculta antes do envio, com mensagem instrutiva clara.

## 🧠 Decisões e Insights
- Optou-se por layout de página única para simplicidade e foco na tarefa principal.
- A experiência foi projetada para minimizar fricções comuns, como erro na quantidade de palavras e falta de feedback visual.
- Prioridade alta na acessibilidade para garantir uso por todos os perfis, seguindo WCAG 2.1 AA.
- A estrutura modular e componentes reutilizáveis facilitam manutenção e futuras atualizações.
- Definiu-se clara separação entre interface do usuário e painel administrativo para segurança.
- A proteção da chave da API e monitoramento de uso foram considerados cruciais para evitar abusos.
- O tempo de resposta máximo de 3 segundos orientou o design do carregamento e feedbacks.
- A inclusão de mensagens claras e visuais para erros e estados vazios visa reduzir frustração do usuário.

Esta especificação de UX Design fornecerá base sólida para as etapas subsequentes de desenvolvimento, testes e implantação, garantindo uma aplicação funcional, segura e agradável para o usuário final.