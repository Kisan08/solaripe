import type { RoofPolygon } from '../types';

export function roofMapTransform(roof: RoofPolygon | undefined, center: {lat:number;lng:number}, zoom: number, width: number, height: number) {
  const anchor = roof?.centroidLatLng;
  if (!roof || !anchor || !roof.traceMpp || roof.traceMpp <= 0 || !roof.points.length || width <= 0 || height <= 0) return null;
  const world = (p: {lat:number;lng:number}) => {
    const sin = Math.sin(Math.max(-85.05112878, Math.min(85.05112878,p.lat))*Math.PI/180);
    return {x:(p.lng+180)/360,y:.5-Math.log((1+sin)/(1-sin))/(4*Math.PI)};
  };
  const a=world(anchor), c=world(center), pixels=256*Math.pow(2,zoom);
  const mpp=156543.03392*Math.cos(anchor.lat*Math.PI/180)/Math.pow(2,zoom);
  const scale=roof.traceMpp/mpp;
  const cx=(Math.min(...roof.points.map(p=>p.x))+Math.max(...roof.points.map(p=>p.x)))/2;
  const cy=(Math.min(...roof.points.map(p=>p.y))+Math.max(...roof.points.map(p=>p.y)))/2;
  let dx=a.x-c.x; dx-=Math.round(dx);
  return {scale,offset:{x:width/2+dx*pixels-cx*scale,y:height/2+(a.y-c.y)*pixels-cy*scale}};
}
