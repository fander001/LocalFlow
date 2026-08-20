import { useState } from 'preact/hooks';
import { api } from './api';
import type { StatusData } from './types';

interface SetupProps {
  status: StatusData;
  onReady: () => void;
  onCancel?: () => void;
}

export function Setup({ status, onReady, onCancel }: SetupProps) {
  const [folder, setFolder] = useState(status.rootPath || status.lastFolder || '');
  const [depth, setDepth] = useState(status.startDepth || status.lastStartDepth || 3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chooseFolder = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await api.pickFolder();
      if (result.selected && result.path) setFolder(result.path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法打开目录选择器');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!folder.trim()) {
      setError('请先选择媒体目录');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.configure(folder.trim(), depth);
      onReady();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法打开媒体库');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="setup-shell">
      <main class="setup-card">
        <div class="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <p class="eyebrow">LOCAL MEDIA, BEAUTIFULLY QUIET</p>
        <h1>打开你的本地媒体流</h1>
        <p class="setup-intro">选择一个目录，并决定从第几层开始展示图片与视频。文件始终留在你的电脑上。</p>

        <label class="field-label" for="folder">媒体根目录</label>
        <div class="folder-picker">
          <input id="folder" value={folder} readOnly placeholder="尚未选择目录" />
          <button class="secondary-button" disabled={busy} onClick={chooseFolder}>选择目录</button>
        </div>

        <label class="field-label" for="depth">信息流起始层级</label>
        <div class="depth-control">
          <button disabled={busy || depth <= 1} onClick={() => setDepth(value => Math.max(1, value - 1))} aria-label="减少层级">−</button>
          <input
            id="depth"
            type="number"
            min="1"
            max="30"
            value={depth}
            onInput={event => setDepth(Math.min(30, Math.max(1, Number((event.currentTarget as HTMLInputElement).value) || 1)))}
          />
          <button disabled={busy || depth >= 30} onClick={() => setDepth(value => Math.min(30, value + 1))} aria-label="增加层级">＋</button>
        </div>
        <p class="depth-hint">第 {depth} 层开始显示信息流；实际目录不足时会提前显示。</p>

        {error && <div class="error-message" role="alert">{error}</div>}

        <div class="setup-actions">
          {onCancel && <button class="ghost-button" onClick={onCancel} disabled={busy}>取消</button>}
          <button class="primary-button" onClick={start} disabled={busy || !folder.trim()}>
            {busy ? '正在准备…' : '打开 LocalFlow'}
          </button>
        </div>
        <p class="font-notice">界面使用 HarmonyOS Sans 字体 · <a href="/fonts/LICENSE_Fonts" target="_blank" rel="noreferrer">字体许可</a></p>
      </main>
    </div>
  );
}
