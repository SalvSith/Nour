import { Mesh, Program, Renderer, Triangle, Vec3 } from 'ogl';
import { useEffect, useRef, type RefObject } from 'react';
import type { EmotionUniforms } from './types';
import type { SoundManager } from './soundManager';

const PHI = 1.618033988749895;

const vert = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// ─── 3D Raymarching Fragment Shader ───────────────────────────────────────────
const frag = /* glsl */ `
  precision highp float;

  uniform float iTime;
  uniform vec3  iResolution;
  uniform float hue;
  uniform float audioLevel;
  uniform float audioBass;
  uniform float audioMid;
  uniform float audioTreble;
  uniform float audioTransient;
  uniform float randomOffsetX;
  uniform float randomOffsetY;
  uniform float breathe;
  uniform float calm;
  uniform float rot;

  uniform float emotionValence;
  uniform float emotionArousal;
  uniform float emotionSize;
  uniform float emotionHue;
  uniform float emotionSaturation;
  uniform float emotionOpacity;
  uniform float emotionColorSpread;

  uniform float touchPosX;
  uniform float touchPosY;
  uniform float touchStrength;
  uniform float touchVelX;
  uniform float touchVelY;
  uniform float touchSpread;

  uniform float euphoric;
  uniform float joyPulse;
  uniform float warmPulse;
  uniform float trickActive;
  uniform float trickPhase;
  uniform float trickType;
  uniform float gameMode;
  uniform float satSeed;
  uniform float satSeed2;

  uniform vec4 gb0;
  uniform vec4 gb1;
  uniform vec4 gb2;
  uniform vec4 gb3;
  uniform vec4 gb4;
  uniform vec4 gb5;
  uniform vec4 gb6;
  uniform vec4 gb7;

  uniform float camDist;

  varying vec2 vUv;

  // ── Color space utilities (unchanged) ─────────────────────────────────────
  vec3 rgb2yiq(vec3 c) {
    return vec3(
      dot(c, vec3(0.299, 0.587, 0.114)),
      dot(c, vec3(0.596, -0.274, -0.322)),
      dot(c, vec3(0.211, -0.523, 0.312))
    );
  }
  vec3 yiq2rgb(vec3 c) {
    return vec3(
      c.x + 0.956*c.y + 0.621*c.z,
      c.x - 0.272*c.y - 0.647*c.z,
      c.x - 1.106*c.y + 1.703*c.z
    );
  }
  vec3 adjustHue(vec3 color, float hueDeg) {
    float hueRad = hueDeg * 3.14159265 / 180.0;
    vec3 yiq = rgb2yiq(color);
    float cosA = cos(hueRad); float sinA = sin(hueRad);
    yiq = vec3(yiq.x, yiq.y*cosA - yiq.z*sinA, yiq.y*sinA + yiq.z*cosA);
    return yiq2rgb(yiq);
  }
  vec3 applySaturation(vec3 c, float sat) {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(vec3(lum), c, sat);
  }
  vec3 linear_srgb_to_oklab(vec3 c) {
    c = max(c, 0.0);
    float l = 0.4122214708*c.r + 0.5363325363*c.g + 0.0514459929*c.b;
    float m = 0.2119034982*c.r + 0.6806995451*c.g + 0.1073969566*c.b;
    float s = 0.0883024619*c.r + 0.2220049874*c.g + 0.6996925507*c.b;
    l = pow(max(l,0.0),1.0/3.0); m = pow(max(m,0.0),1.0/3.0); s = pow(max(s,0.0),1.0/3.0);
    return vec3(
      0.2104542553*l + 0.7936177850*m - 0.0040720468*s,
      1.9779984951*l - 2.4285922050*m + 0.4505937099*s,
      0.0259040371*l + 0.7827717662*m - 0.8086757660*s
    );
  }
  vec3 oklab_to_linear_srgb(vec3 c) {
    float l = c.x + 0.3963377774*c.y + 0.2158037573*c.z;
    float m = c.x - 0.1055613458*c.y - 0.0638541728*c.z;
    float s = c.x - 0.0894841775*c.y - 1.2914855480*c.z;
    l=l*l*l; m=m*m*m; s=s*s*s;
    return vec3(
      +4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
      -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
      -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    );
  }
  vec3 mixOklab(vec3 a, vec3 b, float t) {
    return max(oklab_to_linear_srgb(mix(linear_srgb_to_oklab(a), linear_srgb_to_oklab(b), t)), 0.0);
  }

  // ── Noise (unchanged) ─────────────────────────────────────────────────────
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(p3.x+p3.y, p3.x+p3.z, p3.y+p3.z) * p3.zyx);
  }
  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i  = floor(p + (p.x+p.y+p.z)*K1);
    vec3 d0 = p - (i - (i.x+i.y+i.z)*K2);
    vec3 e  = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e*(1.0-e.zxy);
    vec3 i2 = 1.0-e.zxy*(1.0-e);
    vec3 d1 = d0-(i1-K2); vec3 d2 = d0-(i2-K1); vec3 d3 = d0-0.5;
    vec4 h  = max(0.6-vec4(dot(d0,d0),dot(d1,d1),dot(d2,d2),dot(d3,d3)),0.0);
    vec4 n  = h*h*h*h*vec4(dot(d0,hash33(i)),dot(d1,hash33(i+i1)),dot(d2,hash33(i+i2)),dot(d3,hash33(i+1.0)));
    return dot(vec4(31.316),n);
  }

  vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn/(a+1e-5), a);
  }

  const vec3 baseColor1 = vec3(0.611765, 0.262745, 0.996078);
  const vec3 baseColor2 = vec3(0.298039, 0.760784, 0.913725);
  const vec3 baseColor3 = vec3(0.062745, 0.078431, 0.600000);

  float light2(float intensity, float attenuation, float dist) {
    return intensity/(1.0+dist*dist*attenuation);
  }
  float smin(float a, float b, float k) {
    float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0);
    return mix(b,a,h) - k*h*(1.0-h);
  }

  // ── Dynamic radius (shared between SDF & coloring) ────────────────────────
  float getDynR() {
    float eR = mix(0.05, 0.8, mix(emotionSize, 0.86, euphoric));
    float happyV = max(emotionValence, 0.0);
    float r = eR + breathe*(0.03+happyV*0.015)*(0.5+emotionArousal*1.5) + audioLevel*0.04;
    r *= 1.0 + gameMode*1.6;
    return r;
  }

  // ── Edge displacement (ported from 2D, using 3D surface point xy) ─────────
  float edgeDisp(vec3 q) {
    float arousalScale = 0.3 + emotionArousal*1.4;
    float gnm = 1.0 + gameMode*2.0;
    float bassD = (audioBass*0.16 + audioBass*audioBass*0.11)*gnm;
    float midD  = (audioMid *0.10 + audioMid *audioMid *0.07)*gnm;
    float trebD = (audioTreble*0.07 + audioTreble*audioTreble*0.055)*gnm;

    float eN1 = snoise3(vec3(q.xy*0.3, iTime*0.12))*bassD*3.0;
    float eN2 = snoise3(vec3(q.xy*0.5, iTime*0.18))*bassD*2.0;
    float eN3 = snoise3(vec3(q.xy*0.9, iTime*0.3 ))*midD *2.5;
    float eN4 = snoise3(vec3(q.xy*1.5, iTime*0.5 ))*trebD*2.0;
    float eN5 = snoise3(vec3(q.xy*2.5, iTime*0.8 ))*trebD*1.5;

    float punchD = audioTransient*0.08;
    float punchN = snoise3(vec3(q.xy*0.8, iTime*0.6))*punchD
                 + snoise3(vec3(q.xy*1.4, iTime*0.9))*punchD*0.5;

    float ang = atan(q.y, q.x);
    float bassSquish = sin(ang*2.0+iTime*0.25)*bassD*1.8;
    float midSquish  = sin(ang*3.0-iTime*0.3)*midD*1.4 + sin(ang*4.0+iTime*0.4)*midD*0.9;
    float trebSquish = sin(ang*6.0+iTime*0.7)*trebD*1.2 + sin(ang*9.0-iTime*1.0)*trebD*0.7;

    float happyV = max(emotionValence, 0.0);
    float breatheVar = breathe*(0.018+sin(ang*2.0+iTime*0.25)*0.007);
    float noise = (eN1+eN2+eN3+eN4+eN5+punchN+bassSquish+midSquish+trebSquish+breatheVar)*(1.0-calm)*arousalScale;

    if (gameMode > 0.01) {
      float gb = sin(q.x*3.8+iTime*0.35)*cos(q.y*3.2-iTime*0.25)*0.05
               + sin(q.x*6.1-iTime*0.55)*sin(q.y*5.7+iTime*0.45)*0.03
               + sin(ang*3.0+iTime*0.8)*0.03 + sin(ang*5.0-iTime*1.2)*0.02;
      noise += gb*gameMode;
    }

    float happyWiggle = (sin(ang*3.0+iTime*1.8)*0.012+sin(ang*5.0-iTime*2.5)*0.008)*happyV;
    return noise + happyWiggle + joyPulse*0.018;
  }

  // ── Game blob SDF (3D — blobs sit in the xy-plane, z = 0) ─────────────────
  float gbSDF(vec3 p, vec4 gb) {
    vec3 gbP = vec3(gb.x, gb.y, 0.0);
    vec3 rel  = p - gbP;
    float dist = length(rel);
    float n = snoise3(vec3(rel.xy*2.8, iTime*0.12+gb.x*4.9+gb.y*3.1))*0.018
            + snoise3(vec3(rel.xy*5.8, iTime*0.25+gb.x*7.7-gb.y*5.3))*0.009;
    return dist - gb.z*gb.w - n*gb.w;
  }

  // ── Compute all satellite blob positions & radii ───────────────────────────
  // Shared by both marchSDF (for shape) and shade (for color highlights).
  // tPos2D: already-rotated 2D touch position (same frame as UV).
  void blobData(
    float dynR,
    out vec3 bp1,out vec3 bp2,out vec3 bp3,out vec3 bp4,
    out vec3 bp5,out vec3 bp6,out vec3 bp7,out vec3 bp8,
    out float br1,out float br2,out float br3,out float br4,
    out float br5,out float br6,out float br7,out float br8,
    out float vis1,out float vis2,out float vis3,out float vis4,
    out float vis5,out float vis6,out float vis7,out float vis8
  ) {
    float audioPow = audioLevel*audioLevel;
    float arousalScale = 0.3+emotionArousal*1.4;

    vis1=smoothstep(0.22,0.58,sin(satSeed       +satSeed2*0.71)*0.5+0.5);
    vis2=smoothstep(0.22,0.58,sin(satSeed+2.399 +satSeed2*0.93)*0.5+0.5);
    vis3=smoothstep(0.22,0.58,sin(satSeed+4.798 +satSeed2*1.17)*0.5+0.5);
    vis4=smoothstep(0.22,0.58,sin(satSeed+7.197 +satSeed2*0.59)*0.5+0.5);
    vis5=smoothstep(0.22,0.58,sin(satSeed+1.847 +satSeed2*1.31)*0.5+0.5);
    vis6=smoothstep(0.22,0.58,sin(satSeed+3.691 +satSeed2*0.83)*0.5+0.5);
    vis7=smoothstep(0.22,0.58,sin(satSeed+5.236 +satSeed2*1.07)*0.5+0.5);
    vis8=smoothstep(0.22,0.58,sin(satSeed+0.618 +satSeed2*1.43)*0.5+0.5);

    float o1=dynR*(0.88+sin(satSeed2+0.3)*0.04)+audioLevel*0.4+audioBass*0.45+audioPow*0.15;
    float o2=dynR*(0.85+sin(satSeed2+1.9)*0.04)+audioLevel*0.33+audioMid*0.35+audioPow*0.12;
    float o3=dynR*(0.82+sin(satSeed2+3.7)*0.04)+audioLevel*0.36+audioTreble*0.3+audioPow*0.1;
    float o4=dynR*(0.9 +sin(satSeed2+5.1)*0.04)+audioLevel*0.42+audioPow*0.18;
    float o5=dynR*(0.84+sin(satSeed2+2.3)*0.04)+audioLevel*0.42+audioBass*0.35+audioPow*0.15;
    float o6=dynR*(0.92+sin(satSeed2+4.4)*0.04)+audioLevel*0.45+audioTreble*0.25+audioPow*0.18;
    float o7=dynR*(0.86+sin(satSeed2+6.0)*0.04)+audioLevel*0.45+audioMid*0.3+audioPow*0.2;
    float o8=dynR*(0.94+sin(satSeed2+1.1)*0.04)+audioLevel*0.49+audioBass*0.35+audioPow*0.22;

    // Elevation angles — unique per blob, gives true 3D orbiting
    float e1=sin(iTime*0.13+satSeed2*1.7)*0.4;
    float e2=sin(iTime*0.17+satSeed2*2.3)*0.35;
    float e3=sin(iTime*0.11+satSeed2*0.9)*0.45;
    float e4=sin(iTime*0.19+satSeed2*1.4)*0.38;
    float e5=sin(iTime*0.15+satSeed2*2.8)*0.42;
    float e6=sin(iTime*0.21+satSeed2*1.1)*0.36;
    float e7=sin(iTime*0.09+satSeed2*1.9)*0.44;
    float e8=sin(iTime*0.23+satSeed2*0.7)*0.33;

    float a1=iTime*(0.3 +sin(satSeed2*0.5 )*0.06)*arousalScale;
    float a2=iTime*(-0.22+sin(satSeed2*0.43)*0.05)*arousalScale+2.094;
    float a3=iTime*(0.42 +sin(satSeed2*0.61)*0.07)*arousalScale+4.188;
    float a4=iTime*(-0.55+sin(satSeed2*0.37)*0.08)*arousalScale+1.047;
    float a5=iTime*(0.38 +sin(satSeed2*0.53)*0.06)*arousalScale+3.5;
    float a6=iTime*(-0.65+sin(satSeed2*0.47)*0.07)*arousalScale+5.5;
    float a7=iTime*(0.25 +sin(satSeed2*0.57)*0.05)*arousalScale+0.8;
    float a8=iTime*(-0.4 +sin(satSeed2*0.67)*0.06)*arousalScale+4.8;

    bp1=vec3(cos(a1)*cos(e1),sin(a1)*cos(e1),sin(e1))*o1;
    bp2=vec3(cos(a2)*cos(e2),sin(a2)*cos(e2),sin(e2))*o2;
    bp3=vec3(cos(a3)*cos(e3),sin(a3)*cos(e3),sin(e3))*o3;
    bp4=vec3(cos(a4)*cos(e4),sin(a4)*cos(e4),sin(e4))*o4;
    bp5=vec3(cos(a5)*cos(e5),sin(a5)*cos(e5),sin(e5))*o5;
    bp6=vec3(cos(a6)*cos(e6),sin(a6)*cos(e6),sin(e6))*o6;
    bp7=vec3(cos(a7)*cos(e7),sin(a7)*cos(e7),sin(e7))*o7;
    bp8=vec3(cos(a8)*cos(e8),sin(a8)*cos(e8),sin(e8))*o8;

    br1=(0.07 +audioBass*0.07+audioLevel*0.03+breathe*0.01)*vis1;
    br2=(0.055+audioMid *0.06+audioLevel*0.025+breathe*0.006)*vis2;
    br3=(0.04 +audioTreble*0.05+audioLevel*0.025)*vis3;
    br4=(0.025+audioLevel*0.06)*vis4;
    br5=(0.055*audioLevel+audioBass*0.05+audioPow*0.03)*vis5;
    br6=(0.04 *audioLevel+audioTreble*0.04+audioPow*0.025)*vis6;
    br7=(audioPow*0.06+audioLevel*0.03)*vis7;
    br8=(audioPow*0.05+audioBass*0.035)*vis8;
  }

  // ── Fast SDF for marching: sphere + edge noise + blobs, NO domain distortion
  // tPos2D only used as a placeholder signature; domain distortion excluded for speed.
  float marchSDF(vec3 p) {
    float dynR = getDynR();
    float lavaX = 1.0+gameMode*1.4;
    vec3 q = vec3(p.x/mix(1.0,lavaX,gameMode), p.y, p.z);
    float disp = edgeDisp(q);
    float mainD = length(q)-(dynR+disp);

    vec3 bp1,bp2,bp3,bp4,bp5,bp6,bp7,bp8;
    float br1,br2,br3,br4,br5,br6,br7,br8;
    float vis1,vis2,vis3,vis4,vis5,vis6,vis7,vis8;
    blobData(dynR,bp1,bp2,bp3,bp4,bp5,bp6,bp7,bp8,br1,br2,br3,br4,br5,br6,br7,br8,vis1,vis2,vis3,vis4,vis5,vis6,vis7,vis8);

    float k=0.11-audioLevel*0.03;
    float d=mainD;
    d=smin(d,length(p-bp1)-br1,k*mix(0.4,1.0,vis1));
    d=smin(d,length(p-bp2)-br2,k*0.85*mix(0.4,1.0,vis2));
    d=smin(d,length(p-bp3)-br3,k*0.7 *mix(0.4,1.0,vis3));
    d=smin(d,length(p-bp4)-br4,k*0.55*mix(0.4,1.0,vis4));
    d=smin(d,length(p-bp5)-br5,k*0.75*mix(0.4,1.0,vis5));
    d=smin(d,length(p-bp6)-br6,k*0.6 *mix(0.4,1.0,vis6));
    d=smin(d,length(p-bp7)-br7,k*0.65*mix(0.4,1.0,vis7));
    d=smin(d,length(p-bp8)-br8,k*0.5 *mix(0.4,1.0,vis8));

    // Game blobs
    float d_base=d; float gk=k*5.0;
    if(gb0.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb0),gk*min(gb0.w*3.0,1.0)));
    if(gb1.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb1),gk*min(gb1.w*3.0,1.0)));
    if(gb2.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb2),gk*min(gb2.w*3.0,1.0)));
    if(gb3.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb3),gk*min(gb3.w*3.0,1.0)));
    if(gb4.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb4),gk*min(gb4.w*3.0,1.0)));
    if(gb5.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb5),gk*min(gb5.w*3.0,1.0)));
    if(gb6.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb6),gk*min(gb6.w*3.0,1.0)));
    if(gb7.w>0.005)d=min(d,smin(d_base,gbSDF(q,gb7),gk*min(gb7.w*3.0,1.0)));
    float mk=k*0.85;
    if(gb0.w>0.005)d=smin(d,gbSDF(q,gb0),mk);
    if(gb1.w>0.005)d=smin(d,gbSDF(q,gb1),mk);
    if(gb2.w>0.005)d=smin(d,gbSDF(q,gb2),mk);
    if(gb3.w>0.005)d=smin(d,gbSDF(q,gb3),mk);
    if(gb4.w>0.005)d=smin(d,gbSDF(q,gb4),mk);
    if(gb5.w>0.005)d=smin(d,gbSDF(q,gb5),mk);
    if(gb6.w>0.005)d=smin(d,gbSDF(q,gb6),mk);
    if(gb7.w>0.005)d=smin(d,gbSDF(q,gb7),mk);
    return d;
  }

  // ── Full SDF: adds touch + audio domain distortion (used for normals) ──────
  float sceneSDF(vec3 p, vec2 tPos2D) {
    float dynR=getDynR();

    // Touch domain distortion
    float approxR=mix(0.05,0.8,emotionSize);
    float surfDist=length(tPos2D)-approxR;
    float onOrb=smoothstep(0.2,-0.05,surfDist);
    float tStr=touchStrength*onOrb;
    if(tStr>0.001){
      float tzSq=dynR*dynR-dot(tPos2D,tPos2D);
      vec3 tP3D=vec3(tPos2D,sqrt(max(0.0,tzSq)));
      vec3 tVec=p-tP3D;
      float tDist=length(tVec);
      vec3 tDir=(tDist>0.001)?tVec/tDist:vec3(0.0,0.0,1.0);
      float fDist=max(tDist-touchSpread,0.0);
      p-=tDir*tStr*0.06*exp(-fDist*fDist*16.0);
      p+=tDir*max(tStr-0.2,0.0)*0.18*exp(-fDist*fDist*10.0);
      p+=tDir*tStr*0.016*sin(tDist*18.0-iTime*4.5)*exp(-fDist*4.5);
      float turb=tStr*0.022*exp(-fDist*fDist*12.0);
      p.x+=turb*snoise3(vec3(p.xy*3.0,iTime*2.0));
      p.y+=turb*snoise3(vec3(p.xy*3.0+50.0,iTime*2.0));
      vec2 tVel2=vec2(touchVelX,touchVelY);
      float velMag=length(tVel2);
      vec2 velN=tVel2/(velMag+0.001);
      float wake=min(velMag*0.4,1.0)*tStr*0.12*exp(-fDist*3.5);
      p.xy+=velN*wake*(0.3+0.7*max(dot(tDir.xy,velN),0.0));
    }

    // Audio domain distortion
    float bD=audioBass*0.07;
    p.x+=bD*snoise3(vec3(p.xy*0.7,iTime*0.35));
    p.y+=bD*snoise3(vec3(p.xy*0.7+10.0,iTime*0.4));
    float mD=audioMid*0.04;
    p.x+=mD*snoise3(vec3(p.xy*1.5,iTime*0.8));
    p.y+=mD*snoise3(vec3(p.xy*1.5+10.0,iTime*0.9));
    float tD=audioTreble*0.025;
    p.x+=tD*sin(p.y*14.0+iTime*4.0);
    p.y+=tD*cos(p.x*14.0+iTime*4.0);

    return marchSDF(p);
  }

  // ── Normal via SDF gradient (uses full sceneSDF for accuracy) ─────────────
  vec3 calcNormal(vec3 p, vec2 tPos2D) {
    const float e=0.002;
    return normalize(vec3(
      sceneSDF(p+vec3(e,0,0),tPos2D)-sceneSDF(p-vec3(e,0,0),tPos2D),
      sceneSDF(p+vec3(0,e,0),tPos2D)-sceneSDF(p-vec3(0,e,0),tPos2D),
      sceneSDF(p+vec3(0,0,e),tPos2D)-sceneSDF(p-vec3(0,0,e),tPos2D)
    ));
  }

  // ── Bounding sphere intersection ──────────────────────────────────────────
  vec2 boundSphere(vec3 ro, vec3 rd, float r) {
    float b=dot(ro,rd); float c=dot(ro,ro)-r*r;
    float h=b*b-c;
    if(h<0.0)return vec2(1.0,-1.0);
    h=sqrt(h);
    return vec2(-b-h,-b+h);
  }

  // ── Shading (port of draw(), using 3D hit position) ───────────────────────
  vec4 shade(vec3 p, vec3 n, vec3 rd) {
    float dynR=getDynR();
    float rainbowSpin=iTime*80.0;

    // Emotion color computation (unchanged)
    vec3 warmTint=vec3(1.0,0.9,0.6);
    vec3 coldTint=vec3(0.5,0.55,0.85);
    vec3 baseTint=emotionValence>0.0
      ?mix(vec3(1.0),warmTint,emotionValence*0.4)
      :mix(vec3(1.0),coldTint,-emotionValence*0.5);
    float normalHue=hue+emotionHue+emotionValence*40.0;
    float spread=emotionColorSpread;
    float drift1=snoise3(vec3(0.0,0.0,iTime*0.067))*spread;
    float drift2=snoise3(vec3(5.0,0.0,iTime*0.053))*spread;
    float drift3=snoise3(vec3(0.0,5.0,iTime*0.041))*spread;
    float satBreath=1.0+snoise3(vec3(3.0,3.0,iTime*0.09))*0.08;
    float liveSat=emotionSaturation*satBreath;
    vec3 c1n=applySaturation(adjustHue(baseColor1,normalHue+drift1+audioBass*130.0)*baseTint,liveSat);
    vec3 c2n=applySaturation(adjustHue(baseColor2,normalHue+drift2-audioTreble*100.0)*baseTint,liveSat);
    vec3 c3n=applySaturation(adjustHue(baseColor3,normalHue+drift3+audioMid*70.0)*baseTint,liveSat);
    vec3 c1r=applySaturation(adjustHue(baseColor1,rainbowSpin+audioBass*130.0),1.3);
    vec3 c2r=applySaturation(adjustHue(baseColor2,rainbowSpin+120.0-audioTreble*100.0),1.3);
    vec3 c3r=applySaturation(adjustHue(baseColor3,rainbowSpin+240.0+audioMid*70.0),1.3);
    vec3 color1=mix(c1n,c1r,euphoric);
    vec3 color2=mix(c2n,c2r,euphoric);
    vec3 color3=mix(c3n,c3r,euphoric);

    // Trick color override
    if(trickActive>0.01){
      float tLen=length(p.xy);
      float tAng=atan(p.y,p.x);
      vec3 trickCol;
      if(trickType<0.5){
        vec3 tA=vec3(1.0,0.29,0.14);vec3 tB=vec3(1.0,0.41,0.76);
        trickCol=mix(tA,tB,clamp(tLen*1.5+sin(iTime*0.7)*0.14,0.0,1.0));
      } else if(trickType<1.5){
        vec3 tA=vec3(0.72,0.93,1.0);vec3 tB=vec3(0.04,0.20,0.82);
        trickCol=mix(tA,tB,clamp(p.x*1.0+0.5,0.0,1.0));
      } else if(trickType<2.5){
        vec3 tA=vec3(0.16,1.0,0.14);vec3 tB=vec3(0.98,1.0,0.0);
        trickCol=mix(tA,tB,clamp(tLen*1.3+sin(tAng*1.5+iTime*0.4)*0.22,0.0,1.0));
      } else if(trickType<3.5){
        vec3 tA=vec3(0.90,0.04,0.16);vec3 tB=vec3(1.0,0.62,0.0);
        trickCol=mix(tA,tB,clamp(-p.y*1.1+0.5,0.0,1.0));
      } else {
        vec3 tA=vec3(0.02,0.10,0.56);vec3 tB=vec3(0.28,1.0,0.87);
        trickCol=mix(tA,tB,clamp(sin(length(p.xy)*3.2-iTime*2.8)*0.5+0.5,0.0,1.0));
      }
      float tBlend=trickActive*0.78;
      color1=mix(color1,trickCol,tBlend);
      color2=mix(color2,trickCol*0.82,tBlend);
      color3=mix(color3,trickCol*1.18,tBlend);
    }

    // Use p.xy as effective 2D UV for all color/angular effects
    vec2 uv=p.xy;
    float ang=atan(uv.y,uv.x);
    float len=length(uv);
    float normLen=clamp(len/max(dynR,0.01),0.0,1.0);

    // 3D lighting — real surface normal from SDF gradient
    float lightAngle=iTime*0.25;
    vec3 lightDir=normalize(vec3(0.4*cos(lightAngle),0.3*sin(lightAngle*0.6),1.0));
    float diffuse=max(dot(n,lightDir),0.0);
    vec3 viewDir=-rd;
    vec3 halfDir=normalize(lightDir+viewDir);
    float specExp=35.0-audioBass*15.0+audioTreble*20.0;
    float spec=pow(max(dot(n,halfDir),0.0),specExp)*(0.5+audioLevel*1.0+audioTreble*0.8);
    // Real Fresnel from view angle
    float NdotV=max(dot(n,viewDir),0.0);
    float fresnel=pow(1.0-NdotV,2.5-audioTreble*0.8);

    // Interior texture noise
    float arousalScale=0.3+emotionArousal*1.4;
    float noiseSpeed=(0.4+audioLevel*0.8)*arousalScale;
    float n0=snoise3(vec3(uv*(0.6+audioLevel*0.3),iTime*noiseSpeed))*0.5+0.5;
    float iN1=snoise3(vec3(uv*1.0,iTime*0.4*arousalScale))*0.5+0.5;
    float iN2=snoise3(vec3(uv*0.5+7.0,iTime*0.2*arousalScale))*0.5+0.5;
    float nTreble=snoise3(vec3(uv*2.0,iTime*1.0))*audioTreble*0.08;

    float cl=cos(ang+iTime*1.5+audioBass*5.0)*0.5+0.5;
    float cl2=cos(ang*2.0-iTime*0.5+1.4)*0.5+0.5;
    vec3 colBase=mixOklab(color1,color2,clamp(cl+audioTreble*0.3-audioBass*0.2,0.0,1.0));
    colBase=mixOklab(colBase,color3*1.6,cl2*0.13);

    float cloudN=snoise3(vec3(uv*0.4+2.3,iTime*0.045*arousalScale))*0.5+0.5;
    vec3 coreColor=mixOklab(mixOklab(color3*1.5,color1*0.85,cloudN*0.55),colBase,mix(iN1,iN2,0.4));
    vec3 surfColor=mixOklab(colBase,color1+color2*0.3,n0*0.5);
    float midBand=smoothstep(0.15,0.55,normLen)*(1.0-smoothstep(0.45,0.9,normLen));
    vec3 sphereCol=mixOklab(coreColor,surfColor,normLen*normLen);
    sphereCol=mixOklab(sphereCol,color2*0.75,midBand*0.2);

    // Combine lighting with color
    vec3 col=sphereCol*0.3
           + sphereCol*diffuse*0.7
           + colBase*spec*0.45
           + colBase*fresnel*(0.3+audioLevel*0.4);

    col+=color2*max(dot(n,-lightDir),0.0)*0.12;
    col+=nTreble*colBase;

    // Moving point lights (unchanged logic, using p.xy as 2D coords)
    col+=color2*light2(0.6+audioBass*0.8,25.0,distance(uv,vec2(cos(iTime*-0.7),sin(iTime*-0.7))*dynR*0.6));
    col+=color1*light2(0.4+audioTreble*0.6,30.0,distance(uv,vec2(cos(iTime*0.45+2.094),sin(iTime*0.45+2.094))*dynR*0.4))*(0.3+audioTreble*0.7);

    // Satellite blob color highlights (3D distance)
    vec3 bp1,bp2,bp3,bp4,bp5,bp6,bp7,bp8;
    float br1,br2,br3,br4,br5,br6,br7,br8;
    float vis1,vis2,vis3,vis4,vis5,vis6,vis7,vis8;
    blobData(dynR,bp1,bp2,bp3,bp4,bp5,bp6,bp7,bp8,br1,br2,br3,br4,br5,br6,br7,br8,vis1,vis2,vis3,vis4,vis5,vis6,vis7,vis8);

    float bh1=max(1.0-length(p-bp1)/(br1*2.5+0.01),0.0);bh1*=bh1;
    col+=mix(colBase,adjustHue(baseColor1,rainbowSpin+0.0),  euphoric)*bh1*0.3;
    float bh2=max(1.0-length(p-bp2)/(br2*2.5+0.01),0.0);bh2*=bh2;
    col+=mix(color2, adjustHue(baseColor1,rainbowSpin+45.0), euphoric)*bh2*0.25;
    float bh3=max(1.0-length(p-bp3)/(br3*2.5+0.01),0.0);bh3*=bh3;
    col+=mix(color1, adjustHue(baseColor1,rainbowSpin+90.0), euphoric)*bh3*0.2;
    float bh5=max(1.0-length(p-bp5)/(br5*2.5+0.01),0.0);bh5*=bh5;
    col+=mix(color2, adjustHue(baseColor1,rainbowSpin+135.0),euphoric)*bh5*0.3;
    float bh6=max(1.0-length(p-bp6)/(br6*2.5+0.01),0.0);bh6*=bh6;
    col+=mix(colBase,adjustHue(baseColor1,rainbowSpin+180.0),euphoric)*bh6*0.25;
    float bh7=max(1.0-length(p-bp7)/(br7*2.5+0.01),0.0);bh7*=bh7;
    col+=mix(color1, adjustHue(baseColor1,rainbowSpin+225.0),euphoric)*bh7*0.3;
    float bh8=max(1.0-length(p-bp8)/(br8*2.5+0.01),0.0);bh8*=bh8;
    col+=mix(color2, adjustHue(baseColor1,rainbowSpin+270.0),euphoric)*bh8*0.25;

    // Calm ring fade
    float ringFade=smoothstep(dynR*0.6,dynR*0.93,len);
    col*=mix(1.0,ringFade,calm);

    col=clamp(col,0.0,1.0);

    // Rim glow (based on grazing angle — silhouette brightening)
    float rimFactor=pow(1.0-NdotV,3.0);
    col+=colBase*rimFactor*(0.22+calm*0.2);

    // Calm glow halo
    float calmGlow=0.12*calm*smoothstep(dynR+0.15,dynR,len)*ringFade;
    col+=colBase*calmGlow;

    // Euphoric fireflies (2D positions in XY plane)
    if(euphoric>0.01){
      vec3 sparkCol=vec3(0.0);
      float eR=mix(0.05,0.8,mix(emotionSize,0.86,euphoric));
      for(int si=0;si<8;si++){
        float fi=float(si);
        float speed=sin(fi*2.399)*0.42;
        float phase=fi*2.399+fi*fi*0.1618;
        float sAng=iTime*speed+phase;
        float rB=eR*(1.06+sin(fi*1.618)*0.04);
        float rD=sin(iTime*0.13+fi*4.1)*sin(iTime*0.21+fi*2.7)*0.035;
        vec2 sPos=vec2(cos(sAng),sin(sAng))*(rB+rD);
        sPos.x+=sin(iTime*0.11+fi*1.7)*cos(iTime*0.17+fi*3.1)*0.018;
        sPos.y+=sin(iTime*0.14+fi*3.3)*cos(iTime*0.19+fi*2.1)*0.018;
        float tw1=sin(iTime*(2.3+sin(fi*1.1)*1.8)+fi*1.9)*0.5+0.5;
        float tw2=sin(iTime*(5.7+cos(fi*0.9)*2.3)+fi*4.3)*0.5+0.5;
        float twinkle=tw1*tw2;
        float sz=0.013+sin(fi*2.0+1.0)*0.006;
        float sDist=length(uv-sPos);
        float sg=smoothstep(sz,0.0,sDist)*twinkle;
        float sgGlow=smoothstep(sz*3.0,0.0,sDist)*twinkle*0.22;
        vec3 sH=applySaturation(adjustHue(baseColor1,rainbowSpin*0.85+fi*43.7),1.4);
        sparkCol+=sH*(sg*2.2+sgGlow);
      }
      col+=sparkCol*euphoric;
      col*=mix(1.0,1.18+sin(iTime*2.8)*0.07,euphoric);
    }

    // Happy shimmer
    float happyV=max(emotionValence,0.0);
    if(happyV>0.01){
      float shimmer=sin(ang*7.0+iTime*3.2)*sin(len*16.0-iTime*1.8)
                  + sin(ang*11.0-iTime*2.4)*sin(len*12.0+iTime*1.5);
      float shimmerMask=smoothstep(dynR*0.5,dynR*0.9,len);
      col+=colBase*shimmer*0.022*happyV*shimmerMask;
    }

    col*=1.0+joyPulse*0.09;

    // Warm flush sweep
    if(warmPulse>0.001){
      float sweepT=1.0-warmPulse;
      float sweepAngle=hue*0.01745;
      vec2 sweepDir=vec2(cos(sweepAngle),sin(sweepAngle));
      float axis=dot(uv,sweepDir);
      float nDisp=snoise3(vec3(uv*1.4,iTime*0.07))*0.22
                + snoise3(vec3(uv*3.0+5.0,iTime*0.12))*0.09;
      float front=mix(-dynR*1.2,dynR*1.2,sweepT);
      float bandW=dynR*0.8;
      float wave=exp(-((axis+nDisp-front)*(axis+nDisp-front))/(bandW*bandW));
      col*=mix(vec3(1.0),vec3(1.55,0.52,0.48),wave*warmPulse*0.7);
    }

    return extractAlpha(col);
  }

  // ── Main: camera setup + raymarching ──────────────────────────────────────
  void main() {
    // Screen UV (centered, aspect-corrected) — same coordinate space as original 2D shader
    vec2 center=iResolution.xy*0.5;
    float size=min(iResolution.x,iResolution.y);
    vec2 uv=(vUv*iResolution.xy-center)/size*2.0;

    // Apply drift offset
    uv+=vec2(randomOffsetX,randomOffsetY);

    // Game mode Y shift+scale (same as original mainImage)
    uv.y+=gameMode*1.4;
    uv.y*=1.0+gameMode*1.1;

    // Rotation
    float sr=sin(rot); float cr=cos(rot);
    uv=vec2(cr*uv.x-sr*uv.y, sr*uv.x+cr*uv.y);

    // Touch position: same transforms as UV
    vec2 tPos2D=vec2(touchPosX,touchPosY)+vec2(randomOffsetX,randomOffsetY);
    tPos2D.y+=gameMode*1.4;
    tPos2D.y*=1.0+gameMode*1.1;
    tPos2D=vec2(cr*tPos2D.x-sr*tPos2D.y, sr*tPos2D.x+cr*tPos2D.y);

    // Perspective camera at (0,0,camDist) looking toward origin.
    // focalLength = camDist gives 1:1 UV-to-world mapping at the z=0 plane,
    // so p.xy at the sphere surface matches the original 2D uv values exactly.
    vec3 ro=vec3(0.0,0.0,camDist);
    vec3 rd=normalize(vec3(uv,-camDist));

    float dynR=getDynR();
    float maxR=dynR*2.0+0.45;
    vec2 bound=boundSphere(ro,rd,maxR);

    vec3 finalCol=vec3(0.0);
    float finalAlpha=0.0;

    if(bound.x<=bound.y){
      float t=max(bound.x,0.001);
      float minD=maxR;
      bool hit=false;

      // Sphere-trace using fast SDF (no domain distortion for speed)
      for(int i=0;i<40;i++){
        vec3 pp=ro+rd*t;
        float d=marchSDF(pp);
        if(d<minD) minD=d;
        if(d<0.0008){ hit=true; break; }
        t+=max(d*0.78,0.0008);
        if(t>bound.y+0.25) break;
      }

      if(hit){
        vec3 hitP=ro+rd*t;
        // Compute normal using full SDF (includes domain distortion)
        vec3 norm=calcNormal(hitP,tPos2D);
        vec4 col=shade(hitP,norm,rd);
        finalCol=col.rgb;
        finalAlpha=col.a;
      }

      // Outer glow halo for near-misses (and around the silhouette)
      if(minD<0.25){
        float glowFade=exp(-max(minD,0.0)*5.0)*(1.0-finalAlpha);
        float normalHue_=hue+emotionHue+emotionValence*40.0;
        float drift1_=snoise3(vec3(0.0,0.0,iTime*0.067))*emotionColorSpread;
        vec3 glowColor=applySaturation(adjustHue(baseColor1,normalHue_+drift1_+audioBass*130.0),emotionSaturation);
        vec3 warmTint_=vec3(1.0,0.9,0.6);vec3 coldTint_=vec3(0.5,0.55,0.85);
        vec3 baseTint_=emotionValence>0.0?mix(vec3(1.0),warmTint_,emotionValence*0.4):mix(vec3(1.0),coldTint_,-emotionValence*0.5);
        glowColor*=baseTint_;
        float glowAmt=(0.07+audioLevel*0.2)*glowFade;
        finalCol+=glowColor*glowAmt;
        finalAlpha=max(finalAlpha,glowAmt*0.3);
      }
    }

    finalAlpha*=emotionOpacity;
    gl_FragColor=vec4(finalCol*finalAlpha,finalAlpha);
  }
`;

