import { useRef, useEffect, useCallback } from 'react';

interface UseTouchDropTargetOptions {
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

/**
 * Makes an element a drop target for touch-based drags.
 * Returns a ref to attach to the drop-target element.
 */
export function useTouchDropTarget({ onDragOver, onDragLeave, onDrop }: UseTouchDropTargetOptions) {
  const ref = useRef<HTMLLIElement>(null);
  const isOver = useRef(false);

  // Stable callback refs to avoid re-registering listeners
  const onDragOverRef = useRef(onDragOver);
  const onDragLeaveRef = useRef(onDragLeave);
  const onDropRef = useRef(onDrop);
  onDragOverRef.current = onDragOver;
  onDragLeaveRef.current = onDragLeave;
  onDropRef.current = onDrop;

  const handleTouchDragOver = useCallback((e: Event) => {
    if (!isOver.current) {
      isOver.current = true;
      onDragOverRef.current();
    }
  }, []);

  const handleTouchDrop = useCallback((e: Event) => {
    if (isOver.current) {
      isOver.current = false;
      onDropRef.current();
    }
  }, []);

  // When a touchdragover fires on a *different* element, we need to clear
  // our "over" state. We listen on document for that.
  const handleGlobalTouchDragOver = useCallback((e: Event) => {
    if (!ref.current) return;
    const target = e.target as Node;
    if (!ref.current.contains(target) && isOver.current) {
      isOver.current = false;
      onDragLeaveRef.current();
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener('touchdragover', handleTouchDragOver);
    el.addEventListener('touchdrop', handleTouchDrop);
    document.addEventListener('touchdragover', handleGlobalTouchDragOver);

    return () => {
      el.removeEventListener('touchdragover', handleTouchDragOver);
      el.removeEventListener('touchdrop', handleTouchDrop);
      document.removeEventListener('touchdragover', handleGlobalTouchDragOver);
    };
  }, [handleTouchDragOver, handleTouchDrop, handleGlobalTouchDragOver]);

  return ref;
}
