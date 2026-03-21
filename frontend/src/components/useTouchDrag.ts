import { useRef, useCallback, useEffect } from 'react';
import { DragData } from './dragTypes';

/**
 * Minimum distance (px) a finger must move before we consider it a drag
 * rather than a tap. Prevents accidental drags when tapping inputs.
 */
const DRAG_THRESHOLD = 10;

interface UseTouchDragOptions {
  /** The drag payload to broadcast when this element is dragged */
  dragData: DragData;
  /** Whether dragging is disabled */
  disabled: boolean;
  /** Called when drag starts (mirrors onDragStart) */
  onDragStart: (data: DragData) => void;
  /** Called when drag ends (mirrors onDragEnd) */
  onDragEnd: () => void;
}

/**
 * Provides touch-event handlers that replicate the HTML5 drag-and-drop
 * behaviour for iOS / iPadOS Safari where native DnD is unsupported.
 *
 * Usage:
 *   const touchHandlers = useTouchDrag({ ... });
 *   <li {...touchHandlers} />
 */
export function useTouchDrag({ dragData, disabled, onDragStart, onDragEnd }: UseTouchDragOptions) {
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLElement | null>(null);

  // Clean up ghost on unmount
  useEffect(() => {
    return () => {
      ghostRef.current?.remove();
      ghostRef.current = null;
    };
  }, []);

  const createGhost = useCallback((text: string, x: number, y: number) => {
    const ghost = document.createElement('div');
    ghost.className = 'touch-drag-ghost';
    ghost.textContent = text;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
  }, []);

  const moveGhost = useCallback((x: number, y: number) => {
    if (ghostRef.current) {
      ghostRef.current.style.left = `${x}px`;
      ghostRef.current.style.top = `${y}px`;
    }
  }, []);

  const removeGhost = useCallback(() => {
    ghostRef.current?.remove();
    ghostRef.current = null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    // Don't interfere with input taps
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return;

    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };
    dragging.current = false;
    sourceRef.current = e.currentTarget as HTMLElement;
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || !sourceRef.current) return;

    const touch = e.touches[0];
    const dx = touch.clientX - startPos.current.x;
    const dy = touch.clientY - startPos.current.y;

    if (!dragging.current) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      // Start drag
      dragging.current = true;
      e.preventDefault();

      // Blur any focused input
      const focused = sourceRef.current.querySelector('input:focus') as HTMLElement | null;
      if (focused) focused.blur();

      onDragStart(dragData);

      // Build ghost label from the element text
      const label =
        sourceRef.current.querySelector('.player-typeahead-input')?.getAttribute('value') ||
        sourceRef.current.textContent?.trim() ||
        '';
      createGhost(label, touch.clientX, touch.clientY);
      sourceRef.current.classList.add('dragging');
    } else {
      e.preventDefault();
      moveGhost(touch.clientX, touch.clientY);

      // Hit-test to find the drop target under the finger
      // Temporarily hide ghost so elementFromPoint can see through it
      if (ghostRef.current) ghostRef.current.style.pointerEvents = 'none';
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (ghostRef.current) ghostRef.current.style.pointerEvents = '';

      // Dispatch a custom event so drop targets can react
      if (el) {
        const evt = new CustomEvent('touchdragover', {
          bubbles: true,
          detail: { clientX: touch.clientX, clientY: touch.clientY },
        });
        el.dispatchEvent(evt);
      }
    }
  }, [disabled, dragData, onDragStart, createGhost, moveGhost]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) {
      sourceRef.current = null;
      return;
    }

    const touch = e.changedTouches[0];

    // Hide ghost for hit-test
    if (ghostRef.current) ghostRef.current.style.pointerEvents = 'none';
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (ghostRef.current) ghostRef.current.style.pointerEvents = '';

    // Dispatch a custom drop event
    if (el) {
      const evt = new CustomEvent('touchdrop', {
        bubbles: true,
        detail: { clientX: touch.clientX, clientY: touch.clientY },
      });
      el.dispatchEvent(evt);
    }

    sourceRef.current?.classList.remove('dragging');
    removeGhost();
    dragging.current = false;
    sourceRef.current = null;
    onDragEnd();
  }, [onDragEnd, removeGhost]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
