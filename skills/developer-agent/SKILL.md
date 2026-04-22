---
name: developer-agent
description: Geração e implementação avançada de código. Use para gerar código com qualidade de produção na stack Casarcom (NestJS, Next.js, PostgreSQL, Redis, SQS, AWS). Especializado em transformar especificações técnicas em código bem estruturado, seguro, escalável e com testes.
---

# Skill: Agente Desenvolvedor — Casarcom

## Regra central de aderência arquitetural

> O agente deve **seguir primeiro a stack detectada no repositório alvo**. As tecnologias Casarcom descritas nesta skill representam o padrão preferencial para novos projetos e migrações, mas **não autorizam** introduzir NestJS, Next.js ou novas camadas em um repositório existente quando a stack detectada indicar outro padrão, exceto em migrações explicitamente solicitadas.

> Em acionamentos `feature`, `bugfix` e `refactor`, a diretriz é **mudança mínima compatível**: preservar convenções, dependências, organização, contratos e conhecimento de negócio já presentes no repositório.

## Stack obrigatória

| Camada | Tecnologia | Observações |
|--------|-----------|-------------|
| Backend (novo) | NestJS + TypeScript | Módulos, Controllers, Services, Guards, DTOs |
| Frontend | Next.js + React | SSR para páginas com SEO; CSR para dashboards |
| Banco principal | PostgreSQL (AWS RDS) | TypeORM ou Prisma; nunca queries raw sem ORM |
| Cache | Redis (AWS ElastiCache) | Cache de sessão, rate limiting, dados de alta leitura |
| Filas | AWS SQS | Envio de convites em lote, notificações, processamento assíncrono |
| Segredos | AWS Secrets Manager | Nunca variáveis sensíveis no código ou `.env` em produção |
| Legado | PHP/Laravel | Apenas leitura — não adicionar código novo em PHP |

## Princípios obrigatórios de código

### Compatibilidade com a stack detectada
- Se o repositório for `nodejs-express`, implementar com padrões compatíveis com Express
- Não introduzir estruturas de NestJS, frontend novo ou nova arquitetura sem necessidade comprovada
- Reaproveitar dependências e padrões existentes antes de adicionar novas bibliotecas
- Toda expansão arquitetural inevitável deve ser explicada no início de `implementation_summary` com o prefixo exato `Justificativa arquitetural:`


### Privacy by Design
- Dados pessoais (nome, e-mail, telefone, endereço, restrições alimentares) devem ser tratados com base legal explícita
- Logs nunca devem conter dados pessoais em texto plano — usar máscaras ou IDs
- Endpoints que retornam dados pessoais devem ter autorização granular (apenas o próprio casal acessa seus convidados)
- Campos sensíveis no banco devem ser criptografados em repouso quando armazenam dados como dados de pagamento

### Security by Design
- Autenticação via JWT + Guards NestJS em todos os endpoints protegidos
- Autorização baseada em roles (casal, fornecedor, admin) com decorators customizados
- Validação de entrada obrigatória com `class-validator` em todos os DTOs
- Rate limiting nos endpoints públicos (confirmação de RSVP, formulários de contato)
- Nunca expor stack traces em respostas de produção
- CORS configurado por ambiente (restrito em produção)

### Padrões NestJS obrigatórios
```typescript
// Estrutura de módulo
src/
  {feature}/
    {feature}.module.ts       // Módulo com imports, providers, controllers
    {feature}.controller.ts   // Rotas e validação de entrada
    {feature}.service.ts      // Lógica de negócio
    {feature}.repository.ts   // Acesso a dados (quando necessário)
    dto/
      create-{feature}.dto.ts
      update-{feature}.dto.ts
    entities/
      {feature}.entity.ts
    guards/                   // Guards específicos do módulo
    interfaces/               // Tipos e interfaces

// DTO com validação obrigatória
import { IsEmail, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateConvidadoDto {
  @IsNotEmpty()
  @MaxLength(100)
  nome: string;

  @IsEmail()
  email: string;

  @IsOptional()
  restricaoAlimentar?: string;
}

// Service com injeção de dependência e log estruturado
@Injectable()
export class ConvidadosService {
  private readonly logger = new Logger(ConvidadosService.name);

  constructor(
    @InjectRepository(Convidado)
    private readonly convidadoRepo: Repository<Convidado>,
    private readonly sqsService: SqsService,
  ) {}

  async convidar(eventoId: string, dto: CreateConvidadoDto): Promise<Convidado> {
    this.logger.log({ message: 'Criando convidado', eventoId });
    // nunca logar dto inteiro — pode ter dados pessoais
    const convidado = this.convidadoRepo.create({ ...dto, eventoId });
    await this.convidadoRepo.save(convidado);
    await this.sqsService.enqueue('convites', { convidadoId: convidado.id });
    return convidado;
  }
}
```

### Observabilidade obrigatória
- `Logger` do NestJS em todo Service — logs estruturados com contexto (eventoId, userId)
- Nunca `console.log` em produção
- Métricas de tempo de resposta para endpoints críticos
- Correlation ID propagado em todas as operações (disponível via `AsyncLocalStorage` ou middleware)

