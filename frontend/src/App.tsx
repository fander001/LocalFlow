import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, coverUrl, mediaUrl } from './api';
import { MediaFeed } from './MediaFeed';
import { Setup } from './Setup';
import type { CatalogEntry, FolderData, StatusData } from './types';

export function App() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [showSetup, setShowSetup] = useState(true);
  const [data, setData] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('localflow-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  const scrollPositions = useRef(new Map<string, number>());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('localflow-theme', theme);
  }, [theme]);

  useEffect(() => {
    api.status()
      .then(result => {
        setStatus(result);
        setShowSetup(!result.configured);
        if (result.configured) loadFolder(currentUrlPath(), false);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'LocalFlow 无法初始化'));

    const onPopState = () => loadFolder(currentUrlPath(), false);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadFolder = async (path: string, updateHistory: boolean) => {
    if (data) scrollPositions.current.set(data.relativePath, window.scrollY);
    if (updateHistory) {
      const url = new URL(window.location.href);
      path ? url.searchParams.set('path', path) : url.searchParams.delete('path');
      history.pushState({ path }, '', url);
    }

    setLoading(true);
    setError('');
    setSearch('');
    try {
      const result = await api.folder(path);
      setData(result);
      document.title = `${result.name} · LocalFlow`;
      requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current.get(path) || 0 }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取这个文件夹');
    } finally {
      setLoading(false);
    }
  };

  const ready = async () => {
    const freshStatus = await api.status();
    setStatus(freshStatus);
    setShowSetup(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('path');
    history.replaceState({ path: '' }, '', url);
    await loadFolder('', false);
  };

  if (!status) {
    return <div class="boot-screen"><div class="boot-logo">LF</div><p>{error || '正在启动 LocalFlow…'}</p></div>;
  }

  if (showSetup) {
    return <Setup status={status} onReady={ready} onCancel={status.configured ? () => setShowSetup(false) : undefined} />;
  }

  return (
    <div class="app-shell">
      <header class="topbar">
        <button class="wordmark" onClick={() => loadFolder('', true)} aria-label="返回媒体库首页">
          <span class="wordmark-icon">LF</span>
          <span>LocalFlow</span>
        </button>
        <div class="topbar-actions">
          <button class="icon-button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label="切换明暗主题">
            {theme === 'dark' ? '☼' : '☾'}
          </button>
          <button class="toolbar-button" onClick={() => setShowSetup(true)}>切换目录</button>
          <button class="icon-button exit-button" onClick={async () => {
            if (!confirm('退出 LocalFlow？本地网页也会停止访问。')) return;
            await api.exit().catch(() => undefined);
            document.body.innerHTML = '<main class="closed-screen"><h1>LocalFlow 已退出</h1><p>现在可以关闭这个页面。</p></main>';
          }} aria-label="退出 LocalFlow">×</button>
        </div>
      </header>

      {data && (
        <main class="content">
          <nav class="breadcrumbs" aria-label="当前目录">
            {data.breadcrumbs.map((item, index) => (
              <span key={item.path || 'root'}>
                {index > 0 && <b>/</b>}
                <button onClick={() => loadFolder(item.path, true)}>{item.name}</button>
              </span>
            ))}
          </nav>

          <section class="folder-heading">
            <div>
              <p class="eyebrow">第 {data.depth} 层 · {data.mode === 'feed' ? '媒体信息流' : `第 ${data.startDepth} 层开始信息流`}</p>
              <h1>{data.name}</h1>
              <p>{data.folders.length} 个文件夹 · {data.media.length} 个媒体文件</p>
            </div>
            <label class="search-box">
              <span>⌕</span>
              <input value={search} onInput={event => setSearch((event.currentTarget as HTMLInputElement).value)} placeholder="搜索当前文件夹" />
            </label>
          </section>

          <LibraryContent data={data} search={search} onFolder={path => loadFolder(path, true)} />
        </main>
      )}

      {loading && <div class="loading-bar" aria-label="正在加载" />}
      {error && <div class="floating-error" role="alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    </div>
  );
}

function LibraryContent({ data, search, onFolder }: { data: FolderData; search: string; onFolder: (path: string) => void }) {
  const normalized = search.trim().toLocaleLowerCase('zh-CN');
  const filter = (entry: CatalogEntry) => !normalized || entry.name.toLocaleLowerCase('zh-CN').includes(normalized);
  const folders = useMemo(() => data.folders.filter(filter), [data.folders, normalized]);
  const media = useMemo(() => data.media.filter(filter), [data.media, normalized]);
  const other = useMemo(() => data.other.filter(filter), [data.other, normalized]);

  return (
    <>
      {folders.length > 0 && (
        <section class="section-block">
          <div class="section-title">
            <h2>{data.mode === 'navigation' ? '继续选择目录' : '子文件夹'}</h2>
            <span>{folders.length}</span>
          </div>
          <div class="folder-grid">
            {folders.map(folder => <FolderCard key={folder.path} folder={folder} onOpen={() => onFolder(folder.path)} />)}
          </div>
        </section>
      )}

      {(media.length > 0 || data.mode === 'feed' || (data.mode === 'navigation' && data.media.length > 0)) && (
        <section class="section-block feed-block">
          <div class="section-title">
            <h2>{data.mode === 'navigation' ? '本层媒体' : '媒体流'}</h2>
            <span>{media.length}</span>
          </div>
          <MediaFeed entries={media} />
        </section>
      )}

      {other.length > 0 && (
        <details class="other-files">
          <summary>其他文件 <span>{other.length}</span></summary>
          <div class="file-list">
            {other.map(file => (
              <a key={file.path} href={mediaUrl(file.path)} target="_blank" rel="noreferrer">
                <span class="file-icon">•</span><span>{file.name}</span><small>{formatSize(file.size)}</small>
              </a>
            ))}
          </div>
        </details>
      )}

      {!folders.length && !media.length && !other.length && (
        <div class="empty-state"><span>◇</span><p>{search ? '没有符合搜索条件的内容' : '这个文件夹是空的'}</p></div>
      )}
    </>
  );
}

function FolderCard({ folder, onOpen }: { folder: CatalogEntry; onOpen: () => void }) {
  const [hasCover, setHasCover] = useState(true);
  return (
    <button class="folder-card" onClick={onOpen}>
      <div class={`folder-cover${hasCover ? '' : ' no-cover'}`}>
        {hasCover && <img src={coverUrl(folder.path)} alt="" loading="lazy" onError={() => setHasCover(false)} />}
        <span class="folder-glyph" aria-hidden="true">⌁</span>
        <span class="open-arrow">↗</span>
      </div>
      <div class="folder-card-copy">
        <strong>{folder.name}</strong>
        <span>打开文件夹</span>
      </div>
    </button>
  );
}

function currentUrlPath() {
  return new URL(window.location.href).searchParams.get('path') || '';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
