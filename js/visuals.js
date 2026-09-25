// Rendering: WebGL shader backdrop (halftone mirrored webcam + audio-reactive smoke) composited
// into a 2D stage canvas with glowing fingertip ribbons, particles, an MPC pad HUD and step LCD.
import { BONES, TIPS } from './hands.js';

const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform sampler2D uVideo; uniform float uVideoOn; uniform vec2 uVidScale;
uniform float uLevel; uniform float uBass; uniform float uPulse;
uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uColC;
uniform vec4 uHandL; uniform vec4 uHandR;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=.5; } return v; }
mat2 transpose2(mat2 m){ return mat2(m[0][0], m[1][0], m[0][1], m[1][1]); }
float luma(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
void main(){
  vec2 uv = vUv;
  float ar = uRes.x/uRes.y;
  vec2 p = (uv-.5)*vec2(ar,1.);
  float t = uTime*.05;
  // rising smoke
  vec2 sp = p*vec2(1.1,.8) + vec2(0., -t*1.6);
  vec2 q = vec2(fbm(sp*1.4+vec2(t,0.)), fbm(sp*1.4+vec2(5.2,1.3-t)));
  float f = fbm(sp*1.8 + q*2.2 + uBass*.5);
  vec3 ink = vec3(0.022, 0.014, 0.03);
  vec3 col = ink;
  float glow = .5 + uLevel*.9 + uPulse*.7;
  col = mix(col, uColB*.42, smoothstep(.35,1.,f)*glow);
  col += uColA*.2*smoothstep(.6,1.05,q.x*f*1.6)*glow;
  // stage light from the floor
  float floorGlow = exp(-pow((uv.y)*2.2,2.)) * (.35+uLevel*.8+uPulse*.6);
  col += mix(uColA, uColC, .5+.5*sin(p.x*2.+uTime*.3))*floorGlow*.22;
  // hand auras
  vec2 hl = (uHandL.xy-.5)*vec2(ar,1.); hl.y = -hl.y;
  vec2 hr = (uHandR.xy-.5)*vec2(ar,1.); hr.y = -hr.y;
  float dl = length(p-hl), dr = length(p-hr);
  col += uColC * uHandL.z * exp(-dl*dl*6.) * (.12 + .22*uHandL.w + uLevel*.35);
  col += uColA * uHandR.z * exp(-dr*dr*6.) * (.12 + .22*uHandR.w + uLevel*.35);
  // mirrored webcam as gold/violet halftone print
  if (uVideoOn > .001) {
    vec2 vuv = (uv-.5)*uVidScale+.5; vuv.x = 1.-vuv.x;
    float cell = max(4., uRes.y/96.);
    vec2 g = gl_FragCoord.xy / cell;
    mat2 rot = mat2(.7071,-.7071,.7071,.7071);
    vec2 gr = rot*g; vec2 cc = floor(gr)+.5; vec2 cuv = (transpose2(rot)*cc)*cell/uRes;
    vec2 vcuv = (cuv-.5)*uVidScale+.5; vcuv.x = 1.-vcuv.x;
    float l = pow(smoothstep(.05,.95,luma(texture2D(uVideo, vcuv).rgb)), 1.2);
    float dotm = 1.-smoothstep(l*.62-.06, l*.62+.06, length(gr-cc));
    vec2 px = 1.5/uRes;
    float cx = luma(texture2D(uVideo, vuv+vec2(px.x,0.)).rgb) - luma(texture2D(uVideo, vuv-vec2(px.x,0.)).rgb);
    float cy = luma(texture2D(uVideo, vuv+vec2(0.,px.y)).rgb) - luma(texture2D(uVideo, vuv-vec2(0.,px.y)).rgb);
    float edge = smoothstep(.05,.35,length(vec2(cx,cy)));
    vec3 tone = mix(uColB*.8, mix(uColA, vec3(1.,.95,.85), .35), l);
    vec3 vid = tone*dotm*.55 + edge*mix(uColA, uColC, uv.y)*(.25+uLevel*.7);
    col = mix(col, col*.5 + vid, uVideoOn);
  }
  // scanlines, vignette, grain
  col *= .94 + .06*sin(gl_FragCoord.y*3.14159);
  float vig = smoothstep(1.2, .2, length((uv-.5)*vec2(ar*.8,1.)));
  col *= .3 + .7*vig;
  col += (hash(uv*uRes + fract(uTime)*91.)-.5)*.05;
  col += uColA*uPulse*.06;
  gl_FragColor = vec4(pow(max(col,0.), vec3(.95)), 1.);
}`;


export const PALETTES = {
  pads: ['#ffb627', '#6d28d9', '#ff3d6e'],
  bass: ['#ff6a1f', '#7a1fa2', '#ffcc3c'],
  rolls: ['#b8ff3d', '#4c1d95', '#ff3db8'],
  flute: ['#ffd479', '#5b21b6', '#34f5c5'],
};
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const rgba = (c, a) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export class Visuals {
  constructor(stage, video) {
    this.stage = stage;
    this.ctx = stage.getContext('2d');
    this.video = video;
    this.gl = null;
    this.glCanvas = document.createElement('canvas');
    this.palette = PALETTES.pads.map(hex);
    this.targetPalette = this.palette;
    this.trails = {};
    this.particles = [];
    this.rings = [];
    this.pulse = 0;
    this.videoOn = 0;
    this.flash = {};
    this.shouts = [];
    this.kickV = 0;
    this.snareV = 0;
    this._initGL();
    this._sprite = this._makeSprite();
    this.resize();
  }

  _initGL() {
    const gl = this.glCanvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) return;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      this.u = {};
      for (const n of ['uRes', 'uTime', 'uVideo', 'uVideoOn', 'uVidScale', 'uLevel', 'uBass', 'uPulse', 'uColA', 'uColB', 'uColC', 'uHandL', 'uHandR'])
        this.u[n] = gl.getUniformLocation(prog, n);
      this.gl = gl;
    } catch (e) {
      console.warn('WebGL backdrop unavailable', e);
      this.gl = null;
    }
  }

  _makeSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.W = w; this.H = h; this.dpr = dpr;
    this.stage.width = Math.round(w * dpr);
    this.stage.height = Math.round(h * dpr);
    const gs = Math.min(1, 900 / Math.max(w, h));
    this.glCanvas.width = Math.max(2, Math.round(w * gs));
    this.glCanvas.height = Math.max(2, Math.round(h * gs));
    this.gl?.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
  }

  /** Scale factors mapping screen uv → video uv for a cover fit. */
  coverScale() {
    const v = this.video;
    const va = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
    const ca = this.W / this.H;
    return ca > va ? [1, va / ca] : [ca / va, 1];
  }

  setPalette(mode) { this.targetPalette = PALETTES[mode].map(hex); }

  burst(x, y, n = 18, colorIdx = 0, power = 1) {
    const c = this.palette[colorIdx % 3];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (60 + Math.random() * 260) * power;
      this.particles.push({
        x: x * this.W, y: y * this.H, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0, max: 0.6 + Math.random() * 0.8, size: 6 + Math.random() * 18 * power, c: mix3(c, [1, 1, 1], Math.random() * 0.5),
      });
    }
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
  }

  ring(x, y, colorIdx = 0, size = 1) {
    this.rings.push({ x: x * this.W, y: y * this.H, life: 0, max: 0.9, size, c: this.palette[colorIdx % 3] });
    this.pulse = Math.min(1.2, this.pulse + 0.35 * size);
  }

  flashKey(key, v = 1) { this.flash[key] = Math.max(this.flash[key] || 0, v); }
  kick(v = 0.6) { this.kickV = Math.min(1.4, this.kickV + v); this.pulse = Math.min(1.3, this.pulse + v * 0.5); }
  snare() { this.snareV = 1; }
  shout(text, colorIdx = 0, size = 1) { this.shouts = [{ text, t0: performance.now(), max: 0.9 + size * 0.4, c: colorIdx, size }]; }

  render(scene, dt, time) {
    const { ctx, W, H, dpr } = this;
    for (let i = 0; i < 3; i++) this.palette[i] = mix3(this.palette[i], this.targetPalette[i], 1 - Math.exp(-dt * 3));
    this.pulse *= Math.exp(-dt * 4);
    this.kickV *= Math.exp(-dt * 7);
    this.snareV *= Math.exp(-dt * 8);
    this.videoOn += ((scene.videoOn ? 1 : 0) - this.videoOn) * (1 - Math.exp(-dt * 2.5));
    for (const k in this.flash) this.flash[k] *= Math.exp(-dt * 6);
    const hands = scene.gestures.hands;

    // 1. Shader backdrop
    if (this.gl) {
      const gl = this.gl, u = this.u;
      if (scene.videoOn && this.video.readyState >= 2) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
      }
      const cs = this.coverScale();
      gl.uniform2f(u.uRes, this.glCanvas.width, this.glCanvas.height);
      gl.uniform1f(u.uTime, time);
      gl.uniform1i(u.uVideo, 0);
      gl.uniform1f(u.uVideoOn, this.videoOn);
      gl.uniform2f(u.uVidScale, cs[0], cs[1]);
      gl.uniform1f(u.uLevel, clamp(scene.level * 1.6));
      gl.uniform1f(u.uBass, scene.bands[0]);
      gl.uniform1f(u.uPulse, this.pulse);
      gl.uniform3fv(u.uColA, this.palette[0]);
      gl.uniform3fv(u.uColB, this.palette[1]);
      gl.uniform3fv(u.uColC, this.palette[2]);
      const L = hands.left, R = hands.right;
      gl.uniform4f(u.uHandL, L.palm.x, L.palm.y, L.presence, L.open);
      gl.uniform4f(u.uHandR, R.palm.x, R.palm.y, R.presence, R.open);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (this.gl) ctx.drawImage(this.glCanvas, 0, 0, this.stage.width, this.stage.height);
    else {
      ctx.fillStyle = '#07070d';
      ctx.fillRect(0, 0, this.stage.width, this.stage.height);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 2. Backdrop word + HUD under the light layer
    this._word(scene);
    this._hud(scene, time);

    // 3. Additive light: ribbons, particles, rings
    ctx.globalCompositeOperation = 'lighter';
    for (const side of ['left', 'right']) this._trails(hands[side], side, time);
    this._particles(dt);
    this._rings(dt);
    ctx.globalCompositeOperation = 'source-over';

    for (const side of ['left', 'right']) this._skeleton(hands[side], side);
    this._shouts();
    if (scene.recording) this._watermark(scene);
  }

  _trails(h, side, time) {
    const { ctx, W, H } = this;
    const now = time;
    for (let f = 0; f < 5; f++) {
      const key = side + f;
      let tr = this.trails[key];
      if (!tr) tr = this.trails[key] = [];
      if (h.present && h.pts) {
        const p = h.pts[TIPS[f]];
        tr.push({ x: p.x * W, y: p.y * H, t: now });
      }
      while (tr.length && (now - tr[0].t > 0.55 || tr.length > 40)) tr.shift();
      if (tr.length < 3) continue;
      const cA = this.palette[side === 'right' ? 0 : 2];
      const cB = this.palette[1];
      const col = mix3(cA, cB, f / 5);
      const base = (f === 1 || f === 0 ? 7 : 4.5) * (0.7 + h.presence * 0.3);
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < tr.length - 1; i++) {
          const a = tr[i - 1], b = tr[i], c = tr[i + 1];
          const age = clamp(1 - (now - b.t) / 0.55);
          const w = base * age * (pass === 0 ? 3.2 : 1);
          ctx.strokeStyle = rgba(pass === 0 ? col : mix3(col, [1, 1, 1], 0.55), (pass === 0 ? 0.13 : 0.75) * age * age);
          ctx.lineWidth = w;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
          ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
          ctx.stroke();
        }
      }
      // tip glow
      if (h.present) {
        const last = tr[tr.length - 1];
        const s = (f === 0 || f === 1 ? 46 : 32) * (1 + this.pulse * 0.4);
        ctx.globalAlpha = 0.55 * h.presence;
        this._tint(col);
        ctx.drawImage(this._tinted, last.x - s / 2, last.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    }
  }

  _tint(c) {
    const key = c.map((v) => (v * 16) | 0).join();
    this._tintCache ||= new Map();
    let cv = this._tintCache.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      g.drawImage(this._sprite, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = rgba(c, 1);
      g.fillRect(0, 0, 64, 64);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5;
      g.drawImage(this._sprite, 16, 16, 32, 32);
      if (this._tintCache.size > 400) this._tintCache.clear();
      this._tintCache.set(key, cv);
    }
    this._tinted = cv;
  }

  _particles(dt) {
    const { ctx } = this;
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life > p.max) { ps.splice(i, 1); continue; }
      const k = Math.exp(-dt * 2.2);
      p.vx *= k; p.vy = p.vy * k + 30 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      const s = p.size * (0.4 + a * 0.6);
      ctx.globalAlpha = a * 0.9;
      this._tint(p.c);
      ctx.drawImage(this._tinted, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  _rings(dt) {
    const { ctx } = this;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      if (r.life > r.max) { this.rings.splice(i, 1); continue; }
      const u = r.life / r.max;
      const e = 1 - Math.pow(1 - u, 3);
      ctx.strokeStyle = rgba(r.c, (1 - u) * 0.8);
      ctx.lineWidth = 2.5 * (1 - u) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 12 + e * 120 * r.size, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _skeleton(h, side) {
    if (!h.pts || h.presence < 0.02) return;
    const { ctx, W, H } = this;
    const P = h.pts;
    ctx.globalAlpha = h.presence;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(P[a].x * W, P[a].y * H);
      ctx.lineTo(P[b].x * W, P[b].y * H);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 21; i++) {
      const r = TIPS.includes(i) ? 3 : 1.6;
      ctx.beginPath();
      ctx.arc(P[i].x * W, P[i].y * H, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (h.pinched) {
      const x = ((P[4].x + P[8].x) / 2) * W, y = ((P[4].y + P[8].y) / 2) * H;
      ctx.strokeStyle = rgba(this.palette[0], 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- HUD ---------------- */
  _label(text, x, y, opts = {}) {
    const { ctx } = this;
    const size = opts.size || 11;
    ctx.font = `${opts.weight || 500} ${size}px ${opts.font || '"Geist Mono", ui-monospace, monospace'}`;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = 'middle';
    if (opts.pill) {
      const w = ctx.measureText(text).width + 16;
      const h = size + 10;
      const bx = opts.align === 'right' ? x - w + 8 : opts.align === 'center' ? x - w / 2 : x - 8;
      ctx.fillStyle = opts.pill;
      this._round(bx, y - h / 2, w, h, h / 2);
      ctx.fill();
    }
    ctx.fillStyle = opts.color || 'rgba(255,255,255,0.6)';
    ctx.fillText(text, x, y + 0.5);
  }

  _round(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _word(scene) {
    const { ctx, W, H } = this;
    if (!scene.word) return;
    const s = Math.min(W * 0.34, H * 0.5) * (1 + this.kickV * 0.035);
    ctx.save();
    ctx.font = `400 ${s}px "Anton", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = scene.attract && W >= 760 ? W * 0.7 : W / 2;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(this.palette[0], 0.06 + this.kickV * 0.08);
    ctx.strokeText(scene.word, x, H * 0.52);
    ctx.restore();
  }

  _shouts() {
    const { ctx, W, H } = this;
    const now = performance.now();
    this.shouts = this.shouts.filter((s) => (s.life = (now - s.t0) / 1000) < s.max);
    for (const s of this.shouts) {
      const u = s.life / s.max;
      const a = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      const size = Math.min(W * 0.2, H * 0.3) * s.size * (1.25 - 0.25 * Math.min(1, u * 4));
      ctx.save();
      ctx.globalAlpha = clamp(a);
      ctx.font = `400 ${size}px "Anton", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = rgba(this.palette[s.c], 0.9);
      ctx.shadowBlur = 40;
      ctx.fillStyle = rgba(mix3(this.palette[s.c], [1, 1, 1], 0.55), 1);
      ctx.fillText(s.text, W / 2, H * 0.46);
      ctx.restore();
    }
  }

  _meter(val, label, sub, col) {
    const { ctx, H } = this;
    const mx = 28, my0 = H * 0.3, my1 = H * 0.7;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    this._round(mx - 2, my0, 4, my1 - my0, 2);
    ctx.fill();
    const fy = my1 - (my1 - my0) * clamp(val);
    const g = ctx.createLinearGradient(0, my1, 0, my0);
    g.addColorStop(0, rgba(col, 0.2));
    g.addColorStop(1, rgba(col, 0.95));
    ctx.fillStyle = g;
    this._round(mx - 2, fy, 4, my1 - fy, 2);
    ctx.fill();
    this._label(label, mx - 4, my0 - 16, { size: 10, color: 'rgba(255,255,255,0.5)' });
    this._label(sub, mx - 4, my1 + 16, { size: 9.5, color: 'rgba(255,255,255,0.32)' });
  }

  _lcd(scene) {
    const { ctx, W } = this;
    const c = scene.clock;
    if (!c) return;
    const step = Math.floor(c.pos) % 16, bar = Math.floor(c.pos / 16) % 4;
    const cw = Math.min(14, (W - 200) / 22), gap = 4, grp = 6;
    const total = cw * 16 + gap * 15 + grp * 3;
    const x0 = (W - total) / 2, y = 86;
    const A = this.palette[0], C = this.palette[2];
    ctx.fillStyle = 'rgba(8,6,12,0.55)';
    this._round(x0 - 78, y - 14, total + 156, 28, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    this._label(`BAR ${bar + 1}.${Math.floor(step / 4) + 1}`, x0 - 66, y, { size: 10, weight: 600, color: rgba(A, 0.9) });
    this._label(scene.dropped ? 'DROP…' : `${c.bpm} BPM`, x0 + total + 66, y, { size: 10, weight: 600, align: 'right', color: scene.dropped ? rgba(C, 0.95) : 'rgba(255,255,255,0.6)' });
    for (let i = 0; i < 16; i++) {
      const x = x0 + i * (cw + gap) + Math.floor(i / 4) * grp;
      const on = i === step;
      const isKick = c.kicks && c.kicks[bar].includes(i);
      ctx.fillStyle = on ? rgba(A, scene.dropped ? 0.4 : 1) : isKick ? rgba(A, 0.28) : i === 8 ? rgba(C, 0.3) : 'rgba(255,255,255,0.08)';
      if (on && !scene.dropped) { ctx.shadowColor = rgba(A, 0.9); ctx.shadowBlur = 12; }
      this._round(x, y - 5, cw, 10, 2.5);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _pads(scene) {
    const { ctx } = this;
    const g = scene.grid;
    const A = this.palette[0], B = mix3(this.palette[1], [1, 1, 1], 0.35), C = this.palette[2];
    const groupCol = [A, mix3(A, C, 0.5), C, B];
    for (let i = 0; i < 16; i++) {
      const r = scene.padRect(i, g);
      const lab = scene.padLabels[i];
      const on = this.flash['pad' + i] || 0;
      const hov = scene.hover.includes(i);
      const col = groupCol[lab.group];
      const rad = r.w * 0.1;
      ctx.fillStyle = 'rgba(12,9,18,0.62)';
      this._round(r.x, r.y, r.w, r.h, rad);
      ctx.fill();
      const lg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      lg.addColorStop(0, 'rgba(255,255,255,0.075)');
      lg.addColorStop(1, 'rgba(255,255,255,0.01)');
      ctx.fillStyle = lg;
      ctx.fill();
      if (on > 0.02) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.w * 0.75);
        rg.addColorStop(0, rgba(mix3(col, [1, 1, 1], 0.3), 0.85 * on));
        rg.addColorStop(1, rgba(col, 0.12 * on));
        ctx.fillStyle = rg;
        this._round(r.x, r.y, r.w, r.h, rad);
        ctx.fill();
        ctx.save();
        ctx.shadowColor = rgba(col, on);
        ctx.shadowBlur = 34 * on;
        ctx.strokeStyle = rgba(col, 0.5 + on * 0.5);
        ctx.lineWidth = 1 + on * 2;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = hov ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = hov ? 1.5 : 1;
        ctx.stroke();
      }
      const fs = clamp(r.w * 0.15, 10, 22);
      this._label(lab.name.toUpperCase(), r.x + r.w * 0.1, r.y + r.h - r.w * 0.14, {
        size: fs, weight: 400, font: '"Anton", Impact, sans-serif', color: on > 0.3 ? '#0b0710' : 'rgba(255,255,255,0.9)',
      });
      this._label(lab.bank, r.x + r.w * 0.1, r.y + r.w * 0.13, { size: clamp(r.w * 0.08, 8, 10.5), color: on > 0.3 ? 'rgba(10,6,14,0.7)' : 'rgba(255,255,255,0.35)' });
      if (lab.note) this._label(lab.note, r.x + r.w * 0.9, r.y + r.h - r.w * 0.14, { size: clamp(r.w * 0.09, 9, 12), weight: 600, align: 'right', color: on > 0.3 ? '#0b0710' : rgba(col, 0.9) });
      ctx.fillStyle = on > 0.05 || hov ? rgba(col, 0.6 + on * 0.4) : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(r.x + r.w * 0.88, r.y + r.w * 0.13, clamp(r.w * 0.025, 2, 3.5), 0, Math.PI * 2);
      ctx.fill();
    }
    if (!scene.attract) this._label('TAP INTO A PAD WITH A FINGERTIP', g.x0 + g.size / 2, g.y0 + g.size + 20, { align: 'center', size: 10, color: 'rgba(255,255,255,0.42)' });
    else this._label('MPC BANK A · 16 PADS', g.x0 + g.size / 2, g.y0 + g.size + 20, { align: 'center', size: 10, color: 'rgba(255,255,255,0.42)' });
  }

  _ladder(scene, top) {
    const { W, H, ctx } = this;
    const A = this.palette[0];
    const { notes, active, title } = scene.guide;
    const x0 = W * 0.56, x1 = W - 24;
    const hit = this.flash['808'] || 0;
    for (const n of notes) {
      const y = n.y * H;
      const on = n.midi === active;
      ctx.strokeStyle = on ? rgba(A, 0.9) : `rgba(255,255,255,${n.root ? 0.16 : 0.07})`;
      ctx.lineWidth = on ? 1.5 + (scene.mode === 'bass' ? hit * 3 : 0) : 1;
      ctx.setLineDash(on || n.root ? [] : [2, 6]);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1 - 44, y);
      ctx.stroke();
      ctx.setLineDash([]);
      this._label(n.label, x1, y, {
        align: 'right', size: on ? 12 : 10, weight: on ? 600 : 500,
        color: on ? '#0b0710' : `rgba(255,255,255,${n.root ? 0.6 : 0.34})`,
        pill: on ? rgba(mix3(A, [1, 1, 1], hit * 0.4), 0.95) : null,
      });
    }
    this._label(title, x1, top + 34, { align: 'right', size: 10, color: 'rgba(255,255,255,0.45)' });
  }

  _rates(scene, top) {
    const { W, H, ctx } = this;
    const A = this.palette[0];
    const x0 = W * 0.56, x1 = W - 24;
    scene.rates.forEach((r, i) => {
      const y = scene.rateY(i) * H;
      const on = scene.rateIdx === i;
      const fl = this.flash['rate' + i] || 0;
      ctx.strokeStyle = on ? rgba(A, 0.85) : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = on ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1 - 58, y);
      ctx.stroke();
      const ticks = Math.round(r.div * 8);
      const tw = (x1 - 70 - x0) * 0.42;
      for (let k = 0; k < ticks; k++) {
        const tx = x1 - 70 - tw + (k / ticks) * tw;
        ctx.fillStyle = on ? rgba(A, 0.9) : 'rgba(255,255,255,0.18)';
        ctx.fillRect(tx, y - 5 - fl * 3, 1.5, 10 + fl * 6);
      }
      this._label(r.label, x1, y, {
        align: 'right', size: on ? 12 : 10, weight: on ? 600 : 500,
        color: on ? '#0b0710' : 'rgba(255,255,255,0.45)', pill: on ? rgba(A, 0.95) : null,
      });
    });
    this._label(scene.rateIdx < 0 ? 'HI-HAT ROLL · AUTO · raise right hand' : 'HI-HAT ROLL · right hand up/down', x1, top + 34, { align: 'right', size: 10, color: 'rgba(255,255,255,0.45)' });
  }

  _hud(scene, time) {
    const { ctx, W, H } = this;
    const hands = scene.gestures.hands;
    const C = this.palette[2];
    const top = scene.safeTop ?? 90;

    this._lcd(scene);
    if (scene.mode === 'pads' && scene.grid) this._pads(scene);
    if (!scene.attract) {
      if (scene.mode === 'bass') this._meter(scene.drive, 'DRIVE', 'left hand · open/close', C);
      if (scene.mode === 'flute') this._meter(hands.left.present ? hands.left.open : 0.6, 'VIBRATO', 'left hand · open/close', C);
      if (scene.mode === 'rolls') this._meter(scene.sweep, 'FILTER', 'left hand · up/down', C);
    }
    if ((scene.mode === 'bass' || scene.mode === 'flute') && scene.guide) this._ladder(scene, top);
    if (scene.mode === 'rolls') this._rates(scene, top);

    if (scene.dropped) {
      const a = 0.6 + 0.4 * Math.sin(time * 10);
      this._label('OPEN YOUR FIST TO DROP', W / 2, H * 0.3, { align: 'center', size: 13, weight: 600, color: '#0b0710', pill: rgba(mix3(C, [1, 1, 1], 0.2), a) });
    }

    // Space (reverb) link between both hands
    const L = hands.left, R = hands.right;
    if (scene.mode !== 'pads' && L.presence > 0.05 && R.presence > 0.05 && scene.space != null) {
      const a = Math.min(L.presence, R.presence);
      const x1 = L.palm.x * W, y1 = L.palm.y * H, x2 = R.palm.x * W, y2 = R.palm.y * H;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 40;
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.setLineDash([2, 7]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my + 30, x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      this._label(`ROOM ${Math.round(scene.space * 100)}%`, mx, my + 14, { align: 'center', size: 10, color: 'rgba(255,255,255,0.7)', pill: 'rgba(8,6,12,0.55)' });
      ctx.globalAlpha = 1;
    }
  }

  _watermark(scene) {
    const { W, H } = this;
    this._label('KNUCKLES', 24, H - 28, { size: 24, font: '"Anton", Impact, sans-serif', weight: 400, color: 'rgba(255,255,255,0.92)' });
    this._label(`${scene.modeLabel} · ${scene.keyLabel} · played with bare hands`, 138, H - 27, { size: 10.5, color: 'rgba(255,255,255,0.5)' });
    this._label('chris-wozniczek.github.io/knuckles', W - 24, H - 27, { align: 'right', size: 10.5, color: 'rgba(255,255,255,0.5)' });
  }
}