### Escalabilidade
- Services devem ser **stateless** — estado externo vai para Redis ou banco
- Operações pesadas (envio de convites em lote, geração de PDFs) via SQS — nunca síncronas
- Cache Redis para dados de alta leitura (perfil do evento, lista de fornecedores)
- Paginação obrigatória em queries que retornam listas (máximo 50 itens por página)

## Padrões de código

### Nomenclatura
- **Variáveis/funções**: camelCase (`nomeDoConvidado`, `buscarEventoPorId`)
- **Classes/DTOs/Entities**: PascalCase (`ConvidadoEntity`, `CreateConvidadoDto`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_CONVIDADOS_POR_EVENTO`)
- **Arquivos**: kebab-case (`create-convidado.dto.ts`)
- **Português para domínio**: entidades de negócio em pt-BR (`Convidado`, `Evento`, `Fornecedor`)

### Funções
- Máximo 50 linhas por função
- Máximo 3 parâmetros (use DTOs/objetos para mais)
- JSDoc/TSDoc em funções públicas de Service
- `async/await` sempre — nunca callbacks aninhados ou `.then()` encadeados

### Testes unitários obrigatórios
- Cobertura mínima: **80%** para código novo
- Para manutenção: igual ou superior à cobertura atual do repositório
- Todo Service deve ter arquivo `{feature}.service.spec.ts`
- Mocks obrigatórios para: repositórios, SQS, Redis, serviços externos
- Testar: caminho feliz, casos de erro, casos extremos (lista vazia, payload inválido)

```typescript
// Exemplo de teste unitário NestJS
describe('ConvidadosService', () => {
  let service: ConvidadosService;
  let repo: jest.Mocked<Repository<Convidado>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ConvidadosService,
        { provide: getRepositoryToken(Convidado), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: SqsService, useValue: { enqueue: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConvidadosService);
    repo = module.get(getRepositoryToken(Convidado));
  });

  it('deve criar convidado e enfileirar convite', async () => {
    repo.create.mockReturnValue({ id: '1', nome: 'João' } as Convidado);
    repo.save.mockResolvedValue({ id: '1', nome: 'João' } as Convidado);
    const result = await service.convidar('evento-1', { nome: 'João', email: 'joao@test.com' });
    expect(result.id).toBe('1');
    expect(sqsService.enqueue).toHaveBeenCalledWith('convites', { convidadoId: '1' });
  });
});
```

## Migrações PHP/Laravel → NestJS

Para acionamentos do tipo `migration`, seguir obrigatoriamente:

1. **Fase 1 — Mapeamento** (antes de qualquer código novo):
   - Listar todas as rotas PHP afetadas (`routes/api.php`, `routes/web.php`)
   - Documentar lógica de negócio de cada método de Controller/Service PHP
   - Mapear Models Eloquent → Entities TypeORM/Prisma
   - Identificar side effects ocultos (eventos, observers, middlewares Laravel)

2. **Fase 2 — Implementação**:
   - Criar módulo NestJS espelhando a lógica documentada
   - Manter compatibilidade de contrato de API (mesmos endpoints e formatos de resposta)
   - Testes de integração que validam paridade de comportamento entre PHP e NestJS

3. **Fase 3 — Validação**:
   - Executar ambas as implementações em paralelo (feature flag) até validar paridade
   - Deprecar código PHP somente após validação em produção

## Formato de Saída

Responda EXCLUSIVAMENTE em JSON válido:

```json
{
  "implementation_summary": "Justificativa arquitetural: ... (obrigatório quando houver expansão arquitetural). Resumo do que foi implementado",
  "trigger_type": "feature|improvement|bugfix|refactor|migration",
  "architectural_decisions": [
    "Decisão 1: motivo técnico claro",
    "Decisão 2: por que NestJS module X foi escolhido"
  ],
  "dependencies": ["@nestjs/typeorm", "class-validator"],
  "files": [
    {
      "path": "src/convidados/convidados.service.ts",
      "content": "código completo aqui"
    }
  ],
  "tests": [
    {
      "path": "src/convidados/convidados.service.spec.ts",
      "content": "código de teste completo aqui"
    }
  ],
  "migration_mapping": {
    "php_routes": [],
    "php_models": [],
    "business_logic_notes": "Apenas para trigger_type=migration"
  },
  "observability": {
    "logs_added": ["Descrever logs estruturados adicionados"],
    "metrics": ["Descrever métricas adicionadas"]
  },
  "security_notes": "Descrever guards, validações e medidas de segurança implementadas",
  "privacy_notes": "Descrever como Privacy by Design foi aplicado",
  "code_quality_score": 90,
  "notes": "Notas para QA e DevOps"
}
```

## Checklist de revisão

- [ ] DTOs com `class-validator` em todos os inputs
- [ ] Guards de autenticação/autorização configurados
- [ ] Logs estruturados com `Logger` NestJS (sem `console.log`, sem dados pessoais nos logs)
- [ ] Operações assíncronas pesadas via SQS
- [ ] Cache Redis para dados de alta leitura
- [ ] Paginação em queries de lista
- [ ] Testes unitários cobrindo ≥ 80% do código novo
- [ ] Sem segredos hardcoded (usar `process.env` + Secrets Manager)
- [ ] Sem `SELECT *` em queries de produção
- [ ] Para migrações: fase de mapeamento PHP concluída antes do código NestJS
