import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { useAnalytics } from '../src/hooks/useAnalytics';
import { api } from '../src/services/api';

vi.mock('../src/services/api', () => ({ api: { get: vi.fn() } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let hook: ReturnType<typeof useAnalytics>;
const Probe = ({ period }: { period: string }) => {
  hook = useAnalytics({ period, autoRefresh: false });
  return null;
};
const root = createRoot(document.createElement('div'));
const render = (period: string) => act(async () => root.render(createElement(Probe, { period })));

it('fetches the newly selected period without blanking the page', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { totalEvents: 5, period: 'day' } });
  await render('day');

  vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as any); // still loading
  await render('week');

  expect(api.get).toHaveBeenLastCalledWith('/analytics/stats?period=week');
  expect([hook.isLoading, hook.data?.totalEvents]).toEqual([false, 5]);
});

it('ignores a late answer for a period the user has left', async () => {
  let lateAnswer: (value: unknown) => void = () => {};
  vi.mocked(api.get).mockReturnValueOnce(new Promise((resolve) => { lateAnswer = resolve; }) as any);
  await render('month');
  vi.mocked(api.get).mockResolvedValueOnce({ data: { totalEvents: 9, period: 'week' } });
  await render('week');

  await act(async () => lateAnswer({ data: { totalEvents: 1, period: 'month' } }));

  expect(hook.data?.period).toBe('week');
});
