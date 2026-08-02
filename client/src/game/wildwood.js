import * as THREE from 'three';

export function mountWildwood(container) {
"use strict";

const abortCtrl = new AbortController();
let disposed = false;

container.innerHTML = `
<div id="canvasWrap"></div>

<div id="blocker">
  <h1>Extreme Frontier</h1>
  <div class="sub">a survival experience</div>
  <button id="startBtn">Enter the Woods</button>
  <div class="hint">
    <b>WASD</b> move &nbsp; <b>Shift</b> sprint &nbsp; <b>Space</b> jump &nbsp; <b>Mouse</b> look<br>
    <b>E</b> gather / drink / interact &nbsp; <b>F</b> attack &nbsp; <b>C</b> crafting &nbsp; <b>Esc</b> release cursor<br>
    Survive the night. Keep hunger, thirst and warmth up. Build a fire before dark.
  </div>
</div>

<div id="deathScreen">
  <h1>You Perished</h1>
  <p id="deathReason">The wilderness claims another soul.</p>
  <button id="respawnBtn">Return to the Woods</button>
</div>

<div id="hud">
  <div id="crosshair"></div>
  <div id="topBar">
    <div id="dayLabel">Day 1 — Dawn</div>
    <div id="clock">06:00</div>
  </div>
  <div id="compass"></div>
  <div id="msgLog"></div>
  <div id="interactPrompt">Press <b>E</b> to <span id="interactVerb">gather</span></div>

  <div class="barPanel">
    <div class="stat"><div class="label"><span>Health</span><span id="hpText">100</span></div><div class="track"><div class="fill" id="hpFill"></div></div></div>
    <div class="stat"><div class="label"><span>Hunger</span><span id="hungerText">100</span></div><div class="track"><div class="fill" id="hungerFill"></div></div></div>
    <div class="stat"><div class="label"><span>Thirst</span><span id="thirstText">100</span></div><div class="track"><div class="fill" id="thirstFill"></div></div></div>
    <div class="stat"><div class="label"><span>Stamina</span><span id="stamText">100</span></div><div class="track"><div class="fill" id="stamFill"></div></div></div>
    <div class="stat"><div class="label"><span>Warmth</span><span id="tempText">100</span></div><div class="track"><div class="fill" id="tempFill"></div></div></div>
  </div>

  <div id="inventoryPanel">
    <div class="title">Satchel</div>
    <div class="invRow"><span>Wood</span><span id="invWood">0</span></div>
    <div class="invRow"><span>Stone</span><span id="invStone">0</span></div>
    <div class="invRow"><span>Fiber</span><span id="invFiber">0</span></div>
    <div class="invRow"><span>Berries</span><span id="invBerries">0</span></div>
    <div class="invRow"><span>Raw Meat</span><span id="invRawMeat">0</span></div>
    <div class="invRow"><span>Cooked Meat</span><span id="invCookedMeat">0</span></div>
    <div class="invRow"><span>Spear</span><span id="invSpear">0</span></div>
    <div class="invRow"><span>Torch</span><span id="invTorch">0</span></div>
  </div>

  <div id="hotbar"></div>
</div>

<div id="craftMenu">
  <div id="craftPanel">
    <span id="closeCraft">&times; close</span>
    <h2>Craft</h2>
    <div class="sub">Gathered materials become tools, weapons, and warmth.</div>
    <div id="recipeList"></div>
  </div>
</div>
`;

/* ============ SETUP ============ */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 800);
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('canvasWrap').appendChild(renderer.domElement);

/* ---- Procedural textures (no external assets needed) ---- */
function makeTexture(size, painter){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}
function noiseFill(ctx,size,base,variance,cell){
  for(let y=0;y<size;y+=cell){
    for(let x=0;x<size;x+=cell){
      const v = base + (Math.random()-0.5)*variance;
      ctx.fillStyle = `rgb(${v[0]|0},${v[1]|0},${v[2]|0})`;
      ctx.fillRect(x,y,cell,cell);
    }
  }
}
function noiseFillArr(ctx,size,base,variance,cell){
  for(let y=0;y<size;y+=cell){
    for(let x=0;x<size;x+=cell){
      const r = base[0]+(Math.random()-0.5)*variance;
      const g = base[1]+(Math.random()-0.5)*variance;
      const b = base[2]+(Math.random()-0.5)*variance;
      ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
      ctx.fillRect(x,y,cell,cell);
    }
  }
}
const grassTexture = makeTexture(256, (ctx,s)=>{
  ctx.fillStyle='rgb(58,78,38)'; ctx.fillRect(0,0,s,s);
  for(let i=0;i<3200;i++){
    const x=Math.random()*s, y=Math.random()*s;
    const g = 70+Math.random()*70;
    ctx.fillStyle = `rgba(${g*0.55|0},${g|0},${g*0.4|0},0.5)`;
    ctx.fillRect(x,y,1.6,1.6);
  }
  for(let i=0;i<400;i++){
    const x=Math.random()*s, y=Math.random()*s;
    ctx.fillStyle='rgba(40,50,24,0.4)';
    ctx.fillRect(x,y,2.5,2.5);
  }
});
grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(46,46);
grassTexture.anisotropy = 4;

const grassBump = makeTexture(256, (ctx,s)=>{
  noiseFillArr(ctx,s,[128,128,128],60,3);
});
grassBump.wrapS = grassBump.wrapT = THREE.RepeatWrapping;
grassBump.repeat.set(46,46);

const barkTexture = makeTexture(128, (ctx,s)=>{
  ctx.fillStyle='rgb(58,40,28)'; ctx.fillRect(0,0,s,s);
  for(let x=0;x<s;x+=3){
    const shade = 30+Math.random()*35;
    ctx.fillStyle=`rgba(${shade|0},${shade*0.65|0},${shade*0.42|0},0.6)`;
    ctx.fillRect(x,0,2,s);
  }
  for(let i=0;i<40;i++){
    ctx.fillStyle='rgba(20,14,8,0.35)';
    ctx.fillRect(Math.random()*s, Math.random()*s, 6, 1.5);
  }
});
barkTexture.wrapS = barkTexture.wrapT = THREE.RepeatWrapping;
barkTexture.repeat.set(1,3);

const stoneTexture = makeTexture(128, (ctx,s)=>{
  noiseFillArr(ctx,s,[118,113,104],40,4);
  for(let i=0;i<60;i++){
    ctx.fillStyle='rgba(60,56,50,0.3)';
    ctx.beginPath(); ctx.arc(Math.random()*s,Math.random()*s,1+Math.random()*3,0,Math.PI*2); ctx.fill();
  }
});
stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
stoneTexture.repeat.set(2,2);

const leafTexture = makeTexture(64, (ctx,s)=>{
  noiseFillArr(ctx,s,[42,72,34],26,4);
});
leafTexture.wrapS = leafTexture.wrapT = THREE.RepeatWrapping;
leafTexture.repeat.set(2,2);

