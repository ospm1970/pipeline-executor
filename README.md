# Manus DevAgents - Pipeline de Desenvolvimento Automatizado com Spec-Driven Development

## Pipeline de Desenvolvimento Automatizado com Agentes IA Especializados

Uma prova de conceito completa do Manus DevAgents que demonstra automação de pipeline de desenvolvimento com **6 agentes IA especializados**, cada um com sua própria Skill especializada. O sistema implementa a metodologia **Spec-Driven Development** (baseada no GitHub Spec-Kit) como primeira etapa do pipeline.

---

## 🚀 Features

- ✅ **6 Agentes IA Especializados** (Especificação, Analista, UI/UX, Desenvolvedor, QA, DevOps)
- ✅ **Spec-Driven Development** - Implementação da metodologia GitHub Spec-Kit
- ✅ **Sistema de Skills Modular** - Cada agente com sua Skill dedicada em português
- ✅ **Pipeline Determinístico** - Fluxo controlado sem aleatoriedade
- ✅ **Dashboard em Tempo Real** - Visualização de pipelines com WebSocket
- ✅ **Interface Web Moderna** - Frontend Next.js responsivo
- ✅ **API REST Completa** - Endpoints para integração
- ✅ **Banco de Dados PostgreSQL** - Persistência completa
- ✅ **Integração Multi-Canal** - Slack, Email, Jira
- ✅ **Deploy Automatizado** - CI/CD via Railway

---

## 📋 Requisitos

- Node.js 18+
- npm ou yarn
- OpenAI API Key (GPT-4.1-mini)
- PostgreSQL 12+ (opcional para desenvolvimento local)

---

## 🔧 Instalação

### 1. Clonar repositório
```bash
git clone https://github.com/ospm1970/manus-devagents-mvp.git
cd manus-devagents-mvp
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar .env com suas credenciais
OPENAI_API_KEY="sk-proj-your-key-here"
DATABASE_URL="postgresql://user:password@localhost:5432/manus_devagents"
```

### 4. Iniciar servidor
```bash
npm start
```

O servidor estará disponível em: **http://localhost:3001**

---

## 🏗️ Arquitetura do Pipeline

O Manus DevAgents implementa um pipeline de 6 etapas, cada uma executada por um agente especializado:

```
┌─────────────────────────────────────────────────────────────────┐
│                    👤 USUÁRIO - Requisito Inicial               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 📝 ETAPA 0: AGENTE DE ESPECIFICAÇÃO (Spec-Driven Development)   │
│                                                                 │
│ Transforma ideias vagas em especificações estruturadas          │
│ - Visão Geral do Projeto                                        │
│ - Princípios de Desenvolvimento                                 │
│ - Plano Técnico (Stack, Arquitetura)                            │
│ - Decomposição em Épicos, Features e Tarefas                    │
│ - Critérios de Sucesso Mensuráveis                              │
└────────────────────────────┬────────────────────────────────────┘
                             │ (Especificação JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 📊 ETAPA 1: AGENTE ANALISTA                                     │
│                                                                 │
│ Analisa a especificação e gera requisitos detalhados            │
│ - User Stories                                                  │
│ - Requisitos Funcionais                                         │
│ - Requisitos Não-Funcionais                                     │
│ - Riscos e Mitigações                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ (Análise JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 🎨 ETAPA 2: AGENTE UI/UX                                        │
│                                                                 │
│ Cria design e jornadas de usuário                               │
│ - Jornadas de Usuário                                           │
│ - Wireframes e Layout                                           │
│ - Componentes de Interface                                      │
│ - Requisitos de Acessibilidade (WCAG)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ (Design JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 💻 ETAPA 3: AGENTE DESENVOLVEDOR                                │
│                                                                 │
│ Gera código limpo e estruturado                                 │
│ - Estrutura de Arquivos                                         │
│ - Componentes e Módulos                                         │
│ - Dependências                                                  │
│ - Testes Unitários                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │ (Código JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 🧪 ETAPA 4: AGENTE QA                                           │
│                                                                 │
│ Testa e valida o código                                         │
│ - Casos de Teste                                                │
│ - Análise de Vulnerabilidades                                   │
│ - Cobertura de Testes                                           │
│ - Aprovação/Rejeição                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ (Testes JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 🚀 ETAPA 5: AGENTE DEVOPS                                       │
│                                                                 │
│ Planeja e executa o deploy                                      │
│ - Estratégia de Deploy                                          │
│ - Configuração de Infraestrutura                                │
│ - Monitoramento                                                 │
│ - Plano de Rollback                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ✅ APLICAÇÃO EM PRODUÇÃO
```

---

## 📚 Sistema de Skills

