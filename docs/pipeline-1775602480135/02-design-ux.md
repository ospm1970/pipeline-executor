# 📄 Documentação da Etapa: UX Design
**Pipeline ID:** pipeline-1775602480135  
**Data/Hora:** 07/04/2026 22:56:09

## 🎯 Resumo da Etapa
Nesta etapa de UX Design, foi elaborado o projeto detalhado da interface e experiência do usuário para a aplicação que gera frases motivacionais a partir de três palavras inseridas pelo usuário. O foco principal foi garantir uma interface simples, responsiva e acessível, com fluxos claros, feedback visual adequado e segurança no manuseio das chaves da API. Foram definidos os perfis dos usuários, jornadas, arquitetura da informação, estrutura de layout, sistema de design, diretrizes de acessibilidade e interações esperadas, contemplando todos os requisitos técnicos e critérios de aceitação previamente estabelecidos.

## 📥 Entradas Processadas
- User stories detalhando necessidades dos usuários finais, administrador e desenvolvedor.
- Requisitos técnicos que incluem validação de formulário, integração com API ChatGPT, responsividade, acessibilidade, segurança, usabilidade e performance.
- Critérios de aceitação específicos para funcionalidade, usabilidade, performance e segurança.
- Riscos associados à dependência da API, validação, segurança e deploy.
- Estimativa de esforço para desenvolvimento e testes.

## ⚙️ Ações Executadas
- Identificação e descrição das personas principais (usuário final, administrador e desenvolvedor).
- Mapeamento das jornadas de uso, contemplando fluxo principal, fluxos alternativos e pontos de atrito potenciais.
- Definição da arquitetura da informação com categorização clara das seções da interface e navegação simplificada.
- Estruturação do layout em coluna única com disposição responsiva para dispositivos móveis, tablets e desktops.
- Criação do design system incluindo tipografia, paleta de cores, espaçamentos e componentes visuais com foco em usabilidade e acessibilidade.
- Especificação das diretrizes de acessibilidade conforme WCAG nível AA, incluindo navegação por teclado e suporte a leitores de tela.
- Definição dos estados de interação, animações e comportamento do sistema durante carregamento, erro e estados vazios.
- Documentação das interações visuais como feedback de validação, loading spinner, mensagens de erro e transições suaves para melhor experiência do usuário.

## 📤 Artefatos Gerados

### Personas
| Nome  | Papel         | Descrição                                                                                       |
|-------|---------------|------------------------------------------------------------------------------------------------|
| Maria | Usuário Final | Usuária que busca frases motivacionais personalizadas em português, usa dispositivos móveis e desktop, espera respostas rápidas e claras. |
| João  | Administrador | Responsável pela gestão segura das chaves da API e configurações backend para segurança e confiabilidade. |
| Ana   | Desenvolvedora| Responsável pela manutenção e melhoria do código, garantindo modularidade, documentação e testes. |

### Jornadas de Usuário (Fluxos Principais)
- Usuário acessa app → vê formulário com 3 campos para palavras → insere 3 palavras válidas → envia formulário → spinner aparece → recebe frase motivacional incorporando as palavras → frase exibida destacada → usuário pode gerar nova frase.
- Usuário insere palavras inválidas → validação impede envio → usuário corrige entrada.
- Ocorrência de erro na API → spinner desaparece → mensagem amigável exibida → usuário pode tentar novamente.
- Administrador acessa backend → configura chaves da API de forma segura.

### Arquitetura da Informação
- **Hierarquia:** Tela única principal com foco no formulário de entrada, área de feedback para frase ou erros e botão de nova geração.
- **Navegação:**  
  - Tela Principal: Formulário → Exibição da Frase → Botão "Gerar Nova Frase"
- **Categorias:**  
  - Seção de Entrada: Três palavras com validação  
  - Seção de Saída: Exibição da frase motivacional  
  - Seção de Feedback: Spinner e mensagens de erro  
  - Seção de Ação: Botão para nova geração

### Estrutura do Layout
- Layout de coluna única centralizada.
- Componentes principais:  
  - Cabeçalho com título ou logo (opcional)  
  - Container do formulário com três campos de entrada alinhados horizontalmente ou empilhados em telas pequenas  
  - Botão de envio abaixo dos campos  
  - Spinner exibido próximo ao botão ou em overlay  
  - Área de exibição da frase, visualmente destacada  
  - Exibição de mensagens de erro próximas aos campos ou frase  
  - Botão "Gerar Nova Frase" visível após geração da frase