/* ============ INSTANCED GRASS (dense field around player) ============ */
const GRASS_COUNT = 1100;
const GRASS_RADIUS = 16;
const bladeGeo = new THREE.PlaneGeometry(0.05, 0.4, 1, 3);
bladeGeo.translate(0, 0.2, 0);
const grassMat = new THREE.ShaderMaterial({
  uniforms:{
    uTime:{value:0},
    uColorA:{value:new THREE.Color(0x5a7a3c)},
    uColorB:{value:new THREE.Color(0x2c4420)},
    uLight:{value:1.0}
  },
  vertexShader:`
    #include <common>
    uniform float uTime;
    varying float vH;
    void main(){
      vH = position.y / 0.4;
      vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0);
      float sway = sin(uTime*1.6 + wp.x*0.8 + wp.z*0.8) * 0.07 * vH * vH;
      wp.x += sway;
      wp.z += sway*0.4;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader:`
    uniform vec3 uColorA; uniform vec3 uColorB; uniform float uLight;
    varying float vH;
    void main(){
      vec3 col = mix(uColorB, uColorA, vH) * uLight;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.DoubleSide
});
const grassMesh = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_COUNT);
grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
grassMesh.frustumCulled = false;
scene.add(grassMesh);

const grassDummy = new THREE.Object3D();
const grassCenter = new THREE.Vector2(99999,99999);
function scatterGrass(cx,cz){
  grassCenter.set(cx,cz);
  for(let i=0;i<GRASS_COUNT;i++){
    const a = Math.random()*Math.PI*2;
    const r = Math.sqrt(Math.random())*GRASS_RADIUS;
    const x = cx + Math.cos(a)*r;
    const z = cz + Math.sin(a)*r;
    // thin out grass where a resource object already sits, so it doesn't clip through trunks/rocks
    let clear = true;
    for(const c of collidables){
      const dx=x-c.x, dz=z-c.z;
      if(dx*dx+dz*dz < ((c.radius||0.6)+0.3)*((c.radius||0.6)+0.3)){ clear=false; break; }
    }
    const y = groundHeightAt(x,z);
    if(!clear){ grassDummy.scale.set(0,0,0); }
    else {
      const s = 0.65+Math.random()*0.7;
      grassDummy.scale.set(s, s*(0.75+Math.random()*0.6), s);
    }
    grassDummy.position.set(x,y,z);
    grassDummy.rotation.y = Math.random()*Math.PI*2;
    grassDummy.updateMatrix();
    grassMesh.setMatrixAt(i, grassDummy.matrix);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
}
// (grass scattered once player + collidables exist — see below)

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizePostTargets();
  finalMat.uniforms.uAspect.value = window.innerWidth/window.innerHeight;
}, {signal: abortCtrl.signal});

/* ============ POST-PROCESSING: bloom, filmic grade, vignette, grain ============ */
const postPixelRatio = renderer.getPixelRatio();
function rtDims(scale){
  return {
    w: Math.max(4, Math.floor(window.innerWidth*postPixelRatio*scale)),
    h: Math.max(4, Math.floor(window.innerHeight*postPixelRatio*scale))
  };
}
const rtParams = {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, stencilBuffer:false};
const sceneRT = new THREE.WebGLRenderTarget(4,4, rtParams);
const bloomRT = new THREE.WebGLRenderTarget(4,4, rtParams);
function resizePostTargets(){
  const full = rtDims(1);
  sceneRT.setSize(full.w, full.h);
  const half = rtDims(0.28);
  bloomRT.setSize(half.w, half.h);
}
resizePostTargets();

const postCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const postQuadGeo = new THREE.PlaneGeometry(2,2);

