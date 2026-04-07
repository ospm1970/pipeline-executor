# Guia de Uso das Skills: Manus DevAgents

Este documento fornece instruções detalhadas sobre como utilizar as Skills desenvolvidas para o pipeline do **Manus DevAgents**. O sistema é composto por 6 agentes especializados, cada um com sua própria Skill, trabalhando em conjunto para automatizar o ciclo de vida de desenvolvimento de software.

---

## 1. Visão Geral do Sistema

O Manus DevAgents é um pipeline de desenvolvimento automatizado determinístico. O fluxo de trabalho ocorre na seguinte ordem:

1. **Agente de Especificação (`spec-agent`)**: Utiliza a metodologia Spec-Driven Development (baseada no GitHub Spec-Kit) para transformar ideias vagas em especificações estruturadas e planos técnicos.
2. **Agente Analista (`analyst-agent`)**: Coleta a especificação e gera User Stories e requisitos técnicos detalhados.
3. **Agente UI/UX (`ui-ux-agent`)**: Cria especificações de design e jornadas de usuário.
4. **Agente Desenvolvedor (`developer-agent`)**: Escreve o código com base nas especificações.
5. **Agente QA (`qa-agent`)**: Testa o código, garantindo qualidade e segurança.
6. **Agente DevOps (`devops-agent`)**: Planeja e executa o deploy da aplicação.

Cada agente utiliza sua respectiva Skill (arquivo `SKILL.md`) para entender seu papel, seguir as melhores práticas e gerar saídas no formato JSON estruturado esperado pelo orquestrador.

---

## 2. Como Utilizar as Skills

As Skills estão localizadas no diretório `/home/ubuntu/skills/` e são lidas automaticamente pelo orquestrador (`orchestrator.js`) antes de invocar cada agente.

### 2.1. Estrutura de uma Skill

Cada arquivo `SKILL.md` contém:
- **Metadados (Frontmatter)**: Nome e descrição da Skill.
- **Visão Geral**: Quando e como usar a Skill.
- **Workflow Principal**: Etapas passo a passo que o agente deve seguir.
- **Diretrizes de Prompt**: O template de prompt do sistema que orienta o comportamento do LLM.
- **Formato de Saída**: A estrutura JSON exata que o agente deve retornar.
- **Melhores Práticas**: Regras de ouro para a especialidade do agente.

### 2.2. Integração com o Orquestrador

O arquivo `/home/ubuntu/manus-mvp/orchestrator.js` coordena o pipeline. Ele lê a saída JSON de um agente e a passa como entrada (contexto) para o próximo agente na fila.

**Exemplo de Fluxo de Dados:**
1. O usuário envia um prompt: *"Criar um sistema de login com Next.js"*.
2. O Orquestrador chama o **Agente de Especificação**, que usa a `spec-agent/SKILL.md` para gerar um plano técnico e princípios do projeto (Spec-Driven Development).
3. O Orquestrador passa essa especificação para o **Analista**, que gera um JSON com User Stories.
4. O Orquestrador pega esse JSON e envia para o **UI/UX**, que usa a `ui-ux-agent/SKILL.md` para gerar um JSON com especificações de design.
5. O processo continua até o **DevOps**.

---

## 3. Detalhamento das Skills

### 3.1. Agente de Especificação (`spec-agent`)
- **Objetivo**: Implementar a metodologia Spec-Driven Development (GitHub Spec-Kit).
- **Entrada**: Ideia inicial ou requisito vago do usuário.
- **Saída**: JSON contendo visão geral, princípios do projeto, plano técnico, épicos, tarefas e critérios de sucesso.
- **Foco**: Definir o "o que" e o "como" em alto nível antes de iniciar a análise detalhada.

**Exemplo de Entrada:**
```
"Criar um sistema de login seguro com autenticação de dois fatores"
```

