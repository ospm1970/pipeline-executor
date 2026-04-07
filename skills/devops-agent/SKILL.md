---
name: devops-agent
description: Automação de infraestrutura e orquestração de deploy. Use para planejar deployments, configurar infraestrutura, gerenciar ambientes, implementar pipelines CI/CD, monitorar sistemas e gerenciar recuperação de desastres. Especializado em garantir deployments em produção confiáveis, escaláveis e seguros.
---

# Skill: Agente DevOps (Especialista em Infraestrutura e Deploy)

Esta skill fornece diretrizes especializadas para o Agente DevOps no pipeline do Manus DevAgents. Ela permite o gerenciamento de infraestrutura confiável e escalável, além da automação de deployments.

## Visão Geral

O Agente DevOps gerencia a infraestrutura, automatiza deployments e garante a confiabilidade do sistema. Esta skill fornece abordagens sistemáticas para planejamento de infraestrutura, estratégias de deploy, monitoramento e recuperação de desastres.

### Quando Usar

- Planejando e executando deployments
- Configurando infraestrutura e ambientes
- Configurando pipelines de CI/CD
- Implementando monitoramento e alertas
- Gerenciando recuperação de desastres e rollback
- Otimizando custos de infraestrutura
- Garantindo segurança e conformidade
- Escalando sistemas para performance

## Workflow Principal

### 1. Planejamento de Deploy

Planeje a estratégia de deploy:
- **Tipo de deploy**: Blue-green, canary, rolling, big bang
- **Ambientes alvo**: Dev, staging, produção
- **Estratégia de rollback**: Como reverter se ocorrerem problemas
- **Timing**: Quando fazer o deploy, janelas de manutenção
- **Stakeholders**: Quem precisa ser notificado
- **Avaliação de risco**: Problemas potenciais e mitigações

### 2. Configuração de Infraestrutura

Configure a infraestrutura:
- **Computação**: Servidores, containers, serverless
- **Armazenamento**: Bancos de dados, armazenamento de arquivos, cache
- **Rede**: Balanceadores de carga, firewalls, VPNs
- **Segurança**: SSL/TLS, autenticação, gerenciamento de segredos
- **Monitoramento**: Logs, métricas, alertas
- **Backup**: Backup e recuperação de dados

### 3. Configuração de Pipeline CI/CD

Implemente automação de CI/CD:
- **Controle de versão**: Fluxo de trabalho Git, proteção de branch
- **Build**: Compilação, testes, criação de artefatos
- **Teste**: Testes unitários, de integração, de segurança
- **Deploy**: Deploy automatizado para ambientes
- **Monitoramento**: Verificações de saúde (health checks), métricas, alertas
- **Rollback**: Rollback automatizado em caso de falha

**Estágios de CI/CD:**
1. Trigger (ao fazer push/PR)
2. Build (compilar, testar, lint)
3. Test (unitário, integração, segurança)
4. Deploy Staging (se os testes passarem)
5. Smoke Tests (validar staging)
6. Deploy Produção (aprovação manual)
7. Health Checks (validar produção)
8. Monitor (acompanhar métricas)

### 4. Monitoramento e Alertas

Implemente monitoramento abrangente:
- **Métricas**: CPU, memória, disco, rede
- **Métricas de aplicação**: Tempo de resposta, taxa de erro, throughput
- **Métricas de negócios**: Contagem de usuários, transações, receita
- **Logs**: Logs de aplicação, logs de sistema, logs de auditoria
- **Alertas**: Baseados em limites, detecção de anomalias
- **Dashboards**: Visibilidade em tempo real

### 5. Recuperação de Desastres (Disaster Recovery)

Planeje para falhas:
- **Estratégia de backup**: Frequência, retenção, testes
- **Procedimentos de recuperação**: RTO (Recovery Time Objective), RPO (Recovery Point Objective)
- **Failover**: Automático ou manual
- **Testes**: Simulações regulares de recuperação de desastres
- **Documentação**: Procedimentos claros de recuperação
- **Comunicação**: Notificar stakeholders durante incidentes

### 6. Otimização de Performance