const bloomMat = new THREE.ShaderMaterial({
  uniforms:{ tDiffuse:{value:null}, uTexel:{value:new THREE.Vector2(1/1024,1/1024)}, uThreshold:{value:0.68} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader:`
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold;
    varying vec2 vUv;
    vec3 sampleBright(vec2 uv){
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float lum = dot(c, vec3(0.2126,0.7152,0.0722));
      float w = smoothstep(uThreshold, uThreshold+0.3, lum);
      return c*w;
    }
    void main(){
      vec2 o = uTexel*2.4;
      vec3 sum = sampleBright(vUv)*0.28;
      sum += sampleBright(vUv+vec2(o.x,0.0))*0.12;
      sum += sampleBright(vUv-vec2(o.x,0.0))*0.12;
      sum += sampleBright(vUv+vec2(0.0,o.y))*0.12;
      sum += sampleBright(vUv-vec2(0.0,o.y))*0.12;
      sum += sampleBright(vUv+vec2(o.x,o.y))*0.06;
      sum += sampleBright(vUv-vec2(o.x,o.y))*0.06;
      sum += sampleBright(vUv+vec2(o.x,-o.y))*0.06;
      sum += sampleBright(vUv+vec2(-o.x,o.y))*0.06;
      gl_FragColor = vec4(sum,1.0);
    }
  `
});
const bloomQuad = new THREE.Mesh(postQuadGeo, bloomMat);
const bloomScene = new THREE.Scene(); bloomScene.add(bloomQuad);

const finalMat = new THREE.ShaderMaterial({
  uniforms:{
    tScene:{value:null}, tBloom:{value:null},
    uBloomStrength:{value:0.5},
    uVignette:{value:0.38},
    uGrain:{value:0.03},
    uTime:{value:0},
    uAspect:{value:window.innerWidth/window.innerHeight}
  },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader:`
    uniform sampler2D tScene; uniform sampler2D tBloom;
    uniform float uBloomStrength; uniform float uVignette; uniform float uGrain; uniform float uTime;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)))*43758.5453 + uTime*17.0); }
    void main(){
      vec3 col = texture2D(tScene, vUv).rgb;
      vec3 bloom = texture2D(tBloom, vUv).rgb;
      col += bloom*uBloomStrength;

      // gentle filmic S-curve contrast + a touch of extra saturation
      col = mix(col, col*col*(3.0-2.0*col), 0.2);
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, 1.1);

      // vignette
      vec2 c = vUv-0.5;
      float vig = 1.0 - dot(c,c)*uVignette*2.2;
      col *= clamp(vig,0.0,1.0);

      // film grain
      float g = (rand(vUv*vec2(1920.0,1080.0)) - 0.5)*uGrain;
      col += g;

      gl_FragColor = vec4(col,1.0);
    }
  `
});
const finalQuad = new THREE.Mesh(postQuadGeo, finalMat);
const finalScene = new THREE.Scene(); finalScene.add(finalQuad);

function renderWithPost(){
  bloomMat.uniforms.uTexel.value.set(1/sceneRT.width, 1/sceneRT.height);

  renderer.setRenderTarget(sceneRT);
  renderer.render(scene, camera);

  bloomMat.uniforms.tDiffuse.value = sceneRT.texture;
  renderer.setRenderTarget(bloomRT);
  renderer.render(bloomScene, postCamera);

  finalMat.uniforms.tScene.value = sceneRT.texture;
  finalMat.uniforms.tBloom.value = bloomRT.texture;
  finalMat.uniforms.uTime.value = gameTotalTime;
  renderer.setRenderTarget(null);
  renderer.render(finalScene, postCamera);
}

/* ============ WORLD ============ */
const WORLD_SIZE = 260;

const skyColorDay = new THREE.Color(0x8fc4de);
const skyColorNight = new THREE.Color(0x050812);
scene.fog = new THREE.Fog(0x8fc4de, 30, 190);
renderer.setClearColor(skyColorDay);

/* ---- Sky dome (gradient) ---- */
const skyUniforms = {
  topColor: {value: new THREE.Color(0x3f7fb0)},
  bottomColor: {value: new THREE.Color(0xcfe6ee)},
  offset: {value: 8},
  exponent: {value: 0.7}
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(400, 24, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    fog: false,
    vertexShader:`
      varying vec3 vWorldPos;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader:`
      uniform vec3 topColor; uniform vec3 bottomColor;
      uniform float offset; uniform float exponent;
      varying vec3 vWorldPos;
      void main(){
        float h = normalize(vWorldPos + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h,0.0), exponent),0.0)), 1.0);
      }`
  })
);
scene.add(skyDome);

// sun glow sprite
const sunGlowTex = makeTexture(128,(ctx,s)=>{
  const g = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(255,244,214,1)');
  g.addColorStop(0.4,'rgba(255,214,140,0.55)');
  g.addColorStop(1,'rgba(255,214,140,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
});
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:sunGlowTex, transparent:true, depthWrite:false, fog:false}));
sunSprite.scale.set(60,60,1);
scene.add(sunSprite);

// stars
const starCount = 1200;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){
  const r = 380;
  const theta = Math.random()*Math.PI*2;
  const phi = Math.acos(Math.random()*0.9); // upper hemisphere-ish
  starPos[i*3] = r*Math.sin(phi)*Math.cos(theta);
  starPos[i*3+1] = Math.abs(r*Math.cos(phi))*0.9 + 20;
  starPos[i*3+2] = r*Math.sin(phi)*Math.sin(theta);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos,3));
const starMat = new THREE.PointsMaterial({color:0xffffff, size:1.6, transparent:true, opacity:0, sizeAttenuation:false, fog:false});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// Ground
const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 60, 60);
groundGeo.rotateX(-Math.PI/2);
// gentle undulation
const gpos = groundGeo.attributes.position;
for(let i=0;i<gpos.count;i++){
  const x = gpos.getX(i), z = gpos.getZ(i);
  const h = Math.sin(x*0.04)*1.4 + Math.cos(z*0.05)*1.4 + Math.sin((x+z)*0.02)*1.0;
  gpos.setY(i, h);
}
groundGeo.computeVertexNormals();
const groundMat = new THREE.MeshStandardMaterial({
  map:grassTexture, bumpMap:grassBump, bumpScale:0.06,
  roughness:1, metalness:0
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
scene.add(ground);

function groundHeightAt(x,z){
  const h = Math.sin(x*0.04)*1.4 + Math.cos(z*0.05)*1.4 + Math.sin((x+z)*0.02)*1.0;
  return h;
}

// Lighting
const hemi = new THREE.HemisphereLight(0xbdd8ea, 0x33421f, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(512,512);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.far = 200;
scene.add(sun);
scene.add(sun.target);
const moonAmbient = new THREE.AmbientLight(0x1a2440, 0.15);
scene.add(moonAmbient);

// Water pond
const waterUniforms = {
  uTime:{value:0},
  uDeep:{value:new THREE.Color(0x123a49)},
  uShallow:{value:new THREE.Color(0x3f8697)},
  uSunDir:{value:new THREE.Vector3(0,1,0)}
};
const waterMat = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  transparent:true,
  fog:false,
  vertexShader:`
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldPos;
    void main(){
      vUv = uv;
      vNormal = normalMatrix * normal;
      vec4 wp = modelMatrix * vec4(position,1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader:`
    uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSunDir;
    varying vec2 vUv; varying vec3 vWorldPos;
    void main(){
      vec2 c = vUv - 0.5;
      float d = length(c);
      float ripple = sin((d*26.0 - uTime*1.6))*0.5+0.5;
      float ripple2 = sin((vWorldPos.x*3.0+vWorldPos.z*3.0) + uTime*1.1)*0.5+0.5;
      float shimmer = ripple*0.35 + ripple2*0.25;
      vec3 col = mix(uDeep, uShallow, 0.4+shimmer*0.5);
      float edge = smoothstep(0.5,0.42,d);
      float alpha = 0.78*edge + 0.15;
      col += pow(max(dot(normalize(vec3(0.3,1.0,0.2)), uSunDir),0.0),3.0)*0.15;
      gl_FragColor = vec4(col, alpha);
    }`
});
function makePond(x,z,r){
  const g = new THREE.CircleGeometry(r, 32);
  g.rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(g, waterMat);
  mesh.position.set(x, groundHeightAt(x,z)+0.05, z);
  mesh.userData.isWater = true;
  scene.add(mesh);
  // pebbled rim (merged into a single mesh below via pondPebbleParts)
  for(let i=0;i<8;i++){
    const a = (i/8)*Math.PI*2;
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15+Math.random()*0.12,0), rockMat);
    p.position.set(x+Math.cos(a)*(r+0.2), groundHeightAt(x,z)+0.05, z+Math.sin(a)*(r+0.2));
    pondPebbleParts.push(p);
  }
  return mesh;
}
const shadowBlobTex = makeTexture(64,(ctx,s)=>{
  const g = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'rgba(0,0,0,0.5)');
  g.addColorStop(0.65,'rgba(0,0,0,0.22)');
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
});
const shadowBlobMat = new THREE.MeshBasicMaterial({map:shadowBlobTex, transparent:true, depthWrite:false});
const contactShadowParts = [];
function addContactShadow(x,z,radius){
  const g = new THREE.PlaneGeometry(radius*2, radius*2);
  g.rotateX(-Math.PI/2);
  const m = new THREE.Mesh(g, shadowBlobMat);
  m.position.set(x, groundHeightAt(x,z)+0.025, z);
  contactShadowParts.push(m);
}

/* ---- Geometry merging helpers (collapse many small meshes into one draw call) ---- */
function mergeBufferGeoms(geoms){
  let total = 0;
  geoms.forEach(g=>{ total += g.attributes.position.count; });
  const positions = new Float32Array(total*3);
  const normals = new Float32Array(total*3);
  const uvs = new Float32Array(total*2);
  let po=0, no=0, uo=0;
  geoms.forEach(g=>{
    const p=g.attributes.position, n=g.attributes.normal, u=g.attributes.uv;
    positions.set(p.array, po); po += p.array.length;
    if(n){ normals.set(n.array, no); no += n.array.length; }
    if(u){ uvs.set(u.array, uo); uo += u.array.length; }
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions,3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals,3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs,2));
  return merged;
}
function mergeMeshesToOne(meshes){
  if(meshes.length===1) return meshes[0];
  const geoms = meshes.map(m=>{
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const gc = g.clone();
    gc.applyMatrix4(m.matrix);
    return gc;
  });
  const merged = mergeBufferGeoms(geoms);
  const out = new THREE.Mesh(merged, meshes[0].material);
  out.castShadow = meshes[0].castShadow;
  out.receiveShadow = meshes[0].receiveShadow;
  return out;
}

