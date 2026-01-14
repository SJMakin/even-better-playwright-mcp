/**
 * Smart Outline Generation System Types
 */

export interface ElementNode {
  indent: number;
  type: string;
  ref: string;
  content: string;
  line: string;  // Original line content
  children: ElementNode[];
  priority: number;  // 0-10 priority score
  isRepetitive: boolean;
  groupId?: string;   // Repetition group identifier
  lineNumber: number; // Original line number
  parent?: ElementNode;
  hasInteraction?: boolean;
}

export interface ElementGroup {
  type: string;
  indent: number;
  count: number;
  firstElement: ElementNode;
  samples: ElementNode[];  // Keep 1-3 samples
  refs: string[];          // All element refs
  startLine: number;
  endLine: number;
}

export interface PageStructure {
  nodes: Map<string, ElementNode>;
  nodesByLine: Map<number, ElementNode>;
  groups: ElementGroup[];
  priorityQueue: ElementNode[];
  totalLines: number;
  rootNodes: ElementNode[];
}

export interface OutlineOptions {
  maxLines: number;
  mode: 'smart' | 'simple';
  preserveStructure: boolean;
  foldThreshold: number;  // Fold threshold
}