Otimize a infraestrutura:
- **Escalabilidade**: Escalabilidade horizontal e vertical
- **Cache**: Cache de aplicação e CDN
- **Otimização de banco de dados**: Indexação, otimização de consultas
- **Otimização de código**: Profiling, otimização
- **Otimização de custos**: Dimensionamento correto de recursos (right-sizing)

## Estratégias de Deploy

### Deploy Blue-Green
- Dois ambientes de produção idênticos
- Deploy no ambiente inativo
- Mudar o tráfego quando estiver pronto
- Rollback mudando de volta
- **Melhor para**: Sistemas críticos, deployments com zero downtime

### Deploy Canary
- Deploy para uma pequena porcentagem de usuários primeiro
- Monitorar problemas
- Aumentar gradualmente a porcentagem
- Rollback se problemas forem detectados
- **Melhor para**: Grandes mudanças, mitigação de riscos

### Deploy Rolling
- Atualizar instâncias uma de cada vez
- Remover do balanceador de carga
- Atualizar e reiniciar
- Adicionar de volta ao balanceador de carga
- **Melhor para**: Serviços stateless, rollout gradual

### Feature Flags (Sinalizadores de Recursos)
- Fazer deploy do código, mas desabilitar funcionalidades
- Habilitar funcionalidades gradualmente
- Teste A/B de funcionalidades
- Rollback rápido desabilitando
- **Melhor para**: Teste de funcionalidades, rollout gradual

## Infraestrutura como Código (IaC)

### Exemplo Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: myapp:1.0
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

### Exemplo Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js
CMD ["node", "server.js"]
```

## Stack de Monitoramento

### Componentes Principais
- **Prometheus**: Coleta e armazenamento de métricas
- **Grafana**: Visualização e dashboards
- **Stack ELK**: Logging (Elasticsearch, Logstash, Kibana)
- **Jaeger**: Tracing distribuído
- **PagerDuty**: Gerenciamento de alertas e plantão (on-call)

### Métricas para Monitorar

**Métricas de Sistema:**
- Uso de CPU
- Uso de Memória
- Uso de Disco
- E/S de Rede (Network I/O)
- Contagem de Processos

**Métricas de Aplicação:**
- Taxa de Requisição
- Tempo de Resposta
- Taxa de Erro
- Throughput
- Taxa de Acerto de Cache (Cache hit rate)

**Métricas de Negócios:**
- Usuários Ativos
- Transações
- Receita
- Taxa de Conversão
- Satisfação do Cliente

## Melhores Práticas de Segurança

- [ ] Usar gerenciamento de segredos (não hardcoded)
- [ ] Habilitar criptografia em repouso e em trânsito
- [ ] Implementar acesso de menor privilégio
- [ ] Auditorias regulares de segurança
- [ ] Gerenciamento de patches
- [ ] Segmentação de rede
- [ ] Proteção contra DDoS
- [ ] WAF (Web Application Firewall)
- [ ] Testes regulares de penetração (Penetration testing)
- [ ] Plano de resposta a incidentes

## Melhores Práticas de Confiabilidade

- [ ] Redundância para componentes críticos
- [ ] Verificações de saúde (Health checks) e auto-recuperação
- [ ] Balanceamento de carga (Load balancing)
- [ ] Circuit breakers
- [ ] Degradação graciosa
- [ ] Monitoramento e alertas
- [ ] Testes regulares
- [ ] Engenharia do Caos (Chaos engineering)
- [ ] Simulações de recuperação de desastres
- [ ] Documentação

## Melhores Práticas de Performance

- [ ] Estratégia de cache (aplicação, CDN, banco de dados)
- [ ] CDN para ativos estáticos
- [ ] Otimização de banco de dados (indexação, otimização de consultas)
- [ ] Pool de conexões (Connection pooling)
- [ ] Compressão (gzip, brotli)
- [ ] Processamento assíncrono
- [ ] Testes de carga
- [ ] Monitoramento de performance
- [ ] Planejamento de capacidade
- [ ] Revisões regulares de otimização

## Otimização de Custos

- [ ] Dimensionar recursos corretamente (Right-size)
- [ ] Usar instâncias spot
- [ ] Capacidade reservada para baseline
- [ ] Auto-scaling
- [ ] Limpeza de recursos (Resource cleanup)
- [ ] Monitoramento de custos
- [ ] Revisões regulares
- [ ] Negociar com provedores
- [ ] Usar serviços gerenciados
- [ ] Otimizar transferência de dados

## Plano de Recuperação de Desastres

**RTO:** 1 hora (tempo de inatividade aceitável)
**RPO:** 15 minutos (perda de dados aceitável)

**Estratégia de Backup:**
- Backups completos diários
- Backups incrementais por hora
- Retenção de 30 dias
- Teste de restauração mensal
- Backup em região diferente

**Procedimentos de Recuperação:**
1. Detectar falha (alerta de monitoramento)
2. Ativar resposta a incidentes
3. Restaurar a partir do backup
4. Verificar integridade dos dados
5. Retomar operações
6. Revisão pós-incidente

**Comunicação:**
- Notificar stakeholders
- Atualizar página de status
- Fornecer ETA (Tempo Estimado de Chegada)
- Relatório pós-incidente

## Diretrizes de Prompt

### Template de Prompt do Sistema

```
Você é um engenheiro DevOps especialista. Seu papel é garantir infraestrutura e deployments confiáveis, escaláveis e seguros.

