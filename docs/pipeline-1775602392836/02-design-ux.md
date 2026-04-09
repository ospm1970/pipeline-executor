# 📄 Documentação da Etapa: UX Design  
**Pipeline ID:** pipeline-1775602392836  
**Data/Hora:** 2026-04-07 22:54:40  

## 🎯 Resumo da Etapa  
Nesta etapa de UX Design, foram elaboradas as especificações detalhadas da experiência do usuário para a aplicação de geração de frases motivacionais a partir de três palavras em português fornecidas pelo usuário. O foco principal foi mapear as jornadas dos usuários, definir a arquitetura da informação, estruturar o layout e componentes da interface, estabelecer o design system e garantir acessibilidade e responsividade. O objetivo foi criar uma interface intuitiva, moderna e segura que atenda aos requisitos técnicos e às necessidades dos diferentes perfis de usuários envolvidos.

## 📥 Entradas Processadas  
Foram recebidas as seguintes informações para embasar o design:  

- User Stories detalhadas contemplando as expectativas de usuários finais, administradores e desenvolvedores.  
- Requisitos técnicos para implementação do frontend e backend, integração com a API do ChatGPT, validação e segurança.  
- Critérios de aceitação que definem padrões para validação da experiência e funcionalidade.  
- Riscos técnicos e de usabilidade identificados previamente.  
- Estimativa de esforço para implementação (80 horas).  

## ⚙️ Ações Executadas  
- Definição de personas representativas (usuário final, administrador, desenvolvedor) com seus objetivos e pontos de dor.  
- Mapeamento dos principais fluxos e jornadas do usuário dentro da aplicação.  
- Criação da arquitetura da informação com hierarquia clara, categorização e navegação simplificada.  
- Especificação detalhada da estrutura e layout da interface, incluindo comportamento responsivo para dispositivos móveis, tablets e desktops.  
- Desenvolvimento do design system contemplando tipografia, paleta de cores, espaçamentos e componentes reutilizáveis.  
- Estabelecimento das diretrizes de acessibilidade conforme o nível WCAG AA, incluindo navegação por teclado e suporte a leitores de tela.  
- Definição dos estados de interação e animações para melhorar o feedback visual e a experiência do usuário.  
- Documentação completa das especificações para orientar as próximas fases de desenvolvimento e testes.  

## 📤 Artefatos Gerados  

### Personas  
| Nome   | Papel           | Objetivos Principais                                         | Pontos de Dor Principais                              |
|--------|-----------------|-------------------------------------------------------------|------------------------------------------------------|
| João   | Usuário final   | Inserir palavras, receber frases motivacionais claras, experiência fluida e responsiva | Mensagens de erro confusas, frases pouco legíveis, falta de feedback visual |
| Ana    | Administrador   | Segurança das chaves API, monitoramento, manutenção segura   | Exposição da chave no frontend, dificuldade na manutenção |
| Carlos | Desenvolvedor   | Código modular e documentado, testes automatizados, integração eficiente | Código monolítico, documentação insuficiente, tratamento de erros inadequado |

### Jornadas e Fluxos Principais  
- Inserção e validação de três palavras em português pelo usuário.  
- Envio das palavras ao backend e geração da frase motivacional via ChatGPT.  
- Visualização destacada da frase gerada com possibilidade de reiniciar o processo.  
- Feedback visual durante a geração da frase (loader/spinner).  
- Exibição clara de mensagens de erro em caso de falhas.  
- Monitoramento e segurança gerenciados pelo administrador e desenvolvedor (fora da UI principal).

### Arquitetura da Informação  
- **Hierarquia:** Página única com formulário no topo, frase motivacional em destaque abaixo, mensagens de erro/feedback logo abaixo da frase, botão de reiniciar no rodapé.  
- **Navegação:**  
  - Home: única tela com formulário e resultado.  
  - Página/admin para monitoramento (não acessível via frontend principal).  
  - Footer opcional com links para política de privacidade e contato.  
