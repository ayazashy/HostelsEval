// ============================================================================
// 🏙️ المجسم ثلاثي الأبعاد للأجنحة الأربعة (Light Mode)
// 4-Wing Central Hub Architecture with Clean Light Architectural Rendering
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FixtureEvaluation } from '../../types/hostel';
import { calculateWingHealth, getScoreColor } from '../../utils/healthScore';
import { RotateCw, Eye, Layers } from 'lucide-react';

interface Building3DViewerProps {
  buildingId: string;
  floorsCount?: number;
  evaluations: FixtureEvaluation[];
  selectedWing?: number | null;
  selectedFloor?: number | null;
  onSelectSector: (wingId: number, floor: number) => void;
}

export const Building3DViewer: React.FC<Building3DViewerProps> = ({
  buildingId,
  floorsCount = 5,
  evaluations,
  selectedWing,
  selectedFloor,
  onSelectSector,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredInfo, setHoveredInfo] = useState<{
    wingId: number;
    floor: number;
    health: number;
    leaks: number;
    x: number;
    y: number;
  } | null>(null);

  const [activeFloorFilter, setActiveFloorFilter] = useState<number | 'all'>('all');
  const [autoRotate, setAutoRotate] = useState<boolean>(true);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshesMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const reqIdRef = useRef<number | null>(null);

  const getSectorEvaluations = (wingId: number, floor: number) => {
    return evaluations.filter((e) => e.wingId === wingId && e.floor === floor);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene Setup - Clean Light Architectural Grey
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf1f5f9);

    // 2. Camera Setup
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(22, 20, 26);
    camera.lookAt(0, 4, 0);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Lighting System (Soft Natural Architectural Daylight)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(25, 45, 20);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // Ground Grid - Light architectural grid
    const grid = new THREE.GridHelper(36, 18, 0x94a3b8, 0xcbd5e1);
    grid.position.y = -0.05;
    scene.add(grid);

    // 5. Central Hub (Nexus connecting the 4 wings)
    const hubRadius = 2.4;
    const totalHeight = floorsCount * 1.8 + 0.6;
    const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius, totalHeight, 24);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.1,
      roughness: 0.7,
      transparent: true,
      opacity: 0.9,
    });
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    hubMesh.position.y = totalHeight / 2;
    scene.add(hubMesh);

    // 6. Generate 4 Wings
    const wingAngles = [
      Math.PI / 4,
      (3 * Math.PI) / 4,
      (5 * Math.PI) / 4,
      (7 * Math.PI) / 4,
    ];

    const wingLength = 6.2;
    const wingWidth = 3.2;
    const floorHeight = 1.6;
    const floorGap = 0.15;

    meshesMapRef.current.clear();

    for (let w = 1; w <= 4; w++) {
      const angle = wingAngles[w - 1];
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const distFromCenter = hubRadius + wingLength / 2;

      for (let f = 1; f <= floorsCount; f++) {
        const sectorEvals = getSectorEvaluations(w, f);
        const health = calculateWingHealth(sectorEvals);
        const colorDef = getScoreColor(health);

        const isCurrentSelected = selectedWing === w && selectedFloor === f;

        const boxGeo = new THREE.BoxGeometry(wingWidth, floorHeight, wingLength);
        const boxMat = new THREE.MeshStandardMaterial({
          color: colorDef.threeColor,
          roughness: 0.4,
          metalness: 0.1,
          transparent: true,
          opacity: isCurrentSelected ? 0.98 : 0.85,
        });

        const mesh = new THREE.Mesh(boxGeo, boxMat);
        const yPos = (f - 1) * (floorHeight + floorGap) + floorHeight / 2 + 0.1;

        mesh.position.set(distFromCenter * cosA, yPos, distFromCenter * sinA);
        mesh.rotation.y = -angle + Math.PI / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        mesh.userData = {
          wingId: w,
          floor: f,
          health,
          leaksCount: sectorEvals.filter((e) => e.defects.includes('leak')).length,
        };

        scene.add(mesh);
        meshesMapRef.current.set(`w${w}_f${f}`, mesh);

        // Subtle dark edges for architectural blueprint
        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x334155,
          transparent: true,
          opacity: 0.35,
        });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        mesh.add(wireframe);
      }

      // 3D Floating Wing Label strictly labeled by number 1 to 4
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256;
      labelCanvas.height = 100;
      const lCtx = labelCanvas.getContext('2d');
      if (lCtx) {
        lCtx.fillStyle = '#ffffff';
        lCtx.beginPath();
        lCtx.roundRect(10, 10, 236, 80, 16);
        lCtx.fill();
        lCtx.strokeStyle = '#2563eb';
        lCtx.lineWidth = 6;
        lCtx.stroke();
        lCtx.font = 'bold 44px "Cairo", sans-serif';
        lCtx.fillStyle = '#1e3a8a';
        lCtx.textAlign = 'center';
        lCtx.textBaseline = 'middle';
        lCtx.fillText(`جناح ${w}`, 128, 50);

        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const spriteMat = new THREE.SpriteMaterial({ map: labelTex });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(3.4, 1.35, 1);
        const labelDist = distFromCenter + wingLength / 2 + 1.2;
        sprite.position.set(labelDist * cosA, 1.2, labelDist * sinA);
        scene.add(sprite);
      }
    }

    // 7. Mouse & Touch Interaction
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = { radius: 36, theta: Math.PI / 4, phi: Math.PI / 3 };

    const updateCameraPosition = () => {
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, totalHeight / 2.2, 0);
    };
    updateCameraPosition();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;

        spherical.theta -= deltaX * 0.007;
        spherical.phi = Math.max(0.15, Math.min(Math.PI / 2.1, spherical.phi - deltaY * 0.007));
        updateCameraPosition();
        return;
      }

      // Hover Raycasting
      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(meshesMapRef.current.values());
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const topMesh = intersects[0].object as THREE.Mesh;
        const data = topMesh.userData;
        if (data && data.wingId) {
          setHoveredInfo({
            wingId: data.wingId,
            floor: data.floor,
            health: data.health,
            leaks: data.leaksCount,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
          return;
        }
      }
      setHoveredInfo(null);
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(meshesMapRef.current.values());
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const topMesh = intersects[0].object as THREE.Mesh;
        const data = topMesh.userData;
        if (data && data.wingId && data.floor) {
          onSelectSector(data.wingId, data.floor);
        }
      }
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElement.addEventListener('click', onClick);

    // 8. Animation Loop
    const animate = () => {
      if (autoRotate && !isDragging) {
        spherical.theta += 0.002;
        updateCameraPosition();
      }
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
      renderer.dispose();
    };
  }, [buildingId, floorsCount, evaluations, selectedWing, selectedFloor, autoRotate]);

  useEffect(() => {
    meshesMapRef.current.forEach((mesh) => {
      const floor = mesh.userData.floor;
      if (activeFloorFilter === 'all' || floor === activeFloorFilter) {
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    });
  }, [activeFloorFilter]);

  return (
    <div className="relative w-full h-[480px] bg-slate-100 rounded-2xl overflow-hidden border border-slate-300 shadow-md flex flex-col">
      {/* 3D Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Floating Controls */}
      <div className="absolute top-4 right-4 left-4 flex justify-between items-center pointer-events-none">
        <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm pointer-events-auto flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">
            المجسم المعماري • {buildingId} (4 أجنحة)
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Floor Selector */}
          <div className="bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-sm flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-slate-500 ml-1" />
            <button
              onClick={() => setActiveFloorFilter('all')}
              className={`px-2 py-0.5 text-xs rounded font-bold transition ${
                activeFloorFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            {Array.from({ length: floorsCount }, (_, i) => i + 1).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFloorFilter(f)}
                className={`px-2 py-0.5 text-xs rounded font-bold transition ${
                  activeFloorFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                د{f}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-2 rounded-xl border shadow-sm transition ${
              autoRotate
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
            title="تبديل الدوران التلقائي"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredInfo && (
        <div
          className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
          style={{ left: hoveredInfo.x, top: hoveredInfo.y }}
        >
          <div className="bg-white border border-slate-300 p-3 rounded-xl shadow-xl text-right min-w-[170px]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1 mb-1.5">
              <span className="text-xs font-bold text-slate-900">
                جناح {hoveredInfo.wingId} • الدور {hoveredInfo.floor}
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getScoreColor(hoveredInfo.health).hex }}
              />
            </div>
            <div className="text-xs flex justify-between items-center text-slate-700">
              <span>نسبة السلامة:</span>
              <span className="font-bold text-sm" style={{ color: getScoreColor(hoveredInfo.health).hex }}>
                %{hoveredInfo.health}
              </span>
            </div>
            {hoveredInfo.leaks > 0 && (
              <div className="text-xs text-rose-600 font-bold mt-1">
                💧 {hoveredInfo.leaks} تسريب مياه نشط!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-4 left-4 flex justify-between items-center pointer-events-none text-xs">
        <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span className="text-slate-700">سليم (80-100%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
            <span className="text-slate-700">صيانة (50-79%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
            <span className="text-rose-700 font-bold">حرج (&lt;50%)</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm pointer-events-auto flex items-center gap-1">
          <Eye className="w-3.5 h-3.5 text-blue-600" />
          <span>اسحب للتدوير بالماوس</span>
        </div>
      </div>
    </div>
  );
};
