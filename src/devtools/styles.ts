/**
 * CSS styles inspection via Chrome DevTools Protocol.
 * Get computed and matched styles for elements.
 */

import type { CDPSession, Locator, ElementHandle } from 'playwright';

export interface StyleSource {
  url: string;
  line: number;
  column: number;
}

export type StyleDeclarations = Record<string, string>;

export interface StyleRule {
  selector: string;
  source: StyleSource | null;
  origin: 'regular' | 'user-agent' | 'injected' | 'inspector';
  declarations: StyleDeclarations;
  inheritedFrom: string | null;
}

export interface StylesResult {
  element: string;
  inlineStyle: StyleDeclarations | null;
  rules: StyleRule[];
}

interface CSSProperty {
  name: string;
  value: string;
  important?: boolean;
}

interface CSSStyle {
  cssProperties: CSSProperty[];
  cssText?: string;
}

interface CSSRule {
  selectorList: { text: string; range?: SourceRange };
  style: CSSStyle;
  styleSheetId?: string;
  origin: string;
}

interface RuleMatch {
  rule: CSSRule;
  matchingSelectors: number[];
}

interface InheritedStyleEntry {
  inlineStyle?: CSSStyle;
  matchedCSSRules: RuleMatch[];
}

interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

interface DOMNode {
  localName?: string;
  nodeName?: string;
  backendNodeId: number;
  attributes?: string[];
}

function extractDeclarations(style: CSSStyle | undefined): StyleDeclarations {
  if (!style?.cssProperties) return {};

  const result: StyleDeclarations = {};
  for (const prop of style.cssProperties) {
    if (!prop.value || prop.value === 'initial' || prop.name.startsWith('-webkit-')) {
      continue;
    }
    const value = prop.important ? `${prop.value} !important` : prop.value;
    result[prop.name] = value;
  }
  return result;
}

function formatElementDescription(node: DOMNode): string {
  let desc = node.localName || node.nodeName?.toLowerCase() || 'element';

  if (node.attributes) {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < node.attributes.length; i += 2) {
      attrs[node.attributes[i]] = node.attributes[i + 1];
    }

    if (attrs.id) {
      desc += `#${attrs.id}`;
    }
    if (attrs.class) {
      desc += `.${attrs.class.split(' ').join('.')}`;
    }
  }

  return desc;
}

/**
 * Get matched CSS styles for a locator element.
 * 
 * @example
 * ```ts
 * const cdp = await getCDPSession(page);
 * const styles = await getStylesForLocator({ locator: $('e5'), cdp });
 * console.log(formatStylesAsText(styles));
 * ```
 */