/* ---- Resource objects ---- */
const trees = [];
const rocks = [];
const bushes = [];
const collidables = []; // {pos, radius}
const pondPebbleParts = [];

const barkMat = new THREE.MeshStandardMaterial({map:barkTexture, roughness:0.95, metalness:0});
const leafMatA = new THREE.MeshStandardMaterial({map:leafTexture, color:0x4a7a3a, roughness:0.85, metalness:0});
const leafMatB = new THREE.MeshStandardMaterial({map:leafTexture, color:0x3d6a30, roughness:0.85, metalness:0});
const rockMat = new THREE.MeshStandardMaterial({map:stoneTexture, roughness:0.95, metalness:0.05});
const berryMat = new THREE.MeshStandardMaterial({color:0xa32c3a, roughness:0.4, metalness:0});
const bushLeafMat = new THREE.MeshStandardMaterial({map:leafTexture, color:0x3f6b2a, roughness:0.85});

const ponds = [makePond(18,-30,9), makePond(-60,40,7)];
if(pondPebbleParts.length){
  const pebbleMesh = mergeMeshesToOne(pondPebbleParts);
  pebbleMesh.castShadow = false; pebbleMesh.receiveShadow = true;
  scene.add(pebbleMesh);
}

function makeTree(x,z){
  const grp = new THREE.Group();
  const trunkH = 3 + Math.random()*1.8;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.4,trunkH,6), barkMat);
  trunk.position.y = trunkH/2;
  trunk.castShadow = true; trunk.receiveShadow = true;
  trunk.updateMatrix();

  // layered organic foliage using icosahedrons for a less "toy cone" look —
  // built as separate meshes, then merged into ONE draw call per tree
  const leafMat = Math.random()>0.5?leafMatA:leafMatB;
  const clusterCount = 3;
  const leafParts = [];
  for(let i=0;i<clusterCount;i++){
    const s = 1.0 + Math.random()*0.55;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s,0), leafMat);
    const a = Math.random()*Math.PI*2;
    const r = i===0?0:0.5+Math.random()*0.5;
    leaf.position.set(Math.cos(a)*r, trunkH - 0.5 + i*0.75 + Math.random()*0.3, Math.sin(a)*r);
    leaf.scale.y = 0.85;
    leaf.rotation.set(Math.random(),Math.random(),Math.random());
    leaf.castShadow = true; leaf.receiveShadow = true;
    leaf.updateMatrix();
    leafParts.push(leaf);
  }
  const leafMesh = mergeMeshesToOne(leafParts);
  grp.add(trunk, leafMesh);

  const y = groundHeightAt(x,z);
  grp.position.set(x,y,z);
  grp.rotation.y = Math.random()*Math.PI*2;
  scene.add(grp);
  addContactShadow(x,z,1.15);
  const data = {mesh:grp, x,z,y, hp:3, type:'tree', alive:true, radius:0.6, respawnAt:0};
  trees.push(data);
  collidables.push(data);
  return data;
}
function makeRock(x,z){
  const s = 0.7+Math.random()*0.6;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s,1), rockMat);
  // deform vertices slightly for a more natural, less uniform silhouette
  const pos = rock.geometry.attributes.position;
  for(let i=0;i<pos.count;i++){
    const nx=pos.getX(i), ny=pos.getY(i), nz=pos.getZ(i);
    const n = 1 + (Math.random()-0.5)*0.18;
    pos.setXYZ(i, nx*n, ny*n, nz*n);
  }
  rock.geometry.computeVertexNormals();
  rock.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
  const y = groundHeightAt(x,z);
  rock.position.set(x,y+s*0.3,z);
  rock.castShadow = false; rock.receiveShadow = true;
  rock.updateMatrix();

  // one small satellite pebble, merged in
  const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(s*0.28,0), rockMat);
  const a = Math.random()*Math.PI*2;
  pebble.position.set(x+Math.cos(a)*s*0.9, y+s*0.12, z+Math.sin(a)*s*0.9);
  pebble.castShadow = false; pebble.receiveShadow = true;
  pebble.updateMatrix();

  const merged = mergeMeshesToOne([rock, pebble]);
  scene.add(merged);
  addContactShadow(x,z,s*1.5);
  const data = {mesh:merged,x,z,y,hp:3,type:'rock',alive:true,radius:s*0.7,respawnAt:0};
  rocks.push(data);
  collidables.push(data);
  return data;
}
function makeBush(x,z){
  const grp = new THREE.Group();
  const lobeParts = [];
  for(let i=0;i<3;i++){
    const s = 0.35+Math.random()*0.25;
    const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(s,0), bushLeafMat);
    lobe.position.set((Math.random()-0.5)*0.5, 0.25+Math.random()*0.2, (Math.random()-0.5)*0.5);
    lobe.castShadow = false;
    lobe.updateMatrix();
    lobeParts.push(lobe);
  }
  const lobeMesh = mergeMeshesToOne(lobeParts);

  const berryGeo = new THREE.SphereGeometry(0.07,5,5);
  const berryParts = [];
  for(let i=0;i<6;i++){
    const b = new THREE.Mesh(berryGeo, berryMat);
    b.position.set((Math.random()-0.5)*0.7,(Math.random()-0.1)*0.5,(Math.random()-0.5)*0.7);
    b.updateMatrix();
    berryParts.push(b);
  }
  const berryMesh = mergeMeshesToOne(berryParts);
  grp.add(lobeMesh, berryMesh);

  const y = groundHeightAt(x,z);
  grp.position.set(x,y+0.15,z);
  scene.add(grp);
  addContactShadow(x,z,0.75);
  const data = {mesh:grp,x,z,y,hasBerries:true,type:'bush',alive:true,radius:0.5,respawnAt:0};
  bushes.push(data);
  return data;
}

function randPos(minR){
  let x,z,d;
  do{
    x = (Math.random()-0.5)*WORLD_SIZE*0.92;
    z = (Math.random()-0.5)*WORLD_SIZE*0.92;
    d = Math.hypot(x,z);
  }while(d<minR);
  return [x,z];
}

for(let i=0;i<65;i++){ const [x,z]=randPos(6); makeTree(x,z); }
for(let i=0;i<28;i++){ const [x,z]=randPos(6); makeRock(x,z); }
for(let i=0;i<20;i++){ const [x,z]=randPos(4); makeBush(x,z); }

// batch every contact shadow blob into a single draw call
if(contactShadowParts.length){
  const shadowMesh = mergeMeshesToOne(contactShadowParts);
  shadowMesh.renderOrder = 1;
  scene.add(shadowMesh);
}