**Exemplo de Saída (resumido):**
```json
{
  "specification": {
    "project_name": "Sistema de Login Seguro",
    "objectives": ["Implementar autenticação segura", "Suportar 2FA"],
    "target_users": "Usuários da plataforma SaaS"
  },
  "principles": {
    "security": "Criptografia de ponta a ponta, HTTPS obrigatório",
    "performance": "Tempo de resposta < 500ms"
  },
  "technical_plan": {
    "tech_stack": {
      "frontend": "Next.js + React",
      "backend": "NestJS",
      "database": "PostgreSQL"
    }
  },
  "task_breakdown": {
    "epics": [
      {
        "id": "E-001",
        "title": "Autenticação Básica",
        "features": [...]
      }
    ]
  }
}
```

---

### 3.2. Agente Analista (`analyst-agent`)
- **Objetivo**: Transformar a especificação em requisitos técnicos estruturados.
- **Entrada**: Especificação JSON do Agente de Especificação.
- **Saída**: JSON contendo requisitos funcionais, não funcionais e User Stories com critérios de aceitação.
- **Foco**: Clareza, viabilidade técnica e definição do escopo (MVP).

**Exemplo de Saída:**
```json
{
  "user_stories": [
    {
      "id": "US-001",
      "title": "Usuário faz login com email e senha",
      "description": "Como usuário, quero fazer login com meu email e senha",
      "acceptance_criteria": [
        "Sistema valida email e senha",
        "Token JWT é gerado após sucesso",
        "Mensagem de erro genérica para dados inválidos"
      ]
    }
  ],
  "technical_requirements": [
    "Implementar endpoint POST /auth/login",
    "Validar credenciais contra banco de dados",
    "Gerar JWT com expiração de 24 horas"
  ],
  "estimated_effort_hours": 40,
  "risks": ["Vazamento de dados", "Ataques de força bruta"],
  "acceptance_criteria": ["Todos os testes passam", "Cobertura > 80%"]
}
```

---

### 3.3. Agente UI/UX (`ui-ux-agent`)
- **Objetivo**: Projetar a experiência do usuário e a interface.
- **Entrada**: JSON do Analista.
- **Saída**: JSON contendo jornadas de usuário, estrutura de layout, componentes, comportamento responsivo e requisitos de acessibilidade (WCAG).
- **Foco**: Usabilidade, consistência visual e acessibilidade.

**Exemplo de Saída:**
```json
{
  "user_journeys": [
    {
      "id": "UJ-001",
      "name": "Login",
      "steps": [
        "Usuário acessa página de login",
        "Preenche email e senha",
        "Clica em 'Entrar'",
        "Sistema valida dados",
        "Usuário é redirecionado para dashboard"
      ]
    }
  ],
  "design_specifications": {
    "color_palette": ["#FF6B6B", "#4ECDC4", "#45B7D1"],
    "typography": "Inter, sans-serif",
    "components": ["Button", "Input", "Card", "Modal"]
  },
  "accessibility": {
    "wcag_level": "AA",
    "keyboard_navigation": true,
    "screen_reader_support": true
  },
  "responsive_design": {
    "breakpoints": ["mobile", "tablet", "desktop"],
    "mobile_first": true
  }
}
```

---

### 3.4. Agente Desenvolvedor (`developer-agent`)
- **Objetivo**: Escrever código limpo, modular e de produção.
- **Entrada**: JSON do Analista e JSON do UI/UX.
- **Saída**: JSON contendo a estrutura de arquivos, dependências e blocos de código completos.
- **Foco**: Arquitetura de software (ex: NestJS, Next.js), tratamento de erros e segurança.

**Exemplo de Saída (resumido):**
```json
{
  "project_structure": {
    "src/": {
      "components/": ["LoginForm.tsx", "Button.tsx"],
      "pages/": ["login.tsx", "dashboard.tsx"],
      "utils/": ["auth.ts", "api.ts"],
      "types/": ["user.ts", "auth.ts"]
    }
  },
  "dependencies": [
    "next@14.0.0",
    "react@18.0.0",
    "typescript@5.0.0",
    "axios@1.4.0"
  ],
  "code_blocks": [
    {
      "file": "src/components/LoginForm.tsx",
      "language": "typescript",
      "code": "export const LoginForm = () => { ... }"
    }
  ],
  "code_quality_score": 92
}
```

