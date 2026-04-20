# Graph Report - .  (2026-04-17)

## Corpus Check
- Corpus is ~24,036 words - fits in a single context window. You may not need a graph.

## Summary
- 283 nodes · 411 edges · 33 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Analyst Agent Skill|Analyst Agent Skill]]
- [[_COMMUNITY_Agent Runtime & JSON Handling|Agent Runtime & JSON Handling]]
- [[_COMMUNITY_Code Integrator Engine|Code Integrator Engine]]
- [[_COMMUNITY_Documenter Agent|Documenter Agent]]
- [[_COMMUNITY_Security & Privacy Standards|Security & Privacy Standards]]
- [[_COMMUNITY_Agent Module AST|Agent Module AST]]
- [[_COMMUNITY_Repository Manager|Repository Manager]]
- [[_COMMUNITY_Repository Analyzer|Repository Analyzer]]
- [[_COMMUNITY_UIUX Agent|UI/UX Agent]]
- [[_COMMUNITY_Pipeline Execution Core|Pipeline Execution Core]]
- [[_COMMUNITY_HTTP Server|HTTP Server]]
- [[_COMMUNITY_API & Dashboard Routing|API & Dashboard Routing]]
- [[_COMMUNITY_Integration Tests & API Docs|Integration Tests & API Docs]]
- [[_COMMUNITY_QA Gateway & LGPD Compliance|QA Gateway & LGPD Compliance]]
- [[_COMMUNITY_Dashboard Metrics|Dashboard Metrics]]
- [[_COMMUNITY_UX Agent Actions|UX Agent Actions]]
- [[_COMMUNITY_SSE Progress Stream|SSE Progress Stream]]
- [[_COMMUNITY_GitHub PR Integration|GitHub PR Integration]]
- [[_COMMUNITY_UI Tests|UI Tests]]
- [[_COMMUNITY_Code Artifact Writers|Code Artifact Writers]]
- [[_COMMUNITY_Observability & Dashboard|Observability & Dashboard]]
- [[_COMMUNITY_Startup Script|Startup Script]]
- [[_COMMUNITY_Doc Config|Doc Config]]
- [[_COMMUNITY_Integration Test Suite|Integration Test Suite]]
- [[_COMMUNITY_Playwright Config|Playwright Config]]
- [[_COMMUNITY_Spec Generation|Spec Generation]]
- [[_COMMUNITY_Code Persistence|Code Persistence]]
- [[_COMMUNITY_Time Saved Metric|Time Saved Metric]]
- [[_COMMUNITY_Port Manager|Port Manager]]
- [[_COMMUNITY_Test Report Config|Test Report Config]]
- [[_COMMUNITY_Index HTML Structure|Index HTML Structure]]
- [[_COMMUNITY_Rate Limiting|Rate Limiting]]
- [[_COMMUNITY_Data Persistence|Data Persistence]]

## God Nodes (most connected - your core abstractions)
1. `log()` - 23 edges
2. `runPipeline Internal Function` - 17 edges
3. `runPipeline()` - 14 edges
4. `RepositoryManager` - 13 edges
5. `RepositoryAnalyzer` - 12 edges
6. `PortManager` - 11 edges
7. `withRetry Function` - 11 edges
8. `CodeIntegrator` - 10 edges
9. `withRetry()` - 10 edges
10. `POST /api/pipeline/external Endpoint` - 10 edges

## Surprising Connections (you probably didn't know these)
- `UI Test: Dashboard Stats and Filters` --semantically_similar_to--> `Structured JSON Logging with pipelineId and executionId`  [INFERRED] [semantically similar]
  tests/ui.test.js → README.md
- `Stage Mapping (spec/analysis/ux/dev/qa/deployment)` --references--> `Pipeline Architecture: 7-stage LLM agent chain`  [INFERRED]
  config/documentation.config.js → README.md
- `Documenter Agent With Skill` --semantically_similar_to--> `Spec Agent With Skill`  [INFERRED] [semantically similar]
  agents-documenter.js → agents-spec.js
- `Code Integrator` --semantically_similar_to--> `Code Persister`  [INFERRED] [semantically similar]
  code-integrator.js → code-persister.js
- `Repository Analyzer` --semantically_similar_to--> `Repository Manager`  [INFERRED] [semantically similar]
  repository-analyzer.js → repository-manager.js

