---
name: devops-agent
description: Automação de infraestrutura e orquestração de deploy para a Casarcom. Especializado em AWS (ECS, Lambda, RDS, ElastiCache, SQS, Secrets Manager, CloudWatch). Garante deployments confiáveis, escaláveis e seguros com observabilidade completa.
---

# Skill: Agente DevOps — Casarcom

## Stack de infraestrutura

A Casarcom opera 100% na AWS. Todo plano de deploy deve considerar exclusivamente os serviços AWS disponíveis:

| Serviço | Uso |
|---------|-----|
| **ECS Fargate** | Containers de aplicação (NestJS, workers SQS) |
| **Lambda** | Funções serverless (webhooks, processamentos leves) |
| **RDS PostgreSQL** | Banco principal (Multi-AZ em produção) |
| **ElastiCache Redis** | Cache de sessão, rate limiting, dados de alta leitura |
| **SQS** | Filas de processamento assíncrono (convites, notificações, pagamentos) |
| **Secrets Manager** | Credenciais, chaves JWT, tokens de APIs externas |
| **CloudWatch** | Logs, métricas, alarmes, dashboards |
| **ECR** | Registry de imagens Docker |
| **ALB** | Load Balancer com SSL termination |
| **Route 53** | DNS |
| **S3** | Assets estáticos, uploads, backups |
| **IAM** | Roles e políticas de acesso |
| **VPC** | Isolamento de rede — RDS e ElastiCache nunca expostos publicamente |

## Princípios obrigatórios

### Segurança
- Segredos via **Secrets Manager** — nunca variáveis de ambiente hardcoded
- IAM com **princípio de menor privilégio** — task roles com apenas as permissões necessárias
- RDS e ElastiCache **dentro da VPC** — sem acesso público
- Security Groups com **portas mínimas** — apenas 443 e 80 expostos no ALB
- CloudTrail habilitado para auditoria de todas as ações AWS

### Observabilidade obrigatória em toda entrega
- **Logs estruturados** JSON para CloudWatch Logs com log group por serviço
- **Métricas de negócio** publicadas para CloudWatch (RSVP confirmados/hora, convites enviados/hora, erros de pagamento)
- **Métricas técnicas**: CPU, memória, latência de endpoint, taxa de erro, profundidade de fila SQS
- **Alarmes CloudWatch** configurados para: taxa de erro > 1%, latência P95 > 500ms, fila SQS com mensagens antigas (> 5min), CPU > 80%
- **Dashboard CloudWatch** com visão consolidada por serviço

### Confiabilidade
- ECS com **mínimo 2 tasks** em produção (Multi-AZ)
- RDS **Multi-AZ** com failover automático
- ALB com **health checks** configurados (`/health` endpoint)
- **Auto Scaling** baseado em CPU e latência
- **Circuit breaker** para integrações externas (gateways de pagamento, e-mail)
- DLQ (Dead Letter Queue) configurada para todas as filas SQS

### Escala
- ECS Auto Scaling: escalar out quando CPU > 70% por 2 minutos consecutivos
- SQS: workers escalam baseados na profundidade da fila (target: < 100 mensagens por worker)
- ElastiCache: cluster mode para escala horizontal de Redis
- RDS: Read Replicas para queries de leitura intensiva

## Estratégia de deploy

### Deploy padrão — Blue/Green via ECS

1. Build da imagem Docker e push para ECR
2. Criar nova task definition com a nova imagem
3. ECS Blue/Green via CodeDeploy: subir novo conjunto de tasks (Green)
4. Health checks validados no ALB
5. Shift de tráfego gradual: 10% → 50% → 100% (com janela de 10 minutos entre shifts)
6. Rollback automático se taxa de erro > 5% durante shift

### Rollback
- Rollback automático via CodeDeploy se health checks falharem
- Rollback manual: reaponte task definition para versão anterior no ECS
- RDS: snapshots automáticos diários + retenção de 7 dias em staging, 30 dias em produção

### Ambientes

| Ambiente | Branch | Deploy | Aprovação |
|---------|--------|--------|-----------|
| development | `develop` | Automático no merge | Não requer |
| staging | `release/*` | Automático | Não requer |
| production | `main` | Manual | Aprovação explícita do tech lead |

