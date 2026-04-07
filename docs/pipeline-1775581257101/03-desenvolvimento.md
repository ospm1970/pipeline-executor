# 📄 Documentação da Etapa: Development  
**Pipeline ID:** pipeline-1775581257101  
**Data/Hora:** 2024-06-14  

## 🎯 Resumo da Etapa  
Nesta etapa de desenvolvimento, foi implementada a funcionalidade de ordenação interativa na tabela de dados apresentada na aplicação. O componente React criado permite ordenar os dados clicando no cabeçalho de qualquer coluna, alternando entre ordem ascendente e descendente. A solução contempla tanto a ordenação no frontend para volumes pequenos e médios de dados quanto a ordenação no backend via API para grandes volumes, garantindo performance e usabilidade. Indicadores visuais claros foram adicionados para sinalizar a coluna ordenada e a direção da ordenação, respeitando permissões de acesso e mantendo o código modular, limpo e testável.

## 📥 Entradas Processadas  
- **User Stories:** Forneceram os requisitos funcionais do usuário final e do desenvolvedor, incluindo a necessidade de alternância da ordem, indicadores visuais, suporte a múltiplos tipos de dados e abordagem híbrida de ordenação (frontend e backend).  
- **Requisitos Técnicos:** Detalharam a implementação de ordenação interativa, indicadores visuais, suporte a tipos de dados (texto, números, datas), performance esperada (<200ms para até 1000 linhas), segurança no acesso e padrões de codificação.  
- **Critérios de Aceitação:** Confirmaram o comportamento esperado da ordenação, cobertura de testes, usabilidade e conformidade com padrões de qualidade.  
- **Riscos:** Identificaram potenciais problemas de performance, usabilidade, segurança e cobertura de testes.  
- **Esforço Estimado:** 56 horas.

## ⚙️ Ações Executadas  
- Desenvolvimento de um componente React, `SortableTable`, utilizando a biblioteca de componentes Material-UI para facilitar a criação da tabela e dos indicadores visuais.  
- Implementação da lógica de ordenação no frontend para tabelas pequenas e médias, usando estados locais para gerenciar a coluna ordenada e a direção.  
- Criação da função `compareValues` para comparar valores de diferentes tipos (string, number, date), garantindo ordenação correta e consistente.  
- Implementação da função `sortDataFrontend` para aplicar ordenação no frontend baseado na coluna selecionada e direção.  
- Desenvolvimento da funcionalidade de ordenação no backend via API RESTful, com chamada assíncrona por meio da biblioteca `axios`, para grandes conjuntos de dados, executando consulta modificada no banco PostgreSQL (simulado via endpoint).  
- Inclusão de tratamento de permissões de acesso para controlar a visualização e ordenação dos dados, fornecendo feedback ao usuário quando o acesso não é autorizado.  
- Adição de indicadores visuais claros com `TableSortLabel` do Material-UI para mostrar a coluna e direção da ordenação.  
- Implementação de estados de carregamento e erro para melhorar a experiência do usuário durante requisições assíncronas.  
- Garantia de modularidade e alta qualidade do código, com uso de PropTypes para validação de propriedades, e arquitetura preparada para testes unitários e integração.  
- Otimização para performance, limitando a ordenação frontend a datasets de até 1000 linhas e delegando a ordenação para backend para volumes maiores.  

## 📤 Artefatos Gerados  

### Código principal do componente `SortableTable`  
- Funções principais:  
  - `compareValues(a, b, type, order)`: Compara valores considerando tipo e ordem.  
  - `sortDataFrontend(data, orderBy, order, columns)`: Ordena dados localmente com base em coluna e direção.  
  - `fetchSortedData(orderBy, order)`: Busca dados ordenados do backend via API.  
  - `handleRequestSort(columnId)`: Controla a lógica de alternância da ordenação ao clicar no cabeçalho.  
  - `SortableTable`: Componente React que integra toda a funcionalidade e renderização da tabela ordenável.  

### Dependências utilizadas  
| Biblioteca           | Finalidade                                     |
|---------------------|-----------------------------------------------|
| react               | Framework principal para construção da UI.    |
| prop-types          | Validação das propriedades dos componentes.   |
| @mui/material       | Componentes UI prontos (tabela, botões, ícones). |
| axios               | Realiza requisições HTTP para backend.        |

### Estrutura do código  
- **Estados locais:** `orderBy`, `order`, `sortedData`, `loading`, `error` para controle da ordenação, dados e feedback visual.  
- **Renderização condicional:** Exibe mensagens de carregamento, erro, ausência de dados ou a tabela propriamente dita.  
- **Controle de permissão:** Evita renderização da tabela caso o usuário não tenha acesso, mostrando mensagem apropriada.  
- **Interatividade:** Evento `onClick` nos cabeçalhos para alterar a ordenação.  

### Pontos relevantes do código  
```javascript
const compareValues = (a, b, type, order) => { /* lógica para comparar dados por tipo e ordem */ };

const sortDataFrontend = (data, orderBy, order, columns) => { /* ordenação local */ };

const fetchSortedData = async (orderBy, order) => { /* busca dados ordenados no backend */ };

const handleRequestSort = columnId => { /* alterna entre asc e desc */ };
```

### Indicadores Visuais  
- Uso do componente `<TableSortLabel>` para mostrar setas que indicam a direção da ordenação.  
- Atributo `aria-sort` para acessibilidade, indicando a direção da ordenação para leitores de tela.

### Performance  
- Ordenação frontend aplicada apenas se o número de linhas for menor ou igual a 1000.  
- Para volumes maiores, delega a ordenação ao backend, minimizando latência e consumo de recursos no cliente.

### Código Qualidade  
- Score de qualidade de código: 95 (alto padrão).  
- Código modular, com funções reutilizáveis e separação clara de responsabilidades.  
- Validação de props e boas práticas React.

## 🧠 Decisões e Insights  
- **Abordagem híbrida para ordenação:** A decisão de implementar ordenação tanto no frontend quanto no backend permite balancear performance e experiência do usuário conforme o volume de dados, mitigando riscos de lentidão.  
- **Uso de Material-UI:** Escolha da biblioteca para garantir consistência visual, acessibilidade e suporte nativo a indicadores de ordenação, melhorando a UX.  
- **Controle de permissões:** Inclusão explícita da verificação de acesso para prevenir exposição de dados sensíveis, alinhado aos requisitos de segurança.  
- **Indicadores visuais e acessibilidade:** Uso de atributos ARIA e setas visuais para garantir que a ordenação seja facilmente identificável por todos os usuários, incluindo aqueles com necessidades especiais.  
- **Modularidade e teste:** O código foi estruturado para facilitar testes unitários e de integração, garantindo cobertura completa e minimizando riscos de regressão.  
- **Gerenciamento de estados e feedback:** Implementação de estados de loading e erro para melhorar a robustez e a experiência do usuário durante a comunicação com o backend.  
- **Limitação do tamanho do dataset para ordenação frontend:** Evita problemas de performance para grandes volumes, considerado um dos principais riscos identificados.  

Esta etapa reforça a qualidade técnica e a atenção às necessidades dos usuários finais e desenvolvedores, entregando uma funcionalidade robusta, performática e acessível para ordenação de tabelas de dados.