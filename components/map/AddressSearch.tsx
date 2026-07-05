'use client';
import React, { useEffect, useRef, useState } from 'react';

interface AddressSearchProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
}

export function AddressSearch({ onLocationSelect }: AddressSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const tryInit = () => {
      if (!window.google?.maps?.places) {
        setTimeout(tryInit, 300);
        return;
      }
      if (!inputRef.current || autocompleteRef.current) return;

      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        inputRef.current
      );

      // Must set fields separately after construction
      autocompleteRef.current.setFields(['geometry', 'formatted_address', 'name']);

      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();

        // place.geometry may be undefined if user typed but didn't select a suggestion
        if (!place || !place.geometry || !place.geometry.location) {
          console.warn('No geometry — user must select a suggestion from the dropdown');
          return;
        }

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || place.name || '';
        setValue(address);
        onLocationSelect(lat, lng, address);
      });
    };

    tryInit();
  }, [onLocationSelect]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Force Google's autocomplete dropdown above the z-9999 design overlay */}
      <style>{`
        .pac-container {
          z-index: 10001 !important;
        }
      `}</style>
      <span style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        color: '#94A3B8', fontSize: 14, pointerEvents: 'none', zIndex: 1,
      }}>🔍</span>
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search address or building..."
        style={{
          width: '100%', padding: '8px 10px 8px 32px',
          background: '#FFFFFF', border: '1px solid #CBD5E1',
          borderRadius: 6, color: '#1E293B', fontSize: 12,
          outline: 'none', fontFamily: 'Inter, system-ui, sans-serif',
          boxSizing: 'border-box',
        }}
        onFocus={e => { e.target.style.borderColor = '#2563EB'; }}
        onBlur={e => { e.target.style.borderColor = '#CBD5E1'; }}
      />
      <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, marginBottom: 0 }}>
        Type and select from dropdown
      </p>
    </div>
  );
}
