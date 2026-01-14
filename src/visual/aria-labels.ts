/**
 * Visual Aria Labels - Vimium-style overlays for interactive elements
 * 
 * Shows visual labels (e.g., "e1", "e2") on interactive elements in screenshots
 * for better AI agent interaction.
 */

import type { Page, ElementHandle } from 'playwright';
import { getSnapshot } from '../browser.js';

export interface LabelOptions {
  interactiveOnly?: boolean;  // default: true - only show labels for interactive roles
  timeout?: number;           // auto-hide after ms, default: 30000
}

export interface ScreenshotWithLabelsResult {
  screenshot: Buffer;
  snapshot: string;
  labelCount: number;
}

const LABELS_CONTAINER_ID = '__aria_labels_container__';

// Roles that represent interactive elements
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'combobox',
  'searchbox',
  'checkbox',
  'radio',
  'slider',
  'spinbutton',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'tab',
  'treeitem',
  // Media elements - useful for visual tasks
  'img',
  'video',
  'audio',
]);

// Color coding by role - [gradient-top, gradient-bottom, border]
const ROLE_COLORS: Record<string, [string, string, string]> = {
  // Links - yellow (Vimium-style)
  link: ['#FFF785', '#FFC542', '#E3BE23'],
  // Buttons - orange
  button: ['#FFE0B2', '#FFCC80', '#FFB74D'],
  // Text inputs - coral/red
  textbox: ['#FFCDD2', '#EF9A9A', '#E57373'],
  combobox: ['#FFCDD2', '#EF9A9A', '#E57373'],
  searchbox: ['#FFCDD2', '#EF9A9A', '#E57373'],
  spinbutton: ['#FFCDD2', '#EF9A9A', '#E57373'],
  // Checkboxes/Radios/Switches - warm pink
  checkbox: ['#F8BBD0', '#F48FB1', '#EC407A'],
  radio: ['#F8BBD0', '#F48FB1', '#EC407A'],
  switch: ['#F8BBD0', '#F48FB1', '#EC407A'],
  // Sliders - peach
  slider: ['#FFCCBC', '#FFAB91', '#FF8A65'],
  // Menu items - salmon
  menuitem: ['#FFAB91', '#FF8A65', '#FF7043'],
  menuitemcheckbox: ['#FFAB91', '#FF8A65', '#FF7043'],
  menuitemradio: ['#FFAB91', '#FF8A65', '#FF7043'],
  // Tabs/Options - amber
  tab: ['#FFE082', '#FFD54F', '#FFC107'],
  option: ['#FFE082', '#FFD54F', '#FFC107'],
  treeitem: ['#FFE082', '#FFD54F', '#FFC107'],
  // Media elements - light blue
  img: ['#B3E5FC', '#81D4FA', '#4FC3F7'],
  video: ['#B3E5FC', '#81D4FA', '#4FC3F7'],
  audio: ['#B3E5FC', '#81D4FA', '#4FC3F7'],
};

// Default gray for unknown roles
const DEFAULT_COLORS: [string, string, string] = ['#E0E0E0', '#BDBDBD', '#9E9E9E'];

// CSS for labels
const css = String.raw;

const LABEL_STYLES = css`
  .__aria_label__ {
    position: absolute;
    font: bold 12px Helvetica, Arial, sans-serif;
    padding: 1px 4px;
    border-radius: 3px;
    color: black;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
    white-space: nowrap;
  }
`;

const CONTAINER_STYLES = css`
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2147483647;
  pointer-events: none;
`;

interface RefInfo {
  role: string;
  name: string;
}

interface RefHandle {
  ref: string;
  handle: ElementHandle;
}

/**
 * Discover aria refs by probing aria-ref=e1, e2, e3...
 * Returns refs with their element handles and role info.
 */
