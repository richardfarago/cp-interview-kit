import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

interface AnalyticsData {
  totalEvents: number;
  eventsByType: Array<{ eventType: string; _count: number }>;
  recentEvents: any[];
  period: string;
}

interface UseAnalyticsOptions {
  period?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const { period = 'day', autoRefresh = true, refreshInterval = 30000 } = options;

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentPeriod = useRef(period);
  currentPeriod.current = period;

  const fetchAnalytics = useCallback(async () => {
    try {
      // Only the first load shows the loading state, so a refresh doesn't blank the page
      const response = await api.get(`/analytics/stats?period=${period}`);
      // Ignore a late answer for a period the user has already switched away from
      if (currentPeriod.current !== period) return;
      setData(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  }, [period]);
  useEffect(() => {
    fetchAnalytics();

    if (autoRefresh) {
      intervalRef.current = setInterval(fetchAnalytics, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchAnalytics, autoRefresh, refreshInterval]);

  return { data, isLoading, error, refetch: fetchAnalytics };
}

// Hook for real-time event tracking
export function useEventTracking() {
  const track = useCallback(async (eventType: string, eventName: string, properties?: any) => {
    try {
      await api.post('/analytics/track', {
        eventType,
        eventName,
        properties,
      });
    } catch (error) {
      console.log('Failed to track event:', error);
    }
  }, []);

  return { track };
}

// Hook for analytics search
export function useAnalyticsSearch() {
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await api.get(`/analytics/search?q=${encodeURIComponent(query)}`);
      setResults(response.data);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  return { results, isSearching, search };
}

// Hook for analytics export
export function useAnalyticsExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportData = useCallback(async (format: 'csv' | 'json', startDate?: string, endDate?: string) => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({ format });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const response = await api.get(`/analytics/export?${params.toString()}`, {
        responseType: format === 'csv' ? 'blob' : 'json',
      });

      // Download file
      if (format === 'csv') {
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-export.${format}`;
        a.click();
      } else {
        // JSON download
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json',
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-export.${format}`;
        a.click();
      }
    } catch (error) {
      console.error('Export failed:', error);
      throw error;
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { exportData, isExporting };
}

// Hook for funnel analysis
export function useFunnelAnalysis(steps: string[]) {
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (steps.length < 2) return;

    const fetchFunnel = async () => {
      setIsLoading(true);
      try {
        const response = await api.post('/analytics/funnel', { steps });
        setFunnelData(response.data);
      } catch (error) {
        console.error('Funnel analysis failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFunnel();
  }, [steps]);

  return { funnelData, isLoading };
}

// Hook for real-time metrics
export function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await api.get('/analytics/realtime');
        setMetrics(response.data);
      } catch (error) {
        console.error('Failed to fetch realtime metrics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();

    // Refresh every 5 seconds
    const interval = setInterval(fetchMetrics, 5000);

    return () => clearInterval(interval);
  }, []); // Empty deps is okay here since we want it to run once

  return { metrics, isLoading };
}
