/**
 * Search utility for searching snapshot content
 * In-memory regex search without external dependencies
 */

export interface SearchOptions {
  /**
   * The pattern to search for. Supports JavaScript regular expressions
   */
  pattern: string;
  
  /**
   * Whether to ignore case when matching
   * @default false
   */
  ignoreCase?: boolean;
  
  /**
   * Maximum number of lines to return (1-100, default 100)
   * @default 100
   */
  lineLimit?: number;
}

export interface SearchResponse {
  /**
   * The search results as a string
   */
  result: string;
  
  /**
   * Number of matches found
   */
  matchCount: number;
  
  /**
   * Whether the results were truncated due to line limit
   */
  truncated: boolean;
}

/**
 * Search snapshot content using JavaScript regex
 * @param snapshot - The snapshot content to search
 * @param options - Search options including pattern, ignoreCase, and lineLimit
 * @returns SearchResponse with results, match count, and truncation status
 */
export function searchSnapshot(snapshot: string, options: SearchOptions): SearchResponse {
  const { pattern, ignoreCase = false, lineLimit = 100 } = options;
  
  // Hard cap at 100 results
  const maxAllowed = 100;
  const effectiveLimit = Math.min(lineLimit, maxAllowed);
  
  try {
    // Create regex with appropriate flags
    const flags = ignoreCase ? 'gi' : 'g';
    const regex = new RegExp(pattern, flags);
    
    // Split snapshot into lines and filter matches
    const lines = snapshot.split('\n');
    const matchingLines: string[] = [];
    
    for (const line of lines) {
      // Reset regex state for each line
      regex.lastIndex = 0;
      
      if (regex.test(line)) {
        matchingLines.push(line);
      }
    }
    
    const totalMatches = matchingLines.length;
    
    if (totalMatches === 0) {
      return {
        result: '',
        matchCount: 0,
        truncated: false
      };
    }
    
    // Apply line limit
    if (totalMatches > effectiveLimit) {
      const truncatedLines = matchingLines.slice(0, effectiveLimit);
      const remaining = totalMatches - effectiveLimit;
      truncatedLines.push(`<...${remaining} more results...>`);
      
      return {
        result: truncatedLines.join('\n'),
        matchCount: totalMatches,
        truncated: true
      };
    }
    
    return {
      result: matchingLines.join('\n'),
      matchCount: totalMatches,
      truncated: false
    };
  } catch (error) {
    // Invalid regex pattern
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: `Error: Invalid regex pattern - ${message}`,
      matchCount: 0,
      truncated: false
    };
  }
}