---

### 3.5. Agente QA (`qa-agent`)
- **Objetivo**: Garantir que o código atenda aos requisitos e padrões de qualidade.
- **Entrada**: JSON do Analista e JSON do Desenvolvedor (código).
- **Saída**: JSON contendo casos de teste, análise de vulnerabilidades, métricas de cobertura e decisão de aprovação (`APPROVED` ou `REJECTED`).
- **Foco**: Testes funcionais, segurança (OWASP), performance e edge cases.

**Exemplo de Saída:**
```json
{
  "test_cases": [
    {
      "id": "TC-001",
      "description": "Testar login com credenciais válidas",
      "steps": ["Preencher email", "Preencher senha", "Clicar em entrar"],
      "expected_result": "Usuário é autenticado e redirecionado"
    },
    {
      "id": "TC-002",
      "description": "Testar login com credenciais inválidas",
      "steps": ["Preencher email inválido", "Preencher senha", "Clicar em entrar"],
      "expected_result": "Mensagem de erro genérica é exibida"
    }
  ],
  "issues_found": [
    "Falta validação de email no frontend",
    "Falta rate limiting no backend"
  ],
  "coverage_percentage": 87,
  "security_issues": [
    "Senhas não estão sendo criptografadas com bcrypt",
    "CORS não está configurado corretamente"
  ],
  "approved": false,
  "recommendations": [
    "Adicionar validação de email",
    "Implementar rate limiting",
    "Usar bcrypt para criptografia de senhas"
  ]
}
```

---

### 3.6. Agente DevOps (`devops-agent`)
- **Objetivo**: Preparar a infraestrutura e orquestrar o deploy.
- **Entrada**: JSON de aprovação do QA e código do Desenvolvedor.
- **Saída**: JSON contendo plano de deploy, configuração de infraestrutura (IaC), monitoramento e plano de rollback.
- **Foco**: CI/CD, escalabilidade, monitoramento e recuperação de desastres.

**Exemplo de Saída:**
```json
{
  "deployment_steps": [
    "Build Docker image",
    "Push para Docker registry",
    "Deploy para Railway",
    "Executar health checks",
    "Monitorar logs"
  ],
  "environment": "production",
  "infrastructure": {
    "hosting": "Railway",
    "database": "PostgreSQL 14",
    "cache": "Redis",
    "cdn": "Cloudflare"
  },
  "health_checks": [
    "GET /health - Status da API",
    "GET /health/db - Conexão com banco de dados",
    "GET /health/cache - Conexão com cache"
  ],
  "rollback_plan": "Reverter para versão anterior usando Railway rollback",
  "monitoring": {
    "logs": "Sentry",
    "metrics": "Datadog",
    "uptime": "UptimeRobot"
  },
  "estimated_deployment_time_minutes": 15,
  "deployment_approved": true
}
```

---

## 4. Boas Práticas de Uso

Para garantir o sucesso do pipeline:

1. **Entradas Claras**: Quanto mais detalhado for o prompt inicial fornecido ao Agente de Especificação, melhor será o resultado final.
   - ❌ Ruim: "Criar um app"
   - ✅ Bom: "Criar um app de to-do list com autenticação, temas escuro/claro e sincronização em tempo real"

2. **Validação de JSON**: O orquestrador depende estritamente do formato JSON. Se um agente falhar em retornar um JSON válido, o pipeline será interrompido.

3. **Não Pular Etapas**: O pipeline é determinístico. O Desenvolvedor precisa das informações do Analista e do UI/UX para gerar um código preciso.

4. **Revisão Humana**: Embora automatizado, é recomendável que um desenvolvedor humano revise os relatórios gerados, especialmente:
   - Especificação (Etapa 0) - Validar com stakeholders
   - Análise (Etapa 1) - Verificar User Stories
   - Design (Etapa 2) - Revisar mockups
   - Código (Etapa 3) - Code review
   - Testes (Etapa 4) - Verificar cobertura
   - Deploy (Etapa 5) - Validar antes de produção