## Hyperedges (group relationships)
- **Pipeline Execution Core Loop (Orchestrator + All Agents + Documenter)** — orchestrator_runPipeline, agents_analystAgent, agents_developerAgent, agents_qaAgent, agents_devopsAgent, agentsspec_SpecAgentWithSkill, agentsux_UIUXAgentWithSkill, agentsdocumenter_DocumenterAgentWithSkill [EXTRACTED 1.00]
- **External Repository Workflow (Clone â†’ Execute â†’ Integrate â†’ Commit â†’ PR)** — repositorymanager_RepositoryManager, codeintegrator_CodeIntegrator, codepersister_CodePersister, githubpr_createPullRequest, server_pipelineExternalEndpoint [EXTRACTED 1.00]
- **Agent Skill+Retry Resilience Pattern** — skillloader_loadSkill, retry_withRetry, agents_JSON_SUFFIX [INFERRED 0.85]
- **Cross-Agent Privacy/Security/LGPD Enforcement** — concept_privacyByDesign, concept_securityByDesign, concept_lgpdCompliance, security_agent_skill, qa_agent_skill, developer_agent_privacyByDesign [EXTRACTED 0.95]
- **Ordered Pipeline Stage Execution Chain** — spec_agent_skill, analyst_agent_skill, ui_ux_agent_skill, developer_agent_skill, qa_agent_skill, devops_agent_skill, documenter_agent_skill [EXTRACTED 1.00]
- **QA and Security Blocking Gateway Cluster** — qa_agent_skill, security_agent_skill, readme_qaGateway, concept_blockedByQA, qa_agent_gatewayRules [EXTRACTED 0.95]

## Communities

### Community 0 - "Analyst Agent Skill"
Cohesion: 0.07
Nodes (39): Critical Flow SLA: RSVP/convites/pagamentos/fornecedor < 500ms, Gherkin Acceptance Criteria Format: Dado/Quando/EntÃ£o, Analyst Agent Output Schema: user_stories, technical_requirements, risks, effort_estimation, Rationale: 80% coverage minimum + integration tests for all new endpoints is mandatory, not optional, Analyst Agent SKILL: spec to user stories and technical requirements, User Story Format: Como um [ator], eu quero [aÃ§Ã£o], para que [benefÃ­cio], Casarcom Wedding Journey (RSVP, convites, pagamentos, fornecedores), Blue/Green Deploy Strategy via ECS + CodeDeploy with gradual traffic shift 10â†’50â†’100% (+31 more)

### Community 1 - "Agent Runtime & JSON Handling"
Cohesion: 0.09
Nodes (38): JSON Format Suffix Constant, Analyst Agent Function, autoCorrectJSON Helper, Developer Agent Function, DevOps Agent Function, extractJSON Helper, logTokens Helper, QA Agent Function (+30 more)

### Community 2 - "Code Integrator Engine"
Cohesion: 0.11
Nodes (4): CodeIntegrator, CodePersister, log(), PortManager

### Community 3 - "Documenter Agent"
Cohesion: 0.13
Nodes (6): DocumenterAgentWithSkill, SpecAgentWithSkill, executePipeline(), runPipeline(), saveExecutionToDisk(), startPipeline()

### Community 4 - "Security & Privacy Standards"
Cohesion: 0.11
Nodes (20): Privacy by Design Principle (cross-agent), Security by Design Principle (cross-agent), PHP/Laravel to NestJS Migration: 3-phase (mapping, implementation, validation with feature flag), NestJS Mandatory Patterns: modules, DTOs with class-validator, structured logger, no console.log, Developer Agent Output Schema: files[], tests[], architectural_decisions, observability, security_notes, Developer Privacy by Design: mask PII in logs, encrypt sensitive fields, granular authorization, Rationale: heavy async ops (invite batch, PDF generation) via SQS to avoid synchronous blocking, Rationale: services must be stateless, external state in Redis or DB, enables horizontal scaling (+12 more)

### Community 5 - "Agent Module AST"
Cohesion: 0.29
Nodes (13): analystAgent(), autoCorrectJSON(), developerAgent(), devopsAgent(), extractJSON(), logTokens(), qaAgent(), validateJSON() (+5 more)

### Community 6 - "Repository Manager"
Cohesion: 0.18
Nodes (1): RepositoryManager

### Community 7 - "Repository Analyzer"
Cohesion: 0.27
Nodes (1): RepositoryAnalyzer

### Community 8 - "UI/UX Agent"
Cohesion: 0.24
Nodes (3): loadUIUXSkill(), UIUXAgent, UIUXAgentWithSkill

### Community 9 - "Pipeline Execution Core"
Cohesion: 0.2
Nodes (11): createBackup Method, detectMainFiles Method, integrateIntoRepository Method, persistPipelineOutput Method, executePipeline (Blocking), allocatePort Method, cloneRepository Method, commitChanges Method (+3 more)

### Community 10 - "HTTP Server"
Cohesion: 0.5
Nodes (6): cleanup(), onBlocked(), onDone(), onError(), onProgress(), send()

### Community 11 - "API & Dashboard Routing"
Cohesion: 0.25
Nodes (8): Dashboard Monitor Router, loadExecutionsFromDisk Function, startPipeline (Non-blocking), API Key Auth Middleware, Express Server Application, POST /api/pipeline/execute Endpoint, Rate Limiter Middleware, PowerShell Startup Script

### Community 12 - "Integration Tests & API Docs"
Cohesion: 0.25
Nodes (8): Integration Test: GET /api/deployments, Integration Test: GET /health, Integration Test: API Key Authentication (x-api-key), Integration Test: POST /api/pipeline/execute, Playwright Web Server Config (server.js on :3001), API Endpoints: /api/pipeline, /api/pipeline/execute, /api/pipeline/external, /api/deployments, UI Test: External Pipeline (repo URL + GitHub token), UI Test: Simple Pipeline Execution Flow

