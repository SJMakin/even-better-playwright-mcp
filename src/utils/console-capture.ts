/**
 * Console capture utility for VM sandbox.
 * Creates a custom console that captures logs for returning to the LLM.
 */

export interface ConsoleLogs {
  method: string;
  args: unknown[];
}

export const MAX_LOGS_PER_EXECUTION = 5000;

/**
 * Create a custom console that captures logs to an array.
 */
export function createCapturedConsole(): {
  console: Console;
  logs: ConsoleLogs[];
} {
  const logs: ConsoleLogs[] = [];

  const addLog = (method: string, ...args: unknown[]) => {
    if (logs.length < MAX_LOGS_PER_EXECUTION) {
      logs.push({ method, args });
    }
  };

  const customConsole = {
    log: (...args: unknown[]) => addLog('log', ...args),
    info: (...args: unknown[]) => addLog('info', ...args),
    warn: (...args: unknown[]) => addLog('warn', ...args),
    error: (...args: unknown[]) => addLog('error', ...args),
    debug: (...args: unknown[]) => addLog('debug', ...args),
    trace: (...args: unknown[]) => addLog('trace', ...args),
    dir: (...args: unknown[]) => addLog('dir', ...args),
    table: (...args: unknown[]) => addLog('table', ...args),
    time: () => {},
    timeEnd: () => {},
    timeLog: () => {},
    count: () => {},
    countReset: () => {},
    group: () => {},
    groupCollapsed: () => {},
    groupEnd: () => {},
    clear: () => {},
    assert: (condition: unknown, ...args: unknown[]) => {
      if (!condition) addLog('assert', ...args);
    },
  } as unknown as Console;

  return { console: customConsole, logs };
}

/**
 * Format captured console logs into text for response.
 */
export function formatConsoleLogs(
  logs: ConsoleLogs[], 
  prefix = 'Console output'
): string {
  if (logs.length === 0) {
    return '';
  }

  let text = `${prefix}:\n`;
  for (const { method, args } of logs) {
    const formattedArgs = args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
    text += `[${method}] ${formattedArgs}\n`;
  }
  return text + '\n';
}
