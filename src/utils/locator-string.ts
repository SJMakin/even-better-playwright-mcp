/**
 * Generate locator strings from elements
 * Simplified version that uses Playwright's locator inspector
 */

import type { Locator, ElementHandle, Page } from 'playwright';

/**
 * Get a human-readable locator string for an element
 * This uses Playwright's locator capabilities to generate a selector
 */
export async function getLocatorStringForElement(element: Locator | ElementHandle): Promise<string> {
  if (!element) {
    throw new Error('getLocatorStringForElement: element argument is required');
  }

  let page: Page;
  let locator: Locator;

  // Handle both Locator and ElementHandle
  if ('page' in element && typeof element.page === 'function') {
    page = element.page();
    locator = element as Locator;
  } else if ('evaluate' in element && typeof element.evaluate === 'function') {
    // ElementHandle
    const handle = element as ElementHandle;
    const ownerPage = await handle.evaluateHandle(() => document)
      .then((doc: any) => doc._page);
    if (!ownerPage) {
      throw new Error('Could not determine page from ElementHandle');
    }
    page = ownerPage;

    // Try to get locator info from the element
    const info = await handle.evaluate((el: Element) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const ariaLabel = el.getAttribute('aria-label');
      const text = el.textContent?.trim().slice(0, 50);
      const id = el.id;
      const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
      const placeholder = el.getAttribute('placeholder');

      return { tag, role, ariaLabel, text, id, testId, placeholder };
    });

    // Generate a descriptive locator string
    if (info.testId) {
      return `page.getByTestId('${info.testId}')`;
    }
    if (info.id) {
      return `page.locator('#${info.id}')`;
    }
    if (info.ariaLabel) {
      return `page.getByLabel('${info.ariaLabel}')`;
    }
    if (info.placeholder) {
      return `page.getByPlaceholder('${info.placeholder}')`;
    }
    if (info.role && info.text) {
      return `page.getByRole('${info.role}', { name: '${info.text}' })`;
    }
    if (info.text) {
      return `page.getByText('${info.text}')`;
    }
    return `page.locator('${info.tag}')`;
  } else {
    throw new Error('getLocatorStringForElement: argument must be a Playwright Locator or ElementHandle');
  }

  // For Locator, try to extract useful information
  try {
    const element = await locator.elementHandle({ timeout: 100 });
    if (element) {
      return getLocatorStringForElement(element);
    }
  } catch {
    // Fall back to toString if available
  }

  // Last resort: return locator's internal representation
  const locatorStr = (locator as any)._selector || 'locator';
  return `page.locator('${locatorStr}')`;
}
