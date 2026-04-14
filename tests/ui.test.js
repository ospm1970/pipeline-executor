/**
 * Testes de interface — Pipeline Executor
 * Requer: npm install -D playwright @playwright/test
 * Executar: npx playwright test tests/ui.test.js
 * 
 * Pré-requisito: servidor rodando em localhost:3001
 * com API_KEY=test-ui-key no .env
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'test-ui-key';

// Helper: preenche a API key no painel de configuração
async function setApiKey(page) {
  await page.click('text=⚙️ Configuração');
  await page.fill('#apiKeyInput', API_KEY);
}

// ─────────────────────────────────────────
// index.html
// ─────────────────────────────────────────

test.describe('index.html — Estrutura e navegação', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('página carrega com título correto', async ({ page }) => {
    await expect(page).toHaveTitle(/Pipeline Executor/);
  });

  test('painel de configuração está presente e colapsado', async ({ page }) => {
    await expect(page.locator('#configPanel')).toBeHidden();
    await expect(page.locator('text=⚙️ Configuração')).toBeVisible();
  });

  test('painel de configuração abre ao clicar', async ({ page }) => {
    await page.click('text=⚙️ Configuração');
    await expect(page.locator('#configPanel')).toBeVisible();
    await expect(page.locator('#apiKeyInput')).toBeVisible();
  });

  test('painel de configuração fecha ao clicar novamente', async ({ page }) => {
    await page.click('text=⚙️ Configuração');
    await page.click('text=⚙️ Configuração');
    await expect(page.locator('#configPanel')).toBeHidden();
  });

  test('três tabs estão presentes', async ({ page }) => {
    await expect(page.locator('text=📝 Pipeline Simples')).toBeVisible();
    await expect(page.locator('text=🔗 Pipeline Externo')).toBeVisible();
    await expect(page.locator('text=📊 Deployments Ativos')).toBeVisible();
  });

  test('tab Pipeline Simples está ativa por padrão', async ({ page }) => {
    await expect(page.locator('#simple')).toBeVisible();
    await expect(page.locator('#external')).toBeHidden();
    await expect(page.locator('#deployments')).toBeHidden();
  });

  test('troca para tab Pipeline Externo', async ({ page }) => {
    await page.click('text=🔗 Pipeline Externo');
    await expect(page.locator('#external')).toBeVisible();
    await expect(page.locator('#simple')).toBeHidden();
  });

  test('troca para tab Deployments Ativos', async ({ page }) => {
    await page.click('text=📊 Deployments Ativos');
    await expect(page.locator('#deployments')).toBeVisible();
    await expect(page.locator('#simple')).toBeHidden();
  });
});

test.describe('index.html — Pipeline Simples', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await setApiKey(page);
  });

  test('botão Executar Pipeline está presente', async ({ page }) => {
    await expect(page.locator('button:has-text("Executar Pipeline")').first()).toBeVisible();
  });

  test('alerta ao clicar sem preencher requisito', async ({ page }) => {
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('descreva a alteração');
      await dialog.dismiss();
    });
    await page.click('button:has-text("Executar Pipeline")');
  });

  test('botão dispara request POST /api/pipeline/execute com x-api-key', async ({ page }) => {
    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('/api/pipeline/execute') && req.method() === 'POST'
      ),
      (async () => {
        await page.fill('#requirement', 'Teste de interface automatizado');
        await page.click('button:has-text("Executar Pipeline")');
      })()
    ]);

    expect(request.headers()['x-api-key']).toBe(API_KEY);
    const body = JSON.parse(request.postData());
    expect(body.requirement).toBe('Teste de interface automatizado');
  });

  test('sem API key retorna 401 e não trava a página', async ({ page }) => {
    // Não define API key — usa string vazia
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/pipeline/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': '' },
        body: JSON.stringify({ requirement: 'teste' })
      });
      return res.status;
    });
    expect(response).toBe(401);
  });

  test('progresso do pipeline aparece após execução iniciar', async ({ page }) => {
    await page.route('**/api/pipeline/execute', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pipelineId: 'pipeline-test-123', status: 'running' })
      });
    });

    await page.fill('#requirement', 'Teste de progresso');
    await page.click('button:has-text("Executar Pipeline")');
    await expect(page.locator('#progressContainer')).toBeVisible();
  });

  test('pipeline bloqueado por QA exibe mensagem de erro', async ({ page }) => {
    await page.route('**/api/pipeline/execute', route => {
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'blocked_by_qa',
          reason: 'Cobertura insuficiente: 62% (mínimo 80%)'
        })
      });
    });

    await page.fill('#requirement', 'Teste QA bloqueado');
    await page.click('button:has-text("Executar Pipeline")');
    await expect(page.locator('#progressContainer')).toBeVisible();
    await expect(page.locator('.log-entry.error')).toContainText('QA');
  });
});

