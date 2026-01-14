/**
 * DOM SimHash Implementation
 * Detects DOM tree structural similarity
 */

import type { ElementNode } from '../types/outline.js';

export class DOMSimHash {
  private readonly HASH_BITS = 32;
  private hashCache = new Map<ElementNode, number>();

  /**
   * Extract structural features from DOM node
   */
  extractFeatures(node: ElementNode): string[] {
    const features: string[] = [];
    
    // 1. Skeleton feature: type tree
    features.push(this.getSkeletonSignature(node));
    
    // 2. Shape feature: width distribution
    features.push(this.getShapeSignature(node));
    
    // 3. Type count feature
    features.push(this.getTypeCountSignature(node));
    
    // 4. Interactive feature
    if (this.hasInteractiveElements(node)) {
      features.push('interactive');
    }
    
    // 5. Depth feature
    features.push(`d${this.getMaxDepth(node)}`);
    
    return features;
  }

  /**
   * Get skeleton signature - simplified representation of type tree
   */
  private getSkeletonSignature(node: ElementNode): string {
    // Root node type
    let signature = node.type;
    
    // Child node type sequence (first 5 only)
    const childTypes = node.children
      .slice(0, 5)
      .map(c => c.type)
      .join('+');
    
    if (childTypes) {
      signature += `>${childTypes}`;
    }
    
    // Grandchildren (only first child's children)
    if (node.children.length > 0 && node.children[0].children.length > 0) {
      const grandchildTypes = node.children[0].children
        .slice(0, 3)
        .map(c => c.type)
        .join('+');
      signature += `>${grandchildTypes}`;
    }
    
    return signature;
  }

  /**
   * Get shape signature - tree width distribution
   */
  private getShapeSignature(node: ElementNode): string {
    const widths: number[] = [node.children.length];
    
    // Record width of first 3 children
    for (let i = 0; i < Math.min(3, node.children.length); i++) {
      widths.push(node.children[i].children.length);
    }
    
    return 'w' + widths.join('-');
  }

  /**
   * Get type count signature
   */
  private getTypeCountSignature(node: ElementNode): string {
    const counts = new Map<string, number>();
    
    function count(n: ElementNode, depth: number) {
      if (depth > 2) return; // Only count first 3 levels
      
      const type = n.type;
      counts.set(type, (counts.get(type) || 0) + 1);
      n.children.forEach(c => count(c, depth + 1));
    }
    
    count(node, 0);
    
    // Record only important types (first letter and count)
    const important = ['button', 'link', 'text', 'img', 'heading', 'checkbox', 'radio'];
    const sig = important
      .map(t => {
        const c = counts.get(t) || 0;
        return c > 0 ? `${t[0]}${c}` : '';
      })
      .filter(s => s)
      .join('');
    
    return sig || 'empty';
  }

  /**
   * Check if has interactive elements
   */
  private hasInteractiveElements(node: ElementNode): boolean {
    if (node.line.includes('[cursor=pointer]')) {
      return true;
    }
    
    // Recursive check with depth limit
    function check(n: ElementNode, depth: number): boolean {
      if (depth > 2) return false;
      
      if (n.type === 'button' || n.type === 'link' || n.type === 'checkbox' || n.type === 'radio') {
        return true;
      }
      
      return n.children.some(c => check(c, depth + 1));
    }
    
    return check(node, 0);
  }

  /**
   * Get max depth
   */
  private getMaxDepth(node: ElementNode): number {
    if (node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(c => this.getMaxDepth(c)));
  }