/* ---- Campfires (player placed) ---- */
const campfires = [];
function placeCampfire(x,z){
  const grp = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(0.06,0.06,1,5);
  const logMat = new THREE.MeshLambertMaterial({color:0x3a2818});
  for(let i=0;i<5;i++){
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.z = Math.PI/2;
    log.rotation.y = i*(Math.PI/5);
    log.position.y = 0.12;
    grp.add(log);
  }
  const flameMat = new THREE.MeshBasicMaterial({color:0xff9838});
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28,0.7,8), flameMat);
  flame.position.y = 0.5;
  grp.add(flame);
  const light = new THREE.PointLight(0xff9838, 1.6, 14, 2);
  light.position.y = 0.6;
  grp.add(light);
  const y = groundHeightAt(x,z);
  grp.position.set(x,y,z);
  scene.add(grp);
  const data = {mesh:grp, flame, light, x,z,y, radius:1.4, life:600, lit:true};
  campfires.push(data);
  collidables.push({x,z,radius:0.8});
  return data;
}

/* ============ PLAYER ============ */
const player = {
  height: 1.7,
  radius: 0.35,
  pos: new THREE.Vector3(0, 0, 8),
  velY: 0,
  onGround: true,
  yaw: 0,
  pitch: 0,
  speed: 4.2,
  sprintMult: 1.9,
  hp: 100, hunger: 100, thirst: 100, stamina: 100, warmth: 100,
  alive: true,
  hasSpear: false,
  attackCooldown: 0,
};
player.pos.y = groundHeightAt(player.pos.x, player.pos.z) + player.height;
camera.position.copy(player.pos);
scatterGrass(player.pos.x, player.pos.z);

const inventory = {wood:0, stone:0, fiber:0, berries:0, rawMeat:0, cookedMeat:0, spear:0, torch:0};
let bobPhase = 0;

/* ---- Pointer lock look ---- */
const blocker = document.getElementById('blocker');
const startBtn = document.getElementById('startBtn');
let locked = false;

startBtn.addEventListener('click', ()=>{
  renderer.domElement.requestPointerLock();
}, {signal: abortCtrl.signal});
document.addEventListener('pointerlockchange', ()=>{
  locked = document.pointerLockElement === renderer.domElement;
  blocker.style.display = locked ? 'none' : 'flex';
}, {signal: abortCtrl.signal});
document.addEventListener('mousemove', (e)=>{
  if(!locked || !player.alive) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, player.pitch));
}, {signal: abortCtrl.signal});

/* ---- Keyboard ---- */
const keys = {};
window.addEventListener('keydown', (e)=>{
  keys[e.code] = true;
  if(e.code==='KeyE') tryInteract();
  if(e.code==='KeyF') tryAttack();
  if(e.code==='KeyC') toggleCraft();
  if(e.code==='Space' && player.onGround && player.alive){ player.velY = 5.2; player.onGround=false; }
  if(e.code>='Digit1' && e.code<='Digit8'){ selectHotbar(parseInt(e.code.slice(-1))-1); }
}, {signal: abortCtrl.signal});
window.addEventListener('keyup', (e)=>{ keys[e.code]=false; }, {signal: abortCtrl.signal});

/* ============ TIME / DAY-NIGHT ============ */
const DAY_LENGTH = 300; // seconds per full day
let gameTime = 6/24 * DAY_LENGTH; // start at 06:00
let dayCount = 1;

function updateTimeOfDay(dt){
  gameTime += dt;
  if(gameTime >= DAY_LENGTH){ gameTime -= DAY_LENGTH; dayCount++; }
  const frac = gameTime / DAY_LENGTH; // 0..1
  const hours = Math.floor(frac*24);
  const mins = Math.floor((frac*24*60)%60);
  document.getElementById('clock').textContent = String(hours).padStart(2,'0')+':'+String(mins).padStart(2,'0');
  let label = 'Night';
  if(frac>=0.22 && frac<0.32) label='Dawn';
  else if(frac>=0.32 && frac<0.68) label='Day';
  else if(frac>=0.68 && frac<0.78) label='Dusk';
  else label='Night';
  document.getElementById('dayLabel').textContent = `Day ${dayCount} — ${label}`;

  // sun angle
  const angle = frac*Math.PI*2 - Math.PI/2;
  const sunHeight = Math.sin(angle);
  sun.position.set(Math.cos(angle)*100, Math.max(sunHeight,-0.15)*100, 40);
  sun.target.position.copy(player.pos);
  const dayness = Math.max(0, sunHeight);
  dayFactor = dayness;
  sun.intensity = 0.15 + dayness*1.15;
  hemi.intensity = 0.25 + dayness*0.75;
  moonAmbient.intensity = 0.35 - dayness*0.25;

  const skyT = Math.max(0, Math.min(1, dayness*1.6));
  const sky = skyColorNight.clone().lerp(skyColorDay, skyT);
  renderer.setClearColor(sky);
  scene.fog.color.copy(sky);
  scene.fog.near = 20 + skyT*20;
  scene.fog.far = 110 + skyT*100;

  const duskGlow = Math.max(0, 1 - Math.abs(sunHeight)*3) * 0.5;
  const topDay = new THREE.Color(0x3f7fb0), topNight = new THREE.Color(0x030410);
  const botDay = new THREE.Color(0xcfe6ee), botNight = new THREE.Color(0x0c1526);
  const botDusk = new THREE.Color(0xd98a52);
  skyUniforms.topColor.value.copy(topNight).lerp(topDay, skyT);
  skyUniforms.bottomColor.value.copy(botNight).lerp(botDay, skyT).lerp(botDusk, duskGlow);

  sunSprite.position.copy(sun.position).normalize().multiplyScalar(370).add(player.pos.clone().setY(0));
  sunSprite.material.opacity = 0.15 + dayness*0.85;
  sunSprite.scale.setScalar(50 + duskGlow*40);

  starMat.opacity = clamp(1 - skyT*2.2, 0, 0.9);
  stars.position.copy(player.pos).setY(0);

  isNight = dayness < 0.12;
}
let isNight = false;
let dayFactor = 1;

