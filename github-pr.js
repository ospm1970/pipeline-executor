import { Octokit } from '@octokit/rest';
import logger from './logger.js';

export async function createPullRequest({ repoUrl, githubToken, branchName, baseBranch = 'main', title, body }) {
  try {
    const octokit = new Octokit({ auth: githubToken });

    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!match) throw new Error(`URL de repositório inválida: ${repoUrl}`);
    const owner = match[1];
    const repo = match[2].replace('.git', '');

    const pr = await octokit.pulls.create({
      owner, repo,
      title,
      body,
      head: branchName,
      base: baseBranch
    });

    logger.info('Pull Request criado', { url: pr.data.html_url, number: pr.data.number });
    return { success: true, url: pr.data.html_url, number: pr.data.number };
  } catch (error) {
    logger.error('Erro ao criar Pull Request', { error: error.message });
    throw error;
  }
}
