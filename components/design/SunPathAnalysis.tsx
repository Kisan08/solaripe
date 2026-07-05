'use client';
import React, { useState, useEffect } from 'react';

interface SunPathProps {
  lat: number;
  lng: number;
  roofAzimuth: number;
  roofPitch: number;
}

function getSunPosition(lat: number, lng: number, date: Date): { azimuth: number; elevation: number } {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  const declination = 23.45 * Math.sin(rad * (360 / 365) * (dayOfYear - 81));

  // Treat the slider hour as local solar time directly (noon = sun due south)
  const localSolarTime = date.getHours() + date.getMinutes() / 60;
  const hourAngle = 15 * (localSolarTime - 12);

  const sinElevation =
    Math.sin(rad * lat) * Math.sin(rad * declination) +
    Math.cos(rad * lat) * Math.cos(rad * declination) * Math.cos(rad * hourAngle);

  const elevation = Math.asin(sinElevation) / rad;

  const cosAzimuth =
    (Math.sin(rad * declination) - Math.sin(rad * lat) * sinElevation) /
    (Math.cos(rad * lat) * Math.cos(Math.asin(sinElevation)));

  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) / rad;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  return { azimuth, elevation: Math.max(0, elevation) };
}

function calcPanelEfficiency(sunAzimuth: number, sunElevation: number, panelAzimuth: number, panelTilt: number): number {
  const rad = Math.PI / 180;
  const aziDiff = (sunAzimuth - panelAzimuth) * rad;
  const efficiency =
    Math.cos(rad * sunElevation) * Math.sin(rad * panelTilt) * Math.cos(aziDiff) +
    Math.sin(rad * sunElevation) * Math.cos(rad * panelTilt);
  return Math.max(0, Math.min(1, efficiency));
}

export function SunPathAnalysis({ lat, lng, roofAzimuth, roofPitch }: SunPathProps) {
  const [month, setMonth] = useState(6); // June default
  const [hour, setHour] = useState(12);
  const [open, setOpen] = useState(true);

  const date = new Date(2024, month - 1, 21, hour, 0, 0);
  const sun = getSunPosition(lat, lng, date);
  const efficiency = calcPanelEfficiency(sun.azimuth, sun.elevation, roofAzimuth, roofPitch);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Hourly efficiency for current month
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const d = new Date(2024, month - 1, 21, h, 0, 0);
    const s = getSunPosition(lat, lng, d);
    return { hour: h, eff: calcPanelEfficiency(s.azimuth, s.elevation, roofAzimuth, roofPitch) };
  });

  const peakHour = hourlyData.reduce((a, b) => a.eff > b.eff ? a : b);

  const effColor = efficiency > 0.7 ? '#22C55E' : efficiency > 0.4 ? '#F59E0B' : '#EF4444';
  const dirLabel = roofAzimuth < 45 || roofAzimuth > 315 ? 'North'
    : roofAzimuth < 135 ? 'East'
    : roofAzimuth < 225 ? 'South ✓'
    : 'West';

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E2E8F0',
      borderRadius: 8, overflow: 'hidden', marginTop: 4,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: 'transparent', border: 'none',
          color: '#1E293B', cursor: 'pointer', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>☀️</span> Sun Analysis
        </span>
        <span style={{ color: '#64748B', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          {/* Sun position */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{
              flex: 1, background: '#F8FAFC', borderRadius: 6, padding: '8px 10px',
              border: '1px solid #E2E8F0', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>☀️</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Elevation</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#FCD34D' }}>
                {sun.elevation.toFixed(1)}°
              </div>
            </div>
            <div style={{
              flex: 1, background: '#F8FAFC', borderRadius: 6, padding: '8px 10px',
              border: '1px solid #E2E8F0', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>🧭</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Azimuth</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#60A5FA' }}>
                {sun.azimuth.toFixed(1)}°
              </div>
            </div>
            <div style={{
              flex: 1, background: '#F8FAFC', borderRadius: 6, padding: '8px 10px',
              border: '1px solid #E2E8F0', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>⚡</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Panel Eff.</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: effColor }}>
                {(efficiency * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Roof facing */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 8px', background: '#0F172A', borderRadius: 5,
            border: '1px solid #1E293B', marginBottom: 8,
          }}>
            <span style={{ fontSize: 11, color: '#64748B' }}>Roof facing</span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: dirLabel.includes('South') ? '#22C55E' : '#F59E0B',
            }}>
              {dirLabel} ({roofAzimuth.toFixed(0)}°)
            </span>
          </div>

          {/* Month slider */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#64748B' }}>Month</span>
              <span style={{ fontSize: 10, color: '#E2E8F0', fontWeight: 600 }}>{monthNames[month - 1]}</span>
            </div>
            <input
              type="range" min={1} max={12} value={month}
              onChange={e => setMonth(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#3B82F6' }}
            />
          </div>

          {/* Hour slider */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#64748B' }}>Time</span>
              <span style={{ fontSize: 10, color: '#E2E8F0', fontWeight: 600 }}>
                {hour.toString().padStart(2, '0')}:00
              </span>
            </div>
            <input
              type="range" min={0} max={23} value={hour}
              onChange={e => setHour(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#F59E0B' }}
            />
          </div>

          {/* Hourly efficiency chart */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#64748B', marginBottom: 4 }}>
              Hourly efficiency — {monthNames[month - 1]}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 40 }}>
              {hourlyData.map(d => (
                <div
                  key={d.hour}
                  title={`${d.hour}:00 — ${(d.eff * 100).toFixed(0)}%`}
                  style={{
                    flex: 1, borderRadius: 2,
                    height: `${Math.max(4, d.eff * 100)}%`,
                    background: d.hour === hour
                      ? '#F59E0B'
                      : d.eff > 0.6 ? '#22C55E' : d.eff > 0.3 ? '#3B82F6' : '#1E293B',
                    transition: 'height .2s',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontSize: 9, color: '#334155' }}>0h</span>
              <span style={{ fontSize: 9, color: '#334155' }}>12h</span>
              <span style={{ fontSize: 9, color: '#334155' }}>23h</span>
            </div>
          </div>

          {/* Recommendation */}
          <div style={{
            padding: '8px 10px', background: '#0F172A',
            border: `1px solid ${roofAzimuth > 135 && roofAzimuth < 225 ? '#22C55E33' : '#F59E0B33'}`,
            borderRadius: 6, fontSize: 11,
            color: roofAzimuth > 135 && roofAzimuth < 225 ? '#22C55E' : '#F59E0B',
          }}>
            {roofAzimuth > 135 && roofAzimuth < 225
              ? `✓ South-facing roof. Peak generation at ${peakHour.hour}:00. Ideal for solar.`
              : `⚠ Not south-facing. Consider tilting panels toward 180° for +${Math.round((1 - efficiency) * 20)}% gain.`
            }
          </div>
        </div>
      )}
    </div>
  );
}