- **Categorias:** Entrada (formulário), Saída (frase gerada), Feedback (mensagens e status), Controles (botões de envio e reinício).

### Estrutura do Layout  
- Layout de coluna única centralizada.  
- Componentes:  
  - Header com título e descrição breve.  
  - Formulário com três campos de texto alinhados horizontalmente no desktop e empilhados verticalmente no mobile.  
  - Botão de envio posicionado abaixo do formulário.  
  - Área destacada para frase motivacional, centralizada e legível.  
  - Mensagens de erro visíveis abaixo da frase.  
  - Botão de reiniciar visível após a geração da frase.  
- Responsividade:  
  - Mobile: campos empilhados verticalmente, texto e botões centralizados, fonte maior para legibilidade.  
  - Tablet: campos alinhados em linha única, botão ao lado ou abaixo, uso simples de grid.  
  - Desktop: campos alinhados horizontalmente, espaço em branco para foco visual, tipografia destacada.

### Design System  
- **Tipografia:** Fonte sans-serif (Inter ou Roboto), tamanhos base 16px, títulos entre 24-32px, frases com 28-36px, pesos variados para hierarquia visual.  
- **Paleta de Cores:**  
  - Primária: azul (#2563EB) para botões e destaques.  
  - Secundária: cinza escuro (#1F2937) para textos.  
  - Fundo: cinza claro (#F3F4F6).  
  - Erros: vermelho (#DC2626).  
  - Sucesso/carregamento: verde (#16A34A).  
- **Espaçamento:** Múltiplos de 4px (pequenos: 8px, médios: 16px, grandes: 24-32px) para consistência visual.  
- **Componentes:**  
  - Inputs com bordas arredondadas e foco azul.  
  - Botões com estados diferenciados (normal, hover, ativo, disabled).  
  - Mensagens de erro em vermelho com ícone opcional.  
  - Frases motivacionais em área destacada com sombra sutil.  
  - Loader simples próximo ao botão durante requisições.

### Acessibilidade  
- Nível WCAG AA garantido.  
- Navegação por teclado com foco visível e ordem lógica.  
- Uso correto de landmarks e labels acessíveis via `aria-label` e `aria-describedby`.  
- Frase gerada anunciada dinamicamente com `aria-live polite`.  
- Contraste adequado para textos e elementos interativos (mínimo 4.5:1 para texto normal).

### Interações e Estados  
- Estados dos inputs e botões: default, hover, active, disabled e error.  
- Animações suaves de 150-250ms para foco, hover e erro.  
- Fade-in para exibição da frase motivacional.  
- Spinner rotativo discreto durante carregamento.  
- Estado de carregamento com botão desabilitado e texto "Gerando frase...".  
- Estado vazio inicial com texto sugestivo "Insira três palavras para receber sua frase motivacional".

## 🧠 Decisões e Insights  
- Optou-se por um layout de página única para simplificar a navegação e foco no fluxo principal do usuário.  
- A responsividade foi priorizada para garantir acessibilidade e boa experiência em dispositivos móveis, tablets e desktops.  
- O design system foi estruturado para suportar facilmente variações futuras e manter consistência visual.  
- Foram incorporadas práticas robustas de acessibilidade para ampliar o alcance da aplicação a usuários com necessidades especiais.  
- O uso de feedback visual durante a geração da frase visa mitigar o risco de percepção de lentidão, dado o tempo máximo de 5 segundos estipulado.  
- As mensagens de erro foram desenhadas para serem claras e amigáveis, reduzindo a confusão do usuário final.  
- A modularidade e documentação do design visam facilitar a colaboração entre designers, desenvolvedores e administradores.  
- A segregação das responsabilidades (usuário, administrador, desenvolvedor) foi refletida nas jornadas para garantir que cada perfil tenha suas necessidades contempladas.  
- Riscos como exposição da chave API e falhas na geração de frases foram mitigados via design que prioriza segurança e feedback adequado.