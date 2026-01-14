# even-better-playwright-mcp

## Vision

The **best of all worlds** - a Playwright MCP that combines:
- **Code Execution** - Run arbitrary Playwright code (playwriter's `execute` tool)
- **Intelligent DOM Compression** - 90%+ token reduction (better-playwright-mcp)
- **Advanced DevTools** - Debugger, Editor, Styles inspection (playwriter)
- **Visual Labels** - Vimium-style overlays for screenshot-based interaction
- **Unified Ref System** - Same `aria-ref` pattern all three projects use

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     even-better-playwright-mcp                   │
├─────────────────────────────────────────────────────────────────┤
│  CORE                                                            │
│  ├── aria-ref selector system ([ref=e1], [ref=e2], etc.)        │
│  ├── page._snapshotForAI() for accessibility snapshots          │
│  └── Standard Playwright browser automation                      │
├─────────────────────────────────────────────────────────────────┤
│  ENHANCED SNAPSHOT (from better-playwright-mcp)                  │
│  ├── SimHash-based list folding (compress 48 items → 2 lines)   │
│  ├── Useless wrapper removal                                     │
│  └── Ripgrep-powered content search                              │
├─────────────────────────────────────────────────────────────────┤
│  CODE EXECUTION (from playwriter)                                │
│  ├── browser_execute tool (run Playwright code in VM sandbox)   │
│  ├── Sandboxed require (safe module allowlist)                   │
│  ├── Scoped file system (cwd, /tmp only)                        │
│  └── Console log capture and forwarding                          │
├─────────────────────────────────────────────────────────────────┤
│  ADVANCED DEVTOOLS (from playwriter)                             │
│  ├── Debugger class (breakpoints, step, inspect variables)      │
│  ├── Editor class (live code editing without reload)            │
│  ├── Styles inspection (CSS like DevTools panel)                │
│  └── React source finding (component file/line locations)       │
├─────────────────────────────────────────────────────────────────┤
│  VISUAL OVERLAYS (from playwriter)                               │
│  ├── Vimium-style labels on interactive elements                │
│  ├── Color-coded by role (links=yellow, buttons=orange, etc.)   │
│  └── screenshotWithAccessibilityLabels() helper                  │
└─────────────────────────────────────────────────────────────────┘
```

## The Ref System

**Good news**: All three projects use the **same ref system**!

- Playwright's internal `page._snapshotForAI()` generates refs like `[ref=e1]`
- Elements are selected via `page.locator('aria-ref=e1')`
- This is Playwright's built-in accessibility ref selector engine

No changes needed - just leverage the existing system consistently.

---

## Implementation Plan

### Phase 1: Foundation (Day 1)

**Goal**: Create a working MCP server with the core Playwright integration.

#### Step 1.1: Project Setup
```bash
mkdir src
npm init -y

# Dependencies
npm install @modelcontextprotocol/sdk playwright zod vm2
npm install -D typescript @types/node
```

**Borrow from**: `better-playwright-mcp/tsconfig.json` for TS config.

#### Step 1.2: Core Tools

Create essential tools - can be simpler than Microsoft's since we have `execute`:

**Required tools**:
- `snapshot` - Get compressed accessibility snapshot with refs
- `execute` - Run Playwright code (the main tool!)
- `screenshot` - Capture image (with optional labels)

**Source files to reference**:
- `better-playwright-mcp/lib/tools/*.js` - Tool patterns
- `better-playwright-mcp/lib/tab.js` - `refLocator()` implementation
- `playwriter/playwriter/src/mcp.ts` - Execute tool (lines 653-1058)

#### Step 1.3: Response Handler

Borrow from `better-playwright-mcp/lib/response.js`:
- Snapshot inclusion
- Console message formatting

---

### Phase 2: Enhanced Snapshots (Day 2)

**Goal**: Add intelligent DOM compression and search.

#### Step 2.1: DOM Compression Algorithm

Copy from `better-playwright-mcp/src/utils/`:
- `smart-outline-simple.ts` - Main compression logic
- `list-detector.ts` - Pattern detection
- `dom-simhash.ts` - SimHash fingerprinting
- `remove-useless-wrappers.ts` - Cleanup empty nodes

**Algorithm**:
```
Raw Snapshot (5000+ lines)
    ↓ removeUselessWrappers()
    ↓ truncateText(50 chars)
    ↓ detectSimilarPatterns(SimHash)
    ↓ foldLists()
Compressed (< 500 lines)
```

**Example compression**:
```
Before:
- listitem [ref=e234]: Product 1...
- listitem [ref=e235]: Product 2...
- listitem [ref=e236]: Product 3...
... (48 items)

After:
- listitem [ref=e234]: Product 1...
- listitem (... and 47 more similar) [refs: e235, e236, ...]
```

#### Step 2.2: Ripgrep Search

Copy from `better-playwright-mcp/src/utils/search-snapshot.ts`:
- Regex-based content search
- Line limit protection (max 100)
- Context-aware results

**New tool**: `browser_search_snapshot`
```typescript
{
  name: 'browser_search_snapshot',
  inputSchema: z.object({
    pattern: z.string().describe('Regex pattern to search'),
    ignoreCase: z.boolean().optional().default(false),
    lineLimit: z.number().optional().default(100),
  }),
}
```

---

### Phase 3: Code Execution (Day 3-4)

**Goal**: Add the "god mode" execute tool from playwriter.

#### Step 3.1: VM Sandbox Setup

Copy from `playwriter/playwriter/src/mcp.ts` (lines 128-213):

```typescript
// Safe module allowlist
const ALLOWED_MODULES = new Set([
  'path', 'url', 'querystring', 'crypto', 'buffer',
  'util', 'assert', 'events', 'stream', 'zlib',
  'http', 'https', 'os',
  // fs returns sandboxed version
  'fs', 'node:fs',
]);

// Sandboxed require
function createSandboxedRequire(originalRequire: NodeRequire): NodeRequire {
  return (id: string) => {
    if (!ALLOWED_MODULES.has(id)) {
      throw new Error(`Module "${id}" is not allowed in sandbox`);
    }
    if (id === 'fs' || id === 'node:fs') {
      return scopedFs; // scoped file system
    }
    return originalRequire(id);
  };
}
```

#### Step 3.2: Scoped File System

Copy from `playwriter/playwriter/src/scoped-fs.ts`:
- Restricts file access to cwd, /tmp, os.tmpdir()
- Safe for LLM-generated code

#### Step 3.3: Execute Tool Implementation

**New tool**: `browser_execute`

```typescript
{
  name: 'browser_execute',
  description: 'Execute Playwright code with full API access',
  inputSchema: z.object({
    code: z.string().describe('Playwright code with {page, context, state} in scope'),
    timeout: z.number().optional().default(30000),
  }),
}
```

**VM Context** (from playwriter lines 921-972):
```typescript
const vmContext = {
  page,
  context,
  state: userState,  // persistent across calls
  console: customConsole,  // captured logs
  
  // Helpers
  accessibilitySnapshot,
  screenshotWithAccessibilityLabels,
  getCleanHTML,
  waitForPageLoad,
  getLatestLogs,
  
  // Advanced (Phase 4)
  getCDPSession,
  createDebugger,
  createEditor,
  getStylesForLocator,
  getReactSource,
  
  // Safe globals
  setTimeout, fetch, Buffer, URL, crypto,
  require: sandboxedRequire,
};
```

**Ref helper** - inject `$(ref)` shorthand:
```typescript
// In VM scope
const $ = (ref: string) => page.locator(`aria-ref=${ref}`);
// Usage: await $('e5').click()
```

#### Step 3.4: Console Log Capture

Copy from `playwriter/playwriter/src/mcp.ts` (lines 458-499):
- Per-page log tracking
- Search and filtering
- Max 5000 logs per page

---

### Phase 4: Advanced DevTools (Day 5)

**Goal**: Add CDP-powered debugging and editing capabilities.

#### Step 4.1: CDP Session Management

Copy from `playwriter/playwriter/src/cdp-session.ts`:
- CDP WebSocket connection
- Event handling

#### Step 4.2: Debugger Class

Copy from `playwriter/playwriter/src/debugger.ts`:

**Capabilities**:
- `setBreakpoint({ file, line, condition })` - Set breakpoint
- `deleteBreakpoint({ breakpointId })` - Remove breakpoint
- `inspectLocalVariables()` - Get local vars when paused
- `evaluate({ expression })` - Evaluate in current scope
- `getLocation()` - Current execution position
- `stepOver()`, `stepInto()`, `stepOut()` - Step controls
- `resume()` - Continue execution
- `listScripts({ search })` - Find available scripts
- `setBlackboxPatterns({ patterns })` - Skip framework code

**Available via execute tool**:
```javascript
const cdp = await getCDPSession({ page });
const dbg = createDebugger({ cdp });
await dbg.setBreakpoint({ file: 'app.js', line: 42 });
// trigger code, then when paused:
const vars = await dbg.inspectLocalVariables();
await dbg.resume();
```

#### Step 4.3: Editor Class

Copy from `playwriter/playwriter/src/editor.ts`:

**Capabilities**:
- `search({ url, query })` - Find code in scripts
- `read({ url, startLine, endLine })` - Read script content
- `edit({ url, oldString, newString })` - Live-edit without reload

**Example**:
```javascript
const editor = createEditor({ cdp });
await editor.edit({
  url: 'app.js',
  oldString: 'DEBUG=false',
  newString: 'DEBUG=true'
});
```

#### Step 4.4: Styles Inspection

Copy from `playwriter/playwriter/src/styles.ts`:

```javascript
const styles = await getStylesForLocator({ locator: $('e5') });
// Returns computed styles, inherited styles, matched rules
console.log(formatStylesAsText(styles));
```

#### Step 4.5: React Source Finding

Copy from `playwriter/playwriter/src/react-source.ts`:

```javascript
const source = await getReactSource({ locator: $('e5') });
// { fileName: 'Button.tsx', lineNumber: 42 }
```

---

### Phase 5: Visual Labels (Day 6)

**Goal**: Add Vimium-style overlays for better screenshot interaction.

#### Step 5.1: Label System

Copy from `playwriter/playwriter/src/aria-snapshot.ts`:

**Components**:
- `showAriaRefLabels({ page, interactiveOnly })` - Inject labels
- `hideAriaRefLabels({ page })` - Remove labels
- `screenshotWithAccessibilityLabels({ page })` - Capture with labels

**Color coding**:
| Role | Color |
|------|-------|
| link | Yellow (#FFF785) |
| button | Orange (#FFE0B2) |
| textbox | Coral (#FFCDD2) |
| checkbox/radio | Pink (#F8BBD0) |
| menuitem | Salmon (#FFAB91) |
| tab/option | Amber (#FFE082) |
| img/video | Blue (#B3E5FC) |

**Features**:
- Only shows interactive roles by default
- Skips elements covered by modals
- Prevents label overlap
- Auto-hides after 30 seconds
- Connector lines from label to element

#### Step 5.2: Screenshot Integration

Make labels available in `browser_execute`:
```javascript
await screenshotWithAccessibilityLabels({ page });
// Takes screenshot, includes image + snapshot in response
await $('e5').click(); // Use ref from labels
```

---

### Phase 6: Polish (Day 7)

#### Step 6.1: Configuration

Sensible CLI args:
```
--browser <browser>      Browser to use (chrome, firefox, webkit)
--headless               Run headless
--cdp-endpoint <url>     Connect to existing browser
--user-data-dir <path>   Persistent profile directory
--port <port>            HTTP/SSE transport port
```

#### Step 6.2: Error Handling

From playwriter - "Stale Ref" handling:
```typescript
// In execute tool wrapper
try {
  await userCode();
} catch (e) {
  if (e.message.includes('ref') && e.message.includes('not found')) {
    return {
      error: e.message,
      hint: 'Page may have navigated. Refs are stale after navigation. Call snapshot to get fresh refs.',
    };
  }
  throw e;
}
```

#### Step 6.3: Prompt Guide

Embed in `execute` tool description (like playwriter does):

```markdown
## Available in scope
- `page` - Current Playwright page
- `context` - Browser context
- `state` - Persistent object across calls
- `$('e5')` - Shorthand for page.locator('aria-ref=e5')

## Helpers
- `accessibilitySnapshot({ page })` - Get current snapshot
- `screenshotWithAccessibilityLabels({ page })` - Screenshot with labels
- `getCDPSession({ page })` - Get CDP session for debugging
- `createDebugger({ cdp })` - Create debugger instance
- `createEditor({ cdp })` - Create live editor

## Workflow
1. Call `snapshot` tool to see page structure with refs
2. Use `execute` with code like `await $('e5').click()`
3. After navigation, refs are stale - call `snapshot` again
```

---

## File Structure

```
even-better-playwright-mcp/
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── tools/
│   │   ├── snapshot.ts       # snapshot tool (compressed)
│   │   ├── execute.ts        # execute tool (the main one!)
│   │   ├── screenshot.ts     # screenshot tool (with labels)
│   │   └── reset.ts          # reset tool (reconnect)
│   ├── utils/
│   │   ├── smart-outline.ts  # DOM compression algorithm
│   │   ├── list-detector.ts  # SimHash pattern detection
│   │   ├── dom-simhash.ts    # SimHash implementation
│   │   ├── scoped-fs.ts      # Sandboxed file system
│   │   └── search.ts         # Ripgrep search (in-memory)
│   ├── devtools/
│   │   ├── cdp-session.ts    # CDP connection management
│   │   ├── debugger.ts       # Debugger class
│   │   ├── editor.ts         # Editor class
│   │   ├── styles.ts         # CSS inspection
│   │   └── react-source.ts   # React component locations
│   ├── visual/
│   │   └── aria-labels.ts    # Vimium-style overlays
│   ├── browser.ts            # Browser/context management
│   └── vm-context.ts         # VM sandbox setup
├── bin/
│   └── cli.ts                # CLI entry point
├── package.json
├── tsconfig.json
└── README.md
```

**Note**: Keeping tool count minimal (like playwriter). Most functionality accessible via `execute`.

---

## Source File Mapping

| Feature | Source | Files to Copy |
|---------|--------|---------------|
| Tool definitions | better-playwright-mcp | `lib/tools/*.js` |
| Tab management | better-playwright-mcp | `lib/tab.js` |
| Response handling | better-playwright-mcp | `lib/response.js` |
| DOM compression | better-playwright-mcp | `src/utils/smart-outline-simple.ts`, `list-detector.ts`, `dom-simhash.ts` |
| Execute tool | playwriter | `src/mcp.ts` (lines 653-1058) |
| Scoped FS | playwriter | `src/scoped-fs.ts` |
| Debugger | playwriter | `src/debugger.ts` |
| Editor | playwriter | `src/editor.ts` |
| Styles | playwriter | `src/styles.ts` |
| React source | playwriter | `src/react-source.ts` |
| Visual labels | playwriter | `src/aria-snapshot.ts` |
| CDP session | playwriter | `src/cdp-session.ts` |

---

## Testing Checklist

### Core Functionality
- [x] Refs resolve correctly via `aria-ref=`
- [x] Snapshots are compressed (verify 80%+ reduction)
- [x] `$('e5')` helper works in execute context

### Code Execution (Primary Interface)
- [x] Simple code runs: `await page.click('button')`
- [x] Ref helper works: `await $('e5').click()`
- [x] State persists across calls
- [x] Console logs are captured and returned
- [x] Timeout protection works
- [x] Module sandbox blocks dangerous requires
- [x] Screenshots can be taken inline

### DevTools (via execute)
- [x] Breakpoints can be set and hit
- [x] Variables can be inspected when paused
- [x] Scripts can be edited live
- [x] Styles inspection returns CSS data

### Visual Labels
- [x] Labels appear on interactive elements
- [x] Colors match role type
- [x] Labels don't overlap
- [x] Screenshot includes labels and snapshot
- [x] Labels auto-hide after timeout

### MCP Compatibility
- [ ] Works with Claude Desktop (requires manual testing)
- [ ] Works with VS Code / Cursor (requires manual testing)
- [ ] Works with any MCP client (stdio transport)

---

## Success Metrics

1. **Minimal tool count**: 3-4 tools total (like playwriter)
2. **Token efficiency**: 80%+ reduction in snapshot size
3. **Full Playwright API**: Everything accessible via `execute`
4. **Advanced capabilities**:
   - Multi-step flows with loops
   - Network interception
   - Debugging (breakpoints, inspect)
   - Live code editing
5. **Reliability**: Graceful stale ref handling
