"use client";
import SolarBuildingViewer from "@/components/solar/SolarBuildingViewer";

export default function Test3D() {
  return (
    <div style={{ width: "100%", height: "500px" }}>
      <SolarBuildingViewer
        roofPolygon={[
          { x: -5, z: -4 },
          { x: 5, z: -4 },
          { x: 5, z: 4 },
          { x: -5, z: 4 },
        ]}
        pitchDeg={12}
        kWp={10.5}
      />
    </div>
  );
}