O Manus DevAgents utiliza um sistema modular de **Skills** para guiar o comportamento de cada agente. As Skills estão localizadas em `/skills/` e são lidas automaticamente pelo orquestrador.

### 6 Agentes e suas Skills

#### 0. 📝 Agente de Especificação (`spec-agent`) - **NOVO!**

**Objetivo**: Implementar Spec-Driven Development (GitHub Spec-Kit) como primeira etapa do pipeline.

**O que faz**:
- Recebe um requisito vago ou ideia inicial do usuário
- Estrutura a ideia em uma especificação completa e executável
- Define princípios que guiarão todo o desenvolvimento
- Cria um plano técnico detalhado
- Decompõe o projeto em épicos, features e tarefas
- Estabelece critérios de sucesso mensuráveis

**Entrada**: Ideia inicial ou requisito vago (ex: "Criar um sistema de login seguro")

**Saída**: JSON estruturado com:
```json
{
  "specification": {
    "project_name": "Sistema de Login Seguro",
    "description": "Sistema de autenticação com email e senha",
    "objectives": ["Objetivo 1", "Objetivo 2"],
    "target_users": "Descrição do público-alvo"
  },
  "principles": {
    "code_quality": "Padrões de qualidade de código",
    "ux_design": "Princípios de UX/Design",
    "performance": "Requisitos de performance",
    "security": "Estratégia de segurança",
    "maintainability": "Foco em manutenibilidade"
  },
  "technical_plan": {
    "tech_stack": {
      "frontend": "Next.js + React + Tailwind CSS",
      "backend": "NestJS + TypeScript",
      "database": "PostgreSQL",
      "infrastructure": "Railway"
    },
    "architecture": "Descrição da arquitetura",
    "key_integrations": ["Integração 1", "Integração 2"]
  },
  "task_breakdown": {
    "epics": [
      {
        "id": "E-001",
        "title": "Autenticação de Usuários",
        "features": [
          {
            "id": "F-001",
            "title": "Cadastro de Usuários",
            "tasks": [
              {
                "id": "T-001",
                "title": "Criar formulário de cadastro",
                "effort_days": 2,
                "dependencies": [],
                "priority": "High"
              }
            ]
          }
        ]
      }
    ]
  },
  "success_criteria": [
    {
      "metric": "Taxa de sucesso de login",
      "target": "99.9%",
      "measurement": "Monitoramento de logs"
    }
  ]
}
```

**Skill**: `/skills/spec-agent/SKILL.md`

**Por que é importante**:
- ✅ Clareza desde o início - Evita ambiguidades
- ✅ Planejamento técnico - Stack e arquitetura definidos
- ✅ Decomposição clara - Épicos, features e tarefas identificadas
- ✅ Princípios guiadores - Qualidade, segurança, performance definidas
- ✅ Rastreabilidade - Cada tarefa tem ID único
- ✅ Reduz retrabalho - Especificação clara evita mudanças de escopo

---

#### 1. 🕵️‍♂️ Agente Analista (`analyst-agent`)

**Objetivo**: Transformar a especificação em requisitos técnicos estruturados.

**Entrada**: Especificação JSON do Agente de Especificação

**Saída**: JSON com requisitos funcionais, não funcionais e User Stories

**Skill**: `/skills/analyst-agent/SKILL.md`

**Exemplo de Output**:
```json
{
  "user_stories": [
    {
      "id": "US-001",
      "title": "Criar nova tarefa",
      "description": "Como usuário, quero criar uma nova tarefa...",
      "acceptance_criteria": ["A tarefa deve ser salva no banco de dados"]
    }
  ],
  "technical_requirements": ["Req 1", "Req 2"],
  "estimated_effort_hours": 80,
  "risks": ["Risco 1", "Risco 2"],
  "acceptance_criteria": ["Critério 1", "Critério 2"]
}
```

---

#### 2. 🎨 Agente UI/UX (`ui-ux-agent`)

**Objetivo**: Projetar a experiência do usuário e a interface.

**Entrada**: JSON do Analista

**Saída**: JSON com jornadas de usuário, layout, componentes e requisitos de acessibilidade

**Skill**: `/skills/ui-ux-agent/SKILL.md`

**Exemplo de Output**:
```json
{
  "user_journeys": [
    {
      "id": "UJ-001",
      "name": "Criar Tarefa",
      "steps": ["Abrir app", "Clicar em +", "Preencher formulário", "Salvar"]
    }
  ],
  "design_specifications": {
    "color_palette": ["#FF6B6B", "#4ECDC4"],
    "typography": "Inter, sans-serif",
    "components": ["Button", "Input", "Card"]
  },
  "accessibility": {
    "wcag_level": "AA",
    "keyboard_navigation": true,
    "screen_reader_support": true
  }
}
```

