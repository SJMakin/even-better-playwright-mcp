# even-better-playwright-mcp

The **best of all worlds** Playwright MCP server - combining intelligent DOM compression, code execution, visual labels, and advanced DevTools capabilities.

## Features

- 🎭 **Full Playwright API** - Execute any Playwright code via the `execute` tool
- 🏗️ **90%+ DOM Compression** - SimHash-based list folding and wrapper removal
- 📍 **Ref-Based Elements** - Stable `[ref=e1]` identifiers with aria-ref selectors
- 🔍 **Regex Search** - Find content in snapshots without re-fetching
- 🎯 **Visual Labels** - Vimium-style overlays for screenshot-based interaction
- 🔧 **Advanced DevTools** - Debugger, live editor, styles inspection, React source finding
- 🔒 **Sandboxed Execution** - Safe VM with scoped file system and module allowlist

## Installation

```bash
npm install -g even-better-playwright-mcp
```

Or use directly with npx:
```bash
npx even-better-playwright-mcp
```

## Configuration

Add to your MCP client settings (e.g., Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["even-better-playwright-mcp"]
    }
  }
}
```

### CLI Options

```
Usage: even-better-playwright-mcp [options]

Options:
  --browser <browser>       Browser to use: chromium, firefox, webkit (default: chromium)
  --headless               Run browser in headless mode (default: false)
  --cdp-endpoint <url>     Connect to existing browser via CDP endpoint
  --user-data-dir <path>   Use persistent browser profile directory
  -h, --help               Show help message
```

### Examples

```bash
# Basic usage (launches Chromium in headed mode)
even-better-playwright-mcp

# Use Firefox in headless mode
even-better-playwright-mcp --browser firefox --headless

# Connect to existing Chrome instance
even-better-playwright-mcp --cdp-endpoint ws://localhost:9222

# Use persistent profile
even-better-playwright-mcp --user-data-dir ./browser-profile
```

## Tools

### 1. `snapshot` - Get Page Structure

Get compressed accessibility snapshot with ref IDs for element targeting.

```
Returns: DOM tree with [ref=e1], [ref=e2] etc.
Use refs with execute tool: await $('e1').click()
Call again after navigation (refs become stale).
```

**Options:**
- `compress` (boolean, default: true) - Enable smart compression (~90% token reduction)

**Example output:**
```
### Page Info
- URL: https://example.com
- Title: Example Domain

### Accessibility Snapshot
- document [ref=e1]
  - heading "Example Domain" [level=1] [ref=e2]
  - paragraph [ref=e3]: This domain is for use in illustrative examples...
  - link "More information..." [ref=e4]
```

### 2. `browser_execute` - Run Playwright Code

Execute any Playwright code with full API access. This is the main tool for browser automation.

**Scope variables:**
- `page` - Current Playwright page
- `context` - Browser context
- `state` - Persistent object across calls
- `$('e5')` - Shorthand for `page.locator('aria-ref=e5')`
- `accessibilitySnapshot()` - Get current page snapshot

**Common patterns:**
```javascript
// Navigate
await page.goto('https://example.com')

// Click by ref (from snapshot)
await $('e5').click()

// Fill input
await $('e12').fill('search query')

// Get text
const text = await $('e3').textContent()

// Wait for network
await page.waitForLoadState('networkidle')

// Screenshot
await page.screenshot({ path: 'screenshot.png' })
```

**Advanced - DevTools access:**
```javascript
// Get CDP session for debugging
const cdp = await getCDPSession({ page })
const dbg = createDebugger({ cdp })

// Set breakpoint
await dbg.setBreakpoint({ file: 'app.js', line: 42 })

// Inspect styles
const styles = await getStylesForLocator({ locator: $('e5') })