export async function getStylesForLocator({
  locator,
  cdp,
  includeUserAgentStyles = false,
}: {
  locator: Locator | ElementHandle;
  cdp: CDPSession;
  includeUserAgentStyles?: boolean;
}): Promise<StylesResult> {
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');

  // Get element handle
  const elementHandle = 'elementHandle' in locator 
    ? await (locator as Locator).elementHandle()
    : locator as ElementHandle;
    
  if (!elementHandle) {
    throw new Error('Could not get element handle from locator');
  }

  // Get backend node ID via bounding box location
  const box = await elementHandle.boundingBox();
  if (!box) {
    throw new Error('Element has no bounding box');
  }

  await cdp.send('DOM.getDocument', { depth: 0 });
  const nodeAtPoint = await cdp.send('DOM.getNodeForLocation', {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  }) as { backendNodeId: number };

  const pushResult = await cdp.send('DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [nodeAtPoint.backendNodeId],
  }) as { nodeIds: number[] };
  
  const nodeId = pushResult.nodeIds[0];
  if (!nodeId) {
    throw new Error('Could not get nodeId for element');
  }

  const nodeInfo = await cdp.send('DOM.describeNode', { nodeId }) as { node: DOMNode };
  const elementDescription = formatElementDescription(nodeInfo.node);

  const matchedStyles = await cdp.send('CSS.getMatchedStylesForNode', { nodeId }) as {
    matchedCSSRules?: RuleMatch[];
    inherited?: InheritedStyleEntry[];
    inlineStyle?: CSSStyle;
  };

  const rules: StyleRule[] = [];

  // Process matched CSS rules
  if (matchedStyles.matchedCSSRules) {
    for (const ruleMatch of matchedStyles.matchedCSSRules) {
      const rule = ruleMatch.rule;
      const sourceRange = rule.selectorList?.range;

      let source: StyleSource | null = null;
      if (rule.styleSheetId && sourceRange) {
        source = {
          url: `stylesheet:${rule.styleSheetId}`,
          line: sourceRange.startLine + 1,
          column: sourceRange.startColumn,
        };
      }

      rules.push({
        selector: rule.selectorList.text,
        source,
        origin: rule.origin as StyleRule['origin'],
        declarations: extractDeclarations(rule.style),
        inheritedFrom: null,
      });
    }
  }

  // Process inherited styles
  if (matchedStyles.inherited) {
    for (let i = 0; i < matchedStyles.inherited.length; i++) {
      const inheritedEntry = matchedStyles.inherited[i];
      const ancestorDesc = `ancestor[${i + 1}]`;

      if (inheritedEntry.inlineStyle) {
        const declarations = extractDeclarations(inheritedEntry.inlineStyle);
        if (Object.keys(declarations).length > 0) {
          rules.push({
            selector: 'element.style',
            source: null,
            origin: 'regular',
            declarations,
            inheritedFrom: ancestorDesc,
          });
        }
      }

      for (const ruleMatch of inheritedEntry.matchedCSSRules) {
        const rule = ruleMatch.rule;
        const sourceRange = rule.selectorList?.range;

        let source: StyleSource | null = null;
        if (rule.styleSheetId && sourceRange) {
          source = {
            url: `stylesheet:${rule.styleSheetId}`,
            line: sourceRange.startLine + 1,
            column: sourceRange.startColumn,
          };
        }

        const declarations = extractDeclarations(rule.style);
        if (Object.keys(declarations).length > 0) {
          rules.push({
            selector: rule.selectorList.text,
            source,
            origin: rule.origin as StyleRule['origin'],
            declarations,
            inheritedFrom: ancestorDesc,
          });
        }
      }
    }
  }

  // Extract inline style
  let inlineStyle: StyleDeclarations | null = null;
  if (matchedStyles.inlineStyle) {
    const declarations = extractDeclarations(matchedStyles.inlineStyle);
    if (Object.keys(declarations).length > 0) {
      inlineStyle = declarations;
    }
  }

  // Filter out user-agent styles unless requested
  const filteredRules = includeUserAgentStyles
    ? rules
    : rules.filter((r) => r.origin !== 'user-agent');

  return {
    element: elementDescription,
    inlineStyle,
    rules: filteredRules,
  };
}

/**
 * Format styles result as human-readable text.
 */
export function formatStylesAsText(styles: StylesResult): string {
  const lines: string[] = [];

  lines.push(`Element: ${styles.element}`);
  lines.push('');

  if (styles.inlineStyle) {
    lines.push('Inline styles:');
    for (const [prop, value] of Object.entries(styles.inlineStyle)) {
      lines.push(`  ${prop}: ${value}`);
    }
    lines.push('');
  }

  const directRules = styles.rules.filter((r) => !r.inheritedFrom);
  const inheritedRules = styles.rules.filter((r) => r.inheritedFrom);

  if (directRules.length > 0) {
    lines.push('Matched rules:');
    for (const rule of directRules) {
      lines.push(`  ${rule.selector} {`);
      const sourceInfo = rule.source ? ` /* ${rule.source.url}:${rule.source.line}:${rule.source.column} */` : '';
      if (sourceInfo) {
        lines.push(`   ${sourceInfo}`);
      }
      for (const [prop, value] of Object.entries(rule.declarations)) {
        lines.push(`    ${prop}: ${value};`);
      }
      lines.push('  }');
    }
    lines.push('');
  }

  if (inheritedRules.length > 0) {
    const byAncestor = new Map<string, StyleRule[]>();
    for (const rule of inheritedRules) {
      const key = rule.inheritedFrom!;
      if (!byAncestor.has(key)) {
        byAncestor.set(key, []);
      }
      byAncestor.get(key)!.push(rule);
    }

    for (const [ancestor, rules] of byAncestor) {
      lines.push(`Inherited from ${ancestor}:`);
      for (const rule of rules) {
        lines.push(`  ${rule.selector} {`);
        const sourceInfo = rule.source ? ` /* ${rule.source.url}:${rule.source.line}:${rule.source.column} */` : '';
        if (sourceInfo) {
          lines.push(`   ${sourceInfo}`);
        }
        for (const [prop, value] of Object.entries(rule.declarations)) {
          lines.push(`    ${prop}: ${value};`);
        }
        lines.push('  }');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