---

#### 3. 💻 Agente Desenvolvedor (`developer-agent`)

**Objetivo**: Escrever código limpo, modular e de produção.

**Entrada**: JSON do Analista e JSON do UI/UX

**Saída**: JSON com estrutura de arquivos, dependências e blocos de código

**Skill**: `/skills/developer-agent/SKILL.md`

**Exemplo de Output**:
```json
{
  "project_structure": {
    "src/": {
      "components/": ["Button.tsx", "Input.tsx"],
      "pages/": ["index.tsx", "login.tsx"],
      "utils/": ["auth.ts", "api.ts"]
    }
  },
  "dependencies": ["next", "react", "typescript"],
  "code_blocks": [
    {
      "file": "src/components/Button.tsx",
      "code": "export const Button = (props) => { ... }"
    }
  ]
}
```

---

#### 4. 🧪 Agente QA (`qa-agent`)

**Objetivo**: Garantir que o código atenda aos requisitos e padrões de qualidade.

**Entrada**: JSON do Analista e JSON do Desenvolvedor

**Saída**: JSON com casos de teste, vulnerabilidades e decisão de aprovação

**Skill**: `/skills/qa-agent/SKILL.md`

**Exemplo de Output**:
```json
{
  "test_cases": [
    {
      "id": "TC-001",
      "description": "Testar criação de tarefa",
      "steps": ["Preencher formulário", "Clicar em salvar"],
      "expected_result": "Tarefa criada com sucesso"
    }
  ],
  "issues_found": ["Issue 1", "Issue 2"],
  "coverage_percentage": 85,
  "approved": true,
  "recommendations": ["Adicionar mais testes de integração"]
}
```

---

#### 5. 🚀 Agente DevOps (`devops-agent`)

**Objetivo**: Preparar a infraestrutura e orquestrar o deploy.

**Entrada**: JSON de aprovação do QA e código do Desenvolvedor

**Saída**: JSON com plano de deploy, configuração de infraestrutura e monitoramento

**Skill**: `/skills/devops-agent/SKILL.md`

**Exemplo de Output**:
```json
{
  "deployment_steps": [
    "Build Docker image",
    "Push to registry",
    "Deploy to Railway",
    "Run health checks"
  ],
  "environment": "production",
  "health_checks": ["API health", "Database connection"],
  "rollback_plan": "Revert to previous version",
  "estimated_deployment_time_minutes": 15,
  "deployment_approved": true
}
```

---

## 🔄 Fluxo de Dados

O pipeline funciona com um fluxo de dados estruturado em JSON:

1. **Usuário** envia requisito inicial
2. **Agente de Especificação** lê a Skill e gera especificação estruturada
3. **Agente Analista** lê a Skill e a especificação, gera análise
4. **Agente UI/UX** lê a Skill e a análise, gera design
5. **Agente Desenvolvedor** lê a Skill e o design, gera código
6. **Agente QA** lê a Skill e o código, gera testes
7. **Agente DevOps** lê a Skill e os testes, gera plano de deploy

Cada etapa passa seu output JSON como input para a próxima etapa.

---

## 📖 Como Usar

### Via API REST

```bash
# Executar pipeline completo
curl -X POST http://localhost:3001/api/pipeline/execute \
  -H "Content-Type: application/json" \
  -d '{
    "requirement": "Criar um sistema de login seguro com Next.js"
  }'

# Obter resultado do pipeline
curl http://localhost:3001/api/pipeline/result/{pipelineId}

# Listar todos os pipelines executados
curl http://localhost:3001/api/pipeline/list
```

### Via Dashboard Web

Acesse **http://localhost:3001** e use a interface web para:
- Enviar novos requisitos
- Visualizar progresso em tempo real
- Ver resultados de cada etapa
- Exportar relatórios

---

## 🛠️ Como Atualizar as Skills

As Skills são arquivos Markdown que guiam o comportamento dos agentes. Para atualizar uma Skill:

### 1. Editar o arquivo SKILL.md

```bash
# Exemplo: Atualizar Skill do Agente de Especificação
nano /skills/spec-agent/SKILL.md
```

### 2. Estrutura de uma Skill

Cada arquivo `SKILL.md` contém:

```markdown
---
name: spec-agent
description: Descrição da Skill
---

# Skill: Agente de Especificação

## Visão Geral
Descrição do que o agente faz

## Workflow Principal
Etapas passo a passo

## Diretrizes de Prompt
Template de prompt para o LLM

## Formato de Saída
Estrutura JSON esperada

## Melhores Práticas
Regras de ouro
```

