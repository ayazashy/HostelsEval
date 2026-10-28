// ============================================================================
// 🔍 عارض الصور التفاعلي ملء الشاشة (Universal Image Viewer Modal)
// يدعم التكبير بإصبعين (Pinch to Zoom)، التمرير، والنقر المزدوج على الهواتف والويب
// مصمم وفق أعلى معايير الـ UX دون نصوص أو تعليمات زائدة
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';

export interface ImageViewerModalProps {
  src: string | null;
  alt?: string;
  title?: string;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  src,
  alt = 'صورة مكبرة',
  title,
  onClose,
}) => {
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

  // Reset zoom & pan when image changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clamp translation based on actual image dimensions and scale
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

  // --------------------------------------------------------------------------
  // Mobile Touch Gestures: Two-Finger Pinch & One-Finger Pan & Double-Tap
  // --------------------------------------------------------------------------
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // Start two-finger pinch
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

      // Double-tap detection (< 300ms)
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
    if (e.touches.length === 1) {
      // Transition from 2 fingers to 1: capture new single finger position smoothly
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

  // --------------------------------------------------------------------------
  // Desktop Wheel & Mouse Drag
  // --------------------------------------------------------------------------
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
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
    if (scale <= 1) return;
    setIsDragging(true);
    mouseStartPosRef.current = { x: e.clientX, y: e.clientY };
    mouseDragStartPosRef.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || scale <= 1) return;
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
    if (scale > 1.2) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  // Zoom Button Controls
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
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = `photo_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!src) return null;

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
        // If clicking backdrop directly, close modal when at default scale
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
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
        padding: '12px',
      }}
    >
      {/* Top Floating Header & Close Button */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 20px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          boxSizing: 'border-box',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
          pointerEvents: 'none',
          zIndex: 110,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          {title && (
            <span
              style={{
                color: '#ffffff',
                fontSize: '13px',
                fontFamily: 'var(--font-arabic)',
                fontWeight: 700,
                backgroundColor: 'rgba(30, 41, 59, 0.75)',
                padding: '4px 12px',
                borderRadius: '9999px',
                border: '1px solid rgba(148, 163, 184, 0.25)',
              }}
            >
              {title}
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
            transition: 'background-color 150ms ease',
          }}
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Image Display */}
      <div
        onDoubleClick={handleDoubleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '100%',
          maxHeight: '100%',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          draggable={false}
          style={{
            maxWidth: '92vw',
            maxHeight: '84vh',
            objectFit: 'contain',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transition: isDragging || pinchStartDistRef.current > 0 ? 'none' : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
            pointerEvents: 'auto',
          }}
        />
      </div>

      {/* Floating Bottom Action Toolbar */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          padding: '6px 14px',
          borderRadius: '9999px',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
          zIndex: 110,
          backdropFilter: 'blur(8px)',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
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

        <div style={{ width: '1px', height: '16px', backgroundColor: 'rgba(148, 163, 184, 0.3)', margin: '0 4px' }} />

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
          title="تحميل الصورة"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