5. **Iteração**: Se um agente rejeitar o resultado (ex: QA rejeita código), você pode:
   - Revisar o feedback
   - Fazer ajustes na especificação
   - Re-executar o pipeline

---

## 5. Como Atualizar as Skills

Se for necessário modificar o comportamento de um agente (por exemplo, adicionar uma nova regra de segurança ao QA):

### 5.1. Editar a Skill

```bash
# Exemplo: Editar Skill do Agente de Especificação
nano /home/ubuntu/skills/spec-agent/SKILL.md
```

### 5.2. Estrutura de uma Skill

```markdown
---
name: spec-agent
description: Descrição da Skill
---

# Skill: Agente de Especificação

## Visão Geral
Descrição do que o agente faz

## Quando Usar
Quando usar esta Skill

## Workflow Principal
Etapas passo a passo

## Diretrizes de Prompt
Template de prompt para o LLM

## Formato de Saída
Estrutura JSON esperada

## Melhores Práticas
Regras de ouro
```

### 5.3. Validar a Skill

Após editar, o orquestrador lerá automaticamente as novas regras na próxima execução:

```bash
# Testar o pipeline com a Skill atualizada
node test-pipeline-with-spec.js
```

**Nota:** Sempre mantenha o formato JSON de saída atualizado tanto no `SKILL.md` quanto no código do agente correspondente em `/home/ubuntu/manus-mvp/`.

---

## 6. Exemplos de Uso

### Exemplo 1: Sistema de Login

**Entrada do Usuário:**
```
"Criar um sistema de login seguro com autenticação de dois fatores, 
integração com Google e conformidade com GDPR"
```

**Fluxo do Pipeline:**
1. **Agente de Especificação** → Cria plano técnico com stack, princípios de segurança, épicos
2. **Agente Analista** → Gera User Stories para cadastro, login, 2FA, integração Google
3. **Agente UI/UX** → Cria design com fluxo de login, 2FA, integração social
4. **Agente Desenvolvedor** → Gera código para autenticação, 2FA, OAuth
5. **Agente QA** → Testa segurança, cobertura de testes, conformidade GDPR
6. **Agente DevOps** → Cria plano de deploy com monitoramento de segurança

---

### Exemplo 2: E-commerce

**Entrada do Usuário:**
```
"Criar uma plataforma de e-commerce com catálogo de produtos, 
carrinho de compras, pagamento com Stripe e rastreamento de pedidos"
```

**Épicos Gerados:**
- E-001: Catálogo de Produtos
- E-002: Carrinho de Compras
- E-003: Pagamento
- E-004: Rastreamento de Pedidos
- E-005: Admin Dashboard

---

## 7. Troubleshooting

### Problema: "Spec Agent skill file not found"

**Solução**: Certifique-se de que o arquivo existe:
```bash
ls -la /home/ubuntu/skills/spec-agent/SKILL.md
```

Se não existir, recrie o arquivo com o conteúdo correto.

### Problema: "Invalid JSON from agent"

**Solução**: Verifique o formato de saída esperado na Skill. O agente pode estar retornando um formato diferente.

### Problema: "Pipeline timeout"

**Solução**: Aumente o timeout nas variáveis de ambiente:
```bash
AGENT_TIMEOUT=60000  # 60 segundos
```

### Problema: "QA rejeita código"

**Solução**: Revise o feedback do QA e:
1. Identifique os problemas
2. Atualize a especificação se necessário
3. Re-execute o pipeline

---

## 8. Próximos Passos

Após entender as Skills:

1. **Revisar** - Leia cada arquivo SKILL.md
2. **Testar** - Execute o pipeline com exemplos
3. **Customizar** - Adapte as Skills para suas necessidades
4. **Integrar** - Integre com seus sistemas
5. **Monitorar** - Acompanhe a qualidade dos resultados

---

## 9. Referências

- [Documentação do Agente de Especificação](/SPEC_AGENT_DETAILED.md)
- [README do Projeto](/README.md)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [Spec-Driven Development](https://spec-driven-development.com)

---

**Guia de Uso das Skills - Manus DevAgents**