async function discoverRefs(page: Page): Promise<{
  refToElement: Map<string, RefInfo>;
  refHandles: RefHandle[];
}> {
  const refToElement = new Map<string, RefInfo>();
  const refHandles: RefHandle[] = [];

  let consecutiveMisses = 0;
  let refNum = 1;

  while (consecutiveMisses < 10) {
    const ref = `e${refNum++}`;
    try {
      const locator = page.locator(`aria-ref=${ref}`);
      if (await locator.count() === 1) {
        consecutiveMisses = 0;
        const [info, handle] = await Promise.all([
          locator.evaluate((el: Element) => ({
            role: el.getAttribute('role') || {
              a: (el as HTMLAnchorElement).hasAttribute('href') ? 'link' : 'generic',
              button: 'button',
              input: {
                button: 'button',
                checkbox: 'checkbox',
                radio: 'radio',
                text: 'textbox',
                search: 'searchbox',
                number: 'spinbutton',
                range: 'slider',
              }[(el as HTMLInputElement).type] || 'textbox',
              select: 'combobox',
              textarea: 'textbox',
              img: 'img',
              nav: 'navigation',
              main: 'main',
              header: 'banner',
              footer: 'contentinfo',
            }[el.tagName.toLowerCase()] || 'generic',
            name: el.getAttribute('aria-label') || 
                  el.textContent?.trim()?.slice(0, 50) || 
                  (el as HTMLInputElement).placeholder || '',
          })),
          locator.elementHandle({ timeout: 1000 }),
        ]);
        refToElement.set(ref, info);
        if (handle) {
          refHandles.push({ ref, handle });
        }
      } else {
        consecutiveMisses++;
      }
    } catch {
      consecutiveMisses++;
    }
  }

  return { refToElement, refHandles };
}

/**
 * Show Vimium-style labels on interactive elements.
 * 
 * Labels are color-coded badges positioned above each element showing the aria ref.
 * Use with screenshots so agents can see which elements are interactive.
 * 
 * Labels auto-hide after 30 seconds to prevent stale labels remaining on the page.
 * Call this function again if the page HTML changes to get fresh labels.
 * 
 * @example
 * ```ts
 * const { snapshot, labelCount } = await showAriaRefLabels({ page });
 * await page.screenshot({ path: '/tmp/screenshot.png' });
 * // Agent sees [e5] label on "Submit" button
 * await page.locator('aria-ref=e5').click();
 * ```
 */
