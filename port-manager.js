import net from 'net';

export class PortManager {
  constructor(startPort = 3010, endPort = 3050) {
    this.startPort = startPort;
    this.endPort = endPort;
    this.allocatedPorts = new Map(); // executionId -> port
    this.activeProcesses = new Map(); // port -> process
  }

  /**
   * Verifica se uma porta está disponível
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port);
    });
  }

  /**
   * Encontra a próxima porta disponível
   */
  async findAvailablePort() {
    for (let port = this.startPort; port <= this.endPort; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`Nenhuma porta disponível entre ${this.startPort} e ${this.endPort}`);
  }

  /**
   * Aloca uma porta para uma execução
   */
  async allocatePort(executionId) {
    // Se já tem porta alocada, retorna
    if (this.allocatedPorts.has(executionId)) {
      return this.allocatedPorts.get(executionId);
    }

    const port = await this.findAvailablePort();
    this.allocatedPorts.set(executionId, port);
    console.log(`✅ Porta alocada para ${executionId}: ${port}`);
    return port;
  }

  /**
   * Libera uma porta
   */
  releasePort(executionId) {
    if (this.allocatedPorts.has(executionId)) {
      const port = this.allocatedPorts.get(executionId);
      this.allocatedPorts.delete(executionId);

      // Encerra o processo se ainda estiver rodando
      if (this.activeProcesses.has(port)) {
        const process = this.activeProcesses.get(port);
        process.kill();
        this.activeProcesses.delete(port);
      }

      console.log(`✅ Porta liberada: ${port} (${executionId})`);
      return true;
    }
    return false;
  }

  /**
   * Registra um processo ativo em uma porta
   */
  registerProcess(port, process) {
    this.activeProcesses.set(port, process);
    console.log(`✅ Processo registrado na porta ${port}`);
  }

  /**
   * Obtém a porta alocada para uma execução
   */
  getPort(executionId) {
    return this.allocatedPorts.get(executionId) || null;
  }

  /**
   * Lista todas as portas alocadas
   */
  listAllocatedPorts() {
    const ports = [];
    for (const [executionId, port] of this.allocatedPorts.entries()) {
      ports.push({
        executionId,
        port,
        url: `http://localhost:${port}`,
        isActive: this.activeProcesses.has(port),
      });
    }
    return ports;
  }

  /**
   * Limpa portas inativas
   */
  cleanupInactivePorts() {
    let cleaned = 0;
    for (const [executionId, port] of this.allocatedPorts.entries()) {
      if (!this.activeProcesses.has(port)) {
        this.allocatedPorts.delete(executionId);
        cleaned++;
      }
    }
    console.log(`🧹 ${cleaned} portas inativas limpas`);
    return cleaned;
  }

  /**
   * Obtém estatísticas de portas
   */
  getStats() {
    return {
      totalAllocated: this.allocatedPorts.size,
      totalActive: this.activeProcesses.size,
      portRange: `${this.startPort}-${this.endPort}`,
      allocatedPorts: this.listAllocatedPorts(),
    };
  }
}

export default PortManager;
