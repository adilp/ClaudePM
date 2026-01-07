/**
 * Docs Service Types
 * Types and errors for documentation browsing
 */

// ============================================================================
// Error Classes
// ============================================================================

export class DocsNotFoundError extends Error {
  code = 'DOCS_NOT_FOUND';

  constructor(repoPath: string) {
    super(`No docs folder found at ${repoPath}/docs`);
    this.name = 'DocsNotFoundError';
  }
}

export class DocFileNotFoundError extends Error {
  code = 'DOC_FILE_NOT_FOUND';

  constructor(filePath: string) {
    super(`Document not found: ${filePath}`);
    this.name = 'DocFileNotFoundError';
  }
}

export class DocAccessDeniedError extends Error {
  code = 'DOC_ACCESS_DENIED';

  constructor(filePath: string) {
    super(`Access denied to path: ${filePath}`);
    this.name = 'DocAccessDeniedError';
  }
}

// ============================================================================
// Data Types
// ============================================================================

export interface DocTreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: DocTreeNode[];
}

export interface DocTree {
  tree: DocTreeNode[];
}

export interface DocContent {
  path: string;
  content: string;
  name: string;
}

// ============================================================================
// Configuration
// ============================================================================

export interface DocsConfig {
  /** Directories to exclude from the docs tree */
  excludeDirs: string[];
  /** File extensions to include */
  includeExtensions: string[];
}

export const DEFAULT_DOCS_CONFIG: DocsConfig = {
  excludeDirs: ['jira-tickets', 'ai-context'],
  includeExtensions: ['.md', '.markdown'],
};