/* ============ STATS ============ */
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function updateStats(dt){
  if(!player.alive) return;
  player.hunger = clamp(player.hunger - dt*0.55, 0, 100);
  player.thirst = clamp(player.thirst - dt*0.75, 0, 100);

  const sprinting = keys['ShiftLeft'] && (keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']);
  if(sprinting && player.stamina>0){
    player.stamina = clamp(player.stamina - dt*14, 0, 100);
  } else {
    player.stamina = clamp(player.stamina + dt*9, 0, 100);
  }

  // warmth: drops at night unless near fire, drops faster if in water
  const nearFire = campfires.some(f=>f.lit && dist2(player.pos.x,player.pos.z,f.x,f.z) < f.radius*f.radius*9);
  let warmthDelta = 0;
  if(isNight) warmthDelta -= 3.2;
  else warmthDelta += 2.0;
  if(nearFire) warmthDelta += 9;
  player.warmth = clamp(player.warmth + warmthDelta*dt, 0, 100);

  let dmg = 0;
  if(player.hunger<=0) dmg += 2.2*dt;
  if(player.thirst<=0) dmg += 3*dt;
  if(player.warmth<=0) dmg += 2.5*dt;
  if(dmg>0) player.hp = clamp(player.hp - dmg, 0, 100);
  else if(player.hunger>40 && player.thirst>40) player.hp = clamp(player.hp + 1.2*dt, 0, 100);

  if(player.hp<=0 && player.alive){ die(player.hunger<=0?'You starved to death.':player.thirst<=0?'You died of dehydration.':player.warmth<=0?'You froze in the night.':'The wilds took you.'); }

  document.getElementById('hpFill').style.width = player.hp+'%';
  document.getElementById('hungerFill').style.width = player.hunger+'%';
  document.getElementById('thirstFill').style.width = player.thirst+'%';
  document.getElementById('stamFill').style.width = player.stamina+'%';
  document.getElementById('tempFill').style.width = player.warmth+'%';
  document.getElementById('hpText').textContent = Math.round(player.hp);
  document.getElementById('hungerText').textContent = Math.round(player.hunger);
  document.getElementById('thirstText').textContent = Math.round(player.thirst);
  document.getElementById('stamText').textContent = Math.round(player.stamina);
  document.getElementById('tempText').textContent = Math.round(player.warmth);
}

function dist2(x1,z1,x2,z2){ const dx=x1-x2, dz=z1-z2; return dx*dx+dz*dz; }

/* ============ MESSAGES ============ */
const msgLog = document.getElementById('msgLog');
function showMsg(text){
  const el = document.createElement('div');
  el.className='msg';
  el.textContent = text;
  msgLog.appendChild(el);
  setTimeout(()=>el.remove(), 4600);
}

/* ============ INVENTORY UI ============ */
function refreshInventory(){
  document.getElementById('invWood').textContent = inventory.wood;
  document.getElementById('invStone').textContent = inventory.stone;
  document.getElementById('invFiber').textContent = inventory.fiber;
  document.getElementById('invBerries').textContent = inventory.berries;
  document.getElementById('invRawMeat').textContent = inventory.rawMeat;
  document.getElementById('invCookedMeat').textContent = inventory.cookedMeat;
  document.getElementById('invSpear').textContent = inventory.spear;
  document.getElementById('invTorch').textContent = inventory.torch;
}
refreshInventory();

/* ============ HOTBAR (consumables) ============ */
const hotbarItems = [
  {key:'berries', label:'Berries', ic:'🍓', use:()=>{ if(inventory.berries>0){inventory.berries--; player.hunger=clamp(player.hunger+8,0,100); showMsg('Ate berries. +Hunger');} }},
  {key:'cookedMeat', label:'Meat', ic:'🍖', use:()=>{ if(inventory.cookedMeat>0){inventory.cookedMeat--; player.hunger=clamp(player.hunger+35,0,100); showMsg('Ate cooked meat. +Hunger');} }},
  {key:'rawMeat', label:'Raw Meat', ic:'🥩', use:()=>{ if(inventory.rawMeat>0){inventory.rawMeat--; player.hunger=clamp(player.hunger+10,0,100); player.hp=clamp(player.hp-4,0,100); showMsg('Ate raw meat... risky. Some hunger, some harm.');} }},
];
let selectedSlot = 0;
const hotbarEl = document.getElementById('hotbar');
function buildHotbar(){
  hotbarEl.innerHTML='';
  hotbarItems.forEach((item,i)=>{
    const slot = document.createElement('div');
    slot.className='slot'+(i===selectedSlot?' selected':'');
    slot.innerHTML = `<div class="ic">${item.ic}</div><div>${item.label}</div><div class="qty">${inventory[item.key]}</div>`;
    slot.addEventListener('click', ()=>{ selectHotbar(i); useSelected(); });
    hotbarEl.appendChild(slot);
  });
}
function selectHotbar(i){ if(i>=0 && i<hotbarItems.length){ selectedSlot=i; buildHotbar(); } }
function useSelected(){ hotbarItems[selectedSlot].use(); refreshInventory(); buildHotbar(); }
buildHotbar();
window.addEventListener('keydown', (e)=>{ if(e.code==='KeyQ') useSelected(); }, {signal: abortCtrl.signal});

/* ============ INTERACTION (gather/drink) ============ */
const raycaster = new THREE.Raycaster();
const interactPrompt = document.getElementById('interactPrompt');
const interactVerb = document.getElementById('interactVerb');
const crosshair = document.getElementById('crosshair');
let currentTarget = null; // {type, data}

function findInteractTarget(){
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const px = player.pos.x, pz = player.pos.z;

  // nearest interactable within range & roughly in front
  let best=null, bestScore=1.6;
  function consider(obj, type, range){
    if(obj.alive===false) return;
    const dx=obj.x-px, dz=obj.z-pz;
    const d = Math.hypot(dx,dz);
    if(d>range) return;
    const dot = (dx/d)*camDir.x + (dz/d)*camDir.z;
    if(d<1.6 || dot>0.55){
      const score = d - (dot*1.2);
      if(score<bestScore){ bestScore=score; best={type,obj}; }
    }
  }
  trees.forEach(t=>consider(t,'tree',3.2));
  rocks.forEach(r=>consider(r,'rock',3.0));
  bushes.forEach(b=>{ if(b.hasBerries) consider(b,'bush',2.6); });
  ponds.forEach(p=>{
    const d = Math.hypot(p.position.x-px, p.position.z-pz);
    if(d < p.geometry.parameters.radius+2.2){ if(d-2<bestScore){bestScore=d-2; best={type:'water',obj:p};} }
  });
  campfires.forEach(f=>{
    const d = Math.hypot(f.x-px, f.z-pz);
    if(d<2.6 && inventory.rawMeat>0){ if(d-1.5<bestScore){bestScore=d-1.5; best={type:'cook',obj:f};} }
  });
  return best;
}

function tryInteract(){
  if(!player.alive) return;
  const t = currentTarget;
  if(!t) return;
  if(t.type==='tree'){
    t.obj.hp--;
    inventory.wood += 2;
    showMsg('Chopped wood (+2)');
    if(t.obj.hp<=0){
      t.obj.alive=false;
      t.obj.mesh.visible=false;
      t.obj.respawnAt = gameTotalTime + 90;
    }
  } else if(t.type==='rock'){
    t.obj.hp--;
    inventory.stone += 2;
    inventory.fiber += (Math.random()<0.3?1:0);
    showMsg('Mined stone (+2)');
    if(t.obj.hp<=0){
      t.obj.alive=false;
      t.obj.mesh.visible=false;
      t.obj.respawnAt = gameTotalTime + 100;
    }
  } else if(t.type==='bush'){
    inventory.berries += 3;
    inventory.fiber += 1;
    showMsg('Picked berries (+3)');
    t.obj.hasBerries=false;
    t.obj.mesh.visible=false;
    t.obj.respawnAt = gameTotalTime + 60;
  } else if(t.type==='water'){
    player.thirst = clamp(player.thirst+45,0,100);
    showMsg('Drank water. +Thirst');
  } else if(t.type==='cook'){
    if(inventory.rawMeat>0){
      inventory.rawMeat--; inventory.cookedMeat++;
      showMsg('Cooked meat over the fire');
    }
  }
  refreshInventory();
  buildHotbar();
}

/* ============ RESPAWNING RESOURCES ============ */
let gameTotalTime = 0;
function updateRespawns(){
  [...trees,...rocks,...bushes].forEach(o=>{
    if(!o.alive && o.respawnAt && gameTotalTime>=o.respawnAt){
      o.alive=true; if(o.type!=='bush'){o.hp=3;} else {o.hasBerries=true;}
      o.mesh.visible=true;
      o.respawnAt=0;
    }
  });
}

/* ============ CRAFTING ============ */
const recipes = [
  {name:'Campfire', desc:'Place a warm, lit fire. Cook meat nearby.', cost:{wood:5,stone:3},
    build:()=>{
      const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
      const x = player.pos.x + camDir.x*2.2, z = player.pos.z + camDir.z*2.2;
      placeCampfire(x,z);
      showMsg('Campfire built');
    }},
  {name:'Spear', desc:'A sharpened wood & stone spear for hunting and defense.', cost:{wood:4,stone:2,fiber:2},
    build:()=>{ inventory.spear++; player.hasSpear=true; showMsg('Spear crafted. Press F to attack.'); }},
  {name:'Torch', desc:'Portable light. Keeps small predators at bay.', cost:{wood:2,fiber:2},
    build:()=>{ inventory.torch++; showMsg('Torch crafted.'); }},
  {name:'Waterskin Draught', desc:'Boil water into a safe long drink. Restores more thirst.', cost:{wood:1,stone:1},
    build:()=>{ player.thirst=clamp(player.thirst+70,0,100); showMsg('Brewed and drank a safe draught. +Thirst'); }},
];

const craftMenu = document.getElementById('craftMenu');
const recipeList = document.getElementById('recipeList');
function toggleCraft(){
  if(!player.alive) return;
  const show = craftMenu.style.display !== 'flex';
  if(show){
    craftMenu.style.display = 'flex';
    document.exitPointerLock();
    renderRecipes();
  } else {
    closeCraftMenu();
  }
}
function closeCraftMenu(){
  craftMenu.style.display = 'none';
  if(player.alive) renderer.domElement.requestPointerLock();
}
document.getElementById('closeCraft').addEventListener('click', closeCraftMenu, {signal: abortCtrl.signal});

function renderRecipes(){
  recipeList.innerHTML='';
  recipes.forEach(r=>{
    const canAfford = Object.entries(r.cost).every(([k,v])=>inventory[k]>=v);
    const row = document.createElement('div');
    row.className='recipe';
    const costStr = Object.entries(r.cost).map(([k,v])=>{
      const have = inventory[k]>=v;
      return `<span class="${have?'ok':'bad'}">${v} ${k}</span>`;
    }).join(' &nbsp;+&nbsp; ');
    row.innerHTML = `
      <div>
        <div class="rname">${r.name}</div>
        <div class="rdesc">${r.desc}</div>
        <div class="rcost">${costStr}</div>
      </div>
      <button class="craftBtn" ${canAfford?'':'disabled'}>Craft</button>
    `;
    row.querySelector('button').addEventListener('click', ()=>{
      Object.entries(r.cost).forEach(([k,v])=>inventory[k]-=v);
      r.build();
      refreshInventory(); buildHotbar(); renderRecipes();
    });
    recipeList.appendChild(row);
  });
}

/* ============ ENEMIES (wolves) ============ */
const wolves = [];
const wolfBodyMat = new THREE.MeshStandardMaterial({color:0x33302c, roughness:0.85, metalness:0});
const wolfBellyMat = new THREE.MeshStandardMaterial({color:0x55504a, roughness:0.85, metalness:0});
function makeWolf(x,z){
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.28,1.05,8), wolfBodyMat);
  body.rotation.z = Math.PI/2;
  body.position.y=0.5; body.castShadow=true;
  grp.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.18,0.4), wolfBellyMat);
  belly.position.set(0,0.32,0);
  grp.add(belly);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.35,7), wolfBodyMat);
  neck.rotation.z = Math.PI/3.2;
  neck.position.set(0.55,0.62,0);
  grp.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.28,0.3), wolfBodyMat);
  head.position.set(0.72,0.72,0);
  grp.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24,0.14,0.16), wolfBodyMat);
  snout.position.set(0.95,0.66,0);
  grp.add(snout);
  const earGeo = new THREE.ConeGeometry(0.06,0.14,4);
  [-0.08,0.08].forEach(ez=>{
    const ear = new THREE.Mesh(earGeo, wolfBodyMat);
    ear.position.set(0.68,0.9,ez);
    grp.add(ear);
  });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09,0.55,6), wolfBodyMat);
  tail.rotation.z = -Math.PI/2.6;
  tail.position.set(-0.68,0.62,0);
  grp.add(tail);
  const legGeo = new THREE.CylinderGeometry(0.06,0.08,0.5,6);
  [[-0.35,-0.16],[-0.35,0.16],[0.35,-0.16],[0.35,0.16]].forEach(([lx,lz])=>{
    const leg = new THREE.Mesh(legGeo, wolfBodyMat);
    leg.position.set(lx,0.25,lz);
    leg.castShadow = true;
    grp.add(leg);
  });
  const eyeGeo = new THREE.SphereGeometry(0.035,6,6);
  const eyeMat = new THREE.MeshBasicMaterial({color:0xff3b1a});
  [-0.09,0.09].forEach(ez=>{
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.86,0.75,ez);
    grp.add(eye);
  });
  const y = groundHeightAt(x,z);
  grp.position.set(x,y,z);
  scene.add(grp);
  const data = {mesh:grp, x,z,y, hp:3, alive:true, state:'idle', hitCooldown:0, speed:2.0};
  wolves.push(data);
  return data;
}

