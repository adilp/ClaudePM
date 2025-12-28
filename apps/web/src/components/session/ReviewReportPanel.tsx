/**
 * Review Report Panel
 * Displays AI-generated review report for a session's work
 */

import { useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  GitCommit,
  GitPullRequest,
} from 'lucide-react';
import { useSessionReviewReport, useGenerateCommitMessage, useGeneratePrDescription } from '@/hooks/useSessions';

interface ReviewReportPanelProps {
  sessionId: string;
}

const statusConfig = {
  complete: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Complete' },
  partial: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Partial' },
  blocked: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Blocked' },
  unclear: { icon: HelpCircle, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Unclear' },
};

export function ReviewReportPanel({ sessionId }: ReviewReportPanelProps) {
  const { data: report, isLoading, error, refetch } = useSessionReviewReport(sessionId);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    accomplished: true,
    remaining: false,
    concerns: false,
    nextSteps: false,
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const generateCommit = useGenerateCommitMessage();
  const generatePr = useGeneratePrDescription();

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
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <div>
            <p className="text-sm font-medium">Generating review report...</p>
            <p className="text-xs text-gray-500">This may take a moment</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>Failed to generate review report</span>
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
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-200">AI Review Report</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Confidence */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Confidence:</span>
              <span className={`text-sm font-medium ${
                report.confidence >= 80 ? 'text-green-400' :
                report.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {report.confidence}%
              </span>
            </div>
            {/* Status */}
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${statusConfig[report.completion_status].bg} ${statusConfig[report.completion_status].color}`}>
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
                <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
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
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
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
                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
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
        <div className="p-4 border-t border-gray-700 space-y-3">
          {/* Commit Message */}
          {report.suggested_commit_message && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <GitCommit className="w-3 h-3" />
                  Suggested Commit
                </div>
                <button
                  onClick={() => copyToClipboard(report.suggested_commit_message!, 'commit')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {copiedField === 'commit' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
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
                  <GitPullRequest className="w-3 h-3" />
                  Suggested PR Description
                </div>
                <button
                  onClick={() => copyToClipboard(report.suggested_pr_description!, 'pr')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  {copiedField === 'pr' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
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
      <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-2">
        <button
          onClick={() => generateCommit.mutate(sessionId)}
          disabled={generateCommit.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50"
        >
          {generateCommit.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <GitCommit className="w-3.5 h-3.5" />
          )}
          Generate Commit
        </button>
        <button
          onClick={() => generatePr.mutate({ sessionId })}
          disabled={generatePr.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-200 disabled:opacity-50"
        >
          {generatePr.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <GitPullRequest className="w-3.5 h-3.5" />
          )}
          Generate PR
        </button>
      </div>

      {/* Timestamp */}
      <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700">
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
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
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

export default ReviewReportPanel;
