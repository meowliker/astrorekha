import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let handLandmarker: HandLandmarker | null = null;

// Initialize MediaPipe Hand Landmarker
export async function initializeHandDetection() {
  if (handLandmarker) {
    console.log("[palm-detection] HandLandmarker already initialized");
    return handLandmarker;
  }

  try {
    console.log("[palm-detection] Initializing MediaPipe...");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    console.log("[palm-detection] FilesetResolver loaded");

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "IMAGE",
      numHands: 1,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    });
    console.log("[palm-detection] HandLandmarker created successfully");

    return handLandmarker;
  } catch (error) {
    console.error("[palm-detection] Failed to initialize hand detection:", error);
    throw error;
  }
}

// Detect hand landmarks from image
export async function detectHandLandmarks(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
  const detector = await initializeHandDetection();
  
  if (!detector) {
    throw new Error("Hand detector not initialized");
  }

  const results = detector.detect(imageElement);
  return results;
}

// Extract fingertip positions (landmarks 4, 8, 12, 16, 20)
export function extractFingertips(landmarks: any[]) {
  const fingertipIndices = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
  
  return fingertipIndices.map((index) => ({
    x: landmarks[index].x * 100, // Convert to percentage
    y: landmarks[index].y * 100,
    name: ["Thumb", "Index", "Middle", "Ring", "Pinky"][fingertipIndices.indexOf(index)],
  }));
}

function getElementSize(el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): { width: number; height: number } {
  if (el instanceof HTMLVideoElement) {
    return { width: el.videoWidth, height: el.videoHeight };
  }
  if (el instanceof HTMLImageElement) {
    return { width: el.naturalWidth || el.width, height: el.naturalHeight || el.height };
  }
  return { width: el.width, height: el.height };
}

function elementToCanvas(el: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): HTMLCanvasElement {
  if (el instanceof HTMLCanvasElement) return el;

  const { width, height } = getElementSize(el);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");
  ctx.drawImage(el, 0, 0, width, height);
  return canvas;
}

function extractPalmROI(landmarks: any[], imageWidth: number, imageHeight: number) {
  const wrist = landmarks[0];
  const indexBase = landmarks[5];
  const middleBase = landmarks[9];
  const pinkyBase = landmarks[17];
  const thumbBase = landmarks[1];

  const padding = 0.05;
  const topY = Math.min(indexBase.y, middleBase.y, pinkyBase.y) - padding;
  const bottomY = wrist.y + padding;
  const leftX = Math.min(thumbBase.x, indexBase.x) - padding;
  const rightX = pinkyBase.x + padding;

  const topLeft = {
    x: Math.max(0, leftX * imageWidth),
    y: Math.max(0, topY * imageHeight),
  };
  const bottomRight = {
    x: Math.min(imageWidth, rightX * imageWidth),
    y: Math.min(imageHeight, bottomY * imageHeight),
  };

  const width = Math.max(1, bottomRight.x - topLeft.x);
  const height = Math.max(1, bottomRight.y - topLeft.y);

  return { topLeft, width, height };
}

function extractPalmImage(sourceCanvas: HTMLCanvasElement, roi: { topLeft: { x: number; y: number }; width: number; height: number }, outputSize: number = 400) {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = outputSize;
  tempCanvas.height = outputSize;
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas context");
  ctx.drawImage(sourceCanvas, roi.topLeft.x, roi.topLeft.y, roi.width, roi.height, 0, 0, outputSize, outputSize);
  return ctx.getImageData(0, 0, outputSize, outputSize);
}

