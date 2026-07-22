"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { feature } from "topojson-client";
import worldCountries from "world-atlas/countries-110m.json";
import {
  ArrowLeft,
  Briefcase,
  Compass,
  Globe2,
  Heart,
  Home,
  Loader2,
  Lock,
  MapPin,
  Navigation,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import type {
  AstrocartographyCategory,
  AstrocartographyCityHighlight,
  AstrocartographyLine,
  AstrocartographyReportData,
} from "@/lib/astrocartography-report";
import { useUserStore } from "@/lib/user-store";

interface AstrocartographyStatusResponse {
  status: "not_started" | "generating" | "complete" | "failed";
  report?: AstrocartographyReportData | null;
}

interface AstrocartographyGenerateResponse {
  status: "complete";
  report?: AstrocartographyReportData | null;
  cached?: boolean;
}

const CATEGORY_OPTIONS: Array<{
  id: "all" | AstrocartographyCategory;
  label: string;
  Icon: typeof Sparkles;
}> = [
  { id: "all", label: "All", Icon: Globe2 },
  { id: "love", label: "Love", Icon: Heart },
  { id: "career", label: "Career", Icon: Briefcase },
  { id: "home", label: "Home", Icon: Home },
  { id: "growth", label: "Growth", Icon: Navigation },
  { id: "spiritual", label: "Soul", Icon: Compass },
];

const CATEGORY_TONES: Record<AstrocartographyCategory, string> = {
  love: "border-pink-400/25 bg-pink-400/10 text-pink-100",
  career: "border-sky-400/25 bg-sky-400/10 text-sky-100",
  home: "border-violet-400/25 bg-violet-400/10 text-violet-100",
  growth: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  spiritual: "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100",
};

const CATEGORY_LABELS: Record<AstrocartographyCategory, string> = {
  love: "Love",
  career: "Career",
  home: "Home",
  growth: "Growth",
  spiritual: "Spiritual",
};

function formatBirthDate(report: AstrocartographyReportData) {
  const { day, month, year, hour, minute } = report.birthData;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default function AstrocartographyPage() {
  const router = useRouter();
  const { unlockedFeatures } = useUserStore();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<AstrocartographyReportData | null>(null);
  const [serverUnlocked, setServerUnlocked] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"all" | AstrocartographyCategory>("all");
  const [selectedLineId, setSelectedLineId] = useState<string>("");
  const isUnlocked = unlockedFeatures.astrocartographyReport || serverUnlocked || Boolean(report);

  const filteredLines = useMemo(() => {
    if (!report) return [];
    if (activeCategory === "all") return report.lines;
    return report.lines.filter((line) => line.category === activeCategory);
  }, [activeCategory, report]);

  const selectedLine = useMemo(() => {
    if (!report) return null;
    return report.lines.find((line) => line.id === selectedLineId) || filteredLines[0] || report.featuredLines[0] || null;
  }, [filteredLines, report, selectedLineId]);

  useEffect(() => {
    if (filteredLines.length && !filteredLines.some((line) => line.id === selectedLineId)) {
      setSelectedLineId(filteredLines[0].id);
    }
  }, [filteredLines, selectedLineId]);

  const generateReport = useCallback(
    async (uid: string, force = false) => {
      try {
        setGenerating(true);
        setError("");

        const response = await fetch("/api/astrocartography/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, force }),
        });

        const json = (await response.json().catch(() => ({}))) as Partial<AstrocartographyGenerateResponse> & {
          error?: string;
        };

        if (!response.ok || !json.report) {
          if (response.status === 403) {
            throw new Error("Astrocartography is locked.");
          }
          const message =
            json.error === "missing_birth_details"
              ? "Please complete your birth date, birth time, and birth place before opening Astrocartography."
              : "Unable to generate your Astrocartography right now.";
          throw new Error(message);
        }

        setServerUnlocked(true);
        setReport(json.report);
        setSelectedLineId(json.report.featuredLines[0]?.id || json.report.lines[0]?.id || "");
      } catch (err: any) {
        setError(err?.message || "Unable to generate your Astrocartography.");
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const fetchStatus = useCallback(
    async (uid: string) => {
      const response = await fetch(`/api/astrocartography/status?userId=${encodeURIComponent(uid)}`, {
        cache: "no-store",
      });

      if (response.status === 403) {
        throw new Error("Astrocartography is locked.");
      }

      if (!response.ok) {
        throw new Error("Unable to load your Astrocartography right now.");
      }

      setServerUnlocked(true);
      const json = (await response.json()) as AstrocartographyStatusResponse;
      if (json.status === "complete" && json.report) {
        setReport(json.report);
        setSelectedLineId(json.report.featuredLines[0]?.id || json.report.lines[0]?.id || "");
        return;
      }

      await generateReport(uid);
    },
    [generateReport]
  );

  useEffect(() => {
    const boot = async () => {
      try {
        setLoading(true);
        setError("");
        const localUserId = localStorage.getItem("astrorekha_user_id") || "";
        setUserId(localUserId);

        if (!localUserId) {
          setError("Please login again to continue.");
          return;
        }

        await fetchStatus(localUserId);
      } catch (err: any) {
        setError(err?.message || "Unable to load your Astrocartography.");
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [fetchStatus]);

  if (!isUnlocked && !loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] px-4 py-5">
        <div className="mx-auto w-full max-w-md">
          <button
            onClick={() => router.push("/reports")}
            className="mb-4 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Reports
          </button>

          <div className="rounded-3xl border border-primary/20 bg-[#1A2235] p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-white">Astrocartography is locked</h1>
            <p className="mt-2 text-sm text-white/60">Unlock it from Reports to see your personal planetary map.</p>
            <button
              onClick={() => router.push("/reports")}
              className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
            >
              Back to Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
      <div className="h-screen w-full max-w-md overflow-y-auto bg-[#0A0E1A] shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center gap-4 px-4 py-3">
            <button onClick={() => router.push("/reports")} className="flex h-10 w-10 items-center justify-center">
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
            <div className="flex-1 text-center pr-10">
              <h1 className="text-lg font-semibold text-white">Astrocartography</h1>
            </div>
          </div>
        </div>

        <div className="px-4 py-5">
          {(loading || generating) && !report ? (
            <div className="flex min-h-[70vh] items-center justify-center">
              <div className="rounded-3xl border border-primary/20 bg-[#1A2235] p-6 text-center">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                <h2 className="mt-4 text-lg font-semibold text-white">Drawing your planetary map...</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  We are calculating your Sun, Moon, Venus, Jupiter, and other location lines.
                </p>
              </div>
            </div>
          ) : null}

          {!loading && error && !report ? (
            <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 text-center">
              <p className="text-sm leading-6 text-red-200">{error}</p>
              <button
                onClick={() => (userId ? generateReport(userId, true) : router.push("/reports"))}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
              <button
                onClick={() => router.push("/reports")}
                className="mt-3 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
              >
                Back to Reports
              </button>
            </div>
          ) : null}

          {report ? (
            <AstrocartographyReportView
              report={report}
              activeCategory={activeCategory}
              selectedLine={selectedLine}
              selectedLineId={selectedLine?.id || selectedLineId}
              onSelectLine={setSelectedLineId}
              onSelectCategory={setActiveCategory}
              filteredLines={filteredLines}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AstrocartographyReportView({
  report,
  activeCategory,
  selectedLine,
  selectedLineId,
  filteredLines,
  onSelectLine,
  onSelectCategory,
}: {
  report: AstrocartographyReportData;
  activeCategory: "all" | AstrocartographyCategory;
  selectedLine: AstrocartographyLine | null;
  selectedLineId: string;
  filteredLines: AstrocartographyLine[];
  onSelectLine: (lineId: string) => void;
  onSelectCategory: (category: "all" | AstrocartographyCategory) => void;
}) {
  const visibleCityHighlights = useMemo(() => {
    if (activeCategory === "all") return report.cityHighlights;
    return report.cityHighlights.filter((city) => city.category === activeCategory);
  }, [activeCategory, report.cityHighlights]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-primary/20 bg-[#1A2235] shadow-2xl shadow-black/25">
        <div className="relative px-5 py-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.26),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.18),transparent_44%)]" />
          <div className="relative">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/45">
              <Globe2 className="h-4 w-4 text-cyan-300" />
              Personal Planetary Map
            </p>
            <h2 className="mt-2 text-3xl font-bold leading-tight text-white">Your Best Places to Grow</h2>
            <p className="mt-3 text-sm leading-6 text-white/62">
              Based on {formatBirthDate(report)} at {report.birthData.place}.
            </p>
          </div>
        </div>

        <div className="border-y border-white/10 bg-black/20">
          <AstroGlobe
            report={report}
            activeCategory={activeCategory}
            selectedLineId={selectedLineId}
            onSelectLine={onSelectLine}
          />
        </div>

        <div className="p-4">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORY_OPTIONS.map(({ id, label, Icon }) => {
              const isActive = activeCategory === id;
              return (
                <button
                  key={id}
                  onClick={() => onSelectCategory(id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                      : "border-white/10 bg-white/5 text-white/60"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {selectedLine ? <SelectedLineCard line={selectedLine} /> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#1A2235] p-4">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-white">Power Lines</h3>
          <p className="mt-1 text-xs text-white/45">
            {activeCategory === "all" ? "Tap a line to inspect it on the map." : report.categorySummary[activeCategory]}
          </p>
        </div>

        <div className="space-y-3">
          {(activeCategory === "all" ? report.featuredLines : filteredLines.slice(0, 8)).map((line) => (
            <LineListItem
              key={line.id}
              line={line}
              active={selectedLineId === line.id}
              onClick={() => onSelectLine(line.id)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#1A2235] p-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
          <MapPin className="h-4 w-4 text-primary" />
          City Spotlights
        </h3>
        <p className="mt-1 text-xs text-white/45">Nearby locations from common travel and relocation hubs.</p>
        <div className="mt-4 space-y-3">
          {visibleCityHighlights.length ? (
            visibleCityHighlights.map((city) => (
              <CityHighlightCard key={`${city.city}-${city.lineId}`} city={city} onSelectLine={onSelectLine} />
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/60">
              No major city spotlight is close to this category yet. Use the map lines for the most accurate view.
            </div>
          )}
        </div>
      </section>

      <ReportDisclaimer text="This Astrocartography report is for entertainment only and is not relocation, immigration, legal, financial, or professional advice." />
    </motion.div>
  );
}

function AstroGlobe({
  report,
  activeCategory,
  selectedLineId,
  onSelectLine,
}: {
  report: AstrocartographyReportData;
  activeCategory: "all" | AstrocartographyCategory;
  selectedLineId: string;
  onSelectLine: (lineId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const globeGroupRef = useRef<any>(null);
  const linesGroupRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  const raycasterRef = useRef<any>(null);
  const pointerRef = useRef<any>(null);
  const frameRef = useRef<number | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const lineTargetsRef = useRef<any[]>([]);
  const onSelectLineRef = useRef(onSelectLine);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragStateRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pinching: false,
    pinchDistance: 0,
    pinchZoom: 1,
    zoom: 1,
  });
  const [globeReady, setGlobeReady] = useState(false);

  useEffect(() => {
    onSelectLineRef.current = onSelectLine;
  }, [onSelectLine]);

  const setGlobeZoom = useCallback((nextZoom: number) => {
    const clampedZoom = Math.max(0.82, Math.min(1.9, nextZoom));
    dragStateRef.current.zoom = clampedZoom;
    if (globeGroupRef.current) {
      globeGroupRef.current.scale.setScalar(clampedZoom);
    }
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initializeGlobe = async () => {
      if (!containerRef.current || rendererRef.current) return;
      const THREE = await import("three");
      if (cancelled || !containerRef.current) return;

      const container = containerRef.current;
      const width = container.clientWidth || 420;
      const height = container.clientHeight || 440;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
      camera.position.set(0, 0, 7.15);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      const globeGroup = new THREE.Group();
      globeGroup.rotation.set(-0.22, -0.55, 0.08);
      globeGroup.scale.setScalar(dragStateRef.current.zoom);
      scene.add(globeGroup);

      const earthGeometry = new THREE.SphereGeometry(2, 96, 96);
      const earthTexture = createEarthTexture(THREE);
      const earthMaterial = new THREE.MeshPhongMaterial({
        color: "#ffffff",
        map: earthTexture,
        emissive: "#06111f",
        emissiveIntensity: 0.22,
        shininess: 24,
        specular: "#243a56",
      });
      const earth = new THREE.Mesh(earthGeometry, earthMaterial);
      globeGroup.add(earth);

      const gridGeometry = new THREE.SphereGeometry(2.006, 48, 32);
      const grid = new THREE.Mesh(
        gridGeometry,
        new THREE.MeshBasicMaterial({
          color: "#6b87a8",
          transparent: true,
          opacity: 0.07,
          wireframe: true,
        })
      );
      globeGroup.add(grid);

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.12, 64, 64),
        new THREE.MeshBasicMaterial({
          color: "#22d3ee",
          transparent: true,
          opacity: 0.08,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
        })
      );
      globeGroup.add(atmosphere);

      const linesGroup = new THREE.Group();
      const markersGroup = new THREE.Group();
      globeGroup.add(linesGroup);
      globeGroup.add(markersGroup);

      scene.add(new THREE.AmbientLight("#9cc9ff", 1.15));
      const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
      keyLight.position.set(3.5, 2.4, 4.8);
      scene.add(keyLight);
      const rimLight = new THREE.PointLight("#e11d48", 4.6, 10);
      rimLight.position.set(-3.4, -1.2, 3);
      scene.add(rimLight);

      const starsGeometry = new THREE.BufferGeometry();
      const starPositions: number[] = [];
      for (let index = 0; index < 180; index += 1) {
        const radius = 8 + Math.random() * 8;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        starPositions.push(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        );
      }
      starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
      const stars = new THREE.Points(
        starsGeometry,
        new THREE.PointsMaterial({
          color: "#ffffff",
          size: 0.018,
          transparent: true,
          opacity: 0.44,
        })
      );
      scene.add(stars);

      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;
      globeGroupRef.current = globeGroup;
      linesGroupRef.current = linesGroup;
      markersGroupRef.current = markersGroup;
      raycasterRef.current = new THREE.Raycaster();
      pointerRef.current = new THREE.Vector2();

      const resize = () => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
        const nextWidth = containerRef.current.clientWidth || width;
        const nextHeight = containerRef.current.clientHeight || height;
        cameraRef.current.aspect = nextWidth / nextHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(nextWidth, nextHeight);
      };

      const animate = () => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !globeGroupRef.current) return;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        frameRef.current = window.requestAnimationFrame(animate);
      };

      resizeHandlerRef.current = resize;
      window.addEventListener("resize", resize);
      setGlobeReady(true);
      animate();
    };

    initializeGlobe();

    return () => {
      cancelled = true;
      setGlobeReady(false);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (resizeHandlerRef.current) {
        window.removeEventListener("resize", resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }
      disposeGroup(linesGroupRef.current);
      disposeGroup(markersGroupRef.current);
      disposeGroup(globeGroupRef.current);
      if (sceneRef.current) {
        sceneRef.current.traverse((object: any) => {
          object.geometry?.dispose?.();
          disposeMaterial(object.material);
        });
      }
      if (rendererRef.current) {
        rendererRef.current.domElement?.remove?.();
        rendererRef.current.dispose?.();
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      globeGroupRef.current = null;
      linesGroupRef.current = null;
      markersGroupRef.current = null;
      raycasterRef.current = null;
      pointerRef.current = null;
      lineTargetsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const drawGlobeData = async () => {
      if (!globeReady || !linesGroupRef.current || !markersGroupRef.current) return;
      const THREE = await import("three");
      const linesGroup = linesGroupRef.current;
      const markersGroup = markersGroupRef.current;
      disposeGroup(linesGroup);
      disposeGroup(markersGroup);
      lineTargetsRef.current = [];

      const visibleLines =
        activeCategory === "all"
          ? report.lines
          : report.lines.filter((line) => line.category === activeCategory);

      visibleLines.forEach((line) => {
        const isSelected = line.id === selectedLineId;
        const path = line.points
          .filter((_, index) => index % 2 === 0 || isSelected)
          .map((point) => latLngToVector3(THREE, point.lat, point.lng, isSelected ? 2.045 : 2.032));
        if (path.length < 2) return;

        const curve = new THREE.CatmullRomCurve3(path, false, "centripetal", 0.28);
        const lineGeometry = new THREE.TubeGeometry(curve, Math.max(path.length * 4, 48), isSelected ? 0.016 : 0.009, 8, false);
        const glowGeometry = new THREE.TubeGeometry(curve, Math.max(path.length * 4, 48), isSelected ? 0.048 : 0.029, 8, false);
        const lineMesh = new THREE.Mesh(
          lineGeometry,
          new THREE.MeshBasicMaterial({
            color: line.color,
            transparent: true,
            opacity: isSelected ? 1 : 0.62,
          })
        );
        const glowMesh = new THREE.Mesh(
          glowGeometry,
          new THREE.MeshBasicMaterial({
            color: line.color,
            transparent: true,
            opacity: isSelected ? 0.22 : 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        lineMesh.userData = { lineId: line.id };
        glowMesh.userData = { lineId: line.id };
        linesGroup.add(glowMesh);
        linesGroup.add(lineMesh);
        lineTargetsRef.current.push(lineMesh, glowMesh);
      });

      report.cityHighlights.forEach((city) => {
        if (activeCategory !== "all" && city.category !== activeCategory) return;
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(city.lineId === selectedLineId ? 0.042 : 0.03, 16, 16),
          new THREE.MeshBasicMaterial({
            color: city.lineId === selectedLineId ? "#ffffff" : "#e11d48",
            transparent: true,
            opacity: city.lineId === selectedLineId ? 1 : 0.78,
          })
        );
        marker.position.copy(latLngToVector3(THREE, city.latitude, city.longitude, 2.09));
        marker.userData = { lineId: city.lineId };
        markersGroup.add(marker);
        lineTargetsRef.current.push(marker);

        const label = createGlobeLabelSprite(THREE, city.city, city.lineId === selectedLineId);
        label.position.copy(latLngToVector3(THREE, city.latitude, city.longitude, 2.24));
        label.userData = { lineId: city.lineId };
        markersGroup.add(label);
      });
    };

    drawGlobeData();
  }, [activeCategory, globeReady, report.cityHighlights, report.lines, selectedLineId]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.dragging = true;
    state.moved = false;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    if (activePointersRef.current.size === 2) {
      const pointers = Array.from(activePointersRef.current.values());
      state.pinching = true;
      state.pinchDistance = pointerDistance(pointers[0], pointers[1]);
      state.pinchZoom = state.zoom;
      state.moved = true;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (activePointersRef.current.size >= 2) {
      const pointers = Array.from(activePointersRef.current.values());
      const nextDistance = pointerDistance(pointers[0], pointers[1]);
      if (!state.pinching) {
        state.pinching = true;
        state.pinchDistance = nextDistance;
        state.pinchZoom = state.zoom;
      }
      state.moved = true;
      setGlobeZoom(state.pinchZoom + (nextDistance - state.pinchDistance) * 0.0045);
      return;
    }
    if (!state.dragging || !globeGroupRef.current) return;
    const deltaX = event.clientX - state.lastX;
    const deltaY = event.clientY - state.lastY;
    if (Math.abs(event.clientX - state.startX) + Math.abs(event.clientY - state.startY) > 6) {
      state.moved = true;
    }
    globeGroupRef.current.rotation.y += deltaX * 0.006;
    globeGroupRef.current.rotation.x += deltaY * 0.004;
    globeGroupRef.current.rotation.x = Math.max(-1.15, Math.min(1.15, globeGroupRef.current.rotation.x));
    state.lastX = event.clientX;
    state.lastY = event.clientY;
  };

  const handlePointerUp = async (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    const wasPinching = state.pinching;
    activePointersRef.current.delete(event.pointerId);
    state.dragging = false;
    state.pinching = activePointersRef.current.size >= 2;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (wasPinching || state.moved || !rendererRef.current || !cameraRef.current || !sceneRef.current) return;
    const THREE = await import("three");
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const pointer = pointerRef.current || new THREE.Vector2();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = raycasterRef.current || new THREE.Raycaster();
    raycaster.setFromCamera(pointer, cameraRef.current);
    const hits = raycaster.intersectObjects(lineTargetsRef.current, false);
    const lineId = hits[0]?.object?.userData?.lineId;
    if (lineId) onSelectLineRef.current(lineId);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setGlobeZoom(dragStateRef.current.zoom - event.deltaY * 0.0012);
  };

  const stopZoomControlPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    activePointersRef.current.clear();
    dragStateRef.current.dragging = false;
    dragStateRef.current.pinching = false;
  };

  return (
    <div
      className="relative h-[430px] w-full touch-none overflow-hidden bg-[#050914]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event) => {
        activePointersRef.current.delete(event.pointerId);
        dragStateRef.current.dragging = false;
        dragStateRef.current.pinching = false;
      }}
      onWheel={handleWheel}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_48%),linear-gradient(180deg,rgba(225,29,72,0.08),rgba(10,14,26,0.1)_45%,rgba(0,0,0,0.34))]" />
      <div ref={containerRef} className="relative h-full w-full cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-2xl border border-white/10 bg-[#0A0E1A]/82 px-3 py-2 backdrop-blur-md">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">3D Interactive Globe</p>
        <p className="mt-0.5 text-xs text-white/80">{report.lines.length} planetary lines</p>
      </div>
      <div
        className="absolute right-3 top-3 z-20 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A0E1A]/82 backdrop-blur-md"
        onPointerDown={stopZoomControlPointer}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom in"
          onClick={(event) => {
            event.stopPropagation();
            setGlobeZoom(dragStateRef.current.zoom + 0.24);
          }}
          className="flex h-11 w-11 items-center justify-center text-white transition hover:bg-white/10 active:bg-primary/25"
        >
          <Plus className="h-5 w-5" />
        </button>
        <div className="h-px bg-white/10" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={(event) => {
            event.stopPropagation();
            setGlobeZoom(dragStateRef.current.zoom - 0.24);
          }}
          className="flex h-11 w-11 items-center justify-center text-white transition hover:bg-white/10 active:bg-primary/25"
        >
          <Minus className="h-5 w-5" />
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-2xl border border-white/10 bg-[#0A0E1A]/72 px-3 py-2 text-center text-[11px] text-white/54 backdrop-blur-md">
        Drag to rotate. Pinch or tap + / - to zoom.
      </div>
    </div>
  );
}

type GlobePolygon = {
  name: string;
  points: Array<[number, number]>;
};

const LAND_POLYGONS: GlobePolygon[] = [
  {
    name: "North America",
    points: [
      [-168, 72], [-145, 70], [-126, 57], [-124, 49], [-116, 32], [-105, 24], [-97, 18], [-88, 19],
      [-82, 25], [-76, 38], [-62, 45], [-52, 58], [-72, 70], [-95, 74], [-120, 72], [-142, 76],
    ],
  },
  {
    name: "South America",
    points: [
      [-82, 12], [-70, 10], [-52, -2], [-40, -15], [-38, -28], [-50, -44], [-62, -55], [-72, -48],
      [-78, -28], [-82, -8],
    ],
  },
  {
    name: "Europe",
    points: [
      [-11, 36], [2, 44], [18, 47], [28, 54], [42, 58], [34, 66], [10, 70], [-8, 60], [-20, 50],
    ],
  },
  {
    name: "Africa",
    points: [
      [-18, 35], [8, 37], [34, 30], [48, 12], [44, -12], [31, -34], [18, -35], [4, -24], [-13, -6],
      [-17, 14],
    ],
  },
  {
    name: "Asia",
    points: [
      [32, 36], [50, 50], [73, 56], [105, 60], [135, 54], [150, 44], [139, 30], [116, 21], [103, 6],
      [76, 8], [68, 23], [45, 24],
    ],
  },
  {
    name: "India",
    points: [
      [68, 24], [76, 31], [88, 26], [92, 20], [86, 12], [78, 7], [72, 13],
    ],
  },
  {
    name: "Southeast Asia",
    points: [
      [95, 21], [110, 18], [122, 12], [121, 1], [108, -6], [96, 2],
    ],
  },
  {
    name: "Australia",
    points: [
      [113, -12], [132, -10], [153, -22], [147, -38], [128, -42], [112, -30],
    ],
  },
  {
    name: "Greenland",
    points: [
      [-52, 59], [-30, 66], [-22, 78], [-44, 83], [-62, 75], [-66, 64],
    ],
  },
  {
    name: "Antarctica",
    points: [
      [-180, -72], [-130, -76], [-80, -74], [-35, -78], [8, -74], [58, -78], [110, -74], [180, -72],
      [180, -90], [-180, -90],
    ],
  },
];

const MAP_LABELS: Array<{ label: string; lat: number; lng: number; size?: number }> = [
  { label: "INDIA", lat: 21, lng: 78, size: 23 },
  { label: "CHINA", lat: 34, lng: 104 },
  { label: "RUSSIA", lat: 60, lng: 85 },
  { label: "EUROPE", lat: 51, lng: 14 },
  { label: "AFRICA", lat: 3, lng: 20 },
  { label: "USA", lat: 39, lng: -98 },
  { label: "BRAZIL", lat: -12, lng: -53 },
  { label: "AUSTRALIA", lat: -25, lng: 134 },
  { label: "PACIFIC", lat: 0, lng: -150, size: 20 },
  { label: "ATLANTIC", lat: 6, lng: -32, size: 20 },
];

function createEarthTexture(THREE: any) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const toX = (lng: number) => ((lng + 180) / 360) * canvas.width;
  const toY = (lat: number) => ((90 - lat) / 180) * canvas.height;

  const ocean = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  ocean.addColorStop(0, "#091526");
  ocean.addColorStop(0.48, "#132843");
  ocean.addColorStop(1, "#07111f");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(125, 211, 252, 0.11)";
  ctx.lineWidth = 1;
  for (let lng = -180; lng <= 180; lng += 15) {
    ctx.beginPath();
    ctx.moveTo(toX(lng), 0);
    ctx.lineTo(toX(lng), canvas.height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    ctx.beginPath();
    ctx.moveTo(0, toY(lat));
    ctx.lineTo(canvas.width, toY(lat));
    ctx.stroke();
  }

  const countries = feature(
    worldCountries as any,
    (worldCountries as any).objects.countries
  ) as any;

  const landGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  landGradient.addColorStop(0, "#315b5c");
  landGradient.addColorStop(0.42, "#2f6a5d");
  landGradient.addColorStop(0.72, "#6f6540");
  landGradient.addColorStop(1, "#3d745e");

  ctx.save();
  ctx.shadowColor = "rgba(37, 211, 183, 0.24)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = landGradient;
  ctx.strokeStyle = "rgba(222, 241, 255, 0.62)";
  ctx.lineWidth = 1.35;
  countries.features.forEach((country: any) => {
    drawGeoGeometry(ctx, country.geometry, toX, toY);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  countries.features.forEach((country: any) => {
    drawGeoGeometry(ctx, country.geometry, toX, toY);
    ctx.fill();
  });
  ctx.restore();

  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.25;
  [
    [[-125, 49], [-66, 49], [-66, 25], [-125, 25], [-125, 49]],
    [[68, 8], [92, 8], [92, 33], [68, 33], [68, 8]],
    [[-75, -35], [-35, -35], [-35, 8], [-75, 8], [-75, -35]],
  ].forEach((border) => {
    ctx.beginPath();
    border.forEach(([lng, lat], index) => {
      if (index === 0) ctx.moveTo(toX(lng), toY(lat));
      else ctx.lineTo(toX(lng), toY(lat));
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);

  MAP_LABELS.forEach(({ label, lat, lng, size = 22 }) => {
    const x = toX(lng);
    const y = toY(lat);
    ctx.font = `700 ${size}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(4, 10, 20, 0.86)";
    ctx.fillStyle = label === "INDIA" ? "rgba(255,255,255,0.94)" : "rgba(225,236,255,0.76)";
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function drawGeoGeometry(
  ctx: CanvasRenderingContext2D,
  geometry: any,
  toX: (lng: number) => number,
  toY: (lat: number) => number
) {
  const drawRing = (ring: Array<[number, number]>) => {
    ring.forEach(([lng, lat], index) => {
      const x = toX(lng);
      const y = toY(lat);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  };

  ctx.beginPath();

  if (geometry?.type === "Polygon") {
    geometry.coordinates.forEach((ring: Array<[number, number]>) => {
      drawRing(ring);
      ctx.closePath();
    });
    return;
  }

  if (geometry?.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon: Array<Array<[number, number]>>) => {
      polygon.forEach((ring) => {
        drawRing(ring);
        ctx.closePath();
      });
    });
  }
}

function createGlobeLabelSprite(THREE: any, label: string, isSelected: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 84;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "700 28px Inter, Arial, sans-serif";
    const width = Math.min(228, Math.max(92, ctx.measureText(label).width + 34));
    const x = (canvas.width - width) / 2;
    const y = 18;
    ctx.fillStyle = isSelected ? "rgba(225, 29, 72, 0.92)" : "rgba(10, 14, 26, 0.78)";
    ctx.strokeStyle = isSelected ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.24)";
    ctx.lineWidth = 2;
    roundedRect(ctx, x, y, width, 38, 19);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, canvas.width / 2, y + 19);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: isSelected ? 1 : 0.82,
      depthTest: true,
    })
  );
  sprite.scale.set(isSelected ? 0.72 : 0.58, isSelected ? 0.24 : 0.19, 1);
  return sprite;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function pointerDistance(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function latLngToVector3(THREE: any, latitude: number, longitude: number, radius: number) {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function disposeMaterial(material: any) {
  if (Array.isArray(material)) {
    material.forEach((item) => item?.dispose?.());
    return;
  }
  material?.dispose?.();
}

function disposeGroup(group: any) {
  if (!group) return;
  while (group.children?.length) {
    const child = group.children[0];
    group.remove(child);
    disposeGroup(child);
    child.geometry?.dispose?.();
    disposeMaterial(child.material);
  }
}

function SelectedLineCard({ line }: { line: AstrocartographyLine }) {
  return (
    <div className={`rounded-2xl border p-4 ${CATEGORY_TONES[line.category]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-1 h-3 w-3 shrink-0 rounded-full shadow-lg" style={{ backgroundColor: line.color }} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold text-white">{line.title}</h3>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
              {CATEGORY_LABELS[line.category]}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/76">{line.summary}</p>
          <p className="mt-3 text-sm leading-6 text-white/66">{line.guidance}</p>
        </div>
      </div>
    </div>
  );
}

function LineListItem({
  line,
  active,
  onClick,
}: {
  line: AstrocartographyLine;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active ? "border-primary bg-primary/12" : "border-white/10 bg-black/20 hover:border-primary/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h4 className="truncate text-sm font-semibold text-white">{line.title}</h4>
            <span className="shrink-0 text-[11px] uppercase text-white/45">{line.angleLabel}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/55">{line.summary}</p>
        </div>
      </div>
    </button>
  );
}

function CityHighlightCard({
  city,
  onSelectLine,
}: {
  city: AstrocartographyCityHighlight;
  onSelectLine: (lineId: string) => void;
}) {
  return (
    <button
      onClick={() => onSelectLine(city.lineId)}
      className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">
            {city.city}, {city.country}
          </h4>
          <p className="mt-2 text-xs leading-5 text-white/58">{city.note}</p>
        </div>
        <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
          {city.distanceKm} km
        </div>
      </div>
    </button>
  );
}
