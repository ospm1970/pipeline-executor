# 📄 Documentação da Etapa: Development  
**Pipeline ID:** pipeline-1775602480135  
**Data/Hora:** 2024-06-20  (geração automática)

## 🎯 Resumo da Etapa  
Nesta etapa de desenvolvimento, foi implementada uma aplicação web que solicita ao usuário três palavras em português e gera uma frase motivacional personalizada utilizando a API do ChatGPT. O backend foi desenvolvido em Node.js com Express, responsável pela validação das entradas, integração segura com a API OpenAI e retorno da frase gerada. O frontend foi construído em React.js com Tailwind CSS, oferecendo uma interface responsiva, acessível e amigável, com validação de entradas, feedback visual durante o processamento e tratamento robusto de erros. Além disso, foram criados testes automatizados para garantir a qualidade e estabilidade do código.

## 📥 Entradas Processadas  
- **User Stories**: demandando funcionalidades como validação rigorosa das três palavras, exibição clara da frase motivacional, feedback visual (spinner), segurança no armazenamento das chaves da API, interface responsiva e testabilidade do sistema.  
- **Requisitos Técnicos**: implementação do formulário, integração com API OpenAI, armazenamento seguro das chaves, deploy em cloud, e restrição de performance (tempo máximo de 5 segundos para geração da frase).  
- **Critérios de Aceitação**: validação do formulário, coerência da frase gerada, usabilidade da interface, tratamento de erros e qualidade do código.  
- **Riscos Avaliados**: dependência da API, possíveis falhas na integração, segurança das chaves, validação de entrada, acessibilidade e desafios no deploy.

## ⚙️ Ações Executadas  
- Desenvolvimento do backend em Node.js com Express, incluindo:  
  - Rota POST `/api/generate` para receber as três palavras e retornar a frase motivacional.  
  - Função `validateWords` para garantir que exatamente três palavras alfabéticas em português sejam enviadas.  
  - Integração com a API OpenAI ChatGPT (modelo GPT-4) para geração da frase motivacional com as palavras fornecidas.  
  - Tratamento de erros com respostas adequadas e mensagens amigáveis ao frontend.  
- Construção do frontend em React.js com Tailwind CSS, contemplando:  
  - Formulário com três campos de entrada, cada um validando individualmente as palavras inseridas (apenas caracteres alfabéticos).  
  - Estado de carregamento com spinner visual para feedback durante a requisição à API.  
  - Exibição destacada da frase motivacional gerada.  
  - Botão para geração de nova frase que reseta o formulário e os estados.  
  - Tratamento de erros exibidos de forma clara para o usuário.  
  - Implementação de acessibilidade através de atributos ARIA e foco visual.  
- Configuração e utilização de variáveis de ambiente para armazenamento seguro da chave da API OpenAI no backend.  
- Desenvolvimento de testes automatizados utilizando Jest e Supertest para:  
  - Validar entradas inválidas no backend.  
  - Confirmar retorno da frase motivacional para entradas válidas.  
- Otimização do código para manter alta qualidade, modularidade e documentação inline.  
- Garantia da responsividade e usabilidade da interface em dispositivos móveis e desktop.

## 📤 Artefatos Gerados  

| Artefato                | Descrição                                                                                   |
|-------------------------|---------------------------------------------------------------------------------------------|
| **Backend (server.js)** | Servidor Express configurado com rota `/api/generate`, validação de entrada e integração com OpenAI. |
| **Frontend (App.jsx)**  | Componente React com formulário, validação em tempo real, spinner de carregamento, exibição da frase e botão para nova geração. |
| **Testes (backend.test.js)** | Testes automatizados para validar entrada e resposta da API no backend.                     |
| **Dependências**        | `express`, `cors`, `dotenv`, `openai`, `react`, `tailwindcss`, `jest`, `supertest`          |
| **Código de Qualidade** | Score de 92, indicando código limpo, modular e bem documentado.                             |

### Principais Funções Implementadas

| Função         | Descrição                                                                                     |
|----------------|-----------------------------------------------------------------------------------------------|
| `validateWords`| Valida que o array contém exatamente três palavras alfabéticas em português.                   |
| `handleChange` | Atualiza o estado das palavras e gerencia erros de validação no frontend.                      |
| `canSubmit`    | Verifica se o formulário está apto para envio com todas as validações satisfeitas.             |
| `handleSubmit` | Envia a requisição ao backend, gerencia estados de carregamento e tratamento de erros.         |
| `handleNewPhrase` | Reseta o formulário e estados para permitir nova geração de frase motivacional.               |

## 🧠 Decisões e Insights  
- **Validação Rigorosa**: A validação no frontend e backend garante que a entrada seja sempre exatamente três palavras, com caracteres alfabéticos, prevenindo erros na geração da frase.  
- **Segurança das Chaves**: As chaves da API OpenAI foram armazenadas exclusivamente no backend, evitando exposição no frontend e mitigando riscos de segurança.  
- **Feedback Visual**: O uso do spinner durante a geração da frase melhora a experiência do usuário, evidenciando que a aplicação está processando a solicitação.  
- **Tratamento de Erros**: Mensagens claras e amigáveis foram implementadas para falhas na API ou validação, garantindo que o usuário compreenda o problema e possa tentar novamente facilmente.  
- **Modularidade e Testabilidade**: A estrutura modular do código e os testes automatizados contribuem para a manutenção futura e estabilidade do sistema.  
- **Performance**: A implementação foi planejada para que o tempo de resposta da geração da frase não ultrapasse 5 segundos na maioria dos casos, respeitando o requisito de performance.  
- **Tecnologias Escolhidas**: React.js e Tailwind CSS foram escolhidos para garantir uma interface responsiva e acessível, enquanto Node.js com Express foi utilizado para backend pela facilidade de integração com APIs externas e configuração segura.  
- **Deploy e Variáveis de Ambiente**: Embora o deploy não faça parte do código gerado nesta etapa, a estrutura considera o uso de plataformas cloud e configuração segura das variáveis de ambiente para chaves sensíveis.  

Esta etapa foi concluída com sucesso, atendendo os critérios de aceitação definidos e mitigando os riscos técnicos relevantes.