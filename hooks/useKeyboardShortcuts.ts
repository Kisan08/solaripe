'use client';
import { useEffect } from 'react';
import { useDesignStore } from '../store/designStore';

export function useKeyboardShortcuts() {
  const {
    undo, redo, clearSelection, activeTool, setActiveTool,
    selectedIds, removePanel, removePanels, removeObstacle,
    roofs, obstacles, panels, setSaveStatus,
  } = useDesignStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in input fields
      if ((e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y') { e.preventDefault(); redo(); }
        if (e.key === 's') {
          e.preventDefault();
          setSaveStatus('saving');
          setTimeout(() => setSaveStatus('saved'), 800);
        }
      }

      if (e.key === 'Escape') { clearSelection(); setActiveTool('select'); }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length === 0) return;
        const panelIds = selectedIds.filter(id => panels.some(p => p.id === id));
        if (panelIds.length > 0) removePanels(panelIds);
        selectedIds.forEach(id => {
          if (obstacles.some(o => o.id === id)) removeObstacle(id);
        });
        clearSelection();
      }

      // Tool shortcuts
      const toolKeys: Record<string, any> = {
        'v': 'select',
        'm': 'move',
        'p': 'polygon',
        'r': 'rectangle',
        'o': 'obstacle',
        's': 'panel',
        'd': 'delete',
        'e': 'measure',
      };
      if (!e.ctrlKey && !e.metaKey && toolKeys[e.key]) {
        setActiveTool(toolKeys[e.key]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, panels, obstacles, undo, redo, clearSelection, setActiveTool,
    removePanel, removePanels, removeObstacle, setSaveStatus]);
}
