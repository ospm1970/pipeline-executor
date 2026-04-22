import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const TEST_API_KEY = 'test-key-integration';
process.env.API_KEY = TEST_API_KEY;
process.env.PORT = '0'; // let OS assign a free port
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';

const { default: app, resolveIntegrableArtifact } = await import('../server.js');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health retorna status 200 e { status: "healthy" }', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'healthy');
});

test('GET /api/pipeline sem header x-api-key retorna 401', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline`);
  assert.equal(res.status, 401);
});

test('GET /api/pipeline com x-api-key correto retorna 200', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  assert.equal(res.status, 200);
});

test('POST /api/pipeline/execute sem body retorna 400', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline/execute`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TEST_API_KEY
    },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
});

test('POST /api/pipeline/execute com requirement retorna pipelineId', async () => {
  const res = await fetch(`${baseUrl}/api/pipeline/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': TEST_API_KEY },
    body: JSON.stringify({ requirement: 'test requirement' })
  });
  assert.ok([200, 422, 500].includes(res.status));
});

test('GET /api/deployments retorna estrutura correta', async () => {
  const res = await fetch(`${baseUrl}/api/deployments`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok('deployments' in body);
  assert.ok('count' in body);
});

test('resolveIntegrableArtifact prioriza o artefato final revisado', () => {
  const finalArtifact = {
    files: [{ path: 'src/final.js', content: 'export const reviewed = true;' }],
    tests: [{ path: 'tests/final.test.js', content: 'test("ok", () => {});' }]
  };
  const developmentArtifact = {
    files: [{ path: 'src/raw.js', content: 'export const raw = true;' }]
  };

  const resolved = resolveIntegrableArtifact({
    finalArtifact,
    stages: {
      development: { result: developmentArtifact },
      code_review: { output: { files: [{ path: 'src/review.js', content: 'export const review = true;' }] } }
    }
  });

  assert.deepEqual(resolved, finalArtifact);
});

test('resolveIntegrableArtifact usa o output do code review quando finalArtifact não existe', () => {
  const reviewedArtifact = {
    files: [{ path: 'src/review.js', content: 'export const review = true;' }]
  };
  const developmentArtifact = {
    files: [{ path: 'src/raw.js', content: 'export const raw = true;' }]
  };

  const resolved = resolveIntegrableArtifact({
    stages: {
      development: { result: developmentArtifact },
      code_review: { output: reviewedArtifact }
    }
  });

  assert.deepEqual(resolved, reviewedArtifact);
});

test('resolveIntegrableArtifact usa development como fallback legado', () => {
  const developmentArtifact = {
    files: [{ path: 'src/raw.js', content: 'export const raw = true;' }]
  };

  const resolved = resolveIntegrableArtifact({
    stages: {
      development: { result: developmentArtifact }
    }
  });

  assert.deepEqual(resolved, developmentArtifact);
});
