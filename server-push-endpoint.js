// Push changes to external repository
app.post('/api/pipeline/external/:executionId/push', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { githubToken = null } = req.body;
    
    const workspacePath = path.join(__dirname, 'workspaces', executionId);
    const repoPath = path.join(workspacePath, 'repo');
    
    if (!fs.existsSync(repoPath)) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    await repositoryManager.pushChanges(repoPath, githubToken);
    
    res.json({
      executionId,
      status: 'success',
      message: 'Changes pushed to repository'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
