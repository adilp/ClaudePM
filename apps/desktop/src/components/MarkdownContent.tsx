/**
 * Markdown Content Renderer
 * Renders markdown with proper formatting for headers, lists, code blocks, and links
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

interface MarkdownContentProps {
  children: string;
  className?: string;
}

export function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div className={clsx('markdown-content', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code block rendering
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;

            if (isInline) {
              return (
                <code className="markdown-code--inline" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <div className="markdown-code-block">
                {match && <span className="markdown-code-block__lang">{match[1]}</span>}
                <pre>
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          },
          // Custom link rendering (open external links in new tab)
          a({ href, children, ...props }) {
            const isExternal = href?.startsWith('http');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
          // Custom table rendering
          table({ children, ...props }) {
            return (
              <div className="markdown-table-wrapper">
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
