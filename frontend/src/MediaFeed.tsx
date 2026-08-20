import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { mediaUrl } from './api';
import { Lightbox } from './Lightbox';
import type { CatalogEntry } from './types';

interface MediaFeedProps {
  entries: CatalogEntry[];
  layout: 'feed' | 'masonry';
}

export function MediaFeed({ entries, layout }: MediaFeedProps) {
  const [center, setCenter] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<string, number>());
  const images = entries.filter(entry => entry.kind === 'image');

  useEffect(() => {
    setCenter(0);
    setLightboxIndex(null);
  }, [entries]);

  useEffect(() => {
    if (layout !== 'feed') return;
    const feed = feedRef.current;
    if (!feed) return;

    const shells = Array.from(feed.querySelectorAll<HTMLElement>('.media-shell'));
    const intersecting = new Set<HTMLElement>();
    let frame = 0;

    const updateCenter = () => {
      frame = 0;
      if (!intersecting.size) return;
      const viewportCenter = window.innerHeight / 2;
      const closest = Array.from(intersecting).reduce((best, item) => {
        const bestBox = best.getBoundingClientRect();
        const itemBox = item.getBoundingClientRect();
        const bestDistance = Math.abs(bestBox.top + bestBox.height / 2 - viewportCenter);
        const itemDistance = Math.abs(itemBox.top + itemBox.height / 2 - viewportCenter);
        return itemDistance < bestDistance ? item : best;
      });
      const nextCenter = Number(closest.dataset.index || 0);
      setCenter(current => current === nextCenter ? current : nextCenter);
    };

    const observer = new IntersectionObserver(records => {
      records.forEach(record => {
        const shell = record.target as HTMLElement;
        if (record.isIntersecting) intersecting.add(shell);
        else intersecting.delete(shell);
      });
      if (!frame) frame = window.requestAnimationFrame(updateCenter);
    }, { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '20% 0px' });

    shells.forEach(shell => observer.observe(shell));
    return () => {
      observer.disconnect();
      intersecting.clear();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [entries, layout]);

  if (!entries.length) {
    return <div class="empty-state"><span>◇</span><p>这个文件夹暂时没有图片或视频</p></div>;
  }

  const openImage = (entry: CatalogEntry) => {
    const index = images.findIndex(image => image.path === entry.path);
    if (index >= 0) setLightboxIndex(index);
  };

  const renderEntry = (entry: CatalogEntry, index: number) => (
    <WindowedItem
      key={entry.path}
      entry={entry}
      index={index}
      active={layout === 'masonry' || Math.abs(index - center) <= 10}
      measureHeight={layout === 'feed'}
      storedHeight={heights.current.get(`${layout}:${entry.path}`)}
      placeholderHeight={layout === 'masonry' ? 340 : 540}
      onHeight={height => heights.current.set(`${layout}:${entry.path}`, height)}
      onImage={() => openImage(entry)}
    />
  );

  return (
    <>
      <div ref={feedRef} class={`media-feed ${layout === 'masonry' ? 'is-masonry' : 'is-feed'}`}>
        {entries.map(renderEntry)}
      </div>
      {lightboxIndex !== null && (
        <Lightbox images={images} index={lightboxIndex} onIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}

interface WindowedItemProps {
  entry: CatalogEntry;
  index: number;
  active: boolean;
  measureHeight: boolean;
  storedHeight?: number;
  placeholderHeight: number;
  onHeight: (height: number) => void;
  onImage: () => void;
}

function WindowedItem({ entry, index, active, measureHeight, storedHeight, placeholderHeight, onHeight, onImage }: WindowedItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!active || !measureHeight || !ref.current) return;
    const element = ref.current;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height > 80) onHeight(height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, entry.path, measureHeight]);

  return (
    <article
      ref={ref}
      class={`media-shell${active ? ' is-mounted' : ' is-placeholder'}`}
      data-index={index}
      style={!active ? { height: `${storedHeight || placeholderHeight}px` } : undefined}
    >
      {active && <MediaCard entry={entry} onImage={onImage} />}
    </article>
  );
}

function MediaCard({ entry, onImage }: { entry: CatalogEntry; onImage: () => void }) {
  const [videoError, setVideoError] = useState(false);
  const source = mediaUrl(entry.path);
  const date = entry.modifiedUnixMs ? new Date(entry.modifiedUnixMs).toLocaleDateString('zh-CN') : '';

  const pauseOtherVideos = (current: HTMLVideoElement) => {
    document.querySelectorAll('video').forEach(video => {
      if (video !== current) video.pause();
    });
  };

  return (
    <div class="media-card">
      <div class="media-card-head">
        <div class={`kind-dot ${entry.kind}`} />
        <div class="media-title" title={entry.name}>{entry.name}</div>
        <time>{date}</time>
      </div>
      {entry.kind === 'image' ? (
        <button class="image-button" onClick={onImage} aria-label={`查看大图：${entry.name}`}>
          <img src={source} alt={entry.name} decoding="async" />
          <span class="expand-hint">查看大图</span>
        </button>
      ) : (
        <div class="video-frame">
          {!videoError ? (
            <video src={source} controls preload="metadata" playsInline onPlay={event => pauseOtherVideos(event.currentTarget)} onError={() => setVideoError(true)} />
          ) : (
            <div class="video-error">
              <strong>浏览器无法直接播放此编码</strong>
              <span>文件不会被自动转码，避免占用处理器。</span>
              <a href={source} target="_blank" rel="noreferrer">尝试在浏览器中打开</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
