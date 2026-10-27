// ============================================================================
// 🏙️ المجسم ثلاثي الأبعاد لجميع مباني الإسكان (34 مبنى) — Campus 3D Viewer
// Clean Light Mode Architectural Campus Visualization for 34 Hostel Buildings
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BuildingInfo, FixtureEvaluation } from '../../types/hostel';
import { getScoreColor } from '../../utils/healthScore';
import { getCampusMapConfig } from '../../utils/buildingStructureStore';
import {
  RotateCw,
  Eye,
  ZoomIn,
  ZoomOut,
  Droplets,
  Layers,
  Building,
  RefreshCw,
} from 'lucide-react';

interface Campus3DViewerProps {
  buildings: BuildingInfo[];
  allEvaluations: FixtureEvaluation[];
  onSelectBuilding: (buildingId: string) => void;
}

export const Campus3DViewer: React.FC<Campus3DViewerProps> = ({
  buildings,
  allEvaluations,
  onSelectBuilding,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredBuilding, setHoveredBuilding] = useState<{
    building: BuildingInfo;
    health: number | null | undefined;
    leaks: number;
    broken: number;
    x: number;
    y: number;
  } | null>(null);

  const [filterMode, setFilterMode] = useState<'all' | 'critical' | 'leaks' | 'healthy' | 'uninspected'>('all');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [selectedJumpId, setSelectedJumpId] = useState<string>('');

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const buildingsMapRef = useRef<Map<string, THREE.Group>>(new Map());
  const reqIdRef = useRef<number | null>(null);

  // Camera Orbit State
  const sphericalRef = useRef({ radius: 95, theta: Math.PI / 4, phi: Math.PI / 3.4 });
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const targetLookAtRef = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene Setup - Clean Light Architectural Grey
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf1f5f9);

    // 2. Camera Setup
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 1500);
    cameraRef.current = camera;

    const updateCamera = () => {
      const s = sphericalRef.current;
      const target = targetLookAtRef.current;
      camera.position.x = target.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta);
      camera.position.y = target.y + s.radius * Math.cos(s.phi);
      camera.position.z = target.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta);
      camera.lookAt(target);
    };
    updateCamera();

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Lighting System (Architectural Soft Daylight)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.85);
    sunLight.position.set(80, 140, 70);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
    const d = 80;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    // 5. Campus Ground Grid & Campus Avenues
    const gridHelper = new THREE.GridHelper(240, 48, 0x94a3b8, 0xcbd5e1);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    const mapConfig = getCampusMapConfig();

    // Campus Base Ground Plane (supports Google Map / Satellite ground background)
    const groundGeo = new THREE.PlaneGeometry(240, 240);
    const groundMat = new THREE.MeshStandardMaterial({
      color: mapConfig.groundImageUrl ? 0xffffff : 0xe2e8f0,
      roughness: 0.9,
      metalness: 0.05,
    });

    if (mapConfig.groundImageUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(
        mapConfig.groundImageUrl,
        (tex) => {
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          groundMat.map = tex;
          groundMat.needsUpdate = true;
        },
        undefined,
        (err) => {
          console.warn('[Campus3DViewer] Could not load satellite background texture:', err);
        }
      );
    }

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // 6. Generate 34 Hostel Buildings in Campus Masterplan Layout
    // Support real-world layout positions from mapConfig, falling back to structured grid
    const cols = 6;
    const spacingX = 17;
    const spacingZ = 17;
    const offsetX = ((cols - 1) * spacingX) / 2;
    const rows = Math.ceil(buildings.length / cols);
    const offsetZ = ((rows - 1) * spacingZ) / 2;

    buildingsMapRef.current.clear();

    const wingAngles = [
      Math.PI / 4,
      (3 * Math.PI) / 4,
      (5 * Math.PI) / 4,
      (7 * Math.PI) / 4,
    ];

    buildings.forEach((building, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const defaultX = col * spacingX - offsetX;
      const defaultZ = row * spacingZ - offsetZ;

      const customPos = mapConfig.buildingPositions[building.id];
      const posX = customPos?.x !== undefined ? customPos.x : defaultX;
      const posZ = customPos?.z !== undefined ? customPos.z : defaultZ;

      const bEvals = allEvaluations.filter((e) => e.buildingId === building.id);
      const health = building.healthScore;
      const colorDef = getScoreColor(health);
      const leaksCount = bEvals.filter((e) => e.defects.includes('leak')).length;
      const brokenCount = bEvals.filter((e) => e.status === 'broken').length;

      const buildingGroup = new THREE.Group();
      buildingGroup.position.set(posX, 0, posZ);

      // Building Base Pedestal / Paved courtyard
      const baseGeo = new THREE.BoxGeometry(11, 0.25, 11);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.7,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.125;
      baseMesh.receiveShadow = true;
      buildingGroup.add(baseMesh);

      // Building Central Hub Cylinder
      const hubRadius = 1.3;
      const totalHeight = 5.2;
      const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius, totalHeight, 18);
      const hubMat = new THREE.MeshStandardMaterial({
        color: colorDef.threeColor,
        roughness: 0.35,
        metalness: 0.1,
      });
      const hubMesh = new THREE.Mesh(hubGeo, hubMat);
      hubMesh.position.y = totalHeight / 2 + 0.25;
      hubMesh.castShadow = true;
      hubMesh.receiveShadow = true;
      buildingGroup.add(hubMesh);

      // Building 4 Wings extending outward (iconic university hostel architecture)
      const wingLength = 3.4;
      const wingWidth = 1.8;
      const wingHeight = 4.8;
      const distFromCenter = hubRadius + wingLength / 2 - 0.2;

      for (let w = 1; w <= 4; w++) {
        const angle = wingAngles[w - 1];
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const wingGeo = new THREE.BoxGeometry(wingWidth, wingHeight, wingLength);
        const wingMat = new THREE.MeshStandardMaterial({
          color: colorDef.threeColor,
          roughness: 0.4,
          metalness: 0.1,
        });

        const wingMesh = new THREE.Mesh(wingGeo, wingMat);
        wingMesh.position.set(
          distFromCenter * cosA,
          wingHeight / 2 + 0.25,
          distFromCenter * sinA
        );
        wingMesh.rotation.y = -angle + Math.PI / 2;
        wingMesh.castShadow = true;
        wingMesh.receiveShadow = true;

        // Subtle dark edges for architectural blueprint aesthetic
        const edges = new THREE.EdgesGeometry(wingGeo);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x334155,
          transparent: true,
          opacity: 0.25,
        });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        wingMesh.add(wireframe);

        buildingGroup.add(wingMesh);
      }

      // If active leaks exist, add a pulsing red/amber ring at the top
      if (leaksCount > 0) {
        const beaconGeo = new THREE.RingGeometry(1.6, 2.1, 24);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: 0xdc2626,
          side: THREE.DoubleSide,
        });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.rotation.x = -Math.PI / 2;
        beaconMesh.position.y = totalHeight + 0.6;
        beaconMesh.name = 'beacon';
        buildingGroup.add(beaconMesh);
      }

      // Floating 3D Building Number & Health Badge Sprite
      const spriteCanvas = document.createElement('canvas');
      spriteCanvas.width = 256;
      spriteCanvas.height = 110;
      const sCtx = spriteCanvas.getContext('2d');
      if (sCtx) {
        // Rounded container
        sCtx.fillStyle = '#ffffff';
        sCtx.beginPath();
        sCtx.roundRect(8, 8, 240, 94, 20);
        sCtx.fill();

        // Border colored by health status
        sCtx.strokeStyle = colorDef.hex;
        sCtx.lineWidth = 6;
        sCtx.stroke();

        // Title: مبنى X
        sCtx.font = 'bold 36px "Cairo", sans-serif';
        sCtx.fillStyle = '#0f172a';
        sCtx.textAlign = 'center';
        sCtx.textBaseline = 'middle';
        sCtx.fillText(`مبنى ${building.number}`, 128, 42);

        // Subtitle: %Health or Water Leaks
        sCtx.font = 'bold 24px "Cairo", sans-serif';
        sCtx.fillStyle = leaksCount > 0 ? '#dc2626' : colorDef.hex;
        const subText = leaksCount > 0 ? `💧 ${leaksCount} تسريب` : `%${health} سلامة`;
        sCtx.fillText(subText, 128, 78);

        const spriteTex = new THREE.CanvasTexture(spriteCanvas);
        const spriteMat = new THREE.SpriteMaterial({ map: spriteTex, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(6.2, 2.7, 1);
        sprite.position.y = totalHeight + 2.8;
        buildingGroup.add(sprite);
      }

      // Store Metadata for Raycasting
      buildingGroup.userData = {
        buildingId: building.id,
        building,
        health,
        leaksCount,
        brokenCount,
      };

      scene.add(buildingGroup);
      buildingsMapRef.current.set(building.id, buildingGroup);
    });

    // 7. Mouse & Touch Controls
    let hoveredMesh: THREE.Group | null = null;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDraggingRef.current) {
        const deltaX = e.clientX - prevMouseRef.current.x;
        const deltaY = e.clientY - prevMouseRef.current.y;
        prevMouseRef.current = { x: e.clientX, y: e.clientY };

        sphericalRef.current.theta -= deltaX * 0.005;
        sphericalRef.current.phi = Math.max(
          0.15,
          Math.min(Math.PI / 2.15, sphericalRef.current.phi - deltaY * 0.005)
        );
        updateCamera();
        return;
      }

      // Raycasting Hover
      raycaster.setFromCamera(mouse, camera);
      const groups = Array.from(buildingsMapRef.current.values());

      // Raycast against children of all building groups
      let hitBuildingGroup: THREE.Group | null = null;
      for (const group of groups) {
        const hits = raycaster.intersectObjects(group.children, false);
        if (hits.length > 0) {
          hitBuildingGroup = group;
          break;
        }
      }

      if (hitBuildingGroup && hitBuildingGroup.userData?.buildingId) {
        const data = hitBuildingGroup.userData;
        if (hoveredMesh !== hitBuildingGroup) {
          if (hoveredMesh) hoveredMesh.position.y = 0;
          hitBuildingGroup.position.y = 0.6;
          hoveredMesh = hitBuildingGroup;
        }

        setHoveredBuilding({
          building: data.building,
          health: data.health,
          leaks: data.leaksCount,
          broken: data.brokenCount,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
        return;
      }

      if (hoveredMesh) {
        hoveredMesh.position.y = 0;
        hoveredMesh = null;
      }
      setHoveredBuilding(null);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const groups = Array.from(buildingsMapRef.current.values());

      for (const group of groups) {
        const hits = raycaster.intersectObjects(group.children, false);
        if (hits.length > 0 && group.userData?.buildingId) {
          onSelectBuilding(group.userData.buildingId);
          return;
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sphericalRef.current.radius = Math.max(
        35,
        Math.min(160, sphericalRef.current.radius + e.deltaY * 0.08)
      );
      updateCamera();
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElement.addEventListener('click', onClick);
    domElement.addEventListener('wheel', onWheel, { passive: false });

    // 8. Animation Loop
    let angleBeacon = 0;
    const animate = () => {
      if (autoRotate && !isDraggingRef.current) {
        sphericalRef.current.theta += 0.0012;
        updateCamera();
      }

      // Rotate pulsing beacons
      angleBeacon += 0.04;
      buildingsMapRef.current.forEach((grp) => {
        const beacon = grp.getObjectByName('beacon');
        if (beacon) {
          const s = 1.0 + Math.sin(angleBeacon) * 0.15;
          beacon.scale.set(s, s, 1);
        }
      });

      renderer.render(scene, camera);
      reqIdRef.current = requestAnimationFrame(animate);
    };
    reqIdRef.current = requestAnimationFrame(animate);

    // 9. Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domElement.removeEventListener('click', onClick);
      domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, [buildings, allEvaluations, autoRotate]);

  // Handle Filtering (dim non-matching buildings)
  useEffect(() => {
    buildingsMapRef.current.forEach((group) => {
      const data = group.userData;
      if (!data) return;

      let isMatch = true;
      if (filterMode === 'critical') {
        isMatch = data.health !== null && data.health !== undefined && data.health < 50;
      } else if (filterMode === 'leaks') {
        isMatch = data.leaksCount > 0;
      } else if (filterMode === 'healthy') {
        isMatch = data.health !== null && data.health !== undefined && data.health >= 80;
      } else if (filterMode === 'uninspected') {
        isMatch = data.health === null || data.health === undefined;
      }

      group.visible = isMatch;
    });
  }, [filterMode]);

  // Handle Quick Building Jump Focus
  const handleJumpToBuilding = (bId: string) => {
    setSelectedJumpId(bId);
    if (!bId) {
      targetLookAtRef.current.set(0, 0, 0);
      sphericalRef.current.radius = 95;
      return;
    }

    const group = buildingsMapRef.current.get(bId);
    if (group) {
      targetLookAtRef.current.set(group.position.x, 3, group.position.z);
      sphericalRef.current.radius = 42;
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const delta = direction === 'in' ? -15 : 15;
    sphericalRef.current.radius = Math.max(35, Math.min(160, sphericalRef.current.radius + delta));
    if (cameraRef.current) {
      const s = sphericalRef.current;
      const target = targetLookAtRef.current;
      cameraRef.current.position.x = target.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta);
      cameraRef.current.position.y = target.y + s.radius * Math.cos(s.phi);
      cameraRef.current.position.z = target.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta);
      cameraRef.current.lookAt(target);
    }
  };

  const handleResetCamera = () => {
    targetLookAtRef.current.set(0, 0, 0);
    sphericalRef.current = { radius: 95, theta: Math.PI / 4, phi: Math.PI / 3.4 };
    setSelectedJumpId('');
  };

  return (
    <div className="relative w-full h-[540px] bg-slate-100 rounded-3xl overflow-hidden border border-slate-300 shadow-lg flex flex-col">
      {/* 3D Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating Controls */}
      <div className="absolute top-4 right-4 left-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pointer-events-none">
        {/* Title & Badge */}
        <div className="bg-white/95 backdrop-blur-sm px-3.5 py-2 rounded-2xl border border-slate-200 shadow-sm pointer-events-auto flex items-center gap-2.5">
          <Building className="w-4 h-4 text-blue-600" />
          <div>
            <h3 className="text-xs font-bold text-slate-900 leading-none">
              المجسم ثلاثي الأبعاد لمباني الإسكان الطلابي (34 مبنى)
            </h3>
            <span className="text-[10px] text-slate-500">
              جامعة الملك سعود • مجمع الـ 34 مبنى (136 جناح)
            </span>
          </div>
        </div>

        {/* Right Floating Actions */}
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap">
          {/* Quick Jump Selector */}
          <select
            value={selectedJumpId}
            onChange={(e) => handleJumpToBuilding(e.target.value)}
            className="bg-white/95 backdrop-blur-sm border border-slate-200 text-slate-800 text-xs rounded-xl px-2.5 py-1.5 font-bold shadow-sm cursor-pointer"
          >
            <option value="">🎯 تركيز الكاميرا على مبنى...</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameAr} ({b.id})
              </option>
            ))}
          </select>

          {/* Zoom Buttons */}
          <div className="bg-white/95 backdrop-blur-sm p-1 rounded-xl border border-slate-200 shadow-sm flex items-center gap-1">
            <button
              onClick={() => handleZoom('in')}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition"
              title="تكبير"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition"
              title="تصغير"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetCamera}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition"
              title="إعادة ضبط الرؤية"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Auto Rotate Toggle */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2 rounded-xl border shadow-sm transition ${
              autoRotate
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white/95 border-slate-200 text-slate-600'
            }`}
            title="تبديل الدوران التلقائي للمجمع"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Floating Filter Chips over 3D Canvas */}
      <div className="absolute top-18 sm:top-16 right-4 pointer-events-auto flex items-center gap-1.5 bg-white/90 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-200 shadow-sm text-xs">
        <button
          onClick={() => setFilterMode('all')}
          className={`px-2.5 py-1 rounded-xl font-bold transition ${
            filterMode === 'all'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          الكل (34)
        </button>
        <button
          onClick={() => setFilterMode('uninspected')}
          className={`px-2.5 py-1 rounded-xl font-bold transition flex items-center gap-1 ${
            filterMode === 'uninspected'
              ? 'bg-slate-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>⚪ غير مفحوص</span>
        </button>
        <button
          onClick={() => setFilterMode('critical')}
          className={`px-2.5 py-1 rounded-xl font-bold transition flex items-center gap-1 ${
            filterMode === 'critical'
              ? 'bg-rose-600 text-white'
              : 'text-rose-700 hover:bg-rose-50'
          }`}
        >
          <span>🚨 مباني حرجة</span>
        </button>
        <button
          onClick={() => setFilterMode('leaks')}
          className={`px-2.5 py-1 rounded-xl font-bold transition flex items-center gap-1 ${
            filterMode === 'leaks'
              ? 'bg-blue-600 text-white'
              : 'text-blue-700 hover:bg-blue-50'
          }`}
        >
          <span>💧 تسريبات مياه</span>
        </button>
        <button
          onClick={() => setFilterMode('healthy')}
          className={`px-2.5 py-1 rounded-xl font-bold transition flex items-center gap-1 ${
            filterMode === 'healthy'
              ? 'bg-emerald-600 text-white'
              : 'text-emerald-700 hover:bg-emerald-50'
          }`}
        >
          <span>✅ مباني سليمة</span>
        </button>
      </div>

      {/* Interactive Hover Tooltip */}
      {hoveredBuilding && (
        <div
          className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
          style={{ left: hoveredBuilding.x, top: hoveredBuilding.y }}
        >
          <div className="bg-white/95 backdrop-blur-md border border-slate-300 p-3.5 rounded-2xl shadow-2xl text-right min-w-[210px]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 mb-2">
              <div>
                <span className="text-sm font-bold text-slate-900 block">
                  {hoveredBuilding.building.nameAr}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  معرّف المبنى: {hoveredBuilding.building.id}
                </span>
              </div>
              <span
                className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: getScoreColor(hoveredBuilding.health).hex }}
              />
            </div>

            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-slate-600">حالة المبنى / السلامة:</span>
              <span
                className="font-bold text-sm font-mono"
                style={{ color: getScoreColor(hoveredBuilding.health).hex }}
              >
                {hoveredBuilding.health !== undefined && hoveredBuilding.health !== null
                  ? `%${hoveredBuilding.health}`
                  : 'غير مفحوص'}
              </span>
            </div>

            {hoveredBuilding.leaks > 0 && (
              <div className="text-xs text-rose-600 font-bold flex items-center gap-1 mt-1 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100">
                <Droplets className="w-3.5 h-3.5" />
                <span>{hoveredBuilding.leaks} تسريب مياه نشط!</span>
              </div>
            )}

            {hoveredBuilding.broken > 0 && (
              <div className="text-xs text-amber-700 font-bold mt-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                ⚠️ {hoveredBuilding.broken} مرافق معطلة
              </div>
            )}

            <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-blue-600 font-bold flex items-center justify-center gap-1">
              <span>انقر لمعاينة أجنحة المبنى الـ 4 ←</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Legend & Guidance */}
      <div className="absolute bottom-3 right-4 left-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pointer-events-none text-xs">
        <div className="bg-white/95 backdrop-blur-sm px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-700 font-medium">غير مفحوص</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span className="text-slate-700 font-medium">سليم (80-100%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-700 font-medium">صيانة (50-79%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            <span className="text-rose-700 font-bold">حرج (&lt;50%)</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-600 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm pointer-events-auto flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-blue-600" />
          <span>اسحب للتدوير • عجلة الماوس للتكبير • انقر على أي مبنى للدخول</span>
        </div>
      </div>
    </div>
  );
};