### 3. Validar a Skill

Após editar, o orquestrador lerá a nova versão na próxima execução:

```bash
# Testar a Skill
node test-pipeline-with-spec.js
```

---

## 📊 Boas Práticas

### 1. **Entradas Claras**
Quanto mais detalhado o requisito inicial, melhor será o resultado final.

**Ruim**: "Criar um app"
**Bom**: "Criar um app de to-do list com autenticação, temas escuro/claro e sincronização em tempo real"

### 2. **Validação de JSON**
O orquestrador depende estritamente do formato JSON. Se um agente falhar em retornar um JSON válido, o pipeline será interrompido.

### 3. **Não Pular Etapas**
O pipeline é determinístico. Cada etapa depende da anterior.

### 4. **Revisão Humana**
Embora automatizado, é recomendável que um desenvolvedor humano revise:
- A especificação gerada (Etapa 0)
- Os requisitos (Etapa 1)
- O design (Etapa 2)
- O código (Etapa 3)
- Os testes (Etapa 4)
- O plano de deploy (Etapa 5)

---

## 🔍 Troubleshooting

### Problema: "Spec Agent skill file not found"

**Solução**: Certifique-se de que o arquivo existe:
```bash
ls -la /skills/spec-agent/SKILL.md
```

Se não existir, recrie o arquivo com o conteúdo correto.

### Problema: "Invalid JSON from agent"

**Solução**: Verifique o formato de saída esperado na Skill. O agente pode estar retornando um formato diferente.

### Problema: "Pipeline timeout"

**Solução**: Aumente o timeout nas variáveis de ambiente:
```bash
AGENT_TIMEOUT=60000  # 60 segundos
```

---

## 📁 Estrutura do Projeto

```
manus-devagents-mvp/
├── skills/                          # Skills dos agentes
│   ├── spec-agent/
│   │   └── SKILL.md                # Skill de Spec-Driven Development
│   ├── analyst-agent/
│   │   └── SKILL.md
│   ├── ui-ux-agent/
│   │   └── SKILL.md
│   ├── developer-agent/
│   │   └── SKILL.md
│   ├── qa-agent/
│   │   └── SKILL.md
│   ├── devops-agent/
│   │   └── SKILL.md
│   └── GUIA_DE_USO_SKILLS.md       # Guia completo de uso
├── src/
│   ├── agents-spec.js              # Implementação do Agente de Especificação
│   ├── agents.js                   # Implementação dos outros agentes
│   ├── agents-ux.js                # Implementação do Agente UI/UX
│   ├── orchestrator.js             # Orquestrador do pipeline
│   ├── db.js                       # Conexão com banco de dados
│   └── ...
├── public/                         # Arquivos estáticos
├── pages/                          # Páginas Next.js
├── .env.example                    # Variáveis de ambiente (exemplo)
├── package.json
├── README.md                       # Este arquivo
└── ...
```

---

## 🚀 Deploy

### Deploy no Railway

O projeto está configurado para deploy automático no Railway:

1. **Conectar repositório GitHub**
   ```bash
   git remote add railway https://github.com/ospm1970/manus-devagents-mvp.git
   ```

2. **Fazer push**
   ```bash
   git push railway main
   ```

3. **Deploy automático**
   O Railway detectará as mudanças e iniciará o deploy automaticamente.

### Variáveis de Ambiente no Railway

Configure as seguintes variáveis no painel do Railway:

```
OPENAI_API_KEY=sk-proj-...
DATABASE_URL=postgresql://...
NODE_ENV=production
```

---

## 🤝 Contribuindo

Para contribuir com melhorias:

1. Crie uma branch: `git checkout -b feature/minha-feature`
2. Faça suas mudanças
3. Commit: `git commit -am 'Add minha-feature'`
4. Push: `git push origin feature/minha-feature`
5. Abra um Pull Request

---

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

---

## 📞 Suporte

Para dúvidas ou problemas, abra uma issue no repositório GitHub:
https://github.com/ospm1970/manus-devagents-mvp/issues

---

## 🎯 Roadmap

- [ ] Integração com GitHub Spec-Kit CLI
- [ ] Dashboard de especificações
- [ ] Análise de dependências automática
- [ ] Estimativas de esforço aprimoradas
- [ ] Integração com Jira
- [ ] Suporte a múltiplos idiomas
- [ ] Testes de carga do pipeline
- [ ] Documentação de API (Swagger)

---

## 📚 Referências

- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [Spec-Driven Development](https://spec-driven-development.com)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [NestJS Documentation](https://docs.nestjs.com)

---

**Desenvolvido com ❤️ pelo Manus Team**