const driftLayers = Array.from({ length: 5 }, () => ({
  fx: (0.05 + Math.random() * 0.15) * (Math.random() > 0.5 ? PHI : 1 / PHI),
  fy: (0.05 + Math.random() * 0.15) * (Math.random() > 0.5 ? PHI : 1 / PHI),
  px: Math.random() * Math.PI * 2,
  py: Math.random() * Math.PI * 2,
  ax: 0.005 + Math.random() * 0.02,
  ay: 0.005 + Math.random() * 0.02,
}));

const huePhase = Math.random() * Math.PI * 2;

export interface GameBlobInfo {
  x: number;
  y: number;
  r: number;
  scale: number;
}

interface OrbProps {
  micStream?: MediaStream | null;
  emotionUniforms?: EmotionUniforms;
  onAudioLevel?: (level: number) => void;
  euphoric?: boolean;
  warmPulseTrigger?: number;
  trickTrigger?: number;
  trickIndex?: number;
  soundManager?: SoundManager | null;
  gameMode?: boolean;
  gameBlobsRef?: RefObject<GameBlobInfo[]>;
  gameSurfaceYRef?: React.MutableRefObject<number>;
}

export default function Orb({ micStream, emotionUniforms, onAudioLevel, euphoric, warmPulseTrigger, trickTrigger, trickIndex, soundManager, gameMode, gameBlobsRef, gameSurfaceYRef }: OrbProps) {
  const ctnDom = useRef<HTMLDivElement>(null);
  const emotionRef = useRef(emotionUniforms);
  const onAudioLevelRef = useRef(onAudioLevel);
  const euphoricRef = useRef(euphoric ?? false);
  const warmPulseTriggerRef = useRef(warmPulseTrigger ?? 0);
  const trickTriggerRef = useRef(trickTrigger ?? 0);
  const trickIndexRef = useRef(trickIndex ?? 0);
  const soundManagerRef = useRef(soundManager ?? null);
  const gameModeRef = useRef(gameMode ?? false);

  emotionRef.current = emotionUniforms;
  onAudioLevelRef.current = onAudioLevel;
  euphoricRef.current = euphoric ?? false;
  warmPulseTriggerRef.current = warmPulseTrigger ?? 0;
  trickTriggerRef.current = trickTrigger ?? 0;
  trickIndexRef.current = trickIndex ?? 0;
  soundManagerRef.current = soundManager ?? null;
  gameModeRef.current = gameMode ?? false;

  useEffect(() => {
    const container = ctnDom.current;
    if (!container) return;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vert,
      fragment: frag,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Vec3(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
        hue: { value: 0 },
        audioLevel: { value: 0 },
        audioBass: { value: 0 },
        audioMid: { value: 0 },
        audioTreble: { value: 0 },
        audioTransient: { value: 0 },
        randomOffsetX: { value: 0 },
        randomOffsetY: { value: 0 },
        breathe: { value: 0 },
        calm: { value: 1 },
        rot: { value: 0 },
        emotionValence: { value: 0 },
        emotionArousal: { value: 0.3 },
        emotionSize: { value: 0.55 },
        emotionHue: { value: 0 },
        emotionSaturation: { value: 0.6 },
        emotionOpacity: { value: 1.0 },
        emotionColorSpread: { value: 15 },
        touchPosX: { value: 0 },
        touchPosY: { value: 0 },
        touchStrength: { value: 0 },
        touchVelX: { value: 0 },
        touchVelY: { value: 0 },
        touchSpread: { value: 0 },
        euphoric: { value: 0 },
        joyPulse: { value: 0 },
        warmPulse: { value: 0 },
        trickActive: { value: 0 },
        trickPhase: { value: 0 },
        trickType: { value: 0 },
        gameMode: { value: 0 },
        satSeed: { value: 0 },
        satSeed2: { value: 0 },
        gb0: { value: new Float32Array(4) },
        gb1: { value: new Float32Array(4) },
        gb2: { value: new Float32Array(4) },
        gb3: { value: new Float32Array(4) },
        gb4: { value: new Float32Array(4) },
        gb5: { value: new Float32Array(4) },
        gb6: { value: new Float32Array(4) },
        gb7: { value: new Float32Array(4) },
        camDist: { value: 2.5 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    // Canvas center in viewport y (0=bottom,1=top). Updated on resize to account
    // for the orb-shift CSS translateY on mobile, which moves the canvas up by 10vh.
    let canvasCenterVY = 0.5;
    let canvasBottomVY = 0.0;
    function updateCanvasMetrics() {
      const rect = (gl.canvas as HTMLCanvasElement).getBoundingClientRect();
      canvasCenterVY = 1 - (rect.top + rect.height * 0.5) / window.innerHeight;
      canvasBottomVY = 1 - rect.bottom / window.innerHeight;
    }

    function resize() {
      if (!container) return;
      // Cap at 2× — DPR=3 triples pixel count (9× area) for minimal quality gain.
      // This cuts shader work by ~55% on modern iPhones with no visible difference.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w * dpr, h * dpr);
      gl.canvas.style.width = w + 'px';
      gl.canvas.style.height = h + 'px';
      program.uniforms.iResolution.value.set(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
      updateCanvasMetrics();
    }
    window.addEventListener('resize', resize);
    resize();

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;

    const isMobile = navigator.maxTouchPoints > 0;

    const initAudio = (stream: MediaStream) => {
      try {
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.78;
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        // On mobile, the mic permission grant is a user gesture — attempt to
        // resume immediately so VAD works before the first tap on the orb.
        if (isMobile && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      } catch {
        // runs fine without mic
      }
    };

    if (micStream) initAudio(micStream);

    const resumeAudio = () => {
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };
    window.addEventListener('click', resumeAudio, { once: true });
    window.addEventListener('touchstart', resumeAudio, { once: true });

    let rawTouchX = 0, rawTouchY = 0;
    let rawTouchStr = 0;
    let rawTouchSpread = 0;
    let rawVelX = 0, rawVelY = 0;
    let prevPtrX = 0, prevPtrY = 0;
    let prevPtrTime = 0;
    let ptrDown = false;
    let ptrOver = false;

    function ptrToUV(clientX: number, clientY: number): [number, number] {
      const rect = (gl.canvas as HTMLCanvasElement).getBoundingClientRect();
      const normX = (clientX - rect.left) / rect.width;
      const normY = (clientY - rect.top) / rect.height;
      const w = gl.canvas.width;
      const h = gl.canvas.height;
      const size = Math.min(w, h);
      return [
        (normX * w - w * 0.5) / size * 2,
        ((1 - normY) * h - h * 0.5) / size * 2,
      ];
    }

    function trackVel(uvX: number, uvY: number) {
      const now = performance.now();
      const elapsed = (now - prevPtrTime) * 0.001;
      if (elapsed > 0.008 && elapsed < 0.15 && prevPtrTime > 0) {
        let vx = (uvX - prevPtrX) / elapsed;
        let vy = (uvY - prevPtrY) / elapsed;
        const mag = Math.sqrt(vx * vx + vy * vy);
        const maxVel = 2.5;
        if (mag > maxVel) { vx = vx / mag * maxVel; vy = vy / mag * maxVel; }
        rawVelX = vx;
        rawVelY = vy;
      }
      prevPtrX = uvX;
      prevPtrY = uvY;
      prevPtrTime = now;
    }

    const onMouseMove = (e: MouseEvent) => {
      rawTouchSpread = 0;
      const [x, y] = ptrToUV(e.clientX, e.clientY);
      rawTouchX = x; rawTouchY = y;
      trackVel(x, y);
      ptrOver = true;
      if (!ptrDown) rawTouchStr = 0.35;
    };
    const onMouseEnter = () => { ptrOver = true; };
    const onMouseLeave = () => {
      ptrOver = false;
      if (!ptrDown) { rawTouchStr = 0; rawVelX = 0; rawVelY = 0; }
    };
    const onMouseDown = (e: MouseEvent) => {
      ptrDown = true;
      rawTouchStr = 1.0;
      const [x, y] = ptrToUV(e.clientX, e.clientY);
      rawTouchX = x; rawTouchY = y;
      trackVel(x, y);
    };
    const onMouseUp = () => {
      ptrDown = false;
      rawTouchStr = ptrOver ? 0.35 : 0;
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      // Ensure the mic AudioContext is running — iOS may reject the initial
      // resume() call; this tap is always a valid gesture to retry from.
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
      rawTouchSpread = 0.08;
      const t = e.touches[0];
      const [x, y] = ptrToUV(t.clientX, t.clientY);
      rawTouchX = x; rawTouchY = y;
      ptrDown = true;
      rawTouchStr = 1.0;
      prevPtrX = x; prevPtrY = y;
      prevPtrTime = performance.now();
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      const [x, y] = ptrToUV(t.clientX, t.clientY);
      rawTouchX = x; rawTouchY = y;
      rawTouchStr = 1.0;
      trackVel(x, y);
    };
    const onTouchEnd = () => {
      ptrDown = false;
      rawTouchStr = 0;
      rawVelX = 0; rawVelY = 0;
      sVelX = 0; sVelY = 0;
      prevPtrTime = 0;
    };

    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    let smoothLevel = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothTreble = 0;
    let fastLevel = 0;
    let smoothTransient = 0;
    let smoothOx = 0;
    let smoothOy = 0;
    let orbVx = 0;
    let orbVy = 0;
    let smoothHue = 0;
    let smoothCalm = 1;
    let smoothRot = 0;
    let lastTime = 0;

    let smoothEmValence = 0;
    let smoothEmArousal = 0.3;
    let smoothEmSize = 0.55;
    let smoothSizeTarget = 0.55;
    let smoothEmHue = 0;
    let smoothEmSat = 0.6;
    let smoothEmColorSpread = 15;
    let smoothEmOpacity = 1.0;
    let smoothOpacityTarget = 1.0;
    let smoothEuphoric = 0;

    let joyPulseRaw = 0;
    let smoothJoyPulse = 0;
    let prevTargetValence = 0;

    let warmPulseRaw = 0;
    let smoothWarmPulse = 0;
    let prevWarmTrigger = warmPulseTriggerRef.current;

    let smoothGameMode = 0;

    let trickActiveRaw = 0;
    let smoothTrickActive = 0;
    let trickPhaseVal = 0;
    let trickStartTime = 0;
    let trickCurrentType = 0;
    let prevTrickTrigger = trickTriggerRef.current;
    const TRICK_DURATIONS = [3.2, 2.8, 4.0, 3.0, 3.2];

    // Per-trick movement mods (smoothed)
    let trickSizeMod = 0, trickSizeModSmooth = 0;
    let trickArousalMod = 0, trickArousalModSmooth = 0;
    let trickBreatheMod = 0, trickBreatheModSmooth = 0;
    let trickOxMod = 0, trickOxModSmooth = 0;
    let trickOyMod = 0, trickOyModSmooth = 0;
    let trickRotMod = 0, trickRotModSmooth = 0;
    // Fake audio injected per-trick — these drive edge noise, blob scatter, and calm suppression
    let trickFakeLevelSmooth = 0;
    let trickFakeBassSmooth = 0;
    let trickFakeMidSmooth = 0;
    let trickFakeTrebleSmooth = 0;

    let smoothSoundLevel = 0;
    let smoothSoundBass = 0;
    let smoothSoundMid = 0;
    let smoothSoundTreble = 0;

    let sTouchX = 0, sTouchY = 0;
    let sTouchStr = 0;
    let sVelX = 0, sVelY = 0;

    let rafId: number;

    const update = (t: number) => {
      rafId = requestAnimationFrame(update);
      const dt = Math.min((t - lastTime) * 0.001, 0.1);
      lastTime = t;
      const time = t * 0.001;

      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        const len = dataArray.length;
        const bassEnd = Math.floor(len * 0.12);
        const midEnd = Math.floor(len * 0.45);

        let total = 0, bass = 0, mid = 0, treble = 0;
        for (let i = 0; i < len; i++) {
          const v = dataArray[i] / 255;
          total += v;
          if (i < bassEnd) bass += v;
          else if (i < midEnd) mid += v;
          else treble += v;
        }

        const rawLevel = total / len;
        const rawBass = bass / bassEnd;
        const rawMid = mid / (midEnd - bassEnd);
        const rawTreble = treble / (len - midEnd);

        const levelAtk = 1 - Math.exp(-7 * dt);
        const levelDec = 1 - Math.exp(-2.5 * dt);
        smoothLevel += (rawLevel - smoothLevel) * (rawLevel > smoothLevel ? levelAtk : levelDec);

        const bassAtk = 1 - Math.exp(-5 * dt);
        const bassDec = 1 - Math.exp(-1.4 * dt);
        smoothBass += (rawBass - smoothBass) * (rawBass > smoothBass ? bassAtk : bassDec);

        const midAtk = 1 - Math.exp(-7 * dt);
        const midDec = 1 - Math.exp(-2.8 * dt);
        smoothMid += (rawMid - smoothMid) * (rawMid > smoothMid ? midAtk : midDec);

        const trebAtk = 1 - Math.exp(-12 * dt);
        const trebDec = 1 - Math.exp(-5 * dt);
        smoothTreble += (rawTreble - smoothTreble) * (rawTreble > smoothTreble ? trebAtk : trebDec);

        const fastAtk = 1 - Math.exp(-18 * dt);
        const fastDec = 1 - Math.exp(-8 * dt);
        fastLevel += (rawLevel - fastLevel) * (rawLevel > fastLevel ? fastAtk : fastDec);
      }

      const rawTransient = Math.min(1.0, Math.max(0, (fastLevel - smoothLevel) * 2.0));
      const transAtk = 1 - Math.exp(-12 * dt);
      const transDec = 1 - Math.exp(-3 * dt);
      smoothTransient += (rawTransient - smoothTransient) * (rawTransient > smoothTransient ? transAtk : transDec);

      onAudioLevelRef.current?.(smoothLevel);
      soundManagerRef.current?.feedMicLevel(smoothLevel, dt);

      const soundFreq = soundManagerRef.current?.getFrequencyData();
      if (soundFreq) {
        const sAtk = 1 - Math.exp(-14 * dt);
        const sDec = 1 - Math.exp(-3.5 * dt);
        smoothSoundLevel  += (soundFreq.level  - smoothSoundLevel)  * (soundFreq.level  > smoothSoundLevel  ? sAtk : sDec);
        smoothSoundBass   += (soundFreq.bass   - smoothSoundBass)   * (soundFreq.bass   > smoothSoundBass   ? sAtk : sDec);
        smoothSoundMid    += (soundFreq.mid    - smoothSoundMid)    * (soundFreq.mid    > smoothSoundMid    ? sAtk : sDec);
        smoothSoundTreble += (soundFreq.treble - smoothSoundTreble) * (soundFreq.treble > smoothSoundTreble ? sAtk : sDec);
      }

      const vizLevel  = Math.min(1.0, smoothLevel  + smoothSoundLevel  * 1.6);
      const vizBass   = Math.min(1.0, smoothBass   + smoothSoundBass   * 1.4);
      const vizMid    = Math.min(1.0, smoothMid    + smoothSoundMid    * 1.2);
      const vizTreble = Math.min(1.0, smoothTreble + smoothSoundTreble * 0.9);

      program.uniforms.iTime.value = time;
      program.uniforms.audioLevel.value = vizLevel;
      program.uniforms.audioBass.value = vizBass;
      program.uniforms.audioMid.value = vizMid;
      program.uniforms.audioTreble.value = vizTreble;
      program.uniforms.audioTransient.value = smoothTransient;

      // Vitality: scales all motion with current size so a tiny orb barely stirs
      const lifeScale = Math.max(0.04, 0.08 + smoothEmSize * 1.1);

      let ox = 0, oy = 0;
      const arousal = emotionRef.current?.arousal ?? 0.3;
      const cheeky = Math.max(0, smoothEmValence);
      const chill = Math.max(0, -smoothEmValence);

      const driftMult = (0.5 + arousal * 1.5 + cheeky * 0.6) * lifeScale;
      for (const l of driftLayers) {
        ox += Math.sin(time * l.fx * driftMult + l.px) * l.ax * lifeScale;
        oy += Math.sin(time * l.fy * driftMult + l.py) * l.ay * lifeScale;
      }
      ox += vizBass * Math.sin(time * 2.5) * 0.04 * lifeScale;
      oy += vizBass * Math.cos(time * 1.9) * 0.04 * lifeScale;
      ox += vizMid * Math.sin(time * 3.3) * 0.02 * lifeScale;
      oy += vizTreble * Math.sin(time * 4.1) * 0.012 * lifeScale;

      ox += Math.sin(time * 1.7 + Math.sin(time * 0.7) * 2.0) * cheeky * 0.018 * lifeScale;
      oy += Math.sin(time * 2.1 + Math.cos(time * 0.9) * 1.8) * cheeky * 0.02 * lifeScale;
      oy += Math.abs(Math.sin(time * 1.3)) * cheeky * 0.01 * lifeScale;

      // Gentle figure-8 sway when happy -- traces a slow lemniscate
      const swayT = time * 0.28;
      ox += Math.sin(swayT) * cheeky * 0.007 * lifeScale;
      oy += Math.sin(swayT * 2.0) * cheeky * 0.005 * lifeScale;

      // Brief upward lift from joy pulse
      oy -= smoothJoyPulse * 0.01 * lifeScale;

      // Warm keyword reaction — gentle sway toward the sweep direction + soft lift
      if (smoothWarmPulse > 0.001) {
        const sweepAng = smoothHue * 0.01745;
        ox += Math.cos(sweepAng) * smoothWarmPulse * 0.025 * lifeScale;
        oy += Math.sin(sweepAng) * smoothWarmPulse * 0.025 * lifeScale;
        oy -= smoothWarmPulse * 0.012 * lifeScale;
      }

      const driftDamp = 1 - chill * 0.45;
      ox *= driftDamp;
      oy *= driftDamp;

      // Viewport containment: compute the orb's max visual radius, then clamp the
      // drift target so nothing can leave the screen.  The UV coordinate system maps
      // the short axis to [-1, 1] and the long axis to [-aspect, aspect].
      const canvasW = gl.canvas.width;
      const canvasH = gl.canvas.height;
      const minDim = Math.min(canvasW, canvasH);
      const xBound = canvasW / minDim;
      const yBound = canvasH / minDim;

      // Match the shader's emotionRadius formula including euphoric push
      const emR = 0.05 + 0.75 * (smoothEmSize + (0.86 - smoothEmSize) * smoothEuphoric);
      // Max visual extent: firefly orbit + glow halos + audio/breathe headroom
      const maxR = emR * 1.12 + 0.14;

      const xMargin = Math.max(xBound - maxR, 0);
      const yMargin = Math.max(yBound - maxR, 0);

      // Clamp the drift target so the spring always pulls toward a safe position
      ox = Math.max(-xMargin, Math.min(xMargin, ox));
      oy = Math.max(-yMargin, Math.min(yMargin, oy));

      // Spring-damper physics: orb velocity tracks the organic drift target and
      // bounces elastically off boundary walls — stays on screen at all times.
      const springK    = 8.0;   // stiffness: how eagerly the orb tracks the target
      const dampK      = 5.0;   // damping: slightly underdamped → gentle oscillation
      const bounceDamp = 0.55;  // fraction of velocity kept after each wall impact

      orbVx += ((ox - smoothOx) * springK - orbVx * dampK) * dt;
      orbVy += ((oy - smoothOy) * springK - orbVy * dampK) * dt;
      smoothOx += orbVx * dt;
      smoothOy += orbVy * dt;

      // Reflect velocity at walls so the orb bounces back into the play area
      if (smoothOx >  xMargin && orbVx > 0) { smoothOx =  xMargin; orbVx = -orbVx * bounceDamp; }
      if (smoothOx < -xMargin && orbVx < 0) { smoothOx = -xMargin; orbVx = -orbVx * bounceDamp; }
      if (smoothOy >  yMargin && orbVy > 0) { smoothOy =  yMargin; orbVy = -orbVy * bounceDamp; }
      if (smoothOy < -yMargin && orbVy < 0) { smoothOy = -yMargin; orbVy = -orbVy * bounceDamp; }

      program.uniforms.randomOffsetX.value = smoothOx;
      program.uniforms.randomOffsetY.value = smoothOy;

      const breatheSpeed = (0.3 + arousal * 0.9 + cheeky * 0.3) * lifeScale;
      let breatheVal = Math.sin(time * breatheSpeed) * 0.5 + 0.5;
      breatheVal += Math.sin(time * breatheSpeed * 2.4) * cheeky * 0.12;
      breatheVal = breatheVal * (1 - chill * 0.4) + 0.5 * chill * 0.4;
      breatheVal += smoothWarmPulse * 0.35;
      program.uniforms.breathe.value = Math.max(0, Math.min(1, breatheVal));

      const h1 = Math.sin(time * 0.037 + huePhase) * 90;
      const h2 = Math.sin(time * 0.037 * PHI + huePhase * 1.7) * 55;
      const h3 = Math.sin(time * 0.037 * Math.SQRT2 + huePhase * 0.3) * 35;
      const h4 = Math.sin(time * 0.017 * 1.732 + huePhase * 2.1) * 20;
      const targetHue = h1 + h2 + h3 + h4;
      smoothHue += (targetHue - smoothHue) * (1 - Math.exp(-2 * dt));
      program.uniforms.hue.value = smoothHue;

      const calmTarget = vizLevel < 0.012 ? 1.0 : 0.0;
      const calmUp = 1 - Math.exp(-0.4 * dt);
      const calmDown = 1 - Math.exp(-3.5 * dt);
      smoothCalm += (calmTarget - smoothCalm) * (calmTarget > smoothCalm ? calmUp : calmDown);
      program.uniforms.calm.value = smoothCalm;

      // Organic rotation -- wanders slower when orb is tiny
      const rotTarget = Math.sin(time * 0.11 * lifeScale) * 0.45
                      + Math.sin(time * 0.17 * PHI * lifeScale) * 0.28
                      + Math.sin(time * 0.07 * lifeScale + 1.3) * 0.18
                      + Math.sin(time * 0.31 * lifeScale) * cheeky * 0.22;
      smoothRot += (rotTarget - smoothRot) * (1 - Math.exp(-(0.6 + cheeky * 0.5 - chill * 0.3) * dt));
      program.uniforms.rot.value = smoothRot;

      const em = emotionRef.current;
      if (em) {
        // Intensity-aware transitions: calm emotions (~0.3) drift slowly over ~8s;
        // intense emotions (~1.0) snap in over ~2s. Valence and arousal react first
        // (full speed) while shape uniforms follow at 65% speed, so the orb
        // "startles" energetically before reshaping -- feels alive, not mechanical.
        const speed     = 0.12 + (em.intensity ?? 0.3) * 1.8;
        const fastF     = 1 - Math.exp(-speed * dt);
        const shapeF    = 1 - Math.exp(-speed * 0.65 * dt);
        const hueFactor = 1 - Math.exp(-speed * 0.5 * dt);

        smoothEmValence     += (em.valence     - smoothEmValence)     * fastF;
        smoothEmArousal     += (em.arousal     - smoothEmArousal)     * fastF;
        smoothEmHue         += (em.hue         - smoothEmHue)         * hueFactor;
        smoothEmSat         += (em.saturation  - smoothEmSat)         * shapeF;
        smoothEmColorSpread += (em.colorSpread - smoothEmColorSpread) * shapeF;

        const sizeRate = 1 - Math.exp(-speed * 0.65 * dt);
        smoothSizeTarget += (em.size - smoothSizeTarget) * sizeRate;
        smoothEmSize     += (smoothSizeTarget - smoothEmSize) * sizeRate;

        const opacityRate = 1 - Math.exp(-speed * 0.65 * dt);
        smoothOpacityTarget += (em.opacity - smoothOpacityTarget) * opacityRate;
        smoothEmOpacity     += (smoothOpacityTarget - smoothEmOpacity) * opacityRate;
      }
      program.uniforms.emotionValence.value = smoothEmValence;
      // Scale arousal by lifeScale so shader blob orbits and edge noise also die down when tiny
      program.uniforms.emotionArousal.value = smoothEmArousal * lifeScale;
      program.uniforms.emotionSize.value = smoothEmSize;
      program.uniforms.emotionHue.value = smoothEmHue;
      program.uniforms.emotionSaturation.value = smoothEmSat;
      program.uniforms.emotionColorSpread.value = smoothEmColorSpread;
      program.uniforms.emotionOpacity.value = smoothEmOpacity;

      // Joy pulse: fire when a clearly positive emotion arrives, decay smoothly
      const emValTarget = emotionRef.current?.valence ?? 0;
      if (emValTarget > prevTargetValence + 0.18 && emValTarget > 0.25) {
        joyPulseRaw = 1.0;
      }
      prevTargetValence = emValTarget;
      joyPulseRaw *= Math.exp(-1.4 * dt);
      smoothJoyPulse += (joyPulseRaw - smoothJoyPulse) * (1 - Math.exp(-8 * dt));
      program.uniforms.joyPulse.value = smoothJoyPulse;

      // Warm pulse: fire when a warm keyword is detected, decay over ~1.5s
      if (warmPulseTriggerRef.current !== prevWarmTrigger) {
        warmPulseRaw = 1.0;
        prevWarmTrigger = warmPulseTriggerRef.current;
      }
      warmPulseRaw *= Math.exp(-1.6 * dt);
      smoothWarmPulse += (warmPulseRaw - smoothWarmPulse) * (1 - Math.exp(-10 * dt));
      program.uniforms.warmPulse.value = smoothWarmPulse;

      // Euphoric mode: fast build-up (~1s), slow fade (~3s) so the joy lingers
      const euphoricTarget = euphoricRef.current ? 1.0 : 0.0;
      const euphoricEase = euphoricTarget > smoothEuphoric
        ? 1 - Math.exp(-1.4 * dt)
        : 1 - Math.exp(-0.28 * dt);
      smoothEuphoric += (euphoricTarget - smoothEuphoric) * euphoricEase;
      program.uniforms.euphoric.value = smoothEuphoric;

      // Game mode: fast build-up (~0.8s), slower fade-out (~1.5s)
      const gameModeTarget = gameModeRef.current ? 1.0 : 0.0;
      const gameModeEase = gameModeTarget > smoothGameMode
        ? 1 - Math.exp(-1.8 * dt)
        : 1 - Math.exp(-0.6 * dt);
      smoothGameMode += (gameModeTarget - smoothGameMode) * gameModeEase;
      program.uniforms.gameMode.value = smoothGameMode;

      program.uniforms.satSeed.value = time * 0.04;
      program.uniforms.satSeed2.value = time * 0.067;

      if (smoothGameMode > 0.01) {
        program.uniforms.randomOffsetX.value *= 1 - smoothGameMode * 0.95;
        program.uniforms.randomOffsetY.value *= 1 - smoothGameMode * 0.95;
        program.uniforms.rot.value *= 1 - smoothGameMode * 0.9;
        program.uniforms.calm.value = Math.max(0, program.uniforms.calm.value - smoothGameMode);
        program.uniforms.emotionSize.value = Math.max(
          program.uniforms.emotionSize.value,
          smoothGameMode * 0.82,
        );
      }

      {
        const blobs = gameBlobsRef?.current ?? [];
        const canvasW = gl.canvas.width;
        const canvasH = gl.canvas.height;
        const minDim = Math.min(canvasW, canvasH);
        const rot = program.uniforms.rot.value;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const gbNames = ['gb0','gb1','gb2','gb3','gb4','gb5','gb6','gb7'] as const;
        const gu = program.uniforms as Record<string, { value: Float32Array }>;

        // Compute orb surface viewport Y and expose it for LavaLampGame spawn positioning.
        // The surface is at draw_uv.y = dynamicRadius (at center x=0).
        if (smoothGameMode > 0.1 && gameSurfaceYRef) {
          const eSize = program.uniforms.emotionSize.value;
          const eRadius = 0.05 + 0.75 * Math.min(eSize, 1.0);
          const dRadius = eRadius * (1 + smoothGameMode * 1.6);
          const surfRawUVY = dRadius / (1 + smoothGameMode * 1.1) - smoothGameMode * 1.4;
          const surfCanvasY = surfRawUVY / (2 * canvasH / minDim) + 0.5;
          gameSurfaceYRef.current = canvasBottomVY + surfCanvasY;
        }

        for (let i = 0; i < 8; i++) {
          const b = blobs[i];
          const u = gu[gbNames[i]];
          if (!b || b.scale < 0.005) {
            u.value[3] = 0;
            continue;
          }
          // Use actual canvas center in viewport y (accounts for orb-shift on mobile).
          const uvX = (b.x - 0.5) * 2 * (canvasW / minDim);
          const uvY_raw = (b.y - canvasCenterVY) * 2 * (canvasH / minDim);
          const uvY = (uvY_raw + smoothGameMode * 1.4) * (1 + smoothGameMode * 1.1);
          u.value[0] = cosR * uvX - sinR * uvY;
          u.value[1] = sinR * uvX + cosR * uvY;
          u.value[2] = b.r * 2.0;
          u.value[3] = b.scale;
        }
      }

      const touchPosEase = 1 - Math.exp(-9 * dt);
      const touchStrUp = 1 - Math.exp(-18 * dt);
      const touchStrDown = 1 - Math.exp(-4 * dt);
      const velEase = 1 - Math.exp(-6 * dt);

      sTouchX += (rawTouchX - sTouchX) * touchPosEase;
      sTouchY += (rawTouchY - sTouchY) * touchPosEase;
      sTouchStr += (rawTouchStr - sTouchStr) * (rawTouchStr > sTouchStr ? touchStrUp : touchStrDown);

      if (!ptrDown && !ptrOver) {
        rawVelX *= Math.exp(-14 * dt);
        rawVelY *= Math.exp(-14 * dt);
      }
      sVelX += (rawVelX - sVelX) * velEase;
      sVelY += (rawVelY - sVelY) * velEase;

      program.uniforms.touchPosX.value = sTouchX;
      program.uniforms.touchPosY.value = sTouchY;
      program.uniforms.touchStrength.value = sTouchStr;
      program.uniforms.touchVelX.value = sVelX;
      program.uniforms.touchVelY.value = sVelY;
      program.uniforms.touchSpread.value = rawTouchSpread;

      // === Trick animation system ===
      if (trickTriggerRef.current !== prevTrickTrigger) {
        trickCurrentType = trickIndexRef.current;
        trickStartTime = time;
        trickActiveRaw = 1;
        trickPhaseVal = 0;
        // NOTE: smooth modifier vars are intentionally NOT reset here.
        // Hard-resetting them while they hold a non-zero value from the previous
        // trick causes a one-frame snap. The easing loop below naturally
        // interpolates from whatever state they're in to the new trick's targets.
        prevTrickTrigger = trickTriggerRef.current;
      }

      // Raw targets computed fresh each frame
      let trickFakeLevelTarget = 0, trickFakeBassTarget = 0;
      let trickFakeMidTarget = 0, trickFakeTrebleTarget = 0;
      trickSizeMod = 0; trickArousalMod = 0; trickBreatheMod = 0;
      trickOxMod = 0; trickOyMod = 0; trickRotMod = 0;

      if (trickActiveRaw > 0.005) {
        const dur = TRICK_DURATIONS[trickCurrentType];
        trickPhaseVal = Math.min((time - trickStartTime) / dur, 1.0);
        if (trickPhaseVal >= 1.0) trickActiveRaw *= Math.exp(-0.7 * dt);

        const p = trickPhaseVal;

        // Organic oscillators at irrational frequency ratios — different per trick
        // so each has a unique texture. Multiple overlapping = no mechanical repetition.
        const o1 = (f: number, ph: number) => Math.abs(Math.sin(time * f + ph));
        const o2 = (f: number, ph: number) => 0.5 + 0.5 * Math.sin(time * f + ph);

        switch (trickCurrentType) {
          case 0: {
            // ── INHALE & BLOOM ──────────────────────────────────────────────────
            // Orb contracts (breathe drops, core shrinks), then opens like a flower:
            // bass spikes scatter blobs outward into unique positions, slow rotation.
            // Fake audio: low-frequency rolling bass + mid shimmer during bloom.
            if (p < 0.22) {
              const t = p / 0.22;
              trickSizeMod = -0.06 * t;
              trickBreatheMod = -0.4 * t;
              // Light mid shimmer even on inhale — shape already alive
              trickFakeMidTarget = t * 0.18 * o1(4.3, 0.5);
              trickFakeLevelTarget = t * 0.07;
            } else if (p < 0.58) {
              const t = (p - 0.22) / 0.36;
              trickBreatheMod = -0.4 + 1.4 * t;
              trickArousalMod = 0.45 * t;
              trickRotMod = Math.sin(t * Math.PI * 0.5) * 0.55;
              // Bass drives blobs outward in an organic burst pattern
              trickFakeBassTarget = t * t * 0.55 * (0.7 + 0.3 * o1(2.1, 1.3));
              trickFakeMidTarget = t * 0.35 * o1(5.7, 2.2);
              trickFakeTrebleTarget = t * 0.2 * o1(9.3, 0.8);
              trickFakeLevelTarget = trickFakeBassTarget * 0.8;
            } else {
              const t = (p - 0.58) / 0.42;
              const fade = 1 - t * t;
              trickBreatheMod = 1.0 * fade;
              trickArousalMod = 0.45 * fade;
              trickRotMod = 0.55 * fade;
              // Blobs slowly drift back as audio fades — each at its own speed
              trickFakeBassTarget = 0.55 * fade * (0.6 + 0.4 * o1(1.4, 0.6));
              trickFakeMidTarget = 0.35 * fade * o1(3.8, 1.9);
              trickFakeTrebleTarget = 0.2 * fade * o1(7.1, 0.3);
              trickFakeLevelTarget = trickFakeBassTarget * 0.7;
            }
            trickOyMod = Math.sin(p * Math.PI) * 0.014;
            break;
          }

          case 1: {
            // ── PENDULUM SWAY ────────────────────────────────────────────────────
            // Lateral swing with growing amplitude. Treble-heavy fake audio creates
            // fine edge shimmer and surface texture unique to the swing motion.
            // Blobs stretch toward the trailing edge of each swing — no rotation.
            const swingEnv = Math.sin(p * Math.PI);
            const swingPos = Math.sin(p * Math.PI * 2.1);
            trickOxMod = swingPos * swingEnv * 0.085;
            trickOyMod = -Math.abs(swingPos) * swingEnv * 0.015;
            trickArousalMod = 0.2 * swingEnv;
            // Treble peaks at each swing extreme — surface texture churns
            const swingExtreme = Math.abs(swingPos);
            trickFakeTrebleTarget = swingExtreme * swingEnv * 0.5 * o1(11.2, 1.4);
            trickFakeMidTarget = swingEnv * 0.22 * o1(6.3, 2.7) * (0.5 + 0.5 * swingExtreme);
            trickFakeBassTarget = swingEnv * 0.15 * o2(1.8, 0.9);
            trickFakeLevelTarget = (trickFakeTrebleTarget + trickFakeMidTarget) * 0.5;
            break;
          }

          case 2: {
            // ── SHATTER & REFORM ─────────────────────────────────────────────────
            // The real blob-breaker. Fake audio maxes during scatter so k shrinks
            // and blobs detach into individual shapes, orbiting a shrunken core.
            // Hold as scattered fragments. Reform via cubic ease.
            if (p < 0.14) {
              const t = p / 0.14;
              trickSizeMod = -0.05 * t;
              trickFakeBassTarget = t * 0.3 * o1(3.2, 0.7);
              trickFakeLevelTarget = t * 0.12;
            } else if (p < 0.32) {
              const t = (p - 0.14) / 0.18;
              // Rapid collapse: core shrinks, fake audio spikes — blobs scatter
              trickSizeMod = -0.05 - 0.24 * (t * t);
              trickArousalMod = 0.6 * t;
              trickFakeLevelTarget = 0.12 + 0.55 * t;
              trickFakeBassTarget = (0.3 + 0.5 * t) * o1(4.7, 1.1);
              trickFakeMidTarget = t * 0.4 * o1(7.9, 2.3);
              trickFakeTrebleTarget = t * 0.35 * o1(14.1, 0.5);
            } else if (p < 0.65) {
              // HOLD SCATTERED — core tiny, blobs at unique positions orbiting
              // Each blob is at a different orbit angle/speed (driven by arousal)
              // and the surface churns with high-freq noise
              trickSizeMod = -0.29;
              trickArousalMod = 0.6;
              trickFakeLevelTarget = 0.67;
              trickFakeBassTarget = 0.65 * o1(2.3, 0.4);
              trickFakeMidTarget = 0.45 * o1(6.1, 1.7);
              trickFakeTrebleTarget = 0.38 * o1(13.4, 3.1);
              trickOxMod = Math.sin((p - 0.32) * Math.PI * 2.1) * 0.01;
              trickOyMod = Math.cos((p - 0.32) * Math.PI * 1.4) * 0.008;
            } else {
              // REFORM — cubic ease: slow start then rapid magnetic snap
              const t = (p - 0.65) / 0.35;
              const reform = 1 - t * t * t;
              trickSizeMod = -0.29 * reform;
              trickArousalMod = 0.6 * reform;
              trickFakeLevelTarget = 0.67 * reform;
              trickFakeBassTarget = 0.65 * reform * o1(1.9, 0.8);
              trickFakeMidTarget = 0.45 * reform * o1(5.3, 2.0);
              trickFakeTrebleTarget = 0.38 * reform * o1(10.7, 0.2);
            }
            break;
          }

          case 3: {
            // ── DROP & CATCH ─────────────────────────────────────────────────────
            // Falls with rising treble turbulence. Bass THUD on impact — blobs
            // splatter outward, then float back with gentle mid undulation.
            // Each phase has distinct audio texture.
            if (p < 0.3) {
              const t = p / 0.3;
              trickOyMod = -(t * t) * 0.11;
              // Rising treble = turbulence/wind on the way down
              trickFakeTrebleTarget = t * t * 0.55 * o1(16.3, 2.1);
              trickFakeMidTarget = t * 0.18 * o1(7.2, 0.9);
              trickFakeLevelTarget = t * t * 0.25;
            } else if (p < 0.48) {
              const t = (p - 0.3) / 0.18;
              const impactBell = Math.sin(t * Math.PI);
              trickOyMod = -0.11 + 0.03 * t;
              // Bass THUD — blobs scatter on impact, surface shatters briefly
              trickFakeBassTarget = impactBell * 0.8;
              trickFakeLevelTarget = 0.25 + impactBell * 0.55;
              trickFakeTrebleTarget = impactBell * 0.45 * o1(19.7, 1.5);
              trickFakeMidTarget = 0.18 + impactBell * 0.35 * o1(8.3, 0.4);
              trickSizeMod = -impactBell * 0.04;
              trickArousalMod = impactBell * 0.4;
            } else {
              // Float back up — slow mid oscillation, orb finds a new shape
              const t = (p - 0.48) / 0.52;
              const floatEnv = Math.sqrt(t) * (1 - t * 0.3);
              trickOyMod = -0.08 + 0.08 * Math.sqrt(t);
              trickFakeMidTarget = floatEnv * 0.28 * o1(5.1, 1.6);
              trickFakeBassTarget = floatEnv * 0.12 * o2(1.3, 2.4);
              trickFakeLevelTarget = floatEnv * 0.18;
            }
            break;
          }

          case 4: {
            // ── TRIPLE PULSE ─────────────────────────────────────────────────────
            // Three heartbeat contractions, each bigger. Between beats the orb
            // relaxes to near-silence. Each beat: bass + treble spike together —
            // blobs scatter then snap back differently each time (unique positions).
            const beat = (center: number, w: number) => {
              const d = Math.abs(p - center);
              return d < w ? Math.pow(Math.cos((d / w) * Math.PI * 0.5), 1.4) : 0;
            };
            const b1 = beat(0.14, 0.08);
            const b2 = beat(0.37, 0.1);
            const b3 = beat(0.62, 0.13);
            const bAny = Math.max(b1, b2, b3);

            trickBreatheMod = b1 * 0.5 + b2 * 0.7 + b3 * 1.0;
            trickSizeMod    = b1 * 0.01 + b2 * 0.025 + b3 * 0.04;
            trickOyMod      = b1 * 0.009 + b2 * 0.016 + b3 * 0.026;

            // Each pulse has a distinct fake audio texture — bass-heavy first,
            // treble-heavy second, full-spectrum third
            trickFakeBassTarget    = b1 * 0.55 * o1(3.1, 0.6) + b2 * 0.2 + b3 * 0.65 * o1(2.8, 1.1);
            trickFakeTrebleTarget  = b1 * 0.15 + b2 * 0.58 * o1(12.4, 1.9) + b3 * 0.52 * o1(15.3, 0.3);
            trickFakeMidTarget     = bAny * 0.3 * o1(7.1, 2.5);
            trickFakeLevelTarget   = b1 * 0.35 + b2 * 0.4 + b3 * 0.65;
            // Arousal spikes on each beat — blobs orbit at different speeds each time
            trickArousalMod = b1 * 0.3 + b2 * 0.45 + b3 * 0.65;
            break;
          }
        }
      }

      // Smooth all targets with asymmetric ease.
      // Fast attack (3.5) for snappy onsets, slow decay (1.2) for organic settle.
      const atkRate = 3.5, decRate = 1.2;
      const ease = (s: number, t: number) =>
        s + (t - s) * (1 - Math.exp(-(t > s ? atkRate : decRate) * dt));

      trickSizeModSmooth    = ease(trickSizeModSmooth,    trickSizeMod);
      trickArousalModSmooth = ease(trickArousalModSmooth, trickArousalMod);
      trickBreatheModSmooth = ease(trickBreatheModSmooth, trickBreatheMod);
      trickOxModSmooth      = ease(trickOxModSmooth,      trickOxMod);
      trickOyModSmooth      = ease(trickOyModSmooth,      trickOyMod);
      trickRotModSmooth     = ease(trickRotModSmooth,     trickRotMod);
      trickFakeLevelSmooth  = ease(trickFakeLevelSmooth,  trickFakeLevelTarget);
      trickFakeBassSmooth   = ease(trickFakeBassSmooth,   trickFakeBassTarget);
      trickFakeMidSmooth    = ease(trickFakeMidSmooth,    trickFakeMidTarget);
      trickFakeTrebleSmooth = ease(trickFakeTrebleSmooth, trickFakeTrebleTarget);

      // Apply movement mods
      program.uniforms.emotionSize.value    = Math.max(0.02, program.uniforms.emotionSize.value    + trickSizeModSmooth);
      program.uniforms.emotionArousal.value = Math.max(0,    program.uniforms.emotionArousal.value + trickArousalModSmooth);
      program.uniforms.breathe.value        = Math.max(0, Math.min(1, program.uniforms.breathe.value + trickBreatheModSmooth));
      program.uniforms.randomOffsetX.value += trickOxModSmooth;
      program.uniforms.randomOffsetY.value += trickOyModSmooth;
      // Clamp after trick offsets so animations can never push the orb off-screen
      program.uniforms.randomOffsetX.value = Math.max(-xMargin, Math.min(xMargin, program.uniforms.randomOffsetX.value));
      program.uniforms.randomOffsetY.value = Math.max(-yMargin, Math.min(yMargin, program.uniforms.randomOffsetY.value));
      program.uniforms.rot.value           += trickRotModSmooth;

      // Inject fake audio into the already-set audio uniforms.
      // This drives edgeNoise, blob orbits, smin k — the actual shape deformers.
      // Also suppresses calm (calm is 1 when level < 0.012, so any fake level kills the sphere).
      program.uniforms.audioLevel.value  = Math.min(1, program.uniforms.audioLevel.value  + trickFakeLevelSmooth);
      program.uniforms.audioBass.value   = Math.min(1, program.uniforms.audioBass.value   + trickFakeBassSmooth);
      program.uniforms.audioMid.value    = Math.min(1, program.uniforms.audioMid.value    + trickFakeMidSmooth);
      program.uniforms.audioTreble.value = Math.min(1, program.uniforms.audioTreble.value + trickFakeTrebleSmooth);

      // Also override calm directly when fake audio is present so edgeNoise fires
      if (trickFakeLevelSmooth > 0.01) {
        const trickCalmSuppression = Math.min(1, trickFakeLevelSmooth * 6);
        program.uniforms.calm.value = Math.max(0, program.uniforms.calm.value - trickCalmSuppression);
      }

      smoothTrickActive += (trickActiveRaw - smoothTrickActive) * (1 - Math.exp(-3 * dt));
      program.uniforms.trickActive.value = smoothTrickActive;
      program.uniforms.trickPhase.value  = trickPhaseVal;
      program.uniforms.trickType.value   = trickCurrentType;

      renderer.render({ scene: mesh });
    };
    rafId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', resumeAudio);
      window.removeEventListener('touchstart', resumeAudio);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      audioCtx?.close();
    };
  }, [micStream]);

  return <div ref={ctnDom} style={{ width: '100%', height: '100%' }} />;
}
