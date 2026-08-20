import { useEffect } from 'preact/hooks';
import { mediaUrl } from './api';
import type { CatalogEntry } from './types';

interface LightboxProps {
  images: CatalogEntry[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}

export function Lightbox({ images, index, onIndex, onClose }: LightboxProps) {
  const go = (offset: number) => {
    if (!images.length) return;
    onIndex((index + offset + images.length) % images.length);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('lightbox-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('lightbox-open');
    };
  }, [index, images.length]);

  useEffect(() => {
    if (images.length < 2) return;
    const previous = new Image();
    const next = new Image();
    previous.src = mediaUrl(images[(index - 1 + images.length) % images.length].path);
    next.src = mediaUrl(images[(index + 1) % images.length].path);
  }, [index, images]);

  let touchStart = 0;
  const current = images[index];
  if (!current) return null;

  return (
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="图片大图模式">
      <button class="lightbox-close" onClick={onClose} aria-label="关闭">×</button>
      {images.length > 1 && <button class="lightbox-nav lightbox-prev" onClick={() => go(-1)} aria-label="上一张">‹</button>}
      <div
        class="lightbox-stage"
        onTouchStart={event => { touchStart = event.touches[0]?.clientX ?? 0; }}
        onTouchEnd={event => {
          const distance = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart;
          if (Math.abs(distance) > 50) go(distance > 0 ? -1 : 1);
        }}
      >
        <img src={mediaUrl(current.path)} alt={current.name} />
      </div>
      {images.length > 1 && <button class="lightbox-nav lightbox-next" onClick={() => go(1)} aria-label="下一张">›</button>}
      <div class="lightbox-caption">
        <span>{current.name}</span>
        <span>{index + 1} / {images.length}</span>
      </div>
    </div>
  );
}
