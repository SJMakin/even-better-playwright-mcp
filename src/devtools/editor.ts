/**
 * Editor class for viewing and live-editing web page scripts via CDP.
 * Provides a Claude Code-like interface: list, read, edit, grep.
 * Edits are in-memory only and persist until page reload.
 */

import type { CDPSession } from 'playwright';

export interface ReadResult {
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
}

export interface SearchMatch {
  url: string;
  lineNumber: number;
  lineContent: string;
}

export interface EditResult {
  success: boolean;
  stackChanged?: boolean;
}

export interface Editor {
  enable(): Promise<void>;
  list(options?: { pattern?: RegExp }): Promise<string[]>;
  read(options: { url: string; offset?: number; limit?: number }): Promise<ReadResult>;
  edit(options: { url: string; oldString: string; newString: string; dryRun?: boolean }): Promise<EditResult>;
  grep(options: { regex: RegExp; pattern?: RegExp }): Promise<SearchMatch[]>;
  search(options: { url: string; query: string }): Promise<SearchMatch[]>;
  write(options: { url: string; content: string; dryRun?: boolean }): Promise<EditResult>;
}

/**
 * Create an Editor instance for viewing/editing scripts via CDP.
 * 
 * @example
 * ```ts
 * const cdp = await getCDPSession(page);
 * const editor = createEditor({ cdp });
 * 
 * // List available scripts
 * const scripts = await editor.list({ pattern: /app/ });
 * 
 * // Read a script
 * const { content } = await editor.read({ url: 'https://example.com/app.js' });
 * 
 * // Edit a script (live, in-memory)
 * await editor.edit({
 *   url: 'https://example.com/app.js',
 *   oldString: 'DEBUG=false',
 *   newString: 'DEBUG=true'
 * });
 * ```
 */
