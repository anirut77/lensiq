/* tests/fixtures/palm-v2/textures.js — FIXED TEST SET "palm-layers" relock3 (independent review round 1 of palm-v2, 2026-11-20):
 * crease-free skin-like textures laid over the drawn synthetic hand (synth-hand.js). Taken from the reviewer's texlib.js
 * unchanged in behaviour: noise4 / noise10 (Gaussian grey noise), paper (grain + faint fibres), skin (pores + two families of
 * micro-hatching), skinStrong (hatching 1.7x darker), skinCreases (skin + 70 short random creases 0.03-0.10 palm widths).
 * texture(kind, w, h, seed, pw) -> {A: additive grey, D: darkness 0-1}; apply(hand, T) changes the skin pixels in place.
 * Pure JavaScript, Node and browser (window.PalmTextures). Synthetic only. */
(function (root) {
  "use strict";
  function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
  function gauss(r){let u=0,v=0;while(!u)u=r();v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  function blurF(a,w,h,sg){const R=Math.ceil(sg*3),k=[];let s=0;for(let i=-R;i<=R;i++){k.push(Math.exp(-i*i/(2*sg*sg)));s+=k[k.length-1];}k.forEach((v,i)=>k[i]=v/s);
   const t=new Float32Array(w*h),o=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a2=0;for(let i=-R;i<=R;i++){const xx=Math.min(w-1,Math.max(0,x+i));a2+=a[y*w+xx]*k[i+R];
     }t[y*w+x]=a2;}
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a2=0;for(let i=-R;i<=R;i++){const yy=Math.min(h-1,Math.max(0,y+i));a2+=t[yy*w+x]*k[i+R];}o[y*w+x]=a2;}return o;}
  function stampLine(D,w,h,a,b,depth,sigma){const L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/0.5)),r=Math.ceil(sigma*3);
   for(let t=0;t<=n;t++){const q=[a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n];for(let yy=Math.max(0,Math.floor(q[1]-r));yy<=Math.min(h-1,Math.ceil(q[1]+r));yy++)for(let xx=Math.max(0,
     Math.floor(q[0]-r));xx<=Math.min(w-1,Math.ceil(q[0]+r));xx++){const d2=(xx+.5-q[0])**2+(yy+.5-q[1])**2,v=depth*Math.exp(-d2/(2*sigma*sigma)),i=yy*w+xx;if(v>D[i])D[i]=v;}}}
  // texture: returns additive luminance field A and multiplicative darkness D
  function texture(kind,w,h,seed,pw){const r=rng(seed*7919+13),A=new Float32Array(w*h),D=new Float32Array(w*h);
   if(kind==="noise4"||kind==="noise10"){const sg=kind==="noise4"?4:10;for(let i=0;i<w*h;i++)A[i]=gauss(r)*sg;}
   else if(kind==="paper"){const n=new Float32Array(w*h);for(let i=0;i<w*h;i++)n[i]=gauss(r);const b1=blurF(n,w,h,1.2),b2=blurF(n,w,h,4);for(let i=0;i<w*h;i++)A[i]=b1[i]*18+b2[i]*30+gauss(r)*3;
     for(let f=0;f<3000;f++){const x=r()*w,y=r()*h,an=r()*Math.PI,l=5+r()*25;stampLine(D,w,h,[x,y],[x+Math.cos(an)*l,y+Math.sin(an)*l],0.08+r()*0.1,0.6);}}
   else if(kind.startsWith("skin")){const n=new Float32Array(w*h);for(let i=0;i<w*h;i++)n[i]=gauss(r);const b=blurF(n,w,h,2);for(let i=0;i<w*h;i++)A[i]=b[i]*20+gauss(r)*3;
     // pores
     for(let p=0;p<9000;p++){const x=r()*w,y=r()*h,rad=0.8+r()*1.2,dep=0.15+r()*0.2;for(let yy=Math.floor(y-3*rad);yy<=y+3*rad;yy++)for(let xx=Math.floor(x-3*rad);xx<=x+3*rad;xx++){
       if(xx<0||yy<0||xx>=w||yy>=h)continue;const v=dep*Math.exp(-((xx-x)**2+(yy-y)**2)/(2*rad*rad)),i=yy*w+xx;if(v>D[i])D[i]=v;}}
     // micro-hatching: two crossing families
     for(let f=0;f<8000;f++){const x=r()*w,y=r()*h,an=(r()<0.5?0.6:2.2)+(r()-0.5)*0.4,l=4+r()*12;stampLine(D,w,h,[x,y],[x+Math.cos(an)*l,y+Math.sin(an)*l],
       (kind==="skinStrong"?1.7:1)*(0.1+r()*0.12),0.7);}
     if(kind==="skinCreases"){for(let c=0;c<70;c++){const x=r()*w,y=r()*h,an=r()*Math.PI,l=(0.03+r()*0.07)*pw;stampLine(D,w,h,[x,y],[x+Math.cos(an)*l,y+Math.sin(an)*l],0.3+r()*0.25,1.0+r()*0.8);}}
   }
   return {A,D};}
  function apply(h,T){const p=h.rgba;for(let i=0;i<h.w*h.h;i++){const j=i*4;if(p[j]===70&&p[j+1]===92&&p[j+2]===120)continue;const f=1-0.55*T.D[i];for(let c=0;c<3;c++)p[j+c]=(p[j+c]+T.A[i])*f;}}


  var api = { texture: texture, apply: apply, KINDS: ["noise4", "noise10", "paper", "skin", "skinStrong", "skinCreases"] };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmTextures = api;
})(typeof window !== "undefined" ? window : globalThis);
