/**
 * Debugger class for JavaScript debugging via Chrome DevTools Protocol.
 * Works with browser debugging through Playwright's CDP session.
 */

import type { CDPSession } from 'playwright';

export interface BreakpointInfo {
  id: string;
  file: string;
  line: number;
}

export interface LocationInfo {
  url: string;
  lineNumber: number;
  columnNumber: number;
  callstack: Array<{
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  }>;
  sourceContext: string;
}

export interface EvaluateResult {
  value: unknown;
}

export interface ScriptInfo {
  scriptId: string;
  url: string;
}

interface CallFrame {
  callFrameId: string;
  functionName: string;
  url: string;
  location: {
    scriptId: string;
    lineNumber: number;
    columnNumber?: number;
  };
  scopeChain: Array<{
    type: string;
    object: { objectId?: string };
  }>;
}

interface RemoteObject {
  type: string;
  subtype?: string;
  value?: unknown;
  description?: string;
  objectId?: string;
}

interface PropertyDescriptor {
  name: string;
  value?: RemoteObject;
  configurable?: boolean;
}

export interface Debugger {
  enable(): Promise<void>;
  setBreakpoint(options: { file: string; line: number; condition?: string }): Promise<string>;
  deleteBreakpoint(options: { breakpointId: string }): Promise<void>;
  listBreakpoints(): BreakpointInfo[];
  inspectLocalVariables(): Promise<Record<string, unknown>>;
  inspectGlobalVariables(): Promise<string[]>;
  evaluate(options: { expression: string }): Promise<EvaluateResult>;
  getLocation(): Promise<LocationInfo>;
  stepOver(): Promise<void>;
  stepInto(): Promise<void>;
  stepOut(): Promise<void>;
  resume(): Promise<void>;
  isPaused(): boolean;
  setPauseOnExceptions(options: { state: 'none' | 'uncaught' | 'all' }): Promise<void>;
  listScripts(options?: { search?: string }): Promise<ScriptInfo[]>;
  setBlackboxPatterns(options: { patterns: string[] }): Promise<void>;
}

/**
 * Create a Debugger instance for JavaScript debugging via CDP.
 * 
 * @example
 * ```ts
 * const cdp = await getCDPSession(page);
 * const dbg = createDebugger({ cdp });
 * await dbg.setBreakpoint({ file: 'app.js', line: 42 });
 * // trigger action
 * const vars = await dbg.inspectLocalVariables();
 * await dbg.resume();
 * ```
 */
