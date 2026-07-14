'use client';
import { useCallback } from 'react';
import { useDesignStore } from '../store/designStore';

/**
 * mapMode (pan/zoom the satellite map) and activeTool (which 2D drawing
 * tool is live on the Konva canvas) used to be set independently at each
 * call site — every button that wanted to switch modes had to remember to
 * flip both `setMapMode(...)` and `setActiveTool(...)` itself. That's a
 * second source of truth waiting to drift: it's easy to add a new entry
 * point that sets one and forgets the other, leaving the map interactive
 * while a drawing tool is also active (or vice versa).
 *
 * These are the only sanctioned transitions between the two states —
 * mapMode itself still lives as local component state in
 * DesignPageContent (moving it into the Zustand store is a bigger change
 * than this correction pass calls for), but every place that changes it
 * now goes through here instead of touching it directly.
 */
export function useDesignNavigationActions(setMapMode: (v: boolean) => void) {
  const setActiveTool = useDesignStore(s => s.setActiveTool);

  const enterNavigateMode = useCallback(() => {
    setMapMode(true);
  }, [setMapMode]);

  const enterDrawMode = useCallback(() => {
    setMapMode(false);
  }, [setMapMode]);

  const enterRectangleMode = useCallback(() => {
    setMapMode(false);
    setActiveTool('rectangle');
  }, [setMapMode, setActiveTool]);

  const enterPolygonMode = useCallback(() => {
    setMapMode(false);
    setActiveTool('polygon');
  }, [setMapMode, setActiveTool]);

  const enterSelectMode = useCallback(() => {
    setMapMode(false);
    setActiveTool('select');
  }, [setMapMode, setActiveTool]);

  const enterDeleteMode = useCallback(() => {
    // Matches prior behavior: Delete tool never touched mapMode.
    setActiveTool('delete');
  }, [setActiveTool]);

  return {
    enterNavigateMode,
    enterDrawMode,
    enterRectangleMode,
    enterPolygonMode,
    enterSelectMode,
    enterDeleteMode,
  };
}