export function createEditor({ cdp }: { cdp: CDPSession }): Editor {
  let enabled = false;
  const scripts = new Map<string, string>();
  const stylesheets = new Map<string, string>();
  const sourceCache = new Map<string, string>();

  // Setup event listeners
  cdp.on('Debugger.scriptParsed', (params: { scriptId: string; url: string }) => {
    if (!params.url.startsWith('chrome') && !params.url.startsWith('devtools')) {
      const url = params.url || `inline://${params.scriptId}`;
      scripts.set(url, params.scriptId);
      sourceCache.delete(params.scriptId);
    }
  });

  cdp.on('CSS.styleSheetAdded', (params: { header: { styleSheetId: string; sourceURL?: string } }) => {
    const header = params.header;
    if (header.sourceURL?.startsWith('chrome') || header.sourceURL?.startsWith('devtools')) {
      return;
    }
    const url = header.sourceURL || `inline-css://${header.styleSheetId}`;
    stylesheets.set(url, header.styleSheetId);
    sourceCache.delete(header.styleSheetId);
  });

  async function enable(): Promise<void> {
    if (enabled) return;

    await cdp.send('Debugger.disable');
    await cdp.send('CSS.disable');
    scripts.clear();
    stylesheets.clear();
    sourceCache.clear();

    // Wait for resources to be discovered
    await new Promise<void>((resolve) => {
      let timeout: ReturnType<typeof setTimeout>;
      const listener = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          cdp.off('Debugger.scriptParsed', listener);
          cdp.off('CSS.styleSheetAdded', listener);
          resolve();
        }, 100);
      };
      cdp.on('Debugger.scriptParsed', listener);
      cdp.on('CSS.styleSheetAdded', listener);
      timeout = setTimeout(() => {
        cdp.off('Debugger.scriptParsed', listener);
        cdp.off('CSS.styleSheetAdded', listener);
        resolve();
      }, 100);
    });

    await cdp.send('Debugger.enable');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    enabled = true;
  }

  function getIdByUrl(url: string): { scriptId: string } | { styleSheetId: string } {
    const scriptId = scripts.get(url);
    if (scriptId) {
      return { scriptId };
    }
    const styleSheetId = stylesheets.get(url);
    if (styleSheetId) {
      return { styleSheetId };
    }
    const allUrls = [...Array.from(scripts.keys()), ...Array.from(stylesheets.keys())];
    const available = allUrls.slice(0, 5);
    throw new Error(`Resource not found: ${url}\nAvailable: ${available.join(', ')}${allUrls.length > 5 ? '...' : ''}`);
  }

  async function getSource(id: { scriptId: string } | { styleSheetId: string }): Promise<string> {
    if ('styleSheetId' in id) {
      const cached = sourceCache.get(id.styleSheetId);
      if (cached) return cached;

      const response = await cdp.send('CSS.getStyleSheetText', { styleSheetId: id.styleSheetId }) as { text: string };
      sourceCache.set(id.styleSheetId, response.text);
      return response.text;
    }

    const cached = sourceCache.get(id.scriptId);
    if (cached) return cached;

    const response = await cdp.send('Debugger.getScriptSource', { scriptId: id.scriptId }) as { scriptSource: string };
    sourceCache.set(id.scriptId, response.scriptSource);
    return response.scriptSource;
  }

  async function setSource(
    id: { scriptId: string } | { styleSheetId: string },
    content: string,
    dryRun = false
  ): Promise<EditResult> {
    if ('styleSheetId' in id) {
      await cdp.send('CSS.setStyleSheetText', { styleSheetId: id.styleSheetId, text: content });
      if (!dryRun) {
        sourceCache.set(id.styleSheetId, content);
      }
      return { success: true };
    }

    const response = await cdp.send('Debugger.setScriptSource', {
      scriptId: id.scriptId,
      scriptSource: content,
      dryRun,
    }) as { stackChanged?: boolean };

    if (!dryRun) {
      sourceCache.set(id.scriptId, content);
    }
    return { success: true, stackChanged: response.stackChanged };
  }

  async function list({ pattern }: { pattern?: RegExp } = {}): Promise<string[]> {
    await enable();
    const urls = [...Array.from(scripts.keys()), ...Array.from(stylesheets.keys())];

    if (!pattern) return urls;

    return urls.filter((url) => {
      const matches = pattern.test(url);
      pattern.lastIndex = 0;
      return matches;
    });
  }

  async function read({ url, offset = 0, limit = 2000 }: { url: string; offset?: number; limit?: number }): Promise<ReadResult> {
    await enable();
    const id = getIdByUrl(url);
    const source = await getSource(id);

    const lines = source.split('\n');
    const totalLines = lines.length;
    const startLine = Math.min(offset, totalLines);
    const endLine = Math.min(offset + limit, totalLines);
    const selectedLines = lines.slice(startLine, endLine);

    const content = selectedLines.map((line, i) => `${String(startLine + i + 1).padStart(5)}| ${line}`).join('\n');

    return {
      content,
      totalLines,
      startLine: startLine + 1,
      endLine,
    };
  }

  async function edit({
    url,
    oldString,
    newString,
    dryRun = false,
  }: {
    url: string;
    oldString: string;
    newString: string;
    dryRun?: boolean;
  }): Promise<EditResult> {
    await enable();
    const id = getIdByUrl(url);
    const source = await getSource(id);

    const matchCount = source.split(oldString).length - 1;
    if (matchCount === 0) {
      throw new Error(`oldString not found in ${url}`);
    }
    if (matchCount > 1) {
      throw new Error(`oldString found ${matchCount} times in ${url}. Provide more context to make it unique.`);
    }

    const newSource = source.replace(oldString, newString);
    return setSource(id, newSource, dryRun);
  }

  async function grep({ regex, pattern }: { regex: RegExp; pattern?: RegExp }): Promise<SearchMatch[]> {
    await enable();

    const matches: SearchMatch[] = [];
    const urls = await list({ pattern });

    for (const url of urls) {
      let source: string;
      try {
        const id = getIdByUrl(url);
        source = await getSource(id);
      } catch {
        continue;
      }

      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            url,
            lineNumber: i + 1,
            lineContent: lines[i].trim().slice(0, 200),
          });
          regex.lastIndex = 0;
        }
      }
    }

    return matches;
  }

  async function search({ url, query }: { url: string; query: string }): Promise<SearchMatch[]> {
    await enable();
    const id = getIdByUrl(url);
    const source = await getSource(id);
    
    const matches: SearchMatch[] = [];
    const lines = source.split('\n');
    const lowerQuery = query.toLowerCase();
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        matches.push({
          url,
          lineNumber: i + 1,
          lineContent: lines[i].trim().slice(0, 200),
        });
      }
    }
    
    return matches;
  }

  async function write({ url, content, dryRun = false }: { url: string; content: string; dryRun?: boolean }): Promise<EditResult> {
    await enable();
    const id = getIdByUrl(url);
    return setSource(id, content, dryRun);
  }

  return {
    enable,
    list,
    read,
    edit,
    grep,
    search,
    write,
  };
}
