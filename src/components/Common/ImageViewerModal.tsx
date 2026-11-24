// ============================================================================
// عارض الصور والوسائط المتعددة التفاعلي (Universal Multi-Photo Viewer Modal)
// يدعم عرض صورة واحدة أو معرض صور متعدد مع التنقل بالأسهم والتصغير والتكبير
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  ChevronRight,
  ChevronLeft,
  FileText,
} from 'lucide-react';

export interface MediaGalleryEntry {
  url: string;
  type?: 'image' | 'video' | 'pdf';
  label?: string;
  name?: string;
}

export interface ImageViewerModalProps {
  src: string | null;
  items?: MediaGalleryEntry[];
  initialIndex?: number;
  alt?: string;
  title?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  src,
  items,
  initialIndex = 0,
  alt = 'صورة مكبرة',
  title,
  onClose,
}) => {
  const gallery: MediaGalleryEntry[] = React.useMemo(() => {
    if (items && items.length > 0) {
      return items.filter((item) => !!item?.url);
    }
    return src ? [{ url: src, type: 'image', label: title }] : [];
  }, [items, src, title]);

  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, Math.min(initialIndex, Math.max(0, gallery.length - 1)))
  );
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Touch gesture tracking refs
  const pinchStartDistRef = useRef(0);
  const pinchStartScaleRef = useRef(1);
  const lastTouchPosRef = useRef({ x: 0, y: 0 });
  const lastTapTimeRef = useRef(0);

  // Mouse drag tracking refs
  const mouseStartPosRef = useRef({ x: 0, y: 0 });
  const mouseDragStartPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setActiveIndex(Math.max(0, Math.min(initialIndex, Math.max(0, gallery.length - 1))));
  }, [initialIndex, gallery.length]);

  const activeItem = gallery[activeIndex] || gallery[0] || null;
  const activeUrl = activeItem?.url || null;
  const activeType =
    activeItem?.type ||
    (activeUrl?.startsWith('data:video/')
      ? 'video'
      : activeUrl?.startsWith('data:application/pdf')
      ? 'pdf'
      : 'image');

  // Reset zoom & pan when image changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [activeUrl, activeIndex]);

  const handleNext = useCallback(() => {
    if (gallery.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % gallery.length);
  }, [gallery.length]);

  const handlePrev = useCallback(() => {
    if (gallery.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
  }, [gallery.length]);

  // Keyboard support: ESC to close, Left/Right arrows to switch images
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handleNext();
      } else if (e.key === 'ArrowRight') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleNext, handlePrev]);

  const clampPosition = useCallback((x: number, y: number, currentScale: number) => {
    if (currentScale <= 1) return { x: 0, y: 0 };
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container) return { x, y };

    const imgWidth = img.offsetWidth || container.clientWidth * 0.85;
    const imgHeight = img.offsetHeight || container.clientHeight * 0.8;

    const maxX = Math.max(40, (imgWidth * currentScale - container.clientWidth) / 2 + 50);
    const maxY = Math.max(40, (imgHeight * currentScale - container.clientHeight) / 2 + 50);

    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeType !== 'image') return;
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      pinchStartDistRef.current = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      pinchStartScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };

      const now = Date.now();
      if (now - lastTapTimeRef.current < 300) {
        if (scale > 1.2) {
          setScale(1);
          setPosition({ x: 0, y: 0 });
        } else {
          setScale(2.5);
        }
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeType !== 'image') return;
    if (e.cancelable) {
      e.preventDefault();
    }
    if (e.touches.length === 2 && pinchStartDistRef.current > 0) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDist = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      const ratio = currentDist / pinchStartDistRef.current;
      const nextScale = Math.max(1, Math.min(5, pinchStartScaleRef.current * ratio));
      setScale(nextScale);
      if (nextScale <= 1) {
        setPosition({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && scale > 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchPosRef.current.x;
      const dy = touch.clientY - lastTouchPosRef.current.y;
      lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };

      setPosition((prev) => clampPosition(prev.x + dx, prev.y + dy, scale));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeType !== 'image') return;
    if (e.touches.length === 1) {
      lastTouchPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pinchStartDistRef.current = 0;
    } else if (e.touches.length === 0) {
      pinchStartDistRef.current = 0;
      if (scale <= 1) {
        setPosition({ x: 0, y: 0 });
        setScale(1);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (activeType !== 'image') return;
    e.preventDefault();
    const zoomDelta = -e.deltaY * 0.002;
    const nextScale = Math.max(1, Math.min(4.5, scale + zoomDelta));
    setScale(nextScale);
    if (nextScale <= 1) {
      setPosition({ x: 0, y: 0 });
    } else {
      setPosition((prev) => clampPosition(prev.x, prev.y, nextScale));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1 || activeType !== 'image') return;
    setIsDragging(true);
    mouseStartPosRef.current = { x: e.clientX, y: e.clientY };
    mouseDragStartPosRef.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || scale <= 1 || activeType !== 'image') return;
    const dx = e.clientX - mouseStartPosRef.current.x;
    const dy = e.clientY - mouseStartPosRef.current.y;
    setPosition(
      clampPosition(
        mouseDragStartPosRef.current.x + dx,
        mouseDragStartPosRef.current.y + dy,
        scale
      )
    );
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (activeType !== 'image') return;
    if (scale > 1.2) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.min(4.5, Math.round((prev + 0.5) * 10) / 10));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => {
      const next = Math.max(1, Math.round((prev - 0.5) * 10) / 10);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeUrl) return;
    const link = document.createElement('a');
    link.href = activeUrl;
    const ext = activeType === 'pdf' ? 'pdf' : activeType === 'video' ? 'mp4' : 'jpg';
    link.download = activeItem?.name || `attachment_${activeIndex + 1}_${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!activeUrl) return null;

  const headerTitle = activeItem?.label || title;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={(e) => {
        if (e.target === containerRef.current) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(5, 10, 20, 0.94)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
        padding: '12px',
      }}
    >
      {/* Top Floating Header & Counter & Close Button */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          width: '100%',
          boxSizing: 'border-box',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
          pointerEvents: 'none',
          zIndex: 110,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
          }}
        >
          {gallery.length > 1 && (
            <span
              style={{
                color: '#ffffff',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                backgroundColor: '#2563eb',
                padding: '4px 10px',
                borderRadius: '9999px',
              }}
            >
              {activeIndex + 1} / {gallery.length}
            </span>
          )}
          {headerTitle && (
            <span
              style={{
                color: '#ffffff',
                fontSize: '12px',
                fontFamily: 'var(--font-arabic)',
                fontWeight: 700,
                backgroundColor: 'rgba(30, 41, 59, 0.85)',
                padding: '4px 12px',
                borderRadius: '9999px',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                lineHeight: 1.4,
              }}
            >
              {headerTitle}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            pointerEvents: 'auto',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Multi-Photo Navigation Arrows */}
      {gallery.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 115,
              width: '42px',
              height: '42px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="الصورة السابقة"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 115,
              width: '42px',
              height: '42px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="الصورة التالية"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Main Media Display */}
      <div
        onDoubleClick={handleDoubleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '100%',
          maxHeight: gallery.length > 1 ? '72vh' : '82vh',
          cursor:
            activeType === 'image'
              ? scale > 1
                ? isDragging
                  ? 'grabbing'
                  : 'grab'
                : 'zoom-in'
              : 'default',
        }}
      >
        {activeType === 'video' ? (
          <video
            src={activeUrl}
            controls
            autoPlay
            style={{
              maxWidth: '90vw',
              maxHeight: gallery.length > 1 ? '70vh' : '80vh',
              borderRadius: '16px',
              backgroundColor: '#000',
            }}
          />
        ) : activeType === 'pdf' ? (
          <div
            style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              borderRadius: '16px',
              padding: '28px',
              textAlign: 'center',
              maxWidth: '360px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <FileText className="w-12 h-12 text-rose-600" />
            <div style={{ fontWeight: 700, fontSize: '14px', wordBreak: 'break-word' }}>
              {activeItem?.name || 'مستند PDF'}
            </div>
            <a
              href={activeUrl}
              download={activeItem?.name || 'document.pdf'}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '12px',
                textDecoration: 'none',
              }}
            >
              تحميل وفتح ملف PDF
            </a>
          </div>
        ) : (
          <img
            ref={imageRef}
            src={activeUrl}
            alt={alt}
            draggable={false}
            style={{
              maxWidth: '90vw',
              maxHeight: gallery.length > 1 ? '70vh' : '82vh',
              objectFit: 'contain',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              transition:
                isDragging || pinchStartDistRef.current > 0
                  ? 'none'
                  : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
              pointerEvents: 'auto',
            }}
          />
        )}
      </div>

      {/* Bottom Strip: Multi-photo Thumbnails + Zoom Toolbar */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          zIndex: 110,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        {gallery.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '16px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              overflowX: 'auto',
              maxWidth: '92vw',
            }}
          >
            {gallery.map((entry, idx) => {
              const isCurr = idx === activeIndex;
              const t =
                entry.type ||
                (entry.url.startsWith('data:video/')
                  ? 'video'
                  : entry.url.startsWith('data:application/pdf')
                  ? 'pdf'
                  : 'image');
              return (
                <button
                  key={`${idx}_${entry.name || entry.label || 'm'}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndex(idx);
                  }}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: isCurr ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.2)',
                    padding: 0,
                    backgroundColor: '#1e293b',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                  title={entry.label || `مرفق ${idx + 1}`}
                >
                  {t === 'image' ? (
                    <img
                      src={entry.url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span
                      style={{
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      {t.toUpperCase()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            padding: '6px 14px',
            borderRadius: '9999px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {activeType === 'image' && (
            <>
              <button
                onClick={handleZoomOut}
                disabled={scale <= 1}
                style={{
                  padding: '6px',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: scale <= 1 ? '#64748b' : '#ffffff',
                  border: 'none',
                  cursor: scale <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="تصغير"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span
                style={{
                  color: '#93c5fd',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  minWidth: '44px',
                  textAlign: 'center',
                }}
              >
                {Math.round(scale * 100)}%
              </span>

              <button
                onClick={handleZoomIn}
                disabled={scale >= 4.5}
                style={{
                  padding: '6px',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: scale >= 4.5 ? '#64748b' : '#ffffff',
                  border: 'none',
                  cursor: scale >= 4.5 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="تكبير"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <div
                style={{
                  width: '1px',
                  height: '16px',
                  backgroundColor: 'rgba(148, 163, 184, 0.3)',
                  margin: '0 4px',
                }}
              />

              <button
                onClick={handleResetZoom}
                style={{
                  padding: '6px',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: '#e2e8f0',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="إعادة ضبط"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={handleDownload}
            style={{
              padding: '6px',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: '#e2e8f0',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="تحميل"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
