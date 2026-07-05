'use client';
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { useDesignStore } from '../../store/designStore';

declare global {
  interface Window {
    google: any;
    _mapsReady: boolean;
    _mapsCallbacks: Array<() => void>;
    _mapsLoading: boolean;
    _mapInstance: any; // global singleton map instance
  }
}

export interface MapBackgroundRef {
  jumpTo: (lat: number, lng: number) => void;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
}

interface MapBackgroundProps {
  interactive: boolean;
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.google !== 'undefined' && window.google.maps) { resolve(); return; }
    window._mapsCallbacks = window._mapsCallbacks || [];
    window._mapsCallbacks.push(resolve);
    if (window._mapsLoading) return;
    window._mapsLoading = true;
    (window as any).__googleMapsInit = () => {
      window._mapsReady = true;
      window._mapsLoading = false;
      (window._mapsCallbacks || []).forEach(cb => cb());
      window._mapsCallbacks = [];
    };
    document.querySelectorAll('script[src*="maps.googleapis.com/maps/api"]').forEach(s => s.remove());
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=__googleMapsInit`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
}

export const MapBackground = forwardRef<MapBackgroundRef, MapBackgroundProps>(({ interactive }, ref) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { mapConfig, updateMapConfig } = useDesignStore();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useImperativeHandle(ref, () => ({
    jumpTo: (lat: number, lng: number) => {
      // Try global instance first, then wait for it
      const tryJump = () => {
        const map = window._mapInstance;
        if (map) {
          map.setCenter({ lat, lng });
          map.setZoom(20);
          updateMapConfig({ center: { lat, lng }, zoom: 20 });
        } else {
          setTimeout(tryJump, 200);
        }
      };
      tryJump();
    },
    getCenter: () => {
      const map = window._mapInstance;
      if (!map) return mapConfig.center;
      const c = map.getCenter();
      return { lat: c.lat(), lng: c.lng() };
    },
    getZoom: () => {
      const map = window._mapInstance;
      return map ? map.getZoom() : mapConfig.zoom;
    },
  }));

  useEffect(() => {
    if (!apiKey) { setError('no-key'); return; }
    let cancelled = false;
    let listeners: any[] = [];
    let mapInstance: any = null;

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapDivRef.current) return;

      // If an old instance exists (from a previous mount), resume from its
      // last position but ALWAYS create a fresh map bound to THIS div.
      // (The old early-return here left the map attached to a dead div and
      // dropped the zoom-sync listeners — the source of the stale-scale bug.)
      const startCenter = useDesignStore.getState().mapConfig.center;
      const startZoom = useDesignStore.getState().mapConfig.zoom;

      const map = new window.google.maps.Map(mapDivRef.current, {
        center: startCenter,
        zoom: startZoom,
        mapTypeId: 'satellite',
        tilt: 0,
        rotateControl: false,
        disableDefaultUI: false,
        zoomControl: true,
        gestureHandling: 'greedy',
        keyboardShortcuts: false,
        isFractionalZoomEnabled: true,
      });
      mapInstance = map;
      window._mapInstance = map;

      // Keep the store's mapConfig in sync with the REAL map state.
      // This is the single source of truth for all px ↔ meter conversions.
      const syncMapConfig = () => {
        const c = map.getCenter();
        const z = map.getZoom();
        if (!c || z == null) return;
        useDesignStore.getState().updateMapConfig({
          center: { lat: c.lat(), lng: c.lng() },
          zoom: z, // may be fractional (e.g. 18.42) — do NOT round
        });
      };

      // zoom_changed fires immediately on zoom; idle catches pans settling.
      listeners.push(map.addListener('zoom_changed', syncMapConfig));
      listeners.push(map.addListener('idle', syncMapConfig));
      syncMapConfig(); // capture initial state

    });

    return () => {
      cancelled = true;
      listeners.forEach(l => l?.remove?.());
      // Fully detach this map instance so it stops trying to render into a
      // div that React is about to remove — leaving this undone was letting
      // an orphaned Google Maps instance keep ticking against a dead/0-size
      // container during route navigation (the source of a "drawImage on a
      // 0-size canvas" console error coming from inside Google's own bundle).
      if (mapInstance && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(mapInstance);
      }
      if (window._mapInstance === mapInstance) {
        window._mapInstance = null;
      }
    };
  }, [apiKey]);

  // Toggle gesture handling
  useEffect(() => {
    const map = window._mapInstance;
    if (map) {
      map.setOptions({
        gestureHandling: interactive ? 'greedy' : 'none',
        zoomControl: interactive,
      });
    }
  }, [interactive]);

  if (error === 'no-key') return <MapPlaceholder />;
  return <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />;
});
MapBackground.displayName = 'MapBackground';

function MapPlaceholder() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#1a2a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#64748B', fontSize: 12 }}>Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable satellite view</span>
    </div>
  );
}
