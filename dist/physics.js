// Schwarzschild exterior. Units: Schwarzschild radius r_s = 1 and light speed c = 1.
export const rate = r => Math.sqrt(1 - 1 / r);
export const embedding = r => 2 * Math.sqrt(r - 1);
export const criticalImpact = 3 * Math.sqrt(3) / 2;
function derivative([r,p,phi,t], L) {
  return [p, L*L/(r*r*r) - 1.5*L*L/(r*r*r*r), L/(r*r), 1/(1-1/r)];
}
function step(s,h,L) {
  const a=derivative(s,L), b=derivative(s.map((v,i)=>v+h*a[i]/2),L);
  const c=derivative(s.map((v,i)=>v+h*b[i]/2),L), d=derivative(s.map((v,i)=>v+h*c[i]),L);
  return s.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
}
export function tracePhoton(b, {radius=14, stepSize=.035, maxSteps=16000}={}) {
  const L=-b;
  let s=[radius,-Math.sqrt(1-(1-1/radius)*b*b/(radius*radius)),Math.PI-Math.asin(b/radius),0];
  const points=[];
  let error=0;
  for(let i=0;i<maxSteps;i++) {
    const [r,p,phi,t]=s;
    points.push({r,phi,t,x:r*Math.cos(phi),z:r*Math.sin(phi)});
    error=Math.max(error,Math.abs(p*p+(1-1/r)*L*L/(r*r)-1));
    if(r<1.015) return {points,outcome:'approaches horizon',error};
    if(r>radius+.05 && p>0) return {points,outcome:'escapes',error};
    s=step(s,Math.min(stepSize,.06*(r-1)),L);
  }
  return {points,outcome:'limit',error};
}
export function sampleAt(points,t) {
  if(t<0 || t>points.at(-1).t) return null;
  let lo=0,hi=points.length-1;
  while(hi-lo>1) { const m=(hi+lo)>>1; if(points[m].t<t) lo=m; else hi=m; }
  const a=points[lo],b=points[hi],u=(t-a.t)/(b.t-a.t||1);
  return {x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,r:a.r+(b.r-a.r)*u};
}
