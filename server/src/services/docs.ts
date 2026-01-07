/**
 * Docs Service
 * Service for browsing project documentation folders
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import {
  DocsConfig,
  DEFAULT_DOCS_CONFIG,
  DocTree,
  DocTreeNode,
  DocContent,
  DocsNotFoundError,
  DocFileNotFoundError,
  DocAccessDeniedError,
} from './docs-types.js';

// ============================================================================
// DocsService Class
// ============================================================================

export class DocsService {
  private config: DocsConfig;

  constructor(config: Partial<DocsConfig> = {}) {
    this.config = { ...DEFAULT_DOCS_CONFIG, ...config };
  }

  /**
   * Get the docs folder path for a project
   */
  private getDocsPath(repoPath: string): string {
    return join(repoPath, 'docs');
  }

  /**
   * Check if a directory should be excluded
   */
  private isExcludedDir(name: string): boolean {
    return this.config.excludeDirs.includes(name);
  }

  /**
   * Check if a file has an allowed extension
   */
  private isAllowedFile(name: string): boolean {
    const ext = extname(name).toLowerCase();
    return this.config.includeExtensions.includes(ext);
  }

  /**
   * Recursively build the docs tree
   */
  private async buildTree(dirPath: string, basePath: string): Promise<DocTreeNode[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nodes: DocTreeNode[] = [];

    // Sort: directories first, then files, alphabetically
    const sortedEntries = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sortedEntries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (this.isExcludedDir(entry.name)) {
          continue;
        }

        // Skip hidden directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        // Recursively build children
        const children = await this.buildTree(fullPath, basePath);

        // Only include non-empty directories
        if (children.length > 0) {
          nodes.push({
            name: entry.name,
            type: 'directory',
            path: relativePath,
            children,
          });
        }
      } else if (entry.isFile()) {
        // Only include allowed file types
        if (this.isAllowedFile(entry.name)) {
          nodes.push({
            name: entry.name,
            type: 'file',
            path: relativePath,
          });
        }
      }
    }

    return nodes;
  }

  /**
   * Get the documentation tree for a project
   */
  async getDocTree(repoPath: string): Promise<DocTree> {
    const docsPath = this.getDocsPath(repoPath);

    // Check if docs folder exists
    try {
      const stats = await stat(docsPath);
      if (!stats.isDirectory()) {
        throw new DocsNotFoundError(repoPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new DocsNotFoundError(repoPath);
      }
      throw error;
    }

    const tree = await this.buildTree(docsPath, docsPath);

    return { tree };
  }

  /**
   * Get the content of a specific document
   */
  async getDocContent(repoPath: string, docPath: string): Promise<DocContent> {
    const docsPath = this.getDocsPath(repoPath);

    // Prevent path traversal attacks
    const normalizedPath = docPath.replace(/\.\./g, '').replace(/^\//, '');

    // Ensure the file is a markdown file
    if (!this.isAllowedFile(normalizedPath)) {
      throw new DocAccessDeniedError(docPath);
    }

    // Check that path doesn't access excluded directories
    const pathParts = normalizedPath.split('/');
    for (const part of pathParts) {
      if (this.isExcludedDir(part)) {
        throw new DocAccessDeniedError(docPath);
      }
    }

    const fullPath = join(docsPath, normalizedPath);

    // Ensure the resolved path is within the docs folder
    if (!fullPath.startsWith(docsPath)) {
      throw new DocAccessDeniedError(docPath);
    }

    // Read the file
    try {
      const content = await readFile(fullPath, 'utf-8');
      const name = pathParts[pathParts.length - 1] || docPath;

      return {
        path: normalizedPath,
        content,
        name,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new DocFileNotFoundError(docPath);
      }
      throw error;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const docsService = new DocsService();
