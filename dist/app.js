import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {rate,embedding,tracePhoton,sampleAt} from './physics.js';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,alpha:false,powerPreference:'high-performance'}); }
catch(e) { $('fallback').hidden=false; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setClearColor(0x070b12);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,180);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.06;controls.minDistance=13;controls.maxDistance=90;
controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.12;controls.enablePan=false;controls.rotateSpeed=.6;
const narrow=()=>innerWidth<600;
function home(){camera.position.set(...(narrow()?[30,31,44]:[22,19,29]));camera.position.y+=blend*3.5;controls.target.set(0,-1.5+blend*3.5,0);controls.update();}
let current=8,playing=!reduced,blend=0,targetBlend=0,radii=[2.4,8],last=performance.now(),toastTimer;
home();
const colors=[0xe7b784,0xa6e5ed], angles=[-.25,2.35], bottom=-embedding(14);
const timeY=t=>-4+t*.22;
function pos(x,z,r,t=0,extra=0){return new THREE.Vector3(x,(embedding(Math.max(r,1))+bottom+extra)*(1-blend)+(timeY(t)+extra)*blend,z);}
function line(points,color,opacity=1,dashed=false){
 const geom=new THREE.BufferGeometry().setFromPoints(points);
 const mat=dashed?new THREE.LineDashedMaterial({color,transparent:true,opacity,dashSize:.15,gapSize:.16}):new THREE.LineBasicMaterial({color,transparent:true,opacity});
 const mesh=new THREE.Line(geom,mat);if(dashed)mesh.computeLineDistances();mesh.frustumCulled=false;scene.add(mesh);return mesh;
}
function updateLine(mesh,arr){mesh.geometry.setFromPoints(arr);if(mesh.material.isLineDashedMaterial)mesh.computeLineDistances();}
// A true Flamm embedding; no vertical exaggeration.
const surfaceGeometry=new THREE.BufferGeometry(),vertices=[],indices=[];const nr=90,na=160;
for(let i=0;i<=nr;i++){const r=1.001+(14-1.001)*(i/nr)**1.6;for(let j=0;j<=na;j++){const a=j/na*Math.PI*2;vertices.push(r*Math.cos(a),embedding(r)+bottom,r*Math.sin(a));}}
for(let i=0;i<nr;i++)for(let j=0;j<na;j++){const a=i*(na+1)+j,b=a+na+1;indices.push(a,b,a+1,b,b+1,a+1);}
surfaceGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));surfaceGeometry.setIndex(indices);
const surface=new THREE.Mesh(surfaceGeometry,new THREE.MeshBasicMaterial({color:0x8bbed2,transparent:true,opacity:.025,side:THREE.DoubleSide,depthWrite:false}));scene.add(surface);
const grid=[];
for(let r=1.05;r<=14;r+=.5){const pts=[];for(let j=0;j<=160;j++){const a=j/160*2*Math.PI;pts.push(new THREE.Vector3(r*Math.cos(a),embedding(r)+bottom,r*Math.sin(a)));}const m=line(pts,0x718fa9,r%1<.1?.24:.12);grid.push({m,base:pts,opacity:m.material.opacity});}
for(let i=0;i<64;i++){const a=i/64*2*Math.PI,pts=[];for(let j=0;j<=100;j++){const r=1.003+12.997*(j/100)**1.5;pts.push(new THREE.Vector3(r*Math.cos(a),embedding(r)+bottom,r*Math.sin(a)));}const m=line(pts,0x789bb8,i%4===0?.22:.1);grid.push({m,base:pts,opacity:m.material.opacity});}
// Horizon shown as a dark aperture, not an accretion disc.
const aperture=new THREE.Mesh(new THREE.CircleGeometry(1,100),new THREE.MeshBasicMaterial({color:0x020306,side:THREE.DoubleSide}));aperture.rotation.x=-Math.PI/2;aperture.position.y=bottom+.008;scene.add(aperture);
const rimPts=Array.from({length:161},(_,i)=>new THREE.Vector3(Math.cos(i/160*2*Math.PI),bottom+.03,Math.sin(i/160*2*Math.PI)));
const rim=line(rimPts,0xb8c9d7,.48);
// Sparse, deterministic background stars. Never used to suggest actual positions.
let seed=21;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const starPos=[];for(let i=0;i<650;i++){const a=random()*Math.PI*2,z=random()*2-1,d=65+random()*20;starPos.push(d*Math.sqrt(1-z*z)*Math.cos(a),d*z,d*Math.sqrt(1-z*z)*Math.sin(a));}
const starGeom=new THREE.BufferGeometry();starGeom.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));const stars=new THREE.Points(starGeom,new THREE.PointsMaterial({color:0x93aac6,size:.065,transparent:true,opacity:.43,sizeAttenuation:true}));scene.add(stars);
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.1,'rgba(255,255,255,.8)');g.addColorStop(.3,'rgba(255,255,255,.2)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
const glow=glowTexture();
function sprite(color,size){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));s.scale.set(size,size,1);scene.add(s);return s;}
const clocks=radii.map((r,i)=>{
 const group=new THREE.Group();scene.add(group);
 const face=new THREE.Mesh(new THREE.RingGeometry(.24,.27,64),new THREE.MeshBasicMaterial({color:colors[i],side:THREE.DoubleSide,transparent:true,opacity:.85}));face.rotation.x=-Math.PI/2;group.add(face);
 const hand=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.02,0),new THREE.Vector3(.19,.02,0)]),new THREE.LineBasicMaterial({color:colors[i]}));group.add(hand);
 const point=sprite(colors[i],.85);
 const worldline=line([new THREE.Vector3(),new THREE.Vector3()],colors[i],0,true);
 const tickGeometry=new THREE.BufferGeometry();tickGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(122*3),3));tickGeometry.setDrawRange(0,0);
 const ticks=new THREE.LineSegments(tickGeometry,new THREE.LineBasicMaterial({color:colors[i],transparent:true,opacity:0}));ticks.frustumCulled=false;scene.add(ticks);
 return {group,hand,point,worldline,ticks};
});
const impacts=[-6,-4,-3,-2.25,2.25,3,4,6];
const rays=impacts.map((impact,i)=>{
 const data=tracePhoton(impact);const points=data.points.filter((_,j)=>j%4===0);if(points.at(-1)!==data.points.at(-1))points.push(data.points.at(-1));
 const guide=line(points.map(p=>pos(p.x,p.z,p.r)),0x8bc5de,.075);
 const trailGeom=new THREE.BufferGeometry();trailGeom.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(points.length*3),3));trailGeom.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(points.length*3),3));
 const trail=new THREE.Line(trailGeom,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));trail.frustumCulled=false;scene.add(trail);
 const head=sprite(0xe1f8ff,.5);
 return {data,points,guide,trail,head};
});
const nowPlane=new THREE.Mesh(new THREE.PlaneGeometry(28,28),new THREE.MeshBasicMaterial({color:0x8fbdd7,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false}));nowPlane.rotation.x=-Math.PI/2;scene.add(nowPlane);
const axis=line([new THREE.Vector3(-12,-4,0),new THREE.Vector3(-12,timeY(60),0)],0xb4d7ea,0,true);
let lastBlend=-1,lastT=-1;
function geometry(){
 if(Math.abs(blend-lastBlend)>.0001||Math.abs(current-lastT)>.0001){
  if(Math.abs(blend-lastBlend)>.0001){
   const arr=surface.geometry.attributes.position;for(let i=0;i<arr.count;i++)arr.setY(i,vertices[i*3+1]*(1-blend)+timeY(current)*blend);arr.needsUpdate=true;
   surface.material.opacity=.025*(1-blend);
   for(const {m,base,opacity} of grid){updateLine(m,base.map(v=>new THREE.Vector3(v.x,v.y*(1-blend)+timeY(current)*blend,v.z)));m.material.opacity=opacity*(1-.5*blend);}
   aperture.position.y=bottom*(1-blend)+timeY(current)*blend;aperture.material.transparent=true;aperture.material.opacity=1-blend*.65;
   updateLine(rim,rimPts.map(v=>new THREE.Vector3(v.x,v.y*(1-blend)+timeY(current)*blend,v.z)));rim.material.opacity=.48*(1-blend*.6);
  }else if(blend>.001){
   for(const {m,base} of grid){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,base[i].y*(1-blend)+timeY(current)*blend);a.needsUpdate=true;}
   aperture.position.y=bottom*(1-blend)+timeY(current)*blend;
   const a=rim.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,rimPts[i].y*(1-blend)+timeY(current)*blend);a.needsUpdate=true;
  }
  nowPlane.position.y=timeY(current);nowPlane.material.opacity=.025*blend;axis.material.opacity=.5*blend;
  for(const ray of rays){
   const {points,guide,trail}=ray;const ga=guide.geometry.attributes.position,pa=trail.geometry.attributes.position,ca=trail.geometry.attributes.color;
   let visibleCount=0;
   for(let i=0;i<points.length;i++){
    const p=points[i],v=pos(p.x,p.z,p.r,p.t,.035);ga.setXYZ(i,v.x,v.y,v.z);pa.setXYZ(i,v.x,v.y,v.z);
    const age=current-p.t;
    const lum=age>=0?(blend*.4+.07+.9*Math.exp(-age/2.2)):0;
    ca.setXYZ(i,lum*.7,lum*.88,lum);if(p.t<=current)visibleCount=i+1;
   }
   ga.needsUpdate=pa.needsUpdate=ca.needsUpdate=true;trail.geometry.setDrawRange(0,visibleCount);guide.material.opacity=.065*(1-blend)+.018*blend;
   const p=sampleAt(ray.data.points,current);ray.head.visible=!!p;if(p)ray.head.position.copy(pos(p.x,p.z,p.r,current,.06));
   if(p&&p.r<1.1)ray.head.material.opacity=(p.r-1.015)/.085;else ray.head.material.opacity=1;
  }
  clocks.forEach((clock,i)=>{
   const r=radii[i],a=angles[i],x=r*Math.cos(a),z=r*Math.sin(a),v=pos(x,z,r,current,.12);
   clock.group.position.copy(v);clock.hand.rotation.y=-current*rate(r)*Math.PI;clock.point.position.copy(v);clock.point.material.opacity=.5+.2*Math.sin(current*rate(r)*Math.PI*2);
   updateLine(clock.worldline,[new THREE.Vector3(x,timeY(0),z),new THREE.Vector3(x,timeY(current),z)]);clock.worldline.material.opacity=.7*blend;
   const tickPts=[];for(let tau=0;tau<=current*rate(r);tau+=1){const y=timeY(tau/rate(r));tickPts.push(new THREE.Vector3(x-.13,y,z),new THREE.Vector3(x+.13,y,z));}const ta=clock.ticks.geometry.attributes.position;tickPts.forEach((p,j)=>ta.setXYZ(j,p.x,p.y,p.z));ta.needsUpdate=true;clock.ticks.geometry.setDrawRange(0,tickPts.length);clock.ticks.material.opacity=.8*blend;
   const label=i?'b':'a';$('elapsed-'+label).textContent=(current*rate(r)).toFixed(2)+' τ';
  });
  $('coordinate-time').textContent=current.toFixed(1);$('scrub').value=current;lastBlend=blend;lastT=current;
 }
}
const projected=new THREE.Vector3();
function labelPosition(el,v){projected.copy(v).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;el.style.left=x+'px';el.style.top=y+'px';el.style.visibility=projected.z>1||x<0||x>innerWidth-85||y<65||y>innerHeight-140?'hidden':'visible';}
function labels(){clocks.forEach((c,i)=>labelPosition($('clock-'+(i?'b':'a')),c.group.position));labelPosition($('mass-label'),new THREE.Vector3(0,aperture.position.y,0));$('mass-label').style.opacity=1-blend;}
function updateRates(){radii.forEach((r,i)=>{const id=i?'b':'a';$('rate-'+id).textContent=(rate(r)*100).toFixed(1)+'% of distant clock rate';$('radius-'+id+'-label').textContent=r.toFixed(1)+' rₛ';$(id+'-output').textContent=r.toFixed(1)+' rₛ';});lastT=-1;}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3400);}
function setPlay(value){playing=value;$('play').textContent=playing?'Ⅱ':'▷';$('play').setAttribute('aria-label',playing?'Pause simulation':'Play simulation');}
function view(isTime){targetBlend=isTime?1:0;if(reduced){camera.position.y+=(targetBlend-blend)*3.5;controls.target.y+=(targetBlend-blend)*3.5;blend=targetBlend;}for(const id of ['space','time']){$(id).classList.toggle('active',id===(isTime?'time':'space'));$(id).setAttribute('aria-pressed',String(id===(isTime?'time':'space')));}$('heading').innerHTML=isTime?'Every moment<br>leaves a worldline.':'Gravity changes<br>the rhythm of time.';$('subtitle').textContent=isTime?'Time rises vertically. Scrub to move your “now”.':'Two clocks. One mass. A different experience of time.';$('view-note').textContent=isTime?'2 space dimensions + coordinate time · Height is time':'Schwarzschild spatial slice · Geometry to scale';toast(isTime?'Clock ticks mark equal amounts of each clock’s own time.':'Depth represents spatial curvature, not time.');}
$('space').onclick=()=>view(false);$('time').onclick=()=>view(true);
$('play').onclick=()=>{if(current>=60)current=0;setPlay(!playing);};
$('scrub').addEventListener('input',e=>{setPlay(false);current=+e.target.value;});
$('light').onclick=()=>{current=0;lastT=-1;setPlay(true);toast('A new light pulse. Watch paths bend and clocks diverge.');};
$('reset-camera').onclick=home;
$('adjust-toggle').onclick=()=>{const open=$('adjust-controls').hidden;$('adjust-controls').hidden=!open;$('adjust-toggle').setAttribute('aria-expanded',String(open));$('adjust-toggle').lastElementChild.textContent=open?'−':'＋';};
for(const [i,id] of ['a','b'].entries())$('radius-'+id).addEventListener('input',e=>{radii[i]=+e.target.value;current=0;setPlay(false);updateRates();});
$('about').onclick=()=>{$('model').showModal();setPlay(false);};$('close-model').onclick=()=>$('model').close();
$('model').addEventListener('click',e=>{if(e.target===$('model')){const r=$('model').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('model').close();}});
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();updateRates();setPlay(playing);
document.addEventListener('visibilitychange',()=>{last=performance.now();});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setPlay(false);$('fallback').hidden=false;});
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.08);last=now;if(playing&&!document.hidden){current=Math.min(60,current+dt*2);if(current>=60)setPlay(false);}const previousBlend=blend;if(!reduced){blend+=(targetBlend-blend)*Math.min(1,dt*4);if(Math.abs(blend-targetBlend)<.0001)blend=targetBlend;}camera.position.y+=(blend-previousBlend)*3.5;controls.target.y+=(blend-previousBlend)*3.5;controls.update();geometry();labels();renderer.render(scene,camera);}requestAnimationFrame(animate);
