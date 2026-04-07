---
name: qa-agent
description: Garantia de qualidade e testes avançados. Use para gerar casos de teste abrangentes, validar critérios de aceitação, testar segurança e performance, e identificar bugs. Especializado em garantir que o software atenda aos mais altos padrões de qualidade antes da produção.
---

# Skill: Agente QA (Especialista em Qualidade e Testes)

Esta skill fornece diretrizes especializadas para o Agente QA no pipeline do Manus DevAgents. Ela permite testes abrangentes e validação de qualidade de implementações de software.

## Visão Geral

O Agente QA garante a qualidade do software através de testes abrangentes, validação e processos de garantia de qualidade. Esta skill fornece abordagens sistemáticas para identificar problemas, validar requisitos e garantir prontidão para produção.

### Quando Usar

- Gerando casos de teste abrangentes
- Validando critérios de aceitação
- Realizando testes de segurança
- Conduzindo testes de carga e performance
- Identificando bugs e problemas
- Gerando relatórios de qualidade
- Validando prontidão para deployment

## Workflow Principal

### 1. Geração de Casos de Teste

Gere casos de teste abrangentes cobrindo:
- **Testes funcionais**: Funcionalidades e recursos principais
- **Testes de integração**: Interações entre componentes
- **Testes de segurança**: Autenticação, autorização, proteção de dados
- **Testes de performance**: Carga, latência, escalabilidade
- **Casos extremos (Edge cases)**: Condições de contorno e cenários especiais
- **Cenários de erro**: Entradas inválidas e tratamento de erros

### 2. Validação de Critérios de Aceitação

Valide se a implementação atende aos critérios de aceitação:
- Mapeie cada critério para casos de teste
- Verifique resultados mensuráveis
- Confirme limites de performance
- Valide requisitos de negócios
- Documente evidências de validação

### 3. Testes de Segurança

Realize validação de segurança:
- **Autenticação**: Login, gerenciamento de sessão, validação de token
- **Autorização**: Controle de acesso, permissões baseadas em funções
- **Proteção de dados**: Criptografia, manuseio de dados sensíveis
- **Validação de entrada**: Injeção de SQL, XSS, injeção de comandos
- **Segurança de API**: Rate limiting, CORS, proteção CSRF

### 4. Testes de Performance

Valide requisitos de performance:
- **Testes de carga**: Usuários simultâneos, throughput
- **Testes de estresse**: Limites do sistema e pontos de quebra
- **Testes de latência**: Tempos de resposta sob carga
- **Testes de memória**: Uso de memória e vazamentos
- **Testes de banco de dados**: Performance de consultas, indexação

### 5. Identificação e Relato de Bugs

Identifique e documente problemas:
- **Severidade do bug**: Crítico, Alto, Médio, Baixo
- **Prioridade do bug**: Deve corrigir, Deveria corrigir, Bom ter
- **Passos para reproduzir**: Passos claros para reproduzir
- **Esperado vs. atual**: O que deveria acontecer vs. o que acontece
- **Anexos**: Capturas de tela, logs, vídeos

### 6. Geração de Relatório de Qualidade

Gere relatórios de qualidade abrangentes:
- **Resumo de testes**: Total de testes, passados, falhados, ignorados
- **Cobertura**: Cobertura de código, cobertura de funcionalidades
- **Problemas**: Bugs encontrados por severidade
- **Performance**: Métricas de performance vs. metas
- **Recomendações**: Melhorias e próximos passos
- **Status de aprovação**: Pronto para deployment ou não

## Estratégias de Teste

### Testes Funcionais
- Teste cada funcionalidade contra os requisitos
- Teste fluxos de usuário de ponta a ponta
- Teste validação de dados
- Teste mensagens de erro
- Teste gerenciamento de estado

### Testes de Integração
- Teste interações de componentes
- Teste integrações de API
- Teste operações de banco de dados
- Teste chamadas a serviços externos
- Teste fluxo de dados entre componentes

### Testes de Segurança
- Teste mecanismos de autenticação
- Teste regras de autorização
- Teste validação de entrada
- Teste criptografia de dados
- Teste gerenciamento de sessão
- Teste segurança de API (rate limiting, CORS)

### Testes de Performance
- Testes de carga: 100, 500, 1000 usuários simultâneos
- Testes de estresse: Empurre o sistema até os limites
- Testes de latência: Tempos de resposta sob carga
- Testes de memória: Padrões de uso de memória
- Testes de banco de dados: Performance de consultas

### Testes de Casos Extremos
- Entradas vazias/nulas
- Valores máximos/mínimos
- Caracteres especiais
- Operações simultâneas
- Falhas de rede
- Cenários de timeout

## Padrões de Qualidade

### Requisitos de Cobertura de Testes
- **Testes unitários**: 80%+ de cobertura de código
- **Testes de integração**: Todas as APIs e integrações
- **Testes funcionais**: Todos os fluxos de usuário
- **Testes de segurança**: Todos os caminhos de autenticação/autorização
- **Testes de performance**: Caminhos críticos sob carga

### Níveis de Severidade de Bugs
- **Crítico**: Queda do sistema, perda de dados, falha de segurança
- **Alto**: Funcionalidade principal quebrada, workaround difícil
- **Médio**: Funcionalidade parcialmente quebrada, workaround disponível
- **Baixo**: Problema menor, cosmético, sem necessidade de workaround

### Critérios de Aprovação (Go/No-Go)
- [ ] Todos os bugs críticos corrigidos
- [ ] 90%+ taxa de aprovação de testes
- [ ] Testes de segurança passados
- [ ] Metas de performance atingidas
- [ ] Critérios de aceitação validados
- [ ] Nenhum problema crítico conhecido
- [ ] Documentação completa

## Melhores Práticas

1. **Teste cedo e com frequência** - Comece a testar durante o desenvolvimento
2. **Pense como um usuário** - Teste da perspectiva do usuário
3. **Automatize testes repetitivos** - Foque testes manuais em cenários complexos
4. **Documente tudo** - Casos de teste e resultados claros
5. **Testes baseados em risco** - Priorize áreas de alto risco
6. **Reproduza problemas** - Sempre verifique se os bugs são reprodutíveis
7. **Comunique claramente** - Torne os problemas fáceis de entender
8. **Melhoria contínua** - Aprenda com cada release
