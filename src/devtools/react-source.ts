/**
 * React component source location finder.
 * Uses React DevTools fiber info to find component source locations.
 */

import type { CDPSession, Locator, ElementHandle, Page } from 'playwright';

export interface ReactSourceLocation {
  fileName: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName: string | null;
}

/**
 * Get React component source location for an element.
 * Returns source location if the element is a React component with dev tools info.
 * 
 * @example
 * ```ts
 * const cdp = await getCDPSession(page);
 * const source = await getReactSource({ locator: $('e5'), cdp });
 * // { fileName: 'Button.tsx', lineNumber: 42, ... }
 * ```
 */
export async function getReactSource({
  locator,
  cdp,
}: {
  locator: Locator | ElementHandle;
  cdp: CDPSession;
}): Promise<ReactSourceLocation | null> {
  // Get the page from the locator
  const page: Page = 'page' in locator && typeof (locator as Locator).page === 'function' 
    ? (locator as Locator).page() 
    : (locator as any)._page;

  if (!page) {
    throw new Error('Could not get page from locator');
  }

  // Script to extract React fiber source info
  const extractSourceScript = `
    (function(element) {
      // Find React fiber from element
      const fiberKey = Object.keys(element).find(key => 
        key.startsWith('__reactFiber$') || 
        key.startsWith('__reactInternalInstance$')
      );
      
      if (!fiberKey) {
        return { _notFound: 'fiber' };
      }
      
      const fiber = element[fiberKey];
      if (!fiber) {
        return { _notFound: 'fiber' };
      }
      
      // Try to find source from _debugSource
      function findSource(fib) {
        if (!fib) return null;
        
        // Check _debugSource (React 17+)
        if (fib._debugSource) {
          return {
            fileName: fib._debugSource.fileName || null,
            lineNumber: fib._debugSource.lineNumber || null,
            columnNumber: fib._debugSource.columnNumber || null,
          };
        }
        
        // Check type._source (older React)
        if (fib.type && fib.type._source) {
          return {
            fileName: fib.type._source.fileName || null,
            lineNumber: fib.type._source.lineNumber || null,
            columnNumber: fib.type._source.columnNumber || null,
          };
        }
        
        // Check elementType._source
        if (fib.elementType && fib.elementType._source) {
          return {
            fileName: fib.elementType._source.fileName || null,
            lineNumber: fib.elementType._source.lineNumber || null,
            columnNumber: fib.elementType._source.columnNumber || null,
          };
        }
        
        return null;
      }
      
      // Get component name
      function getDisplayName(fib) {
        if (!fib || !fib.type) return null;
        
        const type = fib.type;
        if (typeof type === 'string') return type;
        if (type.displayName) return type.displayName;
        if (type.name) return type.name;
        
        // Check for wrapped components
        if (type.render) {
          return type.render.displayName || type.render.name || null;
        }
        
        return null;
      }
      
      // Walk up fiber tree to find source
      let current = fiber;
      let source = null;
      let componentName = null;
      
      while (current) {
        source = findSource(current);
        if (source) {
          componentName = getDisplayName(current);
          break;
        }
        
        // Try return fiber (parent)
        current = current.return;
        
        // Limit traversal depth
        if (componentName === null) {
          const name = getDisplayName(current);
          if (name && typeof name === 'string' && !name.includes('Fragment')) {
            componentName = name;
          }
        }
      }
      
      if (!source) {
        // Try to at least get component name
        current = fiber;
        while (current && !componentName) {
          componentName = getDisplayName(current);
          current = current.return;
        }
        
        if (componentName) {
          return {
            fileName: null,
            lineNumber: null,
            columnNumber: null,
            componentName: componentName
          };
        }
        
        return { _notFound: 'source' };
      }
      
      return {
        ...source,
        componentName: componentName
      };
    })(arguments[0])
  `;

  // Get element handle
  const elementHandle = 'elementHandle' in locator 
    ? await (locator as Locator).elementHandle()
    : locator as ElementHandle;

  if (!elementHandle) {
    throw new Error('Could not get element handle from locator');
  }

  try {
    const result = await elementHandle.evaluate(
      new Function('return ' + extractSourceScript)() as (el: Element) => ReactSourceLocation | { _notFound: string }
    );

    if (result && '_notFound' in result) {
      if (result._notFound === 'fiber') {
        console.warn('[getReactSource] no fiber found - is this a React element?');
      } else {
        console.warn('[getReactSource] no source location found - is this a React dev build?');
      }
      return null;
    }

    return result as ReactSourceLocation;
  } catch (error) {
    console.warn('[getReactSource] error extracting source:', error);
    return null;
  }
}
