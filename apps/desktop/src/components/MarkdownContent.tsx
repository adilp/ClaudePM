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
  projectId?: string;
  baseUrl?: string;
}

export function MarkdownContent({ children, className, projectId, baseUrl }: MarkdownContentProps) {
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
          // Custom image rendering for relative paths
          img({ src, alt, ...props }) {
            // Handle relative image paths - route through server
            let imageSrc = src;
            if (src && !src.startsWith('http') && !src.startsWith('data:') && projectId) {
              // Path like: ../../images/multi-tenancy/MT-001_01.jpg
              // Extract: multi-tenancy/MT-001_01.jpg
              const match = src.match(/images\/(.+)$/);
              if (match) {
                const apiPath = `/api/projects/${projectId}/images/${match[1]}`;
                imageSrc = baseUrl ? `${baseUrl}${apiPath}` : apiPath;
              }
            }
            return (
              <img
                src={imageSrc}
                alt={alt || ''}
                className="max-w-full h-auto rounded-lg my-4"
                loading="lazy"
                {...props}
              />
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