function spawnWolfNearPlayer(){
  const angle = Math.random()*Math.PI*2;
  const r = 30 + Math.random()*15;
  const x = player.pos.x + Math.cos(angle)*r;
  const z = player.pos.z + Math.sin(angle)*r;
  makeWolf(clamp(x,-WORLD_SIZE/2+2,WORLD_SIZE/2-2), clamp(z,-WORLD_SIZE/2+2,WORLD_SIZE/2-2));
}

let wolfSpawnTimer = 0;
function updateWolves(dt){
  wolfSpawnTimer -= dt;
  const maxWolves = isNight?5:1;
  if(wolfSpawnTimer<=0 && wolves.filter(w=>w.alive).length<maxWolves){
    spawnWolfNearPlayer();
    wolfSpawnTimer = isNight? (3+Math.random()*4) : (18+Math.random()*10);
  }

  wolves.forEach(w=>{
    if(!w.alive) return;
    const dx = player.pos.x-w.x, dz = player.pos.z-w.z;
    const d = Math.hypot(dx,dz);

    // wolves shy from firelight
    const nearFire = campfires.some(f=>f.lit && dist2(w.x,w.z,f.x,f.z)<64);

    if(d < 22 && !(nearFire && d>4)){
      const nx=dx/d, nz=dz/d;
      if(d>1.3){
        w.x += nx*w.speed*dt;
        w.z += nz*w.speed*dt;
      }
      w.mesh.rotation.y = Math.atan2(nx, nz);
      w.state='chase';
      if(d<1.5 && w.hitCooldown<=0 && player.alive){
        player.hp = clamp(player.hp-8,0,100);
        w.hitCooldown = 1.1;
        showMsg('A wolf bites you!');
        if(player.hp<=0) die('Torn apart by a wolf.');
      }
    } else {
      w.state='idle';
    }
    w.hitCooldown = Math.max(0,w.hitCooldown-dt);
    w.y = groundHeightAt(w.x,w.z);
    w.mesh.position.set(w.x,w.y,w.z);
  });
}