Seu gerenciamento de infraestrutura deve ser:
1. Confiável - Redundância, monitoramento, recuperação
2. Escalável - Auto-scaling, balanceamento de carga
3. Seguro - Criptografia, controle de acesso, conformidade
4. Econômico - Dimensionamento correto, otimização
5. Automatizado - CI/CD, IaC, monitoramento
6. Documentado - Procedimentos claros e runbooks

Para cada deploy:
- Planeje a estratégia de deploy
- Configure a infraestrutura como código (IaC)
- Configure monitoramento e alertas
- Implemente backup e recuperação
- Documente procedimentos
- Forneça plano de rollback

Sempre forneça:
1. Plano de deploy com etapas
2. Configuração de infraestrutura (IaC)
3. Configuração de monitoramento e alertas
4. Procedimentos de backup e recuperação
5. Estratégia de rollback
6. Procedimentos de verificação de saúde (health check)

Formate sua resposta como JSON para fácil parsing.
```

## Formato de Saída

O planejamento DevOps deve ser retornado como JSON estruturado:

```json
{
  "deployment_plan": {
    "deployment_type": "Blue-green",
    "target_environment": "Production",
    "estimated_duration": "30 minutes",
    "rollback_strategy": "Switch traffic back to green environment",
    "steps": [
      {
        "step": 1,
        "description": "Backup current version",
        "duration": "5 minutes"
      }
    ]
  },
  "infrastructure_config": {
    "compute": "Kubernetes cluster with 3 replicas",
    "storage": "PostgreSQL with automated backups",
    "networking": "Load balancer with SSL/TLS",
    "monitoring": "Prometheus + Grafana"
  },
  "monitoring_setup": {
    "metrics": ["cpu_usage", "memory_usage", "request_rate"],
    "alerts": [
      {
        "name": "High CPU",
        "threshold": "80%",
        "action": "Scale up"
      }
    ]
  },
  "backup_recovery": {
    "rto": "1 hour",
    "rpo": "15 minutes",
    "backup_frequency": "Hourly",
    "retention": "30 days"
  },
  "health_checks": [
    {
      "check": "API health endpoint",
      "url": "/health",
      "expected_status": 200
    }
  ]
}
```

## Integração com o Pipeline

Esta skill é usada pelo Agente DevOps no pipeline do Manus DevAgents:
1. Agente DevOps recebe a aprovação do QA
2. Aplica esta skill para planejar o deploy
3. Configura a infraestrutura
4. Configura o monitoramento
5. Executa o deploy
6. Valida as verificações de saúde (health checks)
7. Habilita rollback se necessário

## Melhores Práticas

1. **Infraestrutura como Código** - Controle de versão para toda a infraestrutura
2. **Testes Automatizados** - Testar deployments antes da produção
3. **Monitoramento Primeiro** - Configurar monitoramento antes de fazer o deploy
4. **Rollout Gradual** - Usar deployments canary ou rolling
5. **Rollback Rápido** - Planejar rollback antes de fazer o deploy
6. **Documentação** - Documentar todos os procedimentos
7. **Comunicação** - Manter os stakeholders informados
8. **Melhoria Contínua** - Aprender com cada deploy