### Community 13 - "QA Gateway & LGPD Compliance"
Cohesion: 0.29
Nodes (8): LGPD Compliance Principle for Analyst: PII stories require privacy acceptance criteria, blocked_by_qa Pipeline Status, LGPD Compliance (Brazilian data protection law), QA Gateway Rules: coverage>=80%, no critical/high issues, no auth vulnerabilities, no PII leaks, Rationale: LGPD/PII leakage is always critical severity â€” no exceptions or manual overrides, QA Gateway: blocking quality gate at Stage 4, Rationale: QA Gateway blocks on coverage<80%, critical issues, or QA rejection, UI Test: Pipeline blocked_by_qa Status Display

### Community 14 - "Dashboard Metrics"
Cohesion: 0.53
Nodes (5): calculateCommonErrors(), calculateDistribution(), calculateStats(), calculateTimeSaved(), getAllPipelineExecutions()

### Community 15 - "UX Agent Actions"
Cohesion: 0.5
Nodes (4): applySkillToDesign Method, callLLM Method, createDesignSpecifications Method, validateAccessibility Method

### Community 16 - "SSE Progress Stream"
Cohesion: 1.0
Nodes (3): SSE Real-Time Progress Stream, pipelineEmitters SSE Map, GET /api/pipeline/:id/stream SSE Endpoint

### Community 17 - "GitHub PR Integration"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "UI Tests"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Code Artifact Writers"
Cohesion: 1.0
Nodes (2): Code Integrator, Code Persister

### Community 20 - "Observability & Dashboard"
Cohesion: 1.0
Nodes (2): Structured JSON Logging with pipelineId and executionId, UI Test: Dashboard Stats and Filters

### Community 21 - "Startup Script"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Doc Config"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Integration Test Suite"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Playwright Config"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Spec Generation"
Cohesion: 1.0
Nodes (1): generateSpecification Method

### Community 26 - "Code Persistence"
Cohesion: 1.0
Nodes (1): persistCode Method

### Community 27 - "Time Saved Metric"
Cohesion: 1.0
Nodes (1): calculateTimeSaved Function

### Community 28 - "Port Manager"
Cohesion: 1.0
Nodes (1): Port Manager

### Community 29 - "Test Report Config"
Cohesion: 1.0
Nodes (1): Playwright Report Config (list + html)

### Community 30 - "Index HTML Structure"
Cohesion: 1.0
Nodes (1): UI Test: index.html Structure and Navigation

### Community 31 - "Rate Limiting"
Cohesion: 1.0
Nodes (1): Rate Limiting: 50 req/15min general, 10 exec/hr per IP

### Community 32 - "Data Persistence"
Cohesion: 1.0
Nodes (1): Persistence: executions in data/executions/, workspaces in workspaces/

## Knowledge Gaps
- **79 isolated node(s):** `generateDocumentation Method`, `saveDocumentation Method`, `generateIndexDocument Method`, `generateSpecification Method`, `validateAccessibility Method` (+74 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `GitHub PR Integration`** (2 nodes): `createPullRequest()`, `github-pr.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Tests`** (2 nodes): `ui.test.js`, `setApiKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Code Artifact Writers`** (2 nodes): `Code Integrator`, `Code Persister`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Observability & Dashboard`** (2 nodes): `Structured JSON Logging with pipelineId and executionId`, `UI Test: Dashboard Stats and Filters`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Startup Script`** (1 nodes): `start.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Doc Config`** (1 nodes): `documentation.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Integration Test Suite`** (1 nodes): `integration.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Playwright Config`** (1 nodes): `playwright.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Spec Generation`** (1 nodes): `generateSpecification Method`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Code Persistence`** (1 nodes): `persistCode Method`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Time Saved Metric`** (1 nodes): `calculateTimeSaved Function`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Port Manager`** (1 nodes): `Port Manager`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Report Config`** (1 nodes): `Playwright Report Config (list + html)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Index HTML Structure`** (1 nodes): `UI Test: index.html Structure and Navigation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rate Limiting`** (1 nodes): `Rate Limiting: 50 req/15min general, 10 exec/hr per IP`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Data Persistence`** (1 nodes): `Persistence: executions in data/executions/, workspaces in workspaces/`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log()` connect `Code Integrator Engine` to `UI/UX Agent`, `Documenter Agent`, `Agent Module AST`, `Repository Analyzer`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `runPipeline()` connect `Documenter Agent` to `UI/UX Agent`, `Agent Module AST`, `Repository Analyzer`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `runPipeline Internal Function` connect `Agent Runtime & JSON Handling` to `SSE Progress Stream`, `Pipeline Execution Core`, `API & Dashboard Routing`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `log()` (e.g. with `.saveDocumentation()` and `.generateIndexDocument()`) actually correct?**
  _`log()` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `runPipeline()` (e.g. with `.analyzeRepository()` and `.generateSummary()`) actually correct?**
  _`runPipeline()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `generateDocumentation Method`, `saveDocumentation Method`, `generateIndexDocument Method` to the rest of the system?**
  _79 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Analyst Agent Skill` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._