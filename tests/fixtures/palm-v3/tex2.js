/* tests/fixtures/palm-v3/tex2.js — FIXED TEST SET "palm-v3-lines" (palm v3 line-finder spike, 2026-11-20): the independent
 * reviewer's second texture library (round 2 of the palm-v2 review, file rev2/tex2.js), copied UNCHANGED below this header so a
 * locked test can use it from the repo. Effects on the drawn synthetic hand (synth-hand.js): fingerprint, jpeg60 (needs the local
 * cjpeg/djpeg and env TMPD; NOT used by the locked tests because CI has no cjpeg), noise8, motion, lighting, hardShadow, hair, tattoo,
 * darkSkin, lowContrast. hair and tattoo draw long dark strokes (not crease-free): report-only in the tests. Synthetic only. */
const fs=require("fs"),cp=require("child_process"),os=require("path");
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function gauss(r){let u=0;while(!u)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r());}
const BG=(p,j)=>p[j]===70&&p[j+1]===92&&p[j+2]===120;
function skinMask(h){const m=new Uint8Array(h.w*h.h);for(let i=0;i<m.length;i++)m[i]=BG(h.rgba,i*4)?0:1;return m;}
function darken(h,D,M){const p=h.rgba;for(let i=0;i<D.length;i++)if(M[i]&&D[i]){const f=1-D[i];p[i*4]*=f;p[i*4+1]*=f;p[i*4+2]*=f;}}
function stroke(D,w,h,pts,depth,sigma){const r=Math.ceil(sigma*3);for(let k=0;k<pts.length-1;k++){const a=pts[k],b=pts[k+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/0.5));
 for(let t=0;t<=n;t++){const q=[a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n];for(let y=Math.max(0,Math.floor(q[1]-r));y<=Math.min(h-1,q[1]+r);y++)for(let x=Math.max(0,Math.floor(q[0]-r));x<=Math.min(w-1,q[0]+r);x++){const v=depth*Math.exp(-((x+.5-q[0])**2+(y+.5-q[1])**2)/(2*sigma*sigma)),i=y*w+x;if(v>D[i])D[i]=v;}}}}
