export interface LatLng {
  latitude: number
  longitude: number
}

export interface RoofSegment {
  pitchDegrees: number
  azimuthDegrees: number
  stats: {
    areaMeters2: number
    sunshineQuantiles: number[]
    groundAreaMeters2: number
  }
  center: LatLng
  boundingBox: {
    sw: LatLng
    ne: LatLng
  }
  planeHeightAtCenterMeters: number
}

export interface SolarPanel {
  center: LatLng
  orientation: 'LANDSCAPE' | 'PORTRAIT'
  yearlyEnergyDcKwh: number
  segmentIndex: number
}

export interface SolarPanelConfig {
  panelsCount: number
  yearlyEnergyDcKwh: number
  roofSegmentSummaries: {
    pitchDegrees: number
    azimuthDegrees: number
    panelsCount: number
    yearlyEnergyDcKwh: number
    segmentIndex: number
  }[]
}

export interface BuildingInsights {
  name: string
  center: LatLng
  imageryQuality: string
  imageryDate: { year: number; month: number; day: number }
  solarPotential: {
    maxArrayPanelsCount: number
    maxArrayAreaMeters2: number
    maxSunshineHoursPerYear: number
    carbonOffsetFactorKgPerMwh: number
    wholeRoofStats: {
      areaMeters2: number
      sunshineQuantiles: number[]
      groundAreaMeters2: number
    }
    roofSegmentStats: RoofSegment[]
    solarPanels: SolarPanel[]
    solarPanelConfigs: SolarPanelConfig[]
    panelCapacityWatts: number
    panelHeightMeters: number
    panelWidthMeters: number
    panelLifetimeYears: number
  }
  notFound?: boolean
}