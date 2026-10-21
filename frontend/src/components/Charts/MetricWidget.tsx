import { useMemo } from 'react';

interface MetricWidgetProps {
  config: {
    title?: string;
    format?: 'number' | 'currency' | 'percentage' | 'duration';
    prefix?: string;
    suffix?: string;
    comparison?: {
      value: number;
      label: string;
    };
  };
  data: any;
}

export default function MetricWidget({ config, data }: MetricWidgetProps) {
  const formattedValue = useMemo(() => {
    if (data === null || data === undefined) return '-';

    const numValue = typeof data === 'object' ? data.value || data.count || 0 : data;
    const format = config?.format || 'number';

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(numValue);
      case 'percentage':
        return `${numValue.toFixed(1)}%`;
      case 'duration':
        return `${Math.round(numValue)}s`;
      default:
        return numValue.toLocaleString();
    }
  }, [data, config]); // config is object reference

  // Calculate change percentage
  const changePercentage = useMemo(() => {
    if (!config?.comparison?.value) return null;

    const current = typeof data === 'object' ? data.value || data.count || 0 : data || 0;
    const previous = config.comparison.value;

    if (previous === 0) return null;

    return ((current - previous) / previous) * 100;
  }, [data, config?.comparison]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      <div className="text-sm text-gray-500 mb-1">
        {config?.title || 'Metric'}
      </div>
      <div className="text-3xl font-bold">
        {config?.prefix}
        {formattedValue}
        {config?.suffix}
      </div>

      {changePercentage !== null && (
        <div
          className={`mt-2 text-sm ${
            changePercentage >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {changePercentage >= 0 ? '+' : ''}
          {changePercentage.toFixed(1)}%
          {config?.comparison?.label && (
            <span className="text-gray-500 ml-1">
              vs {config.comparison.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
