export type ToolType =
  | 'select'
  | 'move'
  | 'polygon'
  | 'rectangle'
  | 'obstacle'
  | 'panel'
  | 'rotate'
  | 'delete'
  | 'measure'
  | 'zoom-in'
  | 'zoom-out';

export interface Point {
  x: number;
  y: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoofPolygon {
  id: string;
  type: 'roof';
  points: Point[];
  slope: number;
  azimuth: number;
  color: string;
  opacity: number;
  area: number; // m²
  traceMpp?: number;  
}

export interface Obstacle {
  id: string;
  type: 'obstacle';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
}

export interface Walkway {
  id: string;
  type: 'walkway';
  points: Point[];
  width: number;
}

export interface SolarPanel {
  id: string;
  type: 'panel';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  orientation: 'portrait' | 'landscape';
  manufacturer: string;
  model: string;
  power: number; // Wp
  tilt: number;
  stringNumber: number;
  roofId: string;
}

export type DesignObject = RoofPolygon | Obstacle | Walkway | SolarPanel;

export interface ProjectInfo {
  clientName: string;
  address: string;
  roofArea: number;
  usableArea: number;
  totalPanels: number;
  dcCapacity: number;
  acCapacity: number;
}

export interface Equipment {
  panelModel: string;
  panelPower: number;
  panelWidth: number;
  panelHeight: number;
  inverter: string;
  mountingType: string;
}

export interface DesignStats {
  panelCount: number;
  roofUtilization: number;
  annualGeneration: number;
  co2Savings: number;
  capacity: number;
}

export interface HistoryEntry {
  roofs: RoofPolygon[];
  obstacles: Obstacle[];
  panels: SolarPanel[];
  walkways: Walkway[];
}

export interface MapConfig {
  center: LatLng;
  zoom: number;
  mapTypeId: string;
}