function tryAttack(){
  if(!player.alive) return;
  if(player.attackCooldown>0) return;
  if(inventory.spear<=0){ showMsg('You need a spear to attack. Craft one!'); return; }
  player.attackCooldown = 0.6;
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  let hit=null, bestD=2.6;
  wolves.forEach(w=>{
    if(!w.alive) return;
    const dx=w.x-player.pos.x, dz=w.z-player.pos.z;
    const d=Math.hypot(dx,dz);
    if(d<bestD){
      const dot=(dx/d)*camDir.x+(dz/d)*camDir.z;
      if(dot>0.5){ bestD=d; hit=w; }
    }
  });
  if(hit){
    hit.hp--;
    showMsg('Struck the wolf!');
    if(hit.hp<=0){
      hit.alive=false;
      hit.mesh.visible=false;
      inventory.rawMeat += 2;
      showMsg('Wolf slain. +2 Raw Meat');
      refreshInventory(); buildHotbar();
    }
  }
}

/* ============ DEATH / RESPAWN ============ */
const deathScreen = document.getElementById('deathScreen');
const deathReason = document.getElementById('deathReason');
function die(reason){
  player.alive=false;
  deathReason.textContent = reason;
  deathScreen.style.display='flex';
  document.exitPointerLock();
}
document.getElementById('respawnBtn').addEventListener('click', ()=>{
  player.alive=true;
  player.hp=100; player.hunger=80; player.thirst=80; player.stamina=100; player.warmth=100;
  player.pos.set(0, groundHeightAt(0,8)+player.height, 8);
  deathScreen.style.display='none';
  renderer.domElement.requestPointerLock();
});

/* ============ MOVEMENT ============ */
function updateMovement(dt){
  if(!player.alive) return;
  const forward = new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.sin(player.yaw+Math.PI/2),0,Math.cos(player.yaw+Math.PI/2));
  let move = new THREE.Vector3();
  if(keys['KeyW']) move.sub(forward);
  if(keys['KeyS']) move.add(forward);
  if(keys['KeyD']) move.add(right);
  if(keys['KeyA']) move.sub(right);
  let isMoving = false, sprinting = false;
  if(move.lengthSq()>0){
    isMoving = true;
    move.normalize();
    sprinting = keys['ShiftLeft'] && player.stamina>1;
    const spd = player.speed * (sprinting?player.sprintMult:1);
    const nx = player.pos.x + move.x*spd*dt;
    const nz = player.pos.z + move.z*spd*dt;

    // collision against trees/rocks/campfires
    let blocked=false;
    for(const c of collidables){
      const dx=nx-c.x, dz=nz-c.z;
      const rr=(c.radius||0.6)+player.radius;
      if(dx*dx+dz*dz < rr*rr){ blocked=true; break; }
    }
    const half = WORLD_SIZE/2-2;
    if(!blocked && nx>-half && nx<half && nz>-half && nz<half){
      player.pos.x = nx; player.pos.z = nz;
    }
  }

  // gravity
  const groundY = groundHeightAt(player.pos.x,player.pos.z) + player.height;
  player.velY -= 12*dt;
  player.pos.y += player.velY*dt;
  if(player.pos.y <= groundY){
    player.pos.y = groundY;
    player.velY = 0;
    player.onGround = true;
  }

  // head-bob for a walking, embodied camera feel
  if(isMoving && player.onGround){
    bobPhase += dt * (sprinting?15:9.5);
  } else {
    bobPhase += dt*2; // gentle idle sway
  }
  const bobAmt = (isMoving && player.onGround) ? 0.045 : 0.012;
  const bobY = Math.sin(bobPhase)*bobAmt;
  const bobX = Math.cos(bobPhase*0.5)*bobAmt*0.4;

  camera.position.copy(player.pos);
  camera.position.y += bobY;
  camera.position.x += bobX*Math.cos(player.yaw);
  camera.position.z -= bobX*Math.sin(player.yaw);
  camera.rotation.order='YXZ';

  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

/* ============ MAIN LOOP ============ */
let last = performance.now();
let rafId = null;
function animate(){
  if(disposed) return;
  rafId = requestAnimationFrame(animate);
  const now = performance.now();
  let dt = (now-last)/1000;
  dt = Math.min(dt, 0.06);
  last = now;
  gameTotalTime += dt;

  if(locked && player.alive){
    updateMovement(dt);
    updateTimeOfDay(dt);
    updateStats(dt);
    updateWolves(dt);
    updateRespawns();
    player.attackCooldown = Math.max(0, player.attackCooldown-dt);

    campfires.forEach(f=>{ f.flame.rotation.y += dt*4; f.flame.scale.y = 1+Math.sin(now*0.01)*0.08; });

    currentTarget = findInteractTarget();
    if(currentTarget){
      const verbs = {tree:'chop wood', rock:'mine stone', bush:'pick berries', water:'drink', cook:'cook meat'};
      interactVerb.textContent = verbs[currentTarget.type];
      interactPrompt.style.display='block';
      crosshair.classList.add('active');
    } else {
      interactPrompt.style.display='none';
      crosshair.classList.remove('active');
    }

    // compass
    const deg = ((player.yaw*180/Math.PI)%360+360)%360;
    const dirs=['N','NE','E','SE','S','SW','W','NW'];
    const idx = Math.round(deg/45)%8;
    document.getElementById('compass').textContent = dirs[idx] + '  ' + Math.round(deg)+'°';
  }

  waterUniforms.uTime.value = gameTotalTime;
  waterUniforms.uSunDir.value.copy(sun.position).normalize();

  grassMat.uniforms.uTime.value = gameTotalTime;
  grassMat.uniforms.uLight.value = 0.5 + dayFactor*0.75;
  if(Math.hypot(player.pos.x-grassCenter.x, player.pos.z-grassCenter.z) > 7){
    scatterGrass(player.pos.x, player.pos.z);
  }

  renderWithPost();
}
animate();

/* ============ ESC to release / craft close ============ */
window.addEventListener('keydown',(e)=>{
  if(e.code==='Escape' && craftMenu.style.display==='flex'){ closeCraftMenu(); }
}, {signal: abortCtrl.signal});

showMsg('Gather wood and stone. Build a fire before nightfall.');

function dispose(){
  disposed = true;
  if(rafId !== null) cancelAnimationFrame(rafId);
  abortCtrl.abort();
  if(document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  scene.traverse((obj)=>{
    if(obj.geometry) obj.geometry.dispose();
    if(obj.material){
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m)=>{
        if(m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  renderer.dispose();
  container.innerHTML = '';
}

return dispose;
}
