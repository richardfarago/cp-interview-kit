import { useState } from 'react';

interface AddWidgetModalProps {
  onClose: () => void;
  onSubmit: (data: { name: string; type: string; config: any }) => void;
  isLoading?: boolean;
}

const field = 'w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function AddWidgetModal({ onClose, onSubmit, isLoading }: AddWidgetModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('metric');
  // What the widget measures, saved as config.query
  const [measure, setMeasure] = useState('count');
  const [property, setProperty] = useState('');
  const [eventType, setEventType] = useState('');
  const [range, setRange] = useState('all');
  const [groupBy, setGroupBy] = useState('eventType');
  const usesProperty = measure === 'sum' || measure === 'avg';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const query = {
      ...(type !== 'table' && { measure }),
      ...(type !== 'table' && usesProperty && { property }),
      ...(type === 'chart' && { groupBy }),
      ...(eventType && { eventType }),
      ...(range !== 'all' && { range })
    };
    const config = type === 'metric'
      ? { title: name, format: 'number', query }
      : type === 'chart'
      ? { chartType: groupBy === 'day' ? 'line' : 'bar', title: name, query }
      : type === 'table'
      ? { sortable: true, pageSize: 10, query }
      : { content: '' };

    onSubmit({ name, type, config });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Add Widget</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Widget Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Widget"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Widget Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="metric">Metric</option>
              <option value="chart">Chart</option>
              <option value="table">Table</option>
              <option value="text">Text</option>
            </select>
          </div>

          {type !== 'text' && (
            <div className="mb-6 space-y-3">
              {type !== 'table' && (
                <select aria-label="Measure" value={measure} onChange={(e) => setMeasure(e.target.value)} className={field}>
                  <option value="count">Number of events</option>
                  <option value="sum">Sum of a property</option>
                  <option value="avg">Average of a property</option>
                  <option value="unique_users">Unique users</option>
                </select>
              )}
              {type !== 'table' && usesProperty && (
                <input aria-label="Property" value={property} onChange={(e) => setProperty(e.target.value)} className={field}
                  placeholder="Property, e.g. amount" pattern="[A-Za-z0-9_]{1,50}" required />
              )}
              {type === 'chart' && (
                <select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={field}>
                  <option value="eventType">By event type</option>
                  <option value="eventName">By event name</option>
                  <option value="day">Per day</option>
                </select>
              )}
              <input aria-label="Event type" value={eventType} onChange={(e) => setEventType(e.target.value)} className={field}
                placeholder="Only this event type (optional), e.g. purchase" />
              <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value)} className={field}>
                <option value="all">All time</option>
                <option value="hour">Last hour</option>
                <option value="day">Last 24 hours</option>
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Widget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
