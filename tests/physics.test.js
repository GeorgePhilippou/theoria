import test from 'node:test';
import assert from 'node:assert/strict';
import {rate,embedding,tracePhoton,criticalImpact,sampleAt} from '../dist/physics.js';
test('static clocks and Flamm embedding match analytic limits',()=>{
 assert.equal(rate(Infinity),1); assert.equal(rate(1),0);
 assert.ok(Math.abs(rate(4)-Math.sqrt(.75))<1e-14);
 assert.equal(embedding(2),2);
});
test('null constraint conserved; subcritical capture and supercritical escape',()=>{
 for(const b of [0,2.2,2.58,2.7,3.4,7]) {
  const ray=tracePhoton(b);
  assert.equal(ray.outcome,b<criticalImpact?'approaches horizon':'escapes');
  assert.ok(ray.error<1e-6,`${b}: ${ray.error}`);
  assert.ok(ray.points.every((p,i,a)=>Number.isFinite(p.t)&&(!i||p.t>a[i-1].t)));
 }
});
test('mirrored rays preserve symmetry and integration converges',()=>{
 const a=tracePhoton(3.4),b=tracePhoton(-3.4),c=tracePhoton(3.4,{stepSize:.0175});
 const t=20,aa=sampleAt(a.points,t),bb=sampleAt(b.points,t),cc=sampleAt(c.points,t);
 assert.ok(Math.abs(aa.x-bb.x)<1e-10);assert.ok(Math.abs(aa.z+bb.z)<1e-10);
 assert.ok(Math.hypot(aa.x-cc.x,aa.z-cc.z)<.0002);
 assert.equal(sampleAt(a.points,-1),null);
});