### Responsividade
| Dispositivo | Comportamento do Layout                                                                                 |
|-------------|--------------------------------------------------------------------------------------------------------|
| Mobile      | Campos empilhados verticalmente com largura total, botões também em largura total, fonte grande e legível, spinner inline ou overlay transparente. |
| Tablet      | Campos alinhados em linha com espaçamento, botões inline ou empilhados conforme espaço, frase destacada com fonte de tamanho moderado. |
| Desktop     | Campos alinhados horizontalmente com espaçamento, botões à direita ou abaixo dos campos, frase centralizada com fonte grande e espaçamento amplo. |

### Sistema de Design

| Aspecto      | Detalhes                                                                                       |
|--------------|------------------------------------------------------------------------------------------------|
| Tipografia   | Fonte primária 'Inter', sans-serif; Títulos: H1 (2rem), H2 (1.5rem); Texto corpo: 1rem, altura de linha 1.5; Frase motivacional com fonte maior (1.5-2rem), peso médio. |
| Cores        | Primária: Azul #2563EB; Secundária: Verde #16A34A; Fundo neutro: #F9FAFB; Texto: cinza escuro #111827; Erro: vermelho #DC2626; Spinner com cor primária. |
| Espaçamento  | Escala Tailwind CSS com incrementos de 4px; Padding em inputs/botões entre 12-16px; Espaçamento vertical entre componentes 16-24px; Espaçamento horizontal entre inputs 12-16px. |
| Componentes  | Inputs com bordas arredondadas, foco com anel azul, placeholders cinza claro, estado de erro com borda e mensagem vermelha; Botões com fundo azul, texto branco, cantos arredondados, hover escurece fundo, estado desabilitado esmaecido; Spinner circular animado azul; Caixa de frase com sombra sutil, cantos arredondados, fundo branco; Mensagens de erro em fonte pequena vermelha próximas aos inputs ou frase. |

### Acessibilidade
- Conformidade WCAG nível AA.
- Navegação por teclado: todos elementos interativos acessíveis via tab, shift+tab, enter e espaço, com indicadores visuais claros de foco.
- Uso de HTML semântico e atributos ARIA para labels, descrições e regiões dinâmicas.
- Spinner e mensagens de erro anunciados via aria-live polite.
- Contraste mínimo de 4.5:1 para texto e elementos interativos, incluindo mensagens de erro e foco.

### Interações e Estados
- Estados visuais:  
  - Default: estilo neutro para inputs e botões  
  - Hover: escurecimento do botão e destaque de borda nos inputs  
  - Ativo: efeito inset e intensificação de cor no botão  
  - Desabilitado: opacidade reduzida, sem interação  
  - Erro: bordas vermelhas nos inputs, mensagens visíveis
- Animações:  
  - Transições suaves (150ms) em hover e foco  
  - Spinner com rotação contínua via CSS keyframes  
  - Texto da frase com fade-in (300ms)  
  - Mensagens de erro com slide down ou fade-in
- Estado de carregamento:  
  - Ao enviar formulário, botão desabilitado e spinner exibido próximo ou em overlay para impedir múltiplas submissões  
  - Spinner desaparece ao receber frase ou erro
- Estado vazio:  
  - Área da frase exibe texto placeholder em cinza suave: "Insira três palavras para gerar uma frase motivacional" antes da entrada do usuário

## 🧠 Decisões e Insights
- Optou-se por layout de coluna única para simplificar a experiência e manter foco total na tarefa principal sem distrações.
- Definiu-se validação estrita no frontend para impedir envio de dados inválidos, reduzindo chamadas desnecessárias à API e melhorando a experiência.
- A implementação do spinner e mensagens amigáveis visa mitigar a percepção negativa em caso de latência ou falhas na API.
- A escolha de Tailwind CSS facilita a manutenção do design system e garante consistência visual e responsividade.
- A preocupação com acessibilidade assegura que a aplicação seja utilizável por um público amplo, incluindo pessoas com deficiências.
- Definiu-se o armazenamento seguro das chaves da API no backend para evitar riscos de exposição e garantir compliance com boas práticas de segurança.
- O detalhamento das jornadas e pontos de atrito permite antecipar problemas e planejar testes focados na experiência real dos usuários.
- As decisões tomadas visam equilibrar simplicidade, eficiência e segurança para entregar um produto final confiável, usável e alinhado com os requisitos de negócio e técnicos.