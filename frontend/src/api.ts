import type { FolderData, StatusData } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: `请求失败（${response.status}）` }));
    throw new Error(payload.message ?? `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  status: () => request<StatusData>('/api/status'),
  pickFolder: () => request<{ selected: boolean; path?: string }>('/api/pick-folder', { method: 'POST' }),
  configure: (rootPath: string, startDepth: number) => request<{ message: string }>('/api/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rootPath, startDepth })
  }),
  folder: (path: string) => request<FolderData>(`/api/folder?path=${encodeURIComponent(path)}`),
  exit: () => request<{ message: string }>('/api/exit', { method: 'POST' })
};

export const mediaUrl = (path: string) => `/media?path=${encodeURIComponent(path)}`;
export const coverUrl = (path: string) => `/api/cover?path=${encodeURIComponent(path)}`;