export function createDebugger({ cdp }: { cdp: CDPSession }): Debugger {
  let debuggerEnabled = false;
  let paused = false;
  let currentCallFrames: CallFrame[] = [];
  const breakpoints = new Map<string, BreakpointInfo>();
  const scripts = new Map<string, ScriptInfo>();
  let blackboxPatterns: string[] = [];

  // Setup event listeners
  cdp.on('Debugger.paused', (params: { callFrames: CallFrame[] }) => {
    paused = true;
    currentCallFrames = params.callFrames;
  });

  cdp.on('Debugger.resumed', () => {
    paused = false;
    currentCallFrames = [];
  });

  cdp.on('Debugger.scriptParsed', (params: { scriptId: string; url: string }) => {
    if (params.url && !params.url.startsWith('chrome') && !params.url.startsWith('devtools')) {
      scripts.set(params.scriptId, {
        scriptId: params.scriptId,
        url: params.url,
      });
    }
  });

  async function enable(): Promise<void> {
    if (debuggerEnabled) return;

    await cdp.send('Debugger.disable');
    await cdp.send('Runtime.disable');
    scripts.clear();

    // Wait for scripts to be parsed
    await new Promise<void>((resolve) => {
      let timeout: ReturnType<typeof setTimeout>;
      const listener = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          cdp.off('Debugger.scriptParsed', listener);
          resolve();
        }, 100);
      };
      cdp.on('Debugger.scriptParsed', listener);
      timeout = setTimeout(() => {
        cdp.off('Debugger.scriptParsed', listener);
        resolve();
      }, 100);
    });

    await cdp.send('Debugger.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Runtime.runIfWaitingForDebugger');
    debuggerEnabled = true;
  }

  async function setBreakpoint({ file, line, condition }: { file: string; line: number; condition?: string }): Promise<string> {
    await enable();
    const response = await cdp.send('Debugger.setBreakpointByUrl', {
      lineNumber: line - 1,
      urlRegex: file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      columnNumber: 0,
      condition,
    }) as { breakpointId: string };

    breakpoints.set(response.breakpointId, { id: response.breakpointId, file, line });
    return response.breakpointId;
  }

  async function deleteBreakpoint({ breakpointId }: { breakpointId: string }): Promise<void> {
    await enable();
    await cdp.send('Debugger.removeBreakpoint', { breakpointId });
    breakpoints.delete(breakpointId);
  }

  function listBreakpoints(): BreakpointInfo[] {
    return Array.from(breakpoints.values());
  }

  function truncateValue(value: unknown): unknown {
    if (typeof value === 'string' && value.length > 1000) {
      return value.slice(0, 1000) + `... (${value.length} chars)`;
    }
    return value;
  }

  function formatPropertyValue(value: RemoteObject): unknown {
    if (value.type === 'object' && value.subtype !== 'null') {
      return `[${value.subtype || value.type}]`;
    }
    if (value.type === 'function') {
      return '[function]';
    }
    if (value.value !== undefined) {
      return truncateValue(value.value);
    }
    return `[${value.type}]`;
  }

  async function inspectLocalVariables(): Promise<Record<string, unknown>> {
    await enable();

    if (!paused || currentCallFrames.length === 0) {
      throw new Error('Debugger is not paused at a breakpoint');
    }

    const frame = currentCallFrames[0];
    const result: Record<string, unknown> = {};

    for (const scopeObj of frame.scopeChain) {
      if (scopeObj.type === 'global') continue;
      if (!scopeObj.object.objectId) continue;

      const objProperties = await cdp.send('Runtime.getProperties', {
        objectId: scopeObj.object.objectId,
        ownProperties: true,
        accessorPropertiesOnly: false,
        generatePreview: true,
      }) as { result: PropertyDescriptor[] };

      for (const prop of objProperties.result) {
        if (prop.value && prop.configurable) {
          result[prop.name] = formatPropertyValue(prop.value);
        }
      }
    }

    return result;
  }

  async function inspectGlobalVariables(): Promise<string[]> {
    await enable();
    const response = await cdp.send('Runtime.globalLexicalScopeNames', {}) as { names: string[] };
    return response.names;
  }

  async function processRemoteObject(obj: RemoteObject): Promise<unknown> {
    if (obj.type === 'undefined') return undefined;
    if (obj.value !== undefined) return obj.value;

    if (obj.type === 'object' && obj.objectId) {
      try {
        const props = await cdp.send('Runtime.getProperties', {
          objectId: obj.objectId,
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: true,
        }) as { result: PropertyDescriptor[] };

        const result: Record<string, unknown> = {};
        for (const prop of props.result) {
          if (prop.value) {
            if (prop.value.type === 'object' && prop.value.objectId && prop.value.subtype !== 'null') {
              try {
                const nestedProps = await cdp.send('Runtime.getProperties', {
                  objectId: prop.value.objectId,
                  ownProperties: true,
                  accessorPropertiesOnly: false,
                  generatePreview: true,
                }) as { result: PropertyDescriptor[] };

                const nestedObj: Record<string, unknown> = {};
                for (const nestedProp of nestedProps.result) {
                  if (nestedProp.value) {
                    nestedObj[nestedProp.name] =
                      nestedProp.value.value !== undefined
                        ? nestedProp.value.value
                        : nestedProp.value.description || `[${nestedProp.value.subtype || nestedProp.value.type}]`;
                  }
                }
                result[prop.name] = nestedObj;
              } catch {
                result[prop.name] = prop.value.description || `[${prop.value.subtype || prop.value.type}]`;
              }
            } else if (prop.value.type === 'function') {
              result[prop.name] = '[function]';
            } else if (prop.value.value !== undefined) {
              result[prop.name] = prop.value.value;
            } else {
              result[prop.name] = `[${prop.value.type}]`;
            }
          }
        }
        return result;
      } catch {
        return obj.description || `[${obj.subtype || obj.type}]`;
      }
    }

    return obj.description || `[${obj.type}]`;
  }

  async function evaluate({ expression }: { expression: string }): Promise<EvaluateResult> {
    await enable();

    const wrappedExpression = `
      try {
        ${expression}
      } catch (e) {
        e;
      }
    `;

    let response: { result: RemoteObject };

    if (paused && currentCallFrames.length > 0) {
      const frame = currentCallFrames[0];
      response = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: frame.callFrameId,
        expression: wrappedExpression,
        objectGroup: 'console',
        includeCommandLineAPI: true,
        silent: false,
        returnByValue: true,
        generatePreview: true,
      }) as { result: RemoteObject };
    } else {
      response = await cdp.send('Runtime.evaluate', {
        expression: wrappedExpression,
        objectGroup: 'console',
        includeCommandLineAPI: true,
        silent: false,
        returnByValue: true,
        generatePreview: true,
        awaitPromise: true,
      }) as { result: RemoteObject };
    }

    const value = await processRemoteObject(response.result);
    return { value };
  }

  async function getLocation(): Promise<LocationInfo> {
    await enable();

    if (!paused || currentCallFrames.length === 0) {
      throw new Error('Debugger is not paused at a breakpoint');
    }

    const frame = currentCallFrames[0];
    const { scriptId, lineNumber, columnNumber } = frame.location;

    const callstack = currentCallFrames.map((f) => ({
      functionName: f.functionName || '(anonymous)',
      url: f.url,
      lineNumber: f.location.lineNumber + 1,
      columnNumber: f.location.columnNumber || 0,
    }));

    let sourceContext = '';
    try {
      const scriptSource = await cdp.send('Debugger.getScriptSource', { scriptId }) as { scriptSource: string };
      const lines = scriptSource.scriptSource.split('\n');
      const startLine = Math.max(0, lineNumber - 3);
      const endLine = Math.min(lines.length - 1, lineNumber + 3);

      for (let i = startLine; i <= endLine; i++) {
        const prefix = i === lineNumber ? '> ' : '  ';
        sourceContext += `${prefix}${i + 1}: ${lines[i]}\n`;
      }
    } catch {
      sourceContext = 'Unable to retrieve source code';
    }

    return {
      url: frame.url,
      lineNumber: lineNumber + 1,
      columnNumber: columnNumber || 0,
      callstack,
      sourceContext,
    };
  }

  async function stepOver(): Promise<void> {
    await enable();
    if (!paused) throw new Error('Debugger is not paused');
    await cdp.send('Debugger.stepOver');
  }

  async function stepInto(): Promise<void> {
    await enable();
    if (!paused) throw new Error('Debugger is not paused');
    await cdp.send('Debugger.stepInto');
  }

  async function stepOut(): Promise<void> {
    await enable();
    if (!paused) throw new Error('Debugger is not paused');
    await cdp.send('Debugger.stepOut');
  }

  async function resume(): Promise<void> {
    await enable();
    if (!paused) throw new Error('Debugger is not paused');
    await cdp.send('Debugger.resume');
  }

  function isPausedFn(): boolean {
    return paused;
  }

  async function setPauseOnExceptions({ state }: { state: 'none' | 'uncaught' | 'all' }): Promise<void> {
    await enable();
    await cdp.send('Debugger.setPauseOnExceptions', { state });
  }

  async function listScriptsFn({ search }: { search?: string } = {}): Promise<ScriptInfo[]> {
    await enable();
    const allScripts = Array.from(scripts.values());
    const filtered = search
      ? allScripts.filter((s) => s.url.toLowerCase().includes(search.toLowerCase()))
      : allScripts;
    return filtered.slice(0, 20);
  }

  async function setBlackboxPatterns({ patterns }: { patterns: string[] }): Promise<void> {
    await enable();
    blackboxPatterns = patterns;
    await cdp.send('Debugger.setBlackboxPatterns', { patterns });
  }

  return {
    enable,
    setBreakpoint,
    deleteBreakpoint,
    listBreakpoints,
    inspectLocalVariables,
    inspectGlobalVariables,
    evaluate,
    getLocation,
    stepOver,
    stepInto,
    stepOut,
    resume,
    isPaused: isPausedFn,
    setPauseOnExceptions,
    listScripts: listScriptsFn,
    setBlackboxPatterns,
  };
}
