/**
 * DevTools module - CDP-powered debugging and editing capabilities.
 * 
 * @example
 * ```ts
 * // Debugging
 * const cdp = await getCDPSession(page);
 * const dbg = createDebugger({ cdp });
 * await dbg.setBreakpoint({ file: 'app.js', line: 42 });
 * 
 * // Live editing
 * const editor = createEditor({ cdp });
 * await editor.edit({
 *   url: 'app.js',
 *   oldString: 'DEBUG=false',
 *   newString: 'DEBUG=true'
 * });
 * 
 * // Styles inspection
 * const styles = await getStylesForLocator({ locator, cdp });
 * console.log(formatStylesAsText(styles));
 * 
 * // React source finding
 * const source = await getReactSource({ locator, cdp });
 * ```
 */

export { getCDPSession, clearCDPSession, type CDPSession } from './cdp-session.js';
export { createDebugger, type Debugger, type BreakpointInfo, type LocationInfo, type EvaluateResult, type ScriptInfo } from './debugger.js';
export { createEditor, type Editor, type ReadResult, type SearchMatch, type EditResult } from './editor.js';
export { getStylesForLocator, formatStylesAsText, type StylesResult, type StyleRule, type StyleSource, type StyleDeclarations } from './styles.js';
export { getReactSource, type ReactSourceLocation } from './react-source.js';