export async function showAriaRefLabels({ 
  page, 
  interactiveOnly = true,
  timeout = 30000,
}: {
  page: Page;
  interactiveOnly?: boolean;
  timeout?: number;
}): Promise<{
  snapshot: string;
  labelCount: number;
}> {
  // Get accessibility snapshot
  const snapshot = await getSnapshot(page);
  
  // Discover refs and their element handles
  const { refHandles, refToElement } = await discoverRefs(page);

  // Filter to only interactive elements if requested
  const filteredRefs = interactiveOnly
    ? refHandles.filter(({ ref }) => {
        const info = refToElement.get(ref);
        return info && INTERACTIVE_ROLES.has(info.role);
      })
    : refHandles;

  // Build refs with role info for color coding
  const refsWithRoles = filteredRefs.map(({ ref, handle }) => ({
    ref,
    element: handle,
    role: refToElement.get(ref)?.role || 'generic',
  }));

  // Single evaluate call: create container, styles, and all labels
  // ElementHandles get unwrapped to DOM elements in browser context
  const labelCount = await page.evaluate(
    // Using 'any' for browser types since this runs in browser context
    function ({ refs, containerId, containerStyles, labelStyles, roleColors, defaultColors, autoHideTimeout }: {
      refs: Array<{ ref: string; role: string; element: any }>;
      containerId: string;
      containerStyles: string;
      labelStyles: string;
      roleColors: Record<string, [string, string, string]>;
      defaultColors: [string, string, string];
      autoHideTimeout: number;
    }): number {
      const doc = document;
      const win = window;

      // Cancel any pending auto-hide timer from previous call
      const timerKey = '__aria_labels_timer__';
      if ((win as any)[timerKey]) {
        win.clearTimeout((win as any)[timerKey]);
        (win as any)[timerKey] = null;
      }

      // Remove existing labels if present (idempotent)
      doc.getElementById(containerId)?.remove();

      // Create container - absolute positioned, max z-index, no pointer events
      const container = doc.createElement('div');
      container.id = containerId;
      container.style.cssText = containerStyles;

      // Inject base label CSS
      const style = doc.createElement('style');
      style.textContent = labelStyles;
      container.appendChild(style);

      // Track placed label rectangles for overlap detection
      const placedLabels: Array<{ left: number; top: number; right: number; bottom: number }> = [];

      // Estimate label dimensions (12px font + padding)
      const LABEL_HEIGHT = 17;
      const LABEL_CHAR_WIDTH = 7;

      // Parse alpha from rgb/rgba color string
      function getColorAlpha(color: string): number {
        if (color === 'transparent') return 0;
        const match = color.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (match) {
          return match[1] !== undefined ? parseFloat(match[1]) : 1;
        }
        return 1;
      }

      // Check if an element has an opaque background
      function isOpaqueElement(el: Element): boolean {
        const style = win.getComputedStyle(el);
        const opacity = parseFloat(style.opacity);
        if (opacity < 0.1) return false;
        const bgAlpha = getColorAlpha(style.backgroundColor);
        if (bgAlpha > 0.1) return true;
        if (style.backgroundImage !== 'none') return true;
        return false;
      }

      // Check if element is visible (not covered by opaque overlay)
      function isElementVisible(element: Element, rect: DOMRect): boolean {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const stack = doc.elementsFromPoint(centerX, centerY);

        let targetIndex = -1;
        for (let i = 0; i < stack.length; i++) {
          if (element.contains(stack[i]) || stack[i].contains(element)) {
            targetIndex = i;
            break;
          }
        }

        if (targetIndex === -1) return false;

        for (let i = 0; i < targetIndex; i++) {
          const el = stack[i];
          if ((el as HTMLElement).id === containerId) continue;
          if (win.getComputedStyle(el).pointerEvents === 'none') continue;
          if (isOpaqueElement(el)) return false;
        }

        return true;
      }

      // Check if two rectangles overlap
      function rectsOverlap(
        a: { left: number; top: number; right: number; bottom: number },
        b: { left: number; top: number; right: number; bottom: number }
      ) {
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }

      // Create SVG for connector lines
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;';
      svg.setAttribute('width', `${doc.documentElement.scrollWidth}`);
      svg.setAttribute('height', `${doc.documentElement.scrollHeight}`);

      // Create defs for arrow markers (one per color)
      const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.appendChild(defs);
      const markerCache: Record<string, string> = {};

      function getArrowMarkerId(color: string): string {
        if (markerCache[color]) return markerCache[color];
        const markerId = `arrow-${color.replace('#', '')}`;
        const marker = doc.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');
        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.setAttribute('fill', color);
        marker.appendChild(path);
        defs.appendChild(marker);
        markerCache[color] = markerId;
        return markerId;
      }

      container.appendChild(svg);

      // Create label for each interactive element
      let count = 0;
      for (const { ref, role, element } of refs) {
        const rect = element.getBoundingClientRect();

        // Skip elements with no size (hidden)
        if (rect.width === 0 || rect.height === 0) continue;

        // Skip elements that are covered by opaque overlays
        if (!isElementVisible(element, rect)) continue;

        // Calculate label position and dimensions
        const labelWidth = ref.length * LABEL_CHAR_WIDTH + 8;
        const labelLeft = rect.left;
        const labelTop = Math.max(0, rect.top - LABEL_HEIGHT);
        const labelRect = {
          left: labelLeft,
          top: labelTop,
          right: labelLeft + labelWidth,
          bottom: labelTop + LABEL_HEIGHT,
        };

        // Skip if this label would overlap with any already-placed label
        let overlaps = false;
        for (const placed of placedLabels) {
          if (rectsOverlap(labelRect, placed)) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        // Get colors for this role
        const [gradTop, gradBottom, border] = roleColors[role] || defaultColors;

        // Place the label
        const label = doc.createElement('div');
        label.className = '__aria_label__';
        label.textContent = ref;
        label.style.background = `linear-gradient(to bottom, ${gradTop} 0%, ${gradBottom} 100%)`;
        label.style.border = `1px solid ${border}`;

        // Position above element, accounting for scroll
        label.style.left = `${win.scrollX + labelLeft}px`;
        label.style.top = `${win.scrollY + labelTop}px`;

        container.appendChild(label);

        // Draw connector line from label bottom-center to element center with arrow
        const line = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
        const labelCenterX = win.scrollX + labelLeft + labelWidth / 2;
        const labelBottomY = win.scrollY + labelTop + LABEL_HEIGHT;
        const elementCenterX = win.scrollX + rect.left + rect.width / 2;
        const elementCenterY = win.scrollY + rect.top + rect.height / 2;
        line.setAttribute('x1', `${labelCenterX}`);
        line.setAttribute('y1', `${labelBottomY}`);
        line.setAttribute('x2', `${elementCenterX}`);
        line.setAttribute('y2', `${elementCenterY}`);
        line.setAttribute('stroke', border);
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('marker-end', `url(#${getArrowMarkerId(border)})`);
        svg.appendChild(line);

        placedLabels.push(labelRect);
        count++;
      }

      doc.documentElement.appendChild(container);

      // Auto-hide labels after timeout to prevent stale labels
      (win as any)[timerKey] = win.setTimeout(function() {
        doc.getElementById(containerId)?.remove();
        (win as any)[timerKey] = null;
      }, autoHideTimeout);

      return count;
    },
    {
      refs: refsWithRoles.map(({ ref, role, element }) => ({ ref, role, element })),
      containerId: LABELS_CONTAINER_ID,
      containerStyles: CONTAINER_STYLES,
      labelStyles: LABEL_STYLES,
      roleColors: ROLE_COLORS,
      defaultColors: DEFAULT_COLORS,
      autoHideTimeout: timeout,
    }
  );

  return { snapshot, labelCount };
}

/**
 * Remove all aria ref labels from the page.
 */
export async function hideAriaRefLabels({ page }: { page: Page }): Promise<void> {
  await page.evaluate((id) => {
    const doc = document;
    const win = window;

    // Cancel any pending auto-hide timer
    const timerKey = '__aria_labels_timer__';
    if ((win as any)[timerKey]) {
      win.clearTimeout((win as any)[timerKey]);
      (win as any)[timerKey] = null;
    }

    doc.getElementById(id)?.remove();
  }, LABELS_CONTAINER_ID);
}

/**
 * Take a screenshot with accessibility labels overlaid on interactive elements.
 * Shows Vimium-style labels, captures the screenshot, then removes the labels.
 * 
 * @example
 * ```ts
 * const { screenshot, snapshot } = await screenshotWithAccessibilityLabels({ page });
 * // screenshot is a Buffer containing the PNG image
 * // snapshot is the accessibility tree for reference
 * ```
 */
export async function screenshotWithAccessibilityLabels({
  page,
  interactiveOnly = true,
}: {
  page: Page;
  interactiveOnly?: boolean;
}): Promise<ScreenshotWithLabelsResult> {
  // Show labels and get snapshot
  const { snapshot, labelCount } = await showAriaRefLabels({ 
    page, 
    interactiveOnly,
    timeout: 30000,
  });

  // Take screenshot
  const screenshot = await page.screenshot({ type: 'png' });

  // Hide labels
  await hideAriaRefLabels({ page });

  return {
    screenshot,
    snapshot,
    labelCount,
  };
}