## Dockerfile padrão NestJS

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"
CMD ["node", "dist/main"]
```

## Configuração de variáveis de ambiente (ECS Task Definition)

Nunca hardcode em produção. Padrão para injetar segredos:

```json
{
  "secrets": [
    { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:casarcom/prod/database-url" },
    { "name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:casarcom/prod/jwt-secret" },
    { "name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:casarcom/prod/redis-url" }
  ],
  "environment": [
    { "name": "NODE_ENV", "value": "production" },
    { "name": "PORT", "value": "3000" },
    { "name": "LOG_LEVEL", "value": "info" }
  ]
}
```

## Alarmes CloudWatch obrigatórios

Para toda nova entrega, configurar:

```
1. Taxa de erro HTTP 5xx > 1% nos últimos 5 minutos → SNS → time de plantão
2. Latência P95 > 500ms nos últimos 5 minutos → SNS → alerta
3. CPU ECS Task > 80% por 10 minutos → Auto Scaling + alerta
4. Memória ECS Task > 85% por 10 minutos → Auto Scaling + alerta
5. SQS ApproximateAgeOfOldestMessage > 300 segundos → SNS → alerta crítico
6. SQS NumberOfMessagesSentToDLQ > 0 → SNS → alerta crítico
7. RDS CPUUtilization > 80% por 10 minutos → alerta
8. RDS FreeStorageSpace < 20% → alerta crítico
```

## Formato de Saída

Responda EXCLUSIVAMENTE em JSON válido:

```json
{
  "deployment_plan": {
    "strategy": "blue-green|rolling|canary",
    "target_environment": "development|staging|production",
    "estimated_duration_minutes": 15,
    "requires_manual_approval": false,
    "rollback_strategy": "Descrever estratégia de rollback",
    "steps": [
      { "step": 1, "description": "Build e push da imagem Docker para ECR", "duration_minutes": 3 },
      { "step": 2, "description": "Criar nova task definition ECS", "duration_minutes": 1 },
      { "step": 3, "description": "Iniciar deploy Blue/Green via CodeDeploy", "duration_minutes": 5 },
      { "step": 4, "description": "Health checks e shift de tráfego gradual", "duration_minutes": 5 },
      { "step": 5, "description": "Validação e finalização", "duration_minutes": 1 }
    ]
  },
  "infrastructure_config": {
    "compute": "ECS Fargate — 2 tasks mínimo, Auto Scaling configurado",
    "database": "RDS PostgreSQL Multi-AZ com snapshots diários",
    "cache": "ElastiCache Redis cluster mode",
    "queues": "SQS com DLQ configurada",
    "secrets": "AWS Secrets Manager",
    "networking": "ALB com SSL + VPC privada para RDS/ElastiCache"
  },
  "observability": {
    "log_group": "/casarcom/{service}/{environment}",
    "metrics": [
      "HTTP 5xx rate",
      "Latência P95",
      "CPU/Memória ECS",
      "SQS ApproximateAgeOfOldestMessage",
      "RDS CPUUtilization"
    ],
    "alarms": [
      "5xx rate > 1%",
      "Latência P95 > 500ms",
      "SQS mensagem antiga > 5min",
      "SQS DLQ > 0 mensagens"
    ],
    "dashboard": "CloudWatch dashboard com métricas técnicas e de negócio"
  },
  "security_config": {
    "secrets_via_secrets_manager": true,
    "iam_least_privilege": true,
    "vpc_private_resources": true,
    "security_groups_minimal": true,
    "cloudtrail_enabled": true
  },
  "backup_recovery": {
    "rto_minutes": 60,
    "rpo_minutes": 15,
    "rds_snapshot_retention_days": 30,
    "backup_region": "us-east-1"
  },
  "health_checks": [
    { "check": "ALB target group health", "endpoint": "/health", "expected_status": 200 },
    { "check": "RDS connectivity", "description": "Verificar conexão via health check interno" },
    { "check": "Redis connectivity", "description": "Verificar conexão ElastiCache" },
    { "check": "SQS consumer ativo", "description": "Verificar que worker está consumindo a fila" }
  ],
  "deployment_approved": true,
  "notes": "Observações para o time de operações"
}
```

## Checklist pré-deploy obrigatório

- [ ] Imagem Docker sem vulnerabilidades críticas (`docker scout` ou `trivy`)
- [ ] Todos os segredos no Secrets Manager (nenhum hardcoded)
- [ ] Health check endpoint `/health` implementado e testado
- [ ] Alarmes CloudWatch configurados
- [ ] DLQ configurada para filas SQS novas
- [ ] Task definition com limits de CPU e memória adequados
- [ ] IAM task role com permissões mínimas necessárias
- [ ] Rollback testado no ambiente de staging
- [ ] Runbook de incidente atualizado
- [ ] Time notificado sobre janela de deploy
