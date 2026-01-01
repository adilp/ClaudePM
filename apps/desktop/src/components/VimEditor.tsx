/**
 * VimEditor Component
 * CodeMirror-based markdown editor with full vim emulation
 */

import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { vim, Vim } from '@replit/codemirror-vim';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

interface VimEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onSave?: () => void;
  onCancel?: () => void;
}

// Dark theme for the editor
const darkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#0f0f0f',
    color: '#e5e5e5',
    height: '100%',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    fontSize: '14px',
    padding: '12px 0',
    caretColor: '#e5e5e5',
  },
  '.cm-cursor': {
    borderLeftColor: '#e5e5e5',
    borderLeftWidth: '2px',
  },
  '.cm-activeLine': {
    backgroundColor: '#1a1a1a',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#1a1a1a',
  },
  '.cm-gutters': {
    backgroundColor: '#0f0f0f',
    color: '#666666',
    border: 'none',
    borderRight: '1px solid #333333',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: '#3b3b3b',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#3b3b3b',
  },
  // Vim status bar
  '.cm-vim-panel': {
    backgroundColor: '#1a1a1a',
    color: '#a0a0a0',
    padding: '4px 12px',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    fontSize: '12px',
    borderTop: '1px solid #333333',
  },
  '.cm-fat-cursor': {
    backgroundColor: '#e5e5e5 !important',
    color: '#0f0f0f !important',
  },
  '&:not(.cm-focused) .cm-fat-cursor': {
    backgroundColor: 'transparent !important',
    outline: '1px solid #e5e5e5',
  },
}, { dark: true });

export function VimEditor({
  value,
  onChange,
  placeholder: _placeholder,
  className = '',
  onSave,
  onCancel,
}: VimEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref updated
  onChangeRef.current = onChange;

  // Setup vim commands for :w and :q
  useEffect(() => {
    if (onSave) {
      Vim.defineEx('w', 'w', () => {
        onSave();
      });
      Vim.defineEx('write', 'write', () => {
        onSave();
      });
    }
    if (onCancel) {
      Vim.defineEx('q', 'q', () => {
        onCancel();
      });
      Vim.defineEx('quit', 'quit', () => {
        onCancel();
      });
    }
    if (onSave && onCancel) {
      Vim.defineEx('wq', 'wq', () => {
        onSave();
      });
      Vim.defineEx('x', 'x', () => {
        onSave();
      });
      // Custom zz mapping for save and exit (normal mode)
      Vim.map('zz', ':wq<CR>', 'normal');
    }
  }, [onSave, onCancel]);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newValue = update.state.doc.toString();
        onChangeRef.current(newValue);
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        vim(),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        darkTheme,
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // Focus the editor
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only run on mount

  // Update content when value changes externally
  const updateContent = useCallback((newValue: string) => {
    const view = viewRef.current;
    if (!view) return;

    const currentValue = view.state.doc.toString();
    if (currentValue !== newValue) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: newValue,
        },
      });
    }
  }, []);

  useEffect(() => {
    updateContent(value);
  }, [value, updateContent]);

  return (
    <div className={`vim-editor-container ${className}`}>
      <div
        ref={containerRef}
        className="h-full w-full rounded-lg border border-line overflow-hidden"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-content-muted">
        <span>Vim mode - <kbd className="px-1 py-0.5 bg-surface-tertiary rounded">zz</kbd> or <kbd className="px-1 py-0.5 bg-surface-tertiary rounded">:wq</kbd> save &amp; exit, <kbd className="px-1 py-0.5 bg-surface-tertiary rounded">:q</kbd> cancel</span>
        <span><kbd className="px-1 py-0.5 bg-surface-tertiary rounded">i</kbd> insert, <kbd className="px-1 py-0.5 bg-surface-tertiary rounded">Esc</kbd> normal, <kbd className="px-1 py-0.5 bg-surface-tertiary rounded">v</kbd> visual</span>
      </div>
    </div>
  );
}
