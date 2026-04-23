import fs from 'fs';
import os from 'os';
import path from 'path';
import { QARunner } from '/home/ubuntu/pipeline-executor-latest-2/qa-runner.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sanitize-test-'));

try {
  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify(
      {
        name: 'tmp',
        version: '1.0.0',
        dependencies: {
          'node:test': '*',
          express: '^4.0.0'
        },
        devDependencies: {
          'node:assert': '*',
          mocha: '^10.0.0'
        }
      },
      null,
      2
    )
  );

  const result = QARunner.sanitizeTemporaryPackageManifest(tempDir);
  const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));

  if (!result.changed) throw new Error('sanitização não marcou mudança');
  if (pkg.dependencies['node:test']) throw new Error('node:test não removido');
  if (pkg.devDependencies['node:assert']) throw new Error('node:assert não removido');
  if (!pkg.dependencies.express) throw new Error('dependência válida removida indevidamente');
  if (!pkg.devDependencies.mocha) throw new Error('devDependency válida removida indevidamente');

  console.log('qa-runner sanitize patch ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