// Find React component source
const source = await getReactSource({ locator: $('e5') })
// => { fileName: 'Button.tsx', lineNumber: 42 }
```

**Safe modules via require():**
`path`, `url`, `crypto`, `buffer`, `util`, `assert`, `os`, `fs` (sandboxed)

### 3. `screenshot` - Capture Page Image

Capture screenshots with optional visual ref labels.

**Options:**
- `ref` (string) - Screenshot specific element by ref
- `fullPage` (boolean) - Capture entire scrollable area
- `withLabels` (boolean) - Show Vimium-style ref labels

**Label colors by role:**
| Color | Role |
|-------|------|
| Yellow | links |
| Orange | buttons |
| Coral | text inputs |
| Pink | checkboxes, radios |
| Blue | images, videos |

### 4. `browser_search_snapshot` - Search Content

Search the last captured snapshot using regex patterns.

**Options:**
- `pattern` (string) - Regex pattern to search for
- `ignoreCase` (boolean, default: false) - Case-insensitive matching
- `lineLimit` (number, default: 100) - Maximum lines to return

**Example:**
```
Pattern: "button|link"
Result: 
- link "Contact Us" [ref=e15]
- button "Submit" [ref=e23]
- link "Privacy Policy" [ref=e31]
```

## Workflow

### Basic Automation

1. **Get page structure**
   ```
   Use: snapshot tool
   → See all interactive elements with refs
   ```

2. **Interact with elements**
   ```
   Use: execute tool
   Code: await $('e5').click()
   ```

3. **After navigation, refresh refs**
   ```
   Use: snapshot tool again
   → Refs are stale after navigation
   ```

### Visual Automation

1. **Take labeled screenshot**
   ```
   Use: screenshot tool with withLabels: true
   → See visual labels overlaid on elements
   ```

2. **Identify element from image**
   ```
   Label shows: "e5" on a button
   ```

3. **Click using ref**
   ```
   Use: execute tool
   Code: await $('e5').click()
   ```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     even-better-playwright-mcp                  │
├─────────────────────────────────────────────────────────────────┤
│  CORE                                                           │
│  ├── aria-ref selector system ([ref=e1], [ref=e2], etc.)       │
│  ├── page._snapshotForAI() for accessibility snapshots         │
│  └── Standard Playwright browser automation                     │
├─────────────────────────────────────────────────────────────────┤
│  ENHANCED SNAPSHOT                                              │
│  ├── SimHash-based list folding (compress 48 items → 2 lines)  │
│  ├── Useless wrapper removal                                    │
│  └── Regex-powered content search                               │
├─────────────────────────────────────────────────────────────────┤
│  CODE EXECUTION                                                 │
│  ├── browser_execute tool (run Playwright code in VM sandbox)  │
│  ├── Sandboxed require (safe module allowlist)                  │
│  ├── Scoped file system (cwd, /tmp only)                       │
│  └── Console log capture and forwarding                         │
├─────────────────────────────────────────────────────────────────┤
│  ADVANCED DEVTOOLS                                              │
│  ├── Debugger class (breakpoints, step, inspect variables)     │
│  ├── Editor class (live code editing without reload)           │
│  ├── Styles inspection (CSS like DevTools panel)               │
│  └── React source finding (component file/line locations)      │
├─────────────────────────────────────────────────────────────────┤
│  VISUAL OVERLAYS                                                │
│  ├── Vimium-style labels on interactive elements               │
│  ├── Color-coded by role (links=yellow, buttons=orange, etc.)  │
│  └── Screenshot with visible ref labels                         │
└─────────────────────────────────────────────────────────────────┘
```

## Ref System

All projects use the same ref system built into Playwright:

- **Snapshots** generate refs like `[ref=e1]`
- **Selectors** use `page.locator('aria-ref=e1')`
- **Shorthand** `$('e1')` in execute tool

**Important:** Refs become stale after navigation. Always call `snapshot` again after `page.goto()` or clicking links that navigate.

## Compression Algorithm

The snapshot compression achieves ~90% token reduction:

```
Original DOM (5000+ lines)
    ↓ removeUselessWrappers()
    ↓ truncateText(50 chars)
    ↓ detectSimilarPatterns(SimHash)
    ↓ foldLists()
Compressed (<500 lines)
```

**Example:**
```
Before:
- listitem [ref=e234]: Product 1 - Description...
- listitem [ref=e235]: Product 2 - Description...
- listitem [ref=e236]: Product 3 - Description...
... (48 items)

After:
- listitem [ref=e234]: Product 1 - Description...
- listitem (... and 47 more similar) [refs: e235, e236, ...]
```

## Error Handling

The execute tool provides contextual hints:

- **Stale ref**: "Page may have navigated. Refs are stale after navigation. Call snapshot tool to get fresh refs."
- **Timeout**: "Operation timed out. Try increasing timeout or check if element exists/is visible."
- **Hidden element**: "Element may be hidden or covered by another element. Try scrolling or closing overlays."
- **Connection lost**: "Browser connection lost. The browser may have been closed - try again to relaunch."

## Development

### Building from Source

```bash
git clone https://github.com/your-repo/even-better-playwright-mcp
cd even-better-playwright-mcp
npm install
npm run build
```

### Project Structure

```
even-better-playwright-mcp/
├── bin/
│   └── cli.ts              # CLI entry point with arg parsing
├── src/
│   ├── index.ts            # MCP server setup
│   ├── browser.ts          # Browser/context management
│   ├── vm-context.ts       # VM sandbox setup
│   ├── tools/
│   │   ├── snapshot.ts     # Snapshot tool (compressed)
│   │   ├── execute.ts      # Execute tool (main)
│   │   ├── screenshot.ts   # Screenshot tool (with labels)
│   │   └── search.ts       # Search tool
│   ├── utils/
│   │   ├── smart-outline.ts    # DOM compression
│   │   ├── list-detector.ts    # Pattern detection
│   │   ├── dom-simhash.ts      # SimHash implementation
│   │   ├── scoped-fs.ts        # Sandboxed file system
│   │   └── search.ts           # Regex search
│   ├── devtools/
│   │   ├── cdp-session.ts      # CDP connection
│   │   ├── debugger.ts         # Debugger class
│   │   ├── editor.ts           # Live editor
│   │   ├── styles.ts           # CSS inspection
│   │   └── react-source.ts     # React locations
│   └── visual/
│       └── aria-labels.ts      # Vimium-style overlays
├── package.json
├── tsconfig.json
└── README.md
```

## Acknowledgments

This project combines the best ideas from:
- [better-playwright-mcp](https://github.com/) - Intelligent DOM compression
- [playwriter](https://github.com/) - Code execution and DevTools
- [playwright-mcp](https://github.com/microsoft/playwright-mcp) - Microsoft's official MCP

## License

MIT
