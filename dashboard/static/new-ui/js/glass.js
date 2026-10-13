import * as THREE from "three";

let renderer, scene, camera, group, heroObject, pointLight, fillLight, fallbackLayer, activeRoute="upload";
let visible=true, raf=0, lastFrame=0, frameCount=0, fpsStart=0, qualityReduced=false;
let pointer={x:0,y:0,down:false,lastX:0,lastY:0,dragX:0,dragY:0};
let targetRotation={x:0,y:0}, reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const objects={};
const lerp=(a,b,t)=>a+(b-a)*t;

function makeEnvironment(rendererInstance) {
  const envScene=new THREE.Scene();
  envScene.background=new THREE.Color(0x02030a);
  const addPanel=(color,pos,size,emissiveIntensity=3)=>{
    const material=new THREE.MeshBasicMaterial({color,emissive:color,emissiveIntensity,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size[0],size[1]),material);
    mesh.position.set(...pos);envScene.add(mesh);
  };
  addPanel(0x4ad8ff,[-3.2,1.3,-2.4],[1.9,.055]);
  addPanel(0xe743d0,[2.5,1.7,-3.5],[2.3,.07],1.6);
  addPanel(0x4a65ff,[3.1,-1.25,-2.2],[1.7,.06]);
  addPanel(0xffd95f,[-2.5,-1.65,-3.1],[1.25,.045],1.2);
  addPanel(0x163eff,[0,2.6,-4.1],[3.3,.035],2.5);
  const pmrem=new THREE.PMREMGenerator(rendererInstance);
  pmrem.compileEquirectangularShader();
  const env=pmrem.fromScene(envScene,.035).texture;
  pmrem.dispose();
  envScene.traverse(node=>{if(node.isMesh){node.geometry.dispose();node.material.dispose();}});
  return env;
}
function physicalMaterial(env) {
  const material=new THREE.MeshPhysicalMaterial({
    color:0xffffff,metalness:.005,roughness:.095,transmission:.98,thickness:.38,ior:1.43,
    iridescence:.82,iridescenceIOR:1.3,iridescenceThicknessRange:[180,510],
    clearcoat:.88,clearcoatRoughness:.06,envMap:env,envMapIntensity:1.5,
    emissive:0x010814,emissiveIntensity:.05,
    attenuationColor:new THREE.Color(0x3f60b1),attenuationDistance:4.5,
    transparent:true,opacity:1,depthWrite:false,vertexColors:true,side:THREE.DoubleSide,flatShading:false
  });
  if("dispersion" in material)material.dispersion=.07;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uFilmTime={value:0};
    shader.vertexShader=shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vCrystalPosition;"
    ).replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvCrystalPosition = position;"
    );
    shader.fragmentShader=shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vCrystalPosition;
      uniform float uFilmTime;
      vec3 crystalHsvToRgb(vec3 c) {
        vec3 p=abs(fract(c.xxx+vec3(0.0,2.0/3.0,1.0/3.0))*6.0-3.0);
        return c.z*mix(vec3(1.0),clamp(p-1.0,0.0,1.0),c.y);
      }`
    ).replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float filmPhase=vCrystalPosition.x*2.2+vCrystalPosition.y*1.8-vCrystalPosition.z*1.4+sin(vCrystalPosition.z*2.4+vCrystalPosition.x*1.1+uFilmTime*1.15)*1.4+uFilmTime*1.2;
      float violetBand = smoothstep(.68, .97, .5 + .5 * sin(filmPhase + 3.7));
      float cyanBand=smoothstep(.58,.96,.5+.5*sin(filmPhase));
      float roseBand=smoothstep(.65,.98,.5+.5*sin(filmPhase*.83+vCrystalPosition.y*1.3+sin(vCrystalPosition.x*2.1-uFilmTime*.9)*.7));
      float goldBand=smoothstep(.7,.98,.5+.5*sin(filmPhase+2.25));
      vec3 filmColor=vec3(.015,.035,.62);
      filmColor=mix(filmColor,vec3(0.0,.88,1.0),cyanBand*.1);
      filmColor=mix(filmColor,vec3(1.0,.045,.63),roseBand*.70);
      filmColor=mix(filmColor,vec3(1.0,1.0,1.0),goldBand*.68);
      filmColor = mix(filmColor, vec3(.55, .18, 1.0), violetBand * .55);
      float filmSheen=max(cyanBand,max(roseBand,goldBand));
      diffuseColor.rgb=mix(diffuseColor.rgb,filmColor,.38+.4*filmSheen);`
    ).replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      totalEmissiveRadiance+=vec3(0.0,.22,.34)*cyanBand*.10+vec3(.25,.01,.12)*roseBand*.14+vec3(.24,.13,.01)*goldBand*.02;`
    );
    material.userData.iridescenceShader=shader;
  };
  return material;
}
function withIridescentFacets(geometry) {
  const position=geometry.getAttribute("position");
  const normal=geometry.getAttribute("normal");
  const colors=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++){
    const nx=normal.getX(i),ny=normal.getY(i),nz=normal.getZ(i);
    const shimmer=.5+.5*Math.sin(nx*3.1-ny*2.2+nz*2.7);
    const hue=.62+.035*Math.sin(nx*2.1-ny*1.7+nz*2.5);
    const color=new THREE.Color().setHSL(hue,.86,.26+.11*shimmer);
    color.toArray(colors,i*3);
  }
  geometry.setAttribute("color",new THREE.BufferAttribute(colors,3));
  return geometry;
}
function createGlassObject(route, env) {
  const objectGroup=new THREE.Group();
  const geometry=withIridescentFacets(new THREE.OctahedronGeometry(1.58,0));
  heroObject=new THREE.Mesh(geometry,physicalMaterial(env));
  objectGroup.add(heroObject);
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,26),new THREE.LineBasicMaterial({color:0xb8eaff,transparent:true,opacity:0.005}));
  objectGroup.add(edge);
  objectGroup.userData={route,homeX:2.95,homeY:.06,homeZ:-.35,spin:0};
  objectGroup.position.set(objectGroup.userData.homeX,objectGroup.userData.homeY,objectGroup.userData.homeZ);
  objectGroup.rotation.set(.17,-.24,.05);
  scene.add(objectGroup);objects[route]=objectGroup;
}
function buildFallback() {
  document.body.dataset.glassFallback="true";
  if(!fallbackLayer)return;
  fallbackLayer.innerHTML="";
  const obj=document.createElement("div");obj.className="glass-shape glass-shape--octa";fallbackLayer.append(obj);
}
function handleResize() {
  if(!renderer)return;
  const width=innerWidth,height=innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,qualityReduced?1:2));
  renderer.setSize(width,height,false);
  camera.aspect=width/height;camera.updateProjectionMatrix();
  const mobile=width<700;camera.position.z=mobile?10:8;camera.fov=mobile?36:34;camera.updateProjectionMatrix();
  for(const item of Object.values(objects))item.userData.homeX=mobile?1.62:2.95;
}
function setObjectForRoute(route,state) {
  activeRoute=route;
  const objectRoute=route==="running"?"running":route==="report"||route==="history"?"report":"upload";
  Object.values(objects).forEach(item=>item.visible=item.userData.route===objectRoute);
  const chosen=objects[objectRoute];
  if(chosen){
    chosen.visible=true;
    chosen.userData.spin=0;
  }
  if(document.body.dataset.glassFallback==="true")buildFallback();
}
function animate(time) {
  raf=requestAnimationFrame(animate);
  if(!visible||!renderer||document.hidden)return;
  if(time-lastFrame<15)return;
  const dt=Math.min(.05,(time-lastFrame)/1000||.016);lastFrame=time;
  const current=objects[activeRoute==="running"?"running":activeRoute==="report"||activeRoute==="history"?"report":"upload"];
  if(current){
    const progress=window.appState?.overallProgress||0;
    const runBoost=activeRoute==="running"?progress/100:0;
    current.userData.spin=lerp(current.userData.spin,runBoost*.18,.045);
    if(!reduced){
      targetRotation.x=pointer.y*.34+pointer.dragY;
      targetRotation.y=pointer.x*.42+pointer.dragX;
      current.rotation.x=lerp(current.rotation.x,targetRotation.x+Math.sin(time*.00018)*.08,.035);
      current.rotation.y=lerp(current.rotation.y,targetRotation.y+time*.00004+current.userData.spin,.035);
      current.rotation.z=lerp(current.rotation.z,Math.sin(time*.00012)*.035,.025);
      const nearX=.66,nearY=.48,dist=Math.hypot(pointer.x*.5+.5-nearX,pointer.y*.5+.5-nearY);
      const push=dist<.24?(1-dist/.24)*.18:0;
      const away=pointer.x>.25?-1:1;
      current.position.x=lerp(current.position.x,current.userData.homeX+pointer.x*.18+push*away,.05);
      current.position.y=lerp(current.position.y,current.userData.homeY+pointer.y*.13,.05);
      current.position.z=lerp(current.position.z,current.userData.homeZ+push,.04);
    } else {
      current.rotation.y+=dt*.018;
    }
  }
  // The light drift uses the background field's time scale and cool palette.
  const flow=time*.000075;
  for(const item of Object.values(objects)){
    const shader=item.children[0]?.material?.userData?.iridescenceShader;
    if(shader)shader.uniforms.uFilmTime.value=flow;
  }
  if(pointLight){
    pointLight.position.set(2.95+Math.sin(flow*1.05)*1.55,.25+Math.sin(flow*.72)*.95,2.8+Math.cos(flow*.58)*.45);
    pointLight.color.setHSL(.56+Math.sin(flow*.35)*.025,.84,.62);
    pointLight.intensity=4.8+1.2*(.5+.5*Math.sin(flow*1.1));
  }
  if(fillLight){
    fillLight.position.set(2.95+Math.cos(flow*.75+2.1)*1.85,-.15+Math.sin(flow*.7+1.2)*1.0,2.1);
    fillLight.intensity=1.6+.45*(.5+.5*Math.sin(flow*.8+1.4));
  }
  renderer.render(scene,camera);
  frameCount++;
  if(!fpsStart)fpsStart=time;
  if(time-fpsStart>2200){const fps=frameCount*1000/(time-fpsStart);if(fps<40&&!qualityReduced){qualityReduced=true;handleResize();}frameCount=0;fpsStart=time;}
}
export function initGlass() {
  fallbackLayer=document.querySelector("#glassFallback");
  if(reduced){buildFallback();return;}
  try{
    const canvas=document.querySelector("#glassCanvas");
    renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:"low-power",stencil:false,depth:true});
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=0.4;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    scene=new THREE.Scene();
    camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.1,100);
    camera.position.set(0,0,8);
    scene.add(new THREE.AmbientLight(0x8294c0,.42));
    pointLight=new THREE.PointLight(0x68d9ff,5.5,12,2);scene.add(pointLight);
    fillLight=new THREE.PointLight(0x897cff,1.8,10,2);scene.add(fillLight);
    const env=makeEnvironment(renderer);
    createGlassObject("upload",env);createGlassObject("configure",env);createGlassObject("running",env);createGlassObject("report",env);
    handleResize();
    window.addEventListener("resize",handleResize,{passive:true});
    document.addEventListener("visibilitychange",()=>{visible=!document.hidden;});
    const io=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);});io.observe(canvas);
    window.addEventListener("pointermove",event=>{
      pointer.x=(event.clientX/innerWidth)*2-1;pointer.y=1-(event.clientY/innerHeight)*2;
      if(pointer.down){pointer.dragX+=(event.clientX-pointer.lastX)*.003;pointer.dragY+=(event.clientY-pointer.lastY)*.003;pointer.lastX=event.clientX;pointer.lastY=event.clientY;}
      if(document.body.dataset.glassFallback==="true"){const shape=fallbackLayer.querySelector(".glass-shape");if(shape&&!reduced){shape.style.setProperty("--px",`${pointer.x*14}px`);shape.style.setProperty("--py",`${-pointer.y*10}px`);shape.style.setProperty("--rx",`${pointer.y*4}deg`);shape.style.setProperty("--ry",`${pointer.x*5}deg`);}}
    },{passive:true});
    window.addEventListener("pointerdown",event=>{if(event.pointerType==="touch"){pointer.down=true;pointer.lastX=event.clientX;pointer.lastY=event.clientY;}},{passive:true});
    window.addEventListener("pointerup",()=>{pointer.down=false;pointer.dragX*=.8;pointer.dragY*=.8;},{passive:true});
    window.addEventListener("pointercancel",()=>{pointer.down=false;},{passive:true});
    requestAnimationFrame(animate);
  }catch(error){console.warn("WebGL unavailable; using CSS glass fallback.",error);renderer?.dispose();renderer=null;buildFallback();}
}
export function setGlassScreen(route,state={}) {setObjectForRoute(route,state);}