// Calculate palm lines from landmarks (returns normalized 0-1 coordinates)
// Based on actual palmistry:
// - Heart Line: Starts below pinky, curves across top of palm toward index finger
// - Head Line: Starts near thumb/index junction, goes across center of palm
// - Life Line: Starts between thumb and index, curves around thumb base toward wrist
// - Fate Line: Vertical line from wrist up toward middle finger
export function calculatePalmLines(landmarks: any[]) {
  // Key landmark indices:
  // 0 = wrist, 1-4 = thumb, 5-8 = index, 9-12 = middle, 13-16 = ring, 17-20 = pinky
  // Base of fingers: 5 (index), 9 (middle), 13 (ring), 17 (pinky)
  // Thumb base: 1, 2

  const wrist = landmarks[0];
  const thumbBase = landmarks[2];
  const thumbTip = landmarks[4];
  const indexBase = landmarks[5];
  const indexMcp = landmarks[5];
  const middleBase = landmarks[9];
  const ringBase = landmarks[13];
  const pinkyBase = landmarks[17];

  // Heart Line: Starts below pinky base, curves upward across palm toward index finger
  // This is the TOP horizontal line on the palm
  const heartLine = {
    color: "#EF4444",
    name: "Heart Line",
    points: [
      { x: pinkyBase.x, y: pinkyBase.y + 0.06 },
      { x: pinkyBase.x - 0.03, y: pinkyBase.y + 0.07 },
      { x: (pinkyBase.x + ringBase.x) / 2, y: ringBase.y + 0.065 },
      { x: ringBase.x, y: ringBase.y + 0.06 },
      { x: (ringBase.x + middleBase.x) / 2, y: middleBase.y + 0.055 },
      { x: middleBase.x, y: middleBase.y + 0.05 },
      { x: (middleBase.x + indexBase.x) / 2, y: indexBase.y + 0.04 },
      { x: indexBase.x + 0.02, y: indexBase.y + 0.03 },
    ],
  };

  // Head Line: Starts near life line origin (between thumb and index), goes across center of palm
  // This is BELOW the heart line, roughly horizontal or slightly curved down
  const headLine = {
    color: "#EAB308",
    name: "Head Line",
    points: [
      { x: indexBase.x - 0.05, y: indexBase.y + 0.12 },
      { x: indexBase.x, y: indexBase.y + 0.13 },
      { x: (indexBase.x + middleBase.x) / 2, y: middleBase.y + 0.14 },
      { x: middleBase.x, y: middleBase.y + 0.15 },
      { x: (middleBase.x + ringBase.x) / 2, y: ringBase.y + 0.16 },
      { x: ringBase.x, y: ringBase.y + 0.17 },
      { x: (ringBase.x + pinkyBase.x) / 2 - 0.02, y: pinkyBase.y + 0.15 },
    ],
  };

  // Life Line: Starts between thumb and index finger, curves around thumb base toward wrist
  // This forms an ARC around the thumb mount
  const lifeLine = {
    color: "#06B6D4",
    name: "Life Line",
    points: [
      { x: indexBase.x - 0.05, y: indexBase.y + 0.1 },
      { x: indexBase.x - 0.08, y: indexBase.y + 0.15 },
      { x: thumbBase.x + 0.12, y: thumbBase.y + 0.08 },
      { x: thumbBase.x + 0.1, y: thumbBase.y + 0.18 },
      { x: thumbBase.x + 0.08, y: (thumbBase.y + wrist.y) / 2 },
      { x: wrist.x + 0.05, y: wrist.y - 0.08 },
      { x: wrist.x + 0.03, y: wrist.y - 0.02 },
    ],
  };

  // Fate Line: Vertical line from wrist up toward middle finger
  // Runs through the CENTER of the palm
  const fateLine = {
    color: "#EC4899",
    name: "Fate Line",
    points: [
      { x: wrist.x, y: wrist.y - 0.05 },
      { x: (wrist.x + middleBase.x) / 2, y: (wrist.y + middleBase.y) / 2 + 0.1 },
      { x: middleBase.x, y: middleBase.y + 0.18 },
      { x: middleBase.x, y: middleBase.y + 0.12 },
      { x: middleBase.x, y: middleBase.y + 0.06 },
    ],
  };

  return [heartLine, headLine, lifeLine, fateLine];
}

// Analyze palm reading from landmarks
export function analyzePalmReading(landmarks: any[]) {
  const lines = calculatePalmLines(landmarks);
  
  // Calculate line lengths and characteristics
  const heartLineLength = calculateLineLength(lines[0].points);
  const headLineLength = calculateLineLength(lines[1].points);
  const lifeLineLength = calculateLineLength(lines[2].points);
  const fateLineLength = calculateLineLength(lines[3].points);

  return {
    lines,
    analysis: {
      heartLine: heartLineLength > 30 ? "Strong emotional expression" : "Reserved emotions",
      headLine: headLineLength > 35 ? "Analytical and practical" : "Creative and intuitive",
      lifeLine: lifeLineLength > 40 ? "Vibrant energy and vitality" : "Steady and balanced energy",
      fateLine: fateLineLength > 25 ? "Clear life direction" : "Flexible life path",
    },
  };
}

// Helper: Calculate line length
function calculateLineLength(points: { x: number; y: number }[]) {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

// Main function to detect palm features from an image
export async function detectPalmFeatures(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) {
  console.log("[palm-detection] detectPalmFeatures called");
  
  try {
    const results = await detectHandLandmarks(imageElement);
    console.log("[palm-detection] Detection results:", results);
    
    if (!results || !results.landmarks || results.landmarks.length === 0) {
      console.log("[palm-detection] No landmarks detected");
      return {
        palmLines: [],
        fingertips: [],
      };
    }

    const landmarks = results.landmarks[0];
    console.log("[palm-detection] Found", landmarks.length, "landmarks");

    // Extract fingertips
    const fingertipIndices = [4, 8, 12, 16, 20];
    const fingertips = fingertipIndices.map((index) => ({
      x: landmarks[index].x,
      y: landmarks[index].y,
    }));
    console.log("[palm-detection] Extracted fingertips:", fingertips);

    return {
      palmLines: [],
      fingertips,
    };
  } catch (error) {
    console.error("[palm-detection] Error in detectPalmFeatures:", error);
    return {
      palmLines: [],
      fingertips: [],
    };
  }
}