function curve(r,x0,y0,len,ang,bend){const pts=[[x0,y0]];let a=ang;const st=4;for(let s=0;s<len;s+=st){a+=bend*(r()-0.5);const p=pts[pts.length-1];pts.push([p[0]+Math.cos(a)*st,p[1]+Math.sin(a)*st]);}return pts;}
const E={
 fingerprint(h,r){const M=skinMask(h),D=new Float32Array(h.w*h.h);const cs=[0,1,2,3].map(()=>[r()*h.w,r()*h.h,5+r()*2]);
  for(let y=0;y<h.h;y++)for(let x=0;x<h.w;x++){const i=y*h.w+x;if(!M[i])continue;let best=1e9,per=6;for(const c of cs){const d=Math.hypot(x-c[0],(y-c[1])*1.3);if(d<best){best=d;per=c[2];}}
   const warp=3*Math.sin(x/41)+3*Math.cos(y/37);const v=Math.cos(2*Math.PI*(best+warp)/per);D[i]=0.16*Math.max(0,v)**2;}darken(h,D,M);},
 jpeg60(h,r){const f=os.join(process.env.TMPD,"j"+process.pid);const hdr=`P6\n${h.w} ${h.h}\n255\n`,buf=Buffer.alloc(h.w*h.h*3);for(let i=0;i<h.w*h.h;i++){buf[i*3]=h.rgba[i*4];buf[i*3+1]=h.rgba[i*4+1];buf[i*3+2]=h.rgba[i*4+2];}
  fs.writeFileSync(f+".ppm",Buffer.concat([Buffer.from(hdr),buf]));cp.execSync(`cjpeg -quality 60 ${f}.ppm > ${f}.jpg && djpeg -pnm ${f}.jpg > ${f}.out.ppm`);
  const o=fs.readFileSync(f+".out.ppm");let k=0,nl=0;while(nl<3){if(o[k]===10)nl++;k++;}for(let i=0;i<h.w*h.h;i++){h.rgba[i*4]=o[k+i*3];h.rgba[i*4+1]=o[k+i*3+1];h.rgba[i*4+2]=o[k+i*3+2];}},
 noise8(h,r){const M=skinMask(h);for(let i=0;i<M.length;i++)if(M[i]){const n=gauss(r)*8;for(let c=0;c<3;c++)h.rgba[i*4+c]+=n;}},
 motion(h,r){const ang=r()*Math.PI,L=9,dx=Math.cos(ang),dy=Math.sin(ang),src=new Uint8ClampedArray(h.rgba);
  for(let y=0;y<h.h;y++)for(let x=0;x<h.w;x++){const a=[0,0,0];let n=0;for(let t=-L/2;t<=L/2;t+=1){const xx=Math.round(x+dx*t),yy=Math.round(y+dy*t);if(xx<0||yy<0||xx>=h.w||yy>=h.h)continue;const j=(yy*h.w+xx)*4;a[0]+=src[j];a[1]+=src[j+1];a[2]+=src[j+2];n++;}const j=(y*h.w+x)*4;for(let c=0;c<3;c++)h.rgba[j+c]=a[c]/n;}
  E.noise8(h,r);},
 lighting(h,r){const M=skinMask(h),ang=r()*2*Math.PI,ca=Math.cos(ang),sa=Math.sin(ang),a2=r()*Math.PI,c2=Math.cos(a2),s2=Math.sin(a2),off=(r()-0.5)*200;
  for(let y=0;y<h.h;y++)for(let x=0;x<h.w;x++){const i=y*h.w+x;if(!M[i])continue;const t=((x-450)*ca+(y-600)*sa)/600;let g=0.8+0.35*t;
   const d=(x-450)*c2+(y-600)*s2-off;g*=d<0?0.5+0.5*(1/(1+Math.exp(d/6))):1; // soft-ish shadow edge (6 px)
   const d3=(x-450)*s2-(y-600)*c2;g*=1/(1+Math.exp(-d3/40))*0.3+0.7; // broad shading
   for(let c=0;c<3;c++)h.rgba[i*4+c]*=g;}},
 hardShadow(h,r){const M=skinMask(h),a2=r()*Math.PI,c2=Math.cos(a2),s2=Math.sin(a2),off=(r()-0.5)*150;for(let y=0;y<h.h;y++)for(let x=0;x<h.w;x++){const i=y*h.w+x;if(!M[i])continue;if((x-450)*c2+(y-600)*s2<off)for(let c=0;c<3;c++)h.rgba[i*4+c]*=0.5;}},
 hair(h,r){const M=skinMask(h),D=new Float32Array(h.w*h.h);for(let k=0;k<25;k++){const pw=h.pw;stroke(D,h.w,h.h,curve(r,150+r()*600,250+r()*800,(0.3+r()*0.5)*pw,r()*2*Math.PI,0.15),0.55,0.5);}darken(h,D,M);},
 tattoo(h,r){const M=skinMask(h),D=new Float32Array(h.w*h.h);for(let k=0;k<5;k++){stroke(D,h.w,h.h,curve(r,250+r()*400,350+r()*500,(0.2+r()*0.4)*h.pw,r()*2*Math.PI,0.3),0.6,1.4);}darken(h,D,M);},
 darkSkin(h,r){const M=skinMask(h);for(let i=0;i<M.length;i++)if(M[i]){h.rgba[i*4]*=0.52;h.rgba[i*4+1]*=0.46;h.rgba[i*4+2]*=0.42;}},
 lowContrast(h,r){const M=skinMask(h);let s=[0,0,0],n=0;for(let i=0;i<M.length;i++)if(M[i]){for(let c=0;c<3;c++)s[c]+=h.rgba[i*4+c];n++;}s=s.map(v=>v/n);for(let i=0;i<M.length;i++)if(M[i])for(let c=0;c<3;c++)h.rgba[i*4+c]=s[c]+0.55*(h.rgba[i*4+c]-s[c]);}
};
function applyAll(h,names,seed){const r=rng(seed*7777+3);for(const n of names)E[n](h,r);}
module.exports={applyAll,E};
