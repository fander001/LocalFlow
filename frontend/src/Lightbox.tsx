import { useEffect, useRef, useState } from 'preact/hooks';
import { mediaUrl } from './api';
import type { CatalogEntry } from './types';

interface LightboxProps {
  images: CatalogEntry[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}

export function Lightbox({ images, index, onIndex, onClose }: LightboxProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointerStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const go = (offset: number) => {
    if (!images.length) return;
    onIndex((index + offset + images.length) % images.length);
  };

  const zoomTo = (next: number) => {
    const clamped = Math.min(5, Math.max(1, Math.round(next * 10) / 10));
    setScale(clamped);
    if (clamped === 1) setOffset({ x: 0, y: 0 });
  };

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
      if (event.key === '+' || event.key === '=') zoomTo(scale + 0.25);
      if (event.key === '-') zoomTo(scale - 0.25);
      if (event.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('lightbox-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('lightbox-open');
    };
  }, [index, images.length, scale]);

  useEffect(resetView, [index]);

  useEffect(() => {
    if (images.length < 2) return;
    const previous = new Image();
    const next = new Image();
    previous.src = mediaUrl(images[(index - 1 + images.length) % images.length].path);
    next.src = mediaUrl(images[(index + 1) % images.length].path);
  }, [index, images]);

  const current = images[index];
  if (!current) return null;

  return (
    <div class="lightbox" role="dialog" aria-modal="true" aria-label="图片大图模式">
      <button class="lightbox-close" onClick={onClose} aria-label="关闭">×</button>
      <div class="lightbox-zoom" role="group" aria-label="图片缩放">
        <button onClick={() => zoomTo(scale - 0.25)} disabled={scale <= 1} aria-label="缩小">−</button>
        <button class="zoom-value" onClick={resetView} title="恢复适应窗口">{Math.round(scale * 100)}%</button>
        <button onClick={() => zoomTo(scale + 0.25)} disabled={scale >= 5} aria-label="放大">＋</button>
        <button class="zoom-fit" onClick={resetView}>适应</button>
      </div>
      {images.length > 1 && <button class="lightbox-nav lightbox-prev" onClick={() => go(-1)} aria-label="上一张">‹</button>}
      <div
        class={`lightbox-stage${scale > 1 ? ' is-zoomed' : ''}${dragging ? ' is-dragging' : ''}`}
        onWheel={event => {
          event.preventDefault();
          zoomTo(scale + (event.deltaY < 0 ? 0.25 : -0.25));
        }}
        onDblClick={() => zoomTo(scale === 1 ? 2.5 : 1)}
        onPointerDown={event => {
          pointerStart.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
          if (scale > 1) {
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={event => {
          if (!dragging || scale <= 1) return;
          setOffset({
            x: pointerStart.current.offsetX + event.clientX - pointerStart.current.x,
            y: pointerStart.current.offsetY + event.clientY - pointerStart.current.y
          });
        }}
        onPointerUp={event => {
          if (dragging) {
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
            return;
          }
          if (event.pointerType === 'touch') {
            const distance = event.clientX - pointerStart.current.x;
            if (Math.abs(distance) > 50) go(distance > 0 ? -1 : 1);
          }
        }}
      >
        <img
          src={mediaUrl(current.path)}
          alt={current.name}
          draggable={false}
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
        />
      </div>
      {images.length > 1 && <button class="lightbox-nav lightbox-next" onClick={() => go(1)} aria-label="下一张">›</button>}
      <div class="lightbox-caption">
        <span>{current.name}</span>
        <span>{index + 1} / {images.length}</span>
      </div>
    </div>
  );
}