test.describe('index.html — Pipeline Externo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await setApiKey(page);
    await page.click('text=🔗 Pipeline Externo');
  });

  test('campos de URL, token e requisito estão presentes', async ({ page }) => {
    await expect(page.locator('#repoUrl')).toBeVisible();
    await expect(page.locator('#githubToken')).toBeVisible();
    await expect(page.locator('#externalRequirement')).toBeVisible();
  });

  test('alerta ao clicar sem preencher URL e requisito', async ({ page }) => {
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('URL do repositório');
      await dialog.dismiss();
    });
    await page.click('#external button:has-text("Executar Pipeline")');
  });

  test('envia request com repositoryUrl e requirement', async ({ page }) => {
    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('/api/pipeline/external') && req.method() === 'POST'
      ),
      (async () => {
        await page.fill('#repoUrl', 'https://github.com/teste/repo');
        await page.fill('#externalRequirement', 'Adicionar endpoint de health check');
        await page.click('#external button:has-text("Executar Pipeline")');
      })()
    ]);

    const body = JSON.parse(request.postData());
    expect(body.repositoryUrl).toBe('https://github.com/teste/repo');
    expect(body.requirement).toBe('Adicionar endpoint de health check');
    expect(request.headers()['x-api-key']).toBe(API_KEY);
  });

  test('exibe Pull Request link quando retornado', async ({ page }) => {
    await page.route('**/api/pipeline/external', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          executionId: 'exec-123',
          pipelineId: 'pipeline-123',
          repository: { name: 'repo', type: 'nodejs' },
          deployment: { url: 'http://localhost:3010', port: 3010 },
          pullRequest: { url: 'https://github.com/teste/repo/pull/42', number: 42 },
          status: 'completed'
        })
      });
    });

    await page.fill('#repoUrl', 'https://github.com/teste/repo');
    await page.fill('#externalRequirement', 'Adicionar health check');
    await page.click('#external button:has-text("Executar Pipeline")');

    await expect(page.locator('#externalStatus')).toContainText('Pull Request');
    await expect(page.locator('#externalStatus a[href*="pull/42"]')).toBeVisible();
  });

  test('exibe mensagem de bloqueio quando QA reprova', async ({ page }) => {
    await page.route('**/api/pipeline/external', route => {
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'blocked_by_qa',
          reason: 'Issues críticas encontradas',
          executionId: 'exec-123',
          pipelineId: 'pipeline-123',
          repository: { name: 'repo', type: 'nodejs' },
          deployment: { url: 'http://localhost:3010', port: 3010 }
        })
      });
    });

    await page.fill('#repoUrl', 'https://github.com/teste/repo');
    await page.fill('#externalRequirement', 'Teste QA bloqueado externo');
    await page.click('#external button:has-text("Executar Pipeline")');

    await expect(page.locator('#externalStatus')).toContainText('QA bloqueou');
  });
});

test.describe('index.html — Histórico', () => {
  test('histórico carrega ao abrir a página', async ({ page }) => {
    await page.route('**/api/pipeline', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 2,
          pipelines: [
            { pipelineId: 'pipeline-001', requirement: 'Adicionar login OAuth', fileCount: 6, createdAt: new Date().toISOString() },
            { pipelineId: 'pipeline-002', requirement: 'Refatorar módulo de pagamento', fileCount: 4, createdAt: new Date().toISOString() }
          ]
        })
      });
    });

    await page.goto(BASE_URL);
    await setApiKey(page);
    await expect(page.locator('#history')).toContainText('Adicionar login OAuth');
    await expect(page.locator('#history')).toContainText('Refatorar módulo de pagamento');
  });

  test('histórico vazio exibe mensagem adequada', async ({ page }) => {
    await page.route('**/api/pipeline', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, pipelines: [] })
      });
    });

    await page.goto(BASE_URL);
    await setApiKey(page);
    await expect(page.locator('#history')).toContainText('Nenhuma execução ainda');
  });
});

