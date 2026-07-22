import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { AgentLabError } from './index.mjs';

export const AGENT_LAB_JSONL_PROTOCOL = 'agent-lab.jsonl.v1';

function protocolError(code, message, details = {}) {
  return new AgentLabError(code, message, details);
}

function methodArguments(method, params) {
  if (method === 'reset') return [params.seed];
  if (method === 'observe' || method === 'legalActions') return [params.playerId];
  if (method === 'step') return [params.playerId, params.action];
  return [];
}

export async function serveJsonlEnvironment(environment, { input = process.stdin, output = process.stdout } = {}) {
  const required = ['reset', 'currentPlayer', 'observe', 'legalActions', 'step', 'isTerminal', 'result', 'snapshot'];
  for (const method of required) if (typeof environment?.[method] !== 'function') throw protocolError('INVALID_CONTRACT', `Environment must implement ${method}()`);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let chain = Promise.resolve();
  let closing = false;

  const respond = payload => output.write(`${JSON.stringify(payload)}\n`);
  const handle = async line => {
    if (!line.trim() || closing) return;
    let request;
    try {
      request = JSON.parse(line);
      if (request.protocol !== AGENT_LAB_JSONL_PROTOCOL) throw protocolError('PROTOCOL_MISMATCH', `Expected ${AGENT_LAB_JSONL_PROTOCOL}`, { received: request.protocol });
      if (!Number.isInteger(request.id)) throw protocolError('INVALID_REQUEST_ID', 'Request id must be an integer');
      if (request.method === 'close') {
        if (typeof environment.close === 'function') await environment.close();
        closing = true;
        respond({ protocol: AGENT_LAB_JSONL_PROTOCOL, id: request.id, ok: true, result: null });
        lines.close();
        return;
      }
      if (!required.includes(request.method)) throw protocolError('UNKNOWN_METHOD', `Unknown environment method ${request.method}`);
      const result = await environment[request.method](...methodArguments(request.method, request.params || {}));
      respond({ protocol: AGENT_LAB_JSONL_PROTOCOL, id: request.id, ok: true, result: result ?? null });
    } catch (error) {
      respond({
        protocol: AGENT_LAB_JSONL_PROTOCOL,
        id: Number.isInteger(request?.id) ? request.id : -1,
        ok: false,
        error: { code: error.code || 'ADAPTER_ERROR', message: error.message || String(error), details: error.details || {} }
      });
    }
  };

  lines.on('line', line => { chain = chain.then(() => handle(line)); });
  await once(lines, 'close');
  await chain;
}

export function createJsonlEnvironmentClient({ command, args = [], cwd, env, timeoutMs = 10000 } = {}) {
  if (!command) throw protocolError('MISSING_COMMAND', 'JSONL adapter command is required');
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  let nextId = 1;
  let closed = false;
  let stderr = '';

  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-16000); });
  lines.on('line', line => {
    let response;
    try { response = JSON.parse(line); }
    catch (error) {
      for (const entry of pending.values()) entry.reject(protocolError('INVALID_RESPONSE', 'Adapter returned invalid JSON', { line, cause: error.message }));
      pending.clear();
      return;
    }
    const entry = pending.get(response.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(response.id);
    if (response.protocol !== AGENT_LAB_JSONL_PROTOCOL) entry.reject(protocolError('PROTOCOL_MISMATCH', 'Adapter response protocol differs', { response }));
    else if (!response.ok) entry.reject(protocolError(response.error?.code || 'ADAPTER_ERROR', response.error?.message || 'Adapter request failed', response.error?.details || {}));
    else entry.resolve(response.result);
  });
  child.on('error', error => {
    for (const entry of pending.values()) entry.reject(protocolError('ADAPTER_PROCESS_ERROR', error.message, { command, args }));
    pending.clear();
  });
  child.on('exit', (code, signal) => {
    closed = true;
    for (const entry of pending.values()) entry.reject(protocolError('ADAPTER_EXITED', 'Adapter process exited with pending requests', { code, signal, stderr }));
    pending.clear();
  });

  const request = (method, params = {}) => {
    if (closed) return Promise.reject(protocolError('ADAPTER_CLOSED', 'Adapter process is closed'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(protocolError('ADAPTER_TIMEOUT', `Adapter request ${method} timed out`, { method, timeoutMs, stderr }));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ protocol: AGENT_LAB_JSONL_PROTOCOL, id, method, params })}\n`, error => {
        if (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(protocolError('ADAPTER_WRITE_FAILED', error.message, { method }));
        }
      });
    });
  };

  return {
    reset: seed => request('reset', { seed }),
    currentPlayer: () => request('currentPlayer'),
    observe: playerId => request('observe', { playerId }),
    legalActions: playerId => request('legalActions', { playerId }),
    step: (playerId, action) => request('step', { playerId, action }),
    isTerminal: () => request('isTerminal'),
    result: () => request('result'),
    snapshot: () => request('snapshot'),
    async close() {
      if (closed) return;
      try { await request('close'); } catch {}
      child.stdin.end();
      if (!closed) {
        await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 250))]);
        if (!closed) child.kill('SIGTERM');
      }
      closed = true;
      lines.close();
    },
    process: child
  };
}