  /**
   * DJB2 hash algorithm - simple and fast
   */
  private djb2Hash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    }
    return hash >>> 0; // Convert to unsigned integer
  }

  /**
   * Feature weights
   */
  private getWeight(feature: string): number {
    if (feature.includes('>')) return 5;  // Skeleton feature most important
    if (feature.startsWith('w')) return 3; // Shape feature
    if (feature.startsWith('d')) return 2; // Depth feature
    return 1;
  }

  /**
   * Compute SimHash value
   */
  computeHash(node: ElementNode): number {
    // Check cache
    if (this.hashCache.has(node)) {
      return this.hashCache.get(node)!;
    }
    
    const features = this.extractFeatures(node);
    const vector = new Array(this.HASH_BITS).fill(0);
    
    for (const feature of features) {
      const hash = this.djb2Hash(feature);
      const weight = this.getWeight(feature);
      
      for (let i = 0; i < this.HASH_BITS; i++) {
        const bit = (hash >> i) & 1;
        vector[i] += bit ? weight : -weight;
      }
    }
    
    // Dimension reduction: positive->1, negative->0
    let simhash = 0;
    for (let i = 0; i < this.HASH_BITS; i++) {
      if (vector[i] > 0) {
        simhash |= (1 << i);
      }
    }
    
    this.hashCache.set(node, simhash);
    return simhash;
  }

  /**
   * Calculate hamming distance
   */
  hammingDistance(hash1: number, hash2: number): number {
    let xor = hash1 ^ hash2;
    let count = 0;
    
    while (xor) {
      count += xor & 1;
      xor >>>= 1;
    }
    
    return count;
  }

  /**
   * Check if two nodes are similar
   */
  areSimilar(node1: ElementNode, node2: ElementNode, threshold = 3): boolean {
    const hash1 = this.computeHash(node1);
    const hash2 = this.computeHash(node2);
    const distance = this.hammingDistance(hash1, hash2);
    return distance <= threshold;
  }

  /**
   * Find maximum similar subsequence
   * Does not require starting from first element
   */
  findSimilarSequence(nodes: ElementNode[]): {
    start: number;
    end: number;
    samples: ElementNode[];
    baseHash: number;
  } | null {
    if (nodes.length < 3) return null;
    
    let maxLen = 0;
    let bestStart = 0;
    let bestEnd = 0;
    let bestBaseHash = 0;
    
    // Sliding window to find longest similar sequence
    for (let i = 0; i <= nodes.length - 3; i++) {
      const baseHash = this.computeHash(nodes[i]);
      let j = i + 1;
      let similarCount = 1;
      
      // Extend sequence backward
      while (j < nodes.length) {
        const hash = this.computeHash(nodes[j]);
        const distance = this.hammingDistance(baseHash, hash);
        
        if (distance <= 3) {
          // Similar, continue extending
          similarCount++;
          if (similarCount >= 3 && similarCount > maxLen) {
            maxLen = similarCount;
            bestStart = i;
            bestEnd = j;
            bestBaseHash = baseHash;
          }
        } else if (similarCount >= 3) {
          // Found long enough sequence, can stop
          break;
        }
        j++;
      }
    }
    
    if (maxLen >= 3) {
      return {
        start: bestStart,
        end: bestEnd,
        samples: nodes.slice(bestStart, bestEnd + 1),
        baseHash: bestBaseHash
      };
    }
    
    return null;
  }

  /**
   * Find all similar sequences in batch
   */
  findAllSimilarSequences(nodes: ElementNode[]): Array<{
    start: number;
    end: number;
    count: number;
    sample: ElementNode;
  }> {
    const sequences: Array<{
      start: number;
      end: number;
      count: number;
      sample: ElementNode;
    }> = [];
    
    const processed = new Set<number>();
    
    // Collect all unprocessed nodes regardless of position
    while (processed.size < nodes.length) {
      const unprocessed = [];
      const indexMap = [];
      
      for (let i = 0; i < nodes.length; i++) {
        if (!processed.has(i)) {
          unprocessed.push(nodes[i]);
          indexMap.push(i);
        }
      }
      
      if (unprocessed.length < 3) {
        break;
      }
      
      const seq = this.findSimilarSequence(unprocessed);
      
      if (seq) {
        const actualStart = indexMap[seq.start];
        const actualEnd = indexMap[seq.end];
        
        sequences.push({
          start: actualStart,
          end: actualEnd,
          count: seq.end - seq.start + 1,
          sample: nodes[actualStart]
        });
        
        // Mark processed nodes
        for (let k = seq.start; k <= seq.end; k++) {
          processed.add(indexMap[k]);
        }
      } else {
        // No sequence found, exit to avoid infinite loop
        break;
      }
    }
    
    return sequences;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.hashCache.clear();
  }
}