// ─────────────────────────────────────────
// dashboard.html
// ─────────────────────────────────────────

test.describe('dashboard.html — Estrutura', () => {
  test.beforeEach(async ({ page }) => {
    // Mock todos os endpoints do dashboard
    await page.route('**/api/dashboard/stats', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ successfulExecutions: 42, failedExecutions: 3, successRate: 93.3, averageExecutionTime: 180 })
    }));
    await page.route('**/api/dashboard/distribution', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ simple: 30, external: 15, total: 45 })
    }));
    await page.route('**/api/dashboard/timeline', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ timeline: [] })
    }));
    await page.route('**/api/dashboard/errors', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([])
    }));
    await page.route('**/api/dashboard/time-saved', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ totalExecutions: 45, totalHoursSaved: 1800, costSavedEstimate: '$90,000' })
    }));
    await page.route('**/api/dashboard/executions**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ executions: [] })
    }));

    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('página carrega com título correto', async ({ page }) => {
    await expect(page).toHaveTitle(/Dashboard/);
  });

  test('cards de estatísticas estão presentes', async ({ page }) => {
    await expect(page.locator('#successful-count')).toBeVisible();
    await expect(page.locator('#failed-count')).toBeVisible();
    await expect(page.locator('#success-rate')).toBeVisible();
    await expect(page.locator('#avg-time')).toBeVisible();
  });

  test('estatísticas são preenchidas com dados da API', async ({ page }) => {
    await expect(page.locator('#successful-count')).toHaveText('42');
    await expect(page.locator('#failed-count')).toHaveText('3');
    await expect(page.locator('#success-rate')).toContainText('93.3');
  });

  test('tempo economizado é preenchido', async ({ page }) => {
    await expect(page.locator('#total-executions')).toHaveText('45');
    await expect(page.locator('#hours-saved')).toHaveText('1800');
    await expect(page.locator('#cost-saved')).toHaveText('$90,000');
  });

  test('botão Atualizar está presente e clicável', async ({ page }) => {
    const refreshBtn = page.locator('button.refresh-btn');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await expect(page.locator('#last-updated')).toContainText('Atualizado em');
  });
});

test.describe('dashboard.html — Autenticação', () => {
  test('sem API key todas as chamadas retornam 401 e exibe erro', async ({ page }) => {
    await page.route('**/api/dashboard/**', route => route.fulfill({
      status: 401, contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' })
    }));

    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page.locator('#message-container')).toContainText('Erro');
  });
});

test.describe('dashboard.html — Filtros de execução', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/dashboard/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        successfulExecutions: 10, failedExecutions: 2, successRate: 83, averageExecutionTime: 200,
        simple: 5, external: 7, total: 12, timeline: [], totalExecutions: 12,
        totalHoursSaved: 480, costSavedEstimate: '$24,000', executions: []
      })
    }));
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('botão "Todas" está ativo por padrão', async ({ page }) => {
    await expect(page.locator('.filter-btn.active')).toContainText('Todas');
  });

  test('clique em filtro "Concluídas" muda o botão ativo', async ({ page }) => {
    await page.click('button:has-text("✅ Concluídas")');
    await expect(page.locator('.filter-btn.active')).toContainText('Concluídas');
  });

  test('clique em filtro "Falhadas" muda o botão ativo', async ({ page }) => {
    await page.click('button:has-text("❌ Falhadas")');
    await expect(page.locator('.filter-btn.active')).toContainText('Falhadas');
  });

  test('filtro "Externas" dispara request com parâmetro type=external', async ({ page }) => {
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('type=external')),
      page.click('button:has-text("🔗 Externas")')
    ]);
    expect(request.url()).toContain('type=external');
  });
});
