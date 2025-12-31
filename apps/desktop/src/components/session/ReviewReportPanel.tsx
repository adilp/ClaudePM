/**
 * Review Report Panel
 * Displays AI-generated review report for a session's work
 */

import { useState } from 'react';
import { cn } from '../../lib/utils';
import {
  useSessionReviewReport,
  useRegenerateReviewReport,
  useGenerateCommitMessage,
  useGeneratePrDescription,
} from '../../hooks/useSessions';

interface ReviewReportPanelProps {
  sessionId: string;
}

const statusConfig = {
  complete: { icon: CheckCircleIcon, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Complete' },
  partial: { icon: AlertCircleIcon, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Partial' },
  blocked: { icon: XCircleIcon, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Blocked' },
  unclear: { icon: HelpCircleIcon, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Unclear' },
};

export function ReviewReportPanel({ sessionId }: ReviewReportPanelProps) {
  const {
    data: report,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useSessionReviewReport(sessionId, true);
  const regenerateMutation = useRegenerateReviewReport();

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    accomplished: true,
    remaining: false,
    concerns: false,
    nextSteps: false,
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const generateCommit = useGenerateCommitMessage();
  const generatePr = useGeneratePrDescription();

  const handleRegenerate = () => {
    regenerateMutation.mutate(sessionId);
  };

  const isRegenerating = regenerateMutation.isPending;

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="bg-[#1a1a2e] rounded-lg p-6 border border-gray-600">
        <div className="flex items-center gap-3 text-gray-400">
          <LoaderIcon className="w-5 h-5 animate-spin" />
          <div>
            <p className="text-sm font-medium">Loading review report...</p>
            <p className="text-xs text-gray-500">This may take a moment</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#1a1a2e] rounded-lg p-6 border border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircleIcon className="w-5 h-5" />
            <span>Failed to load review report</span>
          </div>
          <button
            onClick={() => refetch()}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const StatusIcon = statusConfig[report.completion_status].icon;

  return (
    <div className="bg-[#1a1a2e] rounded-lg border border-gray-600 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-200">AI Review Report</span>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating || isFetching}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-50"
              title="Regenerate report"
            >
              <RefreshIcon className={cn('w-3.5 h-3.5', isRegenerating && 'animate-spin')} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {/* Confidence */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Confidence:</span>
              <span className={cn(
                'text-sm font-medium',
                report.confidence >= 80 ? 'text-green-400' :
                report.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'
              )}>
                {report.confidence}%
              </span>
            </div>
            {/* Status */}
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs',
              statusConfig[report.completion_status].bg,
              statusConfig[report.completion_status].color
            )}>
              <StatusIcon className="w-3 h-3" />
              {statusConfig[report.completion_status].label}
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400 mt-1">{report.ticket_title}</p>
      </div>

      {/* Content */}
      <div className="divide-y divide-gray-700">
        {/* Accomplished */}
        <CollapsibleSection
          title="Accomplished"
          count={report.accomplished.length}
          expanded={expandedSections.accomplished}
          onToggle={() => toggleSection('accomplished')}
          variant="success"
        >
          <ul className="space-y-1.5">
            {report.accomplished.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        {/* Remaining */}
        {report.remaining.length > 0 && (
          <CollapsibleSection
            title="Remaining"
            count={report.remaining.length}
            expanded={expandedSections.remaining}
            onToggle={() => toggleSection('remaining')}
            variant="warning"
          >
            <ul className="space-y-1.5">
              {report.remaining.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <AlertCircleIcon className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {/* Concerns */}
        {report.concerns.length > 0 && (
          <CollapsibleSection
            title="Concerns"
            count={report.concerns.length}
            expanded={expandedSections.concerns}
            onToggle={() => toggleSection('concerns')}
            variant="error"
          >
            <ul className="space-y-1.5">
              {report.concerns.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                  <XCircleIcon className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}

        {/* Next Steps */}
        <CollapsibleSection
          title="Suggested Next Steps"
          count={report.next_steps.length}
          expanded={expandedSections.nextSteps}
          onToggle={() => toggleSection('nextSteps')}
          variant="info"
        >
          <ol className="space-y-1.5 list-decimal list-inside">
            {report.next_steps.map((item, i) => (
              <li key={i} className="text-sm text-gray-300">{item}</li>
            ))}
          </ol>
        </CollapsibleSection>
      </div>

      {/* Suggestions */}
      {(report.suggested_commit_message || report.suggested_pr_description) && (
        <div className="p-4 border-t border-gray-600 space-y-3">
          {/* Commit Message */}
          {report.suggested_commit_message && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <GitCommitIcon className="w-3 h-3" />
                  Suggested Commit
                </div>
                <button
                  onClick={() => copyToClipboard(report.suggested_commit_message!, 'commit')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {copiedField === 'commit' ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
                  {copiedField === 'commit' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="block text-sm text-gray-300 bg-gray-900 px-2 py-1.5 rounded font-mono">
                {report.suggested_commit_message}
              </code>
            </div>
          )}

          {/* PR Description Preview */}
          {report.suggested_pr_description && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <GitPullRequestIcon className="w-3 h-3" />
                  Suggested PR Description
                </div>
                <button
                  onClick={() => copyToClipboard(report.suggested_pr_description!, 'pr')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {copiedField === 'pr' ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
                  {copiedField === 'pr' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="text-sm text-gray-400 bg-gray-900 px-2 py-1.5 rounded max-h-24 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-mono text-xs">
                  {report.suggested_pr_description.slice(0, 200)}
                  {report.suggested_pr_description.length > 200 && '...'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-600 flex items-center gap-2">
        <button
          onClick={() => generateCommit.mutate(sessionId)}
          disabled={generateCommit.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50"
        >
          {generateCommit.isPending ? (
            <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <GitCommitIcon className="w-3.5 h-3.5" />
          )}
          Generate Commit
        </button>
        <button
          onClick={() => generatePr.mutate({ sessionId })}
          disabled={generatePr.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50"
        >
          {generatePr.isPending ? (
            <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <GitPullRequestIcon className="w-3.5 h-3.5" />
          )}
          Generate PR
        </button>
      </div>

      {/* Timestamp */}
      <div className="px-4 py-2 text-sm text-gray-400 border-t border-gray-600">
        Generated {new Date(report.generated_at).toLocaleString()}
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  variant: 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, expanded, onToggle, variant, children }: CollapsibleSectionProps) {
  const variantColors = {
    success: 'text-green-400',
    warning: 'text-yellow-400',
    error: 'text-red-400',
    info: 'text-blue-400',
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-700/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{title}</span>
          <span className={`text-xs ${variantColors[variant]}`}>({count})</span>
        </div>
        {expanded ? (
          <ChevronUpIcon className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-gray-500" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

// Icon components
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function HelpCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function GitCommitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  );
}

function GitPullRequestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default ReviewReportPanel;
