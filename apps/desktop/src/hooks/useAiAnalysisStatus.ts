/**
 * AI Analysis Status Hook
 * Tracks the generation status of AI summaries and review reports via WebSocket
 */

import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import type { AiAnalysisType, AiAnalysisStatus } from '../types/api';

export interface AiAnalysisState {
  summary: AiAnalysisStatus | null;
  reviewReport: AiAnalysisStatus | null;
  lastUpdated: string | null;
  error?: string;
}

interface UseAiAnalysisStatusReturn {
  /** Current status for a specific session */
  getStatus: (sessionId: string) => AiAnalysisState;
  /** Whether summary is currently generating */
  isSummaryGenerating: (sessionId: string) => boolean;
  /** Whether review report is currently generating */
  isReviewReportGenerating: (sessionId: string) => boolean;
}

/**
 * Hook to track AI analysis generation status from WebSocket messages
 */
export function useAiAnalysisStatus(): UseAiAnalysisStatusReturn {
  const { lastMessage } = useWebSocket();
  const [statusMap, setStatusMap] = useState<Map<string, AiAnalysisState>>(new Map());

  // Handle incoming AI analysis status messages
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'ai:analysis_status') {
      return;
    }

    const { sessionId, analysisType, status, timestamp, error } = lastMessage.payload as {
      sessionId: string;
      analysisType: AiAnalysisType;
      status: AiAnalysisStatus;
      timestamp: string;
      error?: string;
    };

    setStatusMap((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(sessionId) || {
        summary: null,
        reviewReport: null,
        lastUpdated: null,
      };

      const updated: AiAnalysisState = {
        ...current,
        lastUpdated: timestamp,
      };

      if (analysisType === 'summary') {
        updated.summary = status;
      } else if (analysisType === 'review_report') {
        updated.reviewReport = status;
      }

      if (error) {
        updated.error = error;
      }

      newMap.set(sessionId, updated);
      return newMap;
    });
  }, [lastMessage]);

  const getStatus = useCallback(
    (sessionId: string): AiAnalysisState => {
      return statusMap.get(sessionId) || {
        summary: null,
        reviewReport: null,
        lastUpdated: null,
      };
    },
    [statusMap]
  );

  const isSummaryGenerating = useCallback(
    (sessionId: string): boolean => {
      const state = statusMap.get(sessionId);
      return state?.summary === 'generating';
    },
    [statusMap]
  );

  const isReviewReportGenerating = useCallback(
    (sessionId: string): boolean => {
      const state = statusMap.get(sessionId);
      return state?.reviewReport === 'generating';
    },
    [statusMap]
  );

  return {
    getStatus,
    isSummaryGenerating,
    isReviewReportGenerating,
  };
}
