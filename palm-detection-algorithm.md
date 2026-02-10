# Palm Detection Algorithm Specification
## PalmCosmic - Computer Vision Pipeline

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Fingertip Detection (MediaPipe)](#2-fingertip-detection-mediapipe)
3. [Palm Region Extraction](#3-palm-region-extraction)
4. [Palm Line Detection Pipeline](#4-palm-line-detection-pipeline)
5. [Line Classification Algorithm](#5-line-classification-algorithm)
6. [Data Structures](#6-data-structures)
7. [Integration Guide](#7-integration-guide)
8. [Quality & Validation](#8-quality--validation)

---

## 1. Architecture Overview

### The Problem
MediaPipe Hand Landmarker detects 21 skeletal joint positions (fingertips, knuckles, wrist). These are NOT palm lines. Palm lines (heart, head, life, fate) are skin creases that require image processing to detect.

### Two-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                        VIDEO/IMAGE INPUT                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1: MediaPipe Hand Detection                              │
│  ├── Detect hand presence                                       │
│  ├── Extract 21 landmarks (fingertips, joints, wrist)           │
│  └── Output: Hand landmarks + bounding box                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2: Palm Line Detection (Image Processing)                │
│  ├── Extract palm ROI using landmarks                           │
│  ├── Preprocess (grayscale, blur, enhance contrast)             │
│  ├── Edge detection (adaptive threshold + morphology)           │
│  ├── Line tracing (connected components)                        │
│  └── Line classification (heart, head, life, fate)              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  OUTPUT: PalmScanResult                                         │
│  ├── Fingertip positions (from MediaPipe)                       │
│  ├── Palm lines with classified types                           │
│  ├── Line characteristics (length, depth, breaks, curves)       │
│  └── Confidence scores                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Fingertip Detection (MediaPipe)

MediaPipe already handles this well. Here's the landmark mapping for reference:

### MediaPipe Hand Landmarks (21 Points)

```
        THUMB           INDEX         MIDDLE         RING          PINKY
          4               8             12            16             20
          │               │              │             │              │
          3               7             11            15             19
          │               │              │             │              │
          2               6             10            14             18
          │               │              │             │              │
          1               5              9            13             17
           \              │              │             │             /
            \             │              │             │            /
             ─────────────┴──────────────┴─────────────┴───────────
                                    │
                                    0 (WRIST)
```

### Landmark Index Reference

| Finger | Tip | DIP | PIP | MCP (Base) |
|--------|-----|-----|-----|------------|
| Thumb  | 4   | 3   | 2   | 1          |
| Index  | 8   | 7   | 6   | 5          |
| Middle | 12  | 11  | 10  | 9          |
| Ring   | 16  | 15  | 14  | 13         |
| Pinky  | 20  | 19  | 18  | 17         |
| Wrist  | 0   | -   | -   | -          |

### Fingertip Extraction Code

```typescript
interface Fingertip {
  finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
  position: { x: number; y: number; z: number };
  normalized: { x: number; y: number }; // 0-1 range
}

const FINGERTIP_INDICES = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
} as const;

function extractFingertips(landmarks: NormalizedLandmark[]): Fingertip[] {
  return Object.entries(FINGERTIP_INDICES).map(([finger, index]) => ({
    finger: finger as Fingertip['finger'],
    position: {
      x: landmarks[index].x,
      y: landmarks[index].y,
      z: landmarks[index].z,
    },
    normalized: {
      x: landmarks[index].x,
      y: landmarks[index].y,
    },
  }));
}
```

---

## 3. Palm Region Extraction

### Key Landmarks for Palm ROI

Use these MediaPipe landmarks to define the palm region:

```
Point 0  = Wrist (bottom center)
Point 5  = Index finger MCP (top left of palm)
Point 9  = Middle finger MCP (top center)
Point 13 = Ring finger MCP (top right area)
Point 17 = Pinky MCP (top right corner)
Point 1  = Thumb CMC (left side)
```

### Palm ROI Algorithm

```typescript
interface PalmROI {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
  width: number;
  height: number;
}

function extractPalmROI(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number
): PalmROI {
  // Key landmark positions (normalized 0-1)
  const wrist = landmarks[0];
  const indexBase = landmarks[5];
  const middleBase = landmarks[9];
  const pinkyBase = landmarks[17];
  const thumbBase = landmarks[1];

  // Calculate palm boundaries with padding
  const padding = 0.05; // 5% padding

  // Top boundary: line between finger bases
  const topY = Math.min(indexBase.y, middleBase.y, pinkyBase.y) - padding;
  
  // Bottom boundary: wrist with padding
  const bottomY = wrist.y + padding;
  
  // Left boundary: thumb base or index base (whichever is more left)
  const leftX = Math.min(thumbBase.x, indexBase.x) - padding;
  
  // Right boundary: pinky base
  const rightX = pinkyBase.x + padding;

  // Convert to pixel coordinates
  return {
    topLeft: { 
      x: Math.max(0, leftX * imageWidth), 
      y: Math.max(0, topY * imageHeight) 
    },
    topRight: { 
      x: Math.min(imageWidth, rightX * imageWidth), 
      y: Math.max(0, topY * imageHeight) 
    },
    bottomLeft: { 
      x: Math.max(0, leftX * imageWidth), 
      y: Math.min(imageHeight, bottomY * imageHeight) 
    },
    bottomRight: { 
      x: Math.min(imageWidth, rightX * imageWidth), 
      y: Math.min(imageHeight, bottomY * imageHeight) 
    },
    width: (rightX - leftX) * imageWidth,
    height: (bottomY - topY) * imageHeight,
  };
}
```

### Palm Extraction with Canvas

```typescript
function extractPalmImage(
  sourceCanvas: HTMLCanvasElement,
  roi: PalmROI,
  outputSize: number = 400 // Standard size for processing
): ImageData {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = outputSize;
  tempCanvas.height = outputSize;
  const ctx = tempCanvas.getContext('2d')!;

  // Extract and resize palm region
  ctx.drawImage(
    sourceCanvas,
    roi.topLeft.x,
    roi.topLeft.y,
    roi.width,
    roi.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return ctx.getImageData(0, 0, outputSize, outputSize);
}
```

---

## 4. Palm Line Detection Pipeline

### Step 1: Grayscale Conversion

```typescript
function toGrayscale(imageData: ImageData): Uint8Array {
  const gray = new Uint8Array(imageData.width * imageData.height);
  const data = imageData.data;

  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    // Luminosity method (better for skin tones)
    gray[i] = Math.round(
      0.299 * data[idx] +     // Red
      0.587 * data[idx + 1] + // Green
      0.114 * data[idx + 2]   // Blue
    );
  }

  return gray;
}
```

### Step 2: Gaussian Blur (Noise Reduction)

```typescript
function gaussianBlur(
  gray: Uint8Array,
  width: number,
  height: number,
  sigma: number = 1.4
): Uint8Array {
  // Generate Gaussian kernel
  const kernelSize = Math.ceil(sigma * 6) | 1; // Ensure odd
  const kernel = generateGaussianKernel(kernelSize, sigma);
  
  // Apply separable convolution (horizontal then vertical)
  const temp = convolve1D(gray, width, height, kernel, true);  // horizontal
  return convolve1D(temp, width, height, kernel, false);       // vertical
}

function generateGaussianKernel(size: number, sigma: number): Float32Array {
  const kernel = new Float32Array(size);
  const half = Math.floor(size / 2);
  let sum = 0;

  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }

  // Normalize
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }

  return kernel;
}

function convolve1D(
  data: Uint8Array,
  width: number,
  height: number,
  kernel: Float32Array,
  horizontal: boolean
): Uint8Array {
  const result = new Uint8Array(data.length);
  const half = Math.floor(kernel.length / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      
      for (let k = 0; k < kernel.length; k++) {
        const offset = k - half;
        let px: number, py: number;
        
        if (horizontal) {
          px = Math.min(Math.max(x + offset, 0), width - 1);
          py = y;
        } else {
          px = x;
          py = Math.min(Math.max(y + offset, 0), height - 1);
        }
        
        sum += data[py * width + px] * kernel[k];
      }
      
      result[y * width + x] = Math.round(sum);
    }
  }

  return result;
}
```

### Step 3: Contrast Enhancement (CLAHE-like)

Palm lines are subtle creases. Enhance local contrast to make them more visible:

```typescript
function enhanceContrast(
  gray: Uint8Array,
  width: number,
  height: number,
  tileSize: number = 32
): Uint8Array {
  const result = new Uint8Array(gray.length);
  
  // Process in tiles for local contrast enhancement
  for (let ty = 0; ty < height; ty += tileSize) {
    for (let tx = 0; tx < width; tx += tileSize) {
      const tileW = Math.min(tileSize, width - tx);
      const tileH = Math.min(tileSize, height - ty);
      
      // Find min/max in tile
      let min = 255, max = 0;
      for (let y = ty; y < ty + tileH; y++) {
        for (let x = tx; x < tx + tileW; x++) {
          const val = gray[y * width + x];
          min = Math.min(min, val);
          max = Math.max(max, val);
        }
      }
      
      // Stretch contrast
      const range = max - min || 1;
      for (let y = ty; y < ty + tileH; y++) {
        for (let x = tx; x < tx + tileW; x++) {
          const idx = y * width + x;
          result[idx] = Math.round(((gray[idx] - min) / range) * 255);
        }
      }
    }
  }
  
  return result;
}
```

### Step 4: Adaptive Thresholding

This is crucial for detecting palm lines as dark creases against skin:

```typescript
function adaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  blockSize: number = 15,  // Must be odd
  C: number = 8            // Constant subtracted from mean
): Uint8Array {
  const result = new Uint8Array(gray.length);
  const half = Math.floor(blockSize / 2);

  // Compute integral image for fast mean calculation
  const integral = computeIntegralImage(gray, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Calculate local mean using integral image
      const x1 = Math.max(0, x - half);
      const y1 = Math.max(0, y - half);
      const x2 = Math.min(width - 1, x + half);
      const y2 = Math.min(height - 1, y + half);

      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = getIntegralSum(integral, width, x1, y1, x2, y2);
      const mean = sum / area;

      // Threshold: pixel is foreground (line) if darker than local mean - C
      const idx = y * width + x;
      result[idx] = gray[idx] < (mean - C) ? 255 : 0;
    }
  }

  return result;
}

function computeIntegralImage(
  gray: Uint8Array,
  width: number,
  height: number
): Float64Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  const w = width + 1;

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      rowSum += gray[(y - 1) * width + (x - 1)];
      integral[y * w + x] = integral[(y - 1) * w + x] + rowSum;
    }
  }

  return integral;
}

function getIntegralSum(
  integral: Float64Array,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const w = width + 1;
  x1++; y1++; x2++; y2++;
  return (
    integral[y2 * w + x2] -
    integral[y1 * w + x2] -
    integral[y2 * w + x1] +
    integral[y1 * w + x1]
  );
}
```

### Step 5: Morphological Operations

Clean up the binary image to get cleaner lines:

```typescript
function morphologicalClose(
  binary: Uint8Array,
  width: number,
  height: number,
  kernelSize: number = 3
): Uint8Array {
  // Close = Dilate then Erode (connects nearby line segments)
  const dilated = dilate(binary, width, height, kernelSize);
  return erode(dilated, width, height, kernelSize);
}

function morphologicalOpen(
  binary: Uint8Array,
  width: number,
  height: number,
  kernelSize: number = 2
): Uint8Array {
  // Open = Erode then Dilate (removes small noise)
  const eroded = erode(binary, width, height, kernelSize);
  return dilate(eroded, width, height, kernelSize);
}

function dilate(
  binary: Uint8Array,
  width: number,
  height: number,
  kernelSize: number
): Uint8Array {
  const result = new Uint8Array(binary.length);
  const half = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxVal = 0;
      
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            maxVal = Math.max(maxVal, binary[ny * width + nx]);
          }
        }
      }
      
      result[y * width + x] = maxVal;
    }
  }

  return result;
}

function erode(
  binary: Uint8Array,
  width: number,
  height: number,
  kernelSize: number
): Uint8Array {
  const result = new Uint8Array(binary.length);
  const half = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minVal = 255;
      
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            minVal = Math.min(minVal, binary[ny * width + nx]);
          }
        }
      }
      
      result[y * width + x] = minVal;
    }
  }

  return result;
}
```

### Step 6: Skeletonization (Line Thinning)

Reduce thick lines to single-pixel width for easier tracing:

```typescript
function skeletonize(
  binary: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  // Zhang-Suen thinning algorithm
  const result = new Uint8Array(binary);
  let changed = true;

  while (changed) {
    changed = false;
    
    // Sub-iteration 1
    const toRemove1: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (result[y * width + x] === 0) continue;
        
        const neighbors = getNeighbors(result, width, x, y);
        const B = countNonZeroNeighbors(neighbors);
        const A = countTransitions(neighbors);
        
        if (B >= 2 && B <= 6 && A === 1) {
          const p2 = neighbors[0], p4 = neighbors[2], p6 = neighbors[4], p8 = neighbors[6];
          if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) {
            toRemove1.push(y * width + x);
          }
        }
      }
    }
    
    for (const idx of toRemove1) {
      result[idx] = 0;
      changed = true;
    }
    
    // Sub-iteration 2
    const toRemove2: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (result[y * width + x] === 0) continue;
        
        const neighbors = getNeighbors(result, width, x, y);
        const B = countNonZeroNeighbors(neighbors);
        const A = countTransitions(neighbors);
        
        if (B >= 2 && B <= 6 && A === 1) {
          const p2 = neighbors[0], p4 = neighbors[2], p6 = neighbors[4], p8 = neighbors[6];
          if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) {
            toRemove2.push(y * width + x);
          }
        }
      }
    }
    
    for (const idx of toRemove2) {
      result[idx] = 0;
      changed = true;
    }
  }

  return result;
}

// Neighbors in order: P2, P3, P4, P5, P6, P7, P8, P9 (clockwise from top)
function getNeighbors(
  data: Uint8Array,
  width: number,
  x: number,
  y: number
): number[] {
  return [
    data[(y - 1) * width + x] > 0 ? 1 : 0,     // P2 (top)
    data[(y - 1) * width + x + 1] > 0 ? 1 : 0, // P3 (top-right)
    data[y * width + x + 1] > 0 ? 1 : 0,       // P4 (right)
    data[(y + 1) * width + x + 1] > 0 ? 1 : 0, // P5 (bottom-right)
    data[(y + 1) * width + x] > 0 ? 1 : 0,     // P6 (bottom)
    data[(y + 1) * width + x - 1] > 0 ? 1 : 0, // P7 (bottom-left)
    data[y * width + x - 1] > 0 ? 1 : 0,       // P8 (left)
    data[(y - 1) * width + x - 1] > 0 ? 1 : 0, // P9 (top-left)
  ];
}

function countNonZeroNeighbors(neighbors: number[]): number {
  return neighbors.reduce((sum, n) => sum + n, 0);
}

function countTransitions(neighbors: number[]): number {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (neighbors[i] === 0 && neighbors[(i + 1) % 8] === 1) {
      count++;
    }
  }
  return count;
}
```

### Step 7: Line Tracing (Connected Component Analysis)

Extract individual lines as point sequences:

```typescript
interface TracedLine {
  points: { x: number; y: number }[];
  length: number;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}

function traceLines(
  skeleton: Uint8Array,
  width: number,
  height: number,
  minLength: number = 30 // Minimum pixels to be considered a line
): TracedLine[] {
  const visited = new Uint8Array(skeleton.length);
  const lines: TracedLine[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      if (skeleton[idx] === 0 || visited[idx]) continue;
      
      // Found an unvisited line pixel - trace it
      const points = traceSingleLine(skeleton, visited, width, height, x, y);
      
      if (points.length >= minLength) {
        const boundingBox = calculateBoundingBox(points);
        lines.push({
          points,
          length: calculateLineLength(points),
          boundingBox,
        });
      }
    }
  }

  return lines;
}

function traceSingleLine(
  skeleton: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const stack: { x: number; y: number }[] = [{ x: startX, y: startY }];
  
  // 8-connected neighbors
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const idx = y * width + x;
    
    if (visited[idx]) continue;
    visited[idx] = 1;
    points.push({ x, y });

    // Check all 8 neighbors
    for (let i = 0; i < 8; i++) {
      const nx = x + dx[i];
      const ny = y + dy[i];
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (skeleton[nidx] > 0 && !visited[nidx]) {
          stack.push({ x: nx, y: ny });
        }
      }
    }
  }

  // Sort points to form a continuous path
  return orderLinePoints(points);
}

function orderLinePoints(
  points: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (points.length <= 2) return points;

  // Find endpoint (point with only one neighbor in the set)
  const pointSet = new Set(points.map(p => `${p.x},${p.y}`));
  let startPoint = points[0];
  
  for (const point of points) {
    let neighborCount = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (pointSet.has(`${point.x + dx},${point.y + dy}`)) {
          neighborCount++;
        }
      }
    }
    if (neighborCount === 1) {
      startPoint = point;
      break;
    }
  }

  // Order points by walking from start
  const ordered: { x: number; y: number }[] = [startPoint];
  const usedSet = new Set([`${startPoint.x},${startPoint.y}`]);

  while (ordered.length < points.length) {
    const current = ordered[ordered.length - 1];
    let found = false;

    for (let dx = -1; dx <= 1 && !found; dx++) {
      for (let dy = -1; dy <= 1 && !found; dy++) {
        if (dx === 0 && dy === 0) continue;
        const key = `${current.x + dx},${current.y + dy}`;
        if (pointSet.has(key) && !usedSet.has(key)) {
          ordered.push({ x: current.x + dx, y: current.y + dy });
          usedSet.add(key);
          found = true;
        }
      }
    }

    if (!found) break; // Disconnected component
  }

  return ordered;
}

function calculateBoundingBox(
  points: { x: number; y: number }[]
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, minY, maxX, maxY };
}

function calculateLineLength(points: { x: number; y: number }[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}
```

---

## 5. Line Classification Algorithm

### Palm Line Positions Reference

```
┌─────────────────────────────────────────────────┐
│  INDEX    MIDDLE    RING    PINKY               │
│    │        │        │        │                 │
│    └────────┴────────┴────────┘                 │
│                                                 │
│  ════════════════════════════╗  ← HEART LINE    │
│                              ║    (uppermost,   │
│                              ║     curves down  │
│  ─────────────────────────   ║     toward pinky)│
│         HEAD LINE →          ║                  │
│    (middle horizontal)       ║                  │
│                              ║                  │
│    ╔══════════════════       ║  ← FATE LINE    │
│    ║                         ║    (vertical,    │
│    ║                         ║     center,      │
│    ║     ╔═══════════════════╝     optional)    │
│    ║     ║                                      │
│    ║     ║ ← LIFE LINE                          │
│    ║     ║   (curves around thumb base)         │
│    ║     ║                                      │
│  THUMB   ╚══════════════════════════════════    │
│    │                                            │
│    │              WRIST                         │
└────┴────────────────────────────────────────────┘
```

### Classification Algorithm

```typescript
type PalmLineType = 'heart' | 'head' | 'life' | 'fate' | 'unknown';

interface ClassifiedLine {
  type: PalmLineType;
  points: { x: number; y: number }[];
  confidence: number;
  characteristics: {
    length: number;
    averageDepth: number;
    curvature: number;
    breaks: number;
    branches: number;
  };
}

interface PalmZones {
  upperThird: { minY: number; maxY: number };   // Heart line zone
  middleThird: { minY: number; maxY: number };  // Head line zone
  lowerHalf: { minY: number; maxY: number };    // Life line zone
  centerVertical: { minX: number; maxX: number }; // Fate line zone
  thumbSide: { minX: number; maxX: number };    // Life line starts here
}

function definePalmZones(
  palmWidth: number,
  palmHeight: number
): PalmZones {
  return {
    upperThird: { 
      minY: 0, 
      maxY: palmHeight * 0.35 
    },
    middleThird: { 
      minY: palmHeight * 0.25, 
      maxY: palmHeight * 0.55 
    },
    lowerHalf: { 
      minY: palmHeight * 0.3, 
      maxY: palmHeight 
    },
    centerVertical: { 
      minX: palmWidth * 0.35, 
      maxX: palmWidth * 0.65 
    },
    thumbSide: { 
      minX: 0, 
      maxX: palmWidth * 0.4 
    },
  };
}

function classifyLines(
  tracedLines: TracedLine[],
  palmWidth: number,
  palmHeight: number
): ClassifiedLine[] {
  const zones = definePalmZones(palmWidth, palmHeight);
  const classified: ClassifiedLine[] = [];
  
  // Score each line for each possible type
  for (const line of tracedLines) {
    const scores = {
      heart: scoreAsHeartLine(line, zones, palmWidth, palmHeight),
      head: scoreAsHeadLine(line, zones, palmWidth, palmHeight),
      life: scoreAsLifeLine(line, zones, palmWidth, palmHeight),
      fate: scoreAsFateLine(line, zones, palmWidth, palmHeight),
    };

    // Find best match
    let bestType: PalmLineType = 'unknown';
    let bestScore = 0.3; // Minimum confidence threshold

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as PalmLineType;
      }
    }

    classified.push({
      type: bestType,
      points: line.points,
      confidence: bestScore,
      characteristics: analyzeLineCharacteristics(line, palmWidth, palmHeight),
    });
  }

  // Resolve conflicts (only one line per type, pick highest confidence)
  return resolveConflicts(classified);
}

function scoreAsHeartLine(
  line: TracedLine,
  zones: PalmZones,
  palmWidth: number,
  palmHeight: number
): number {
  let score = 0;
  const bb = line.boundingBox;
  const centerY = (bb.minY + bb.maxY) / 2;

  // Position: Should be in upper third
  if (centerY >= zones.upperThird.minY && centerY <= zones.upperThird.maxY) {
    score += 0.3;
  }

  // Orientation: Should be mostly horizontal
  const horizontalSpan = bb.maxX - bb.minX;
  const verticalSpan = bb.maxY - bb.minY;
  const aspectRatio = horizontalSpan / (verticalSpan + 1);
  
  if (aspectRatio > 2.5) {
    score += 0.3;
  } else if (aspectRatio > 1.5) {
    score += 0.15;
  }

  // Length: Should span significant portion of palm
  const lengthRatio = horizontalSpan / palmWidth;
  if (lengthRatio > 0.5) {
    score += 0.2;
  } else if (lengthRatio > 0.3) {
    score += 0.1;
  }

  // Curvature: Heart line typically curves downward toward pinky
  const curvature = calculateCurvature(line.points);
  if (curvature > 0) { // Positive = curving down on right side
    score += 0.2;
  }

  return Math.min(score, 1);
}

function scoreAsHeadLine(
  line: TracedLine,
  zones: PalmZones,
  palmWidth: number,
  palmHeight: number
): number {
  let score = 0;
  const bb = line.boundingBox;
  const centerY = (bb.minY + bb.maxY) / 2;

  // Position: Should be in middle third
  if (centerY >= zones.middleThird.minY && centerY <= zones.middleThird.maxY) {
    score += 0.3;
  }

  // Orientation: Should be mostly horizontal
  const horizontalSpan = bb.maxX - bb.minX;
  const verticalSpan = bb.maxY - bb.minY;
  const aspectRatio = horizontalSpan / (verticalSpan + 1);
  
  if (aspectRatio > 2) {
    score += 0.3;
  } else if (aspectRatio > 1.2) {
    score += 0.15;
  }

  // Length: Moderate length
  const lengthRatio = horizontalSpan / palmWidth;
  if (lengthRatio > 0.4 && lengthRatio < 0.9) {
    score += 0.2;
  }

  // Head line is usually straighter than heart line
  const curvature = Math.abs(calculateCurvature(line.points));
  if (curvature < 0.3) {
    score += 0.2;
  }

  return Math.min(score, 1);
}

function scoreAsLifeLine(
  line: TracedLine,
  zones: PalmZones,
  palmWidth: number,
  palmHeight: number
): number {
  let score = 0;
  const bb = line.boundingBox;

  // Position: Should start from thumb side, upper area
  const startsFromThumbSide = bb.minX < zones.thumbSide.maxX;
  const startsFromUpper = bb.minY < palmHeight * 0.5;
  
  if (startsFromThumbSide && startsFromUpper) {
    score += 0.25;
  }

  // Should curve around thumb base (arc shape)
  const verticalSpan = bb.maxY - bb.minY;
  const horizontalSpan = bb.maxX - bb.minX;
  
  // Life line is more vertical than horizontal, but curves
  if (verticalSpan > horizontalSpan * 0.8) {
    score += 0.2;
  }

  // Length: Life line is typically the longest
  if (line.length > palmHeight * 0.5) {
    score += 0.25;
  }

  // Curvature: Should curve around thumb (specific arc pattern)
  const curvatureScore = scoreLifeLineCurvature(line.points, palmWidth, palmHeight);
  score += curvatureScore * 0.3;

  return Math.min(score, 1);
}

function scoreAsFateLine(
  line: TracedLine,
  zones: PalmZones,
  palmWidth: number,
  palmHeight: number
): number {
  let score = 0;
  const bb = line.boundingBox;
  const centerX = (bb.minX + bb.maxX) / 2;

  // Position: Should be in center vertical zone
  if (centerX >= zones.centerVertical.minX && centerX <= zones.centerVertical.maxX) {
    score += 0.3;
  }

  // Orientation: Should be mostly vertical
  const horizontalSpan = bb.maxX - bb.minX;
  const verticalSpan = bb.maxY - bb.minY;
  const aspectRatio = verticalSpan / (horizontalSpan + 1);
  
  if (aspectRatio > 2) {
    score += 0.3;
  } else if (aspectRatio > 1.2) {
    score += 0.15;
  }

  // Should span from middle to bottom of palm
  const spansMiddleToBottom = bb.minY < palmHeight * 0.6 && bb.maxY > palmHeight * 0.7;
  if (spansMiddleToBottom) {
    score += 0.2;
  }

  // Fate line is usually relatively straight
  const curvature = Math.abs(calculateCurvature(line.points));
  if (curvature < 0.2) {
    score += 0.2;
  }

  return Math.min(score, 1);
}

function calculateCurvature(points: { x: number; y: number }[]): number {
  if (points.length < 10) return 0;

  // Calculate average curvature using three-point method
  let totalCurvature = 0;
  const step = Math.max(1, Math.floor(points.length / 10));

  for (let i = step; i < points.length - step; i += step) {
    const p1 = points[i - step];
    const p2 = points[i];
    const p3 = points[i + step];

    // Vectors
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    // Cross product gives signed curvature direction
    const cross = v1.x * v2.y - v1.y * v2.x;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (mag1 > 0 && mag2 > 0) {
      totalCurvature += cross / (mag1 * mag2);
    }
  }

  return totalCurvature / (points.length / step);
}

function scoreLifeLineCurvature(
  points: { x: number; y: number }[],
  palmWidth: number,
  palmHeight: number
): number {
  // Life line should form an arc that:
  // 1. Starts near index finger base (upper left)
  // 2. Curves around thumb mount
  // 3. Ends toward wrist (lower left or center)

  if (points.length < 5) return 0;

  const start = points[0];
  const end = points[points.length - 1];
  const mid = points[Math.floor(points.length / 2)];

  // Check if forms expected arc pattern
  const startsUpperLeft = start.y < palmHeight * 0.4 && start.x < palmWidth * 0.5;
  const endsLower = end.y > palmHeight * 0.6;
  const midBulgesRight = mid.x > start.x && mid.x > end.x;

  let score = 0;
  if (startsUpperLeft) score += 0.4;
  if (endsLower) score += 0.3;
  if (midBulgesRight) score += 0.3;

  return score;
}

function resolveConflicts(classified: ClassifiedLine[]): ClassifiedLine[] {
  const byType: Map<PalmLineType, ClassifiedLine[]> = new Map();

  for (const line of classified) {
    if (line.type === 'unknown') continue;
    
    if (!byType.has(line.type)) {
      byType.set(line.type, []);
    }
    byType.get(line.type)!.push(line);
  }

  const resolved: ClassifiedLine[] = [];

  // For each type, keep only the highest confidence line
  for (const [type, lines] of byType) {
    lines.sort((a, b) => b.confidence - a.confidence);
    resolved.push(lines[0]);
    
    // Mark others as unknown
    for (let i = 1; i < lines.length; i++) {
      resolved.push({ ...lines[i], type: 'unknown', confidence: 0 });
    }
  }

  // Add back unknown lines
  for (const line of classified) {
    if (line.type === 'unknown') {
      resolved.push(line);
    }
  }

  return resolved;
}

function analyzeLineCharacteristics(
  line: TracedLine,
  palmWidth: number,
  palmHeight: number
): ClassifiedLine['characteristics'] {
  return {
    length: line.length / Math.max(palmWidth, palmHeight), // Normalized
    averageDepth: estimateLineDepth(line), // 0-1, deeper = darker in original
    curvature: Math.abs(calculateCurvature(line.points)),
    breaks: countLineBreaks(line.points),
    branches: countBranches(line.points),
  };
}

function estimateLineDepth(line: TracedLine): number {
  // This would need access to original grayscale values
  // Placeholder: return moderate depth
  return 0.5;
}

function countLineBreaks(points: { x: number; y: number }[]): number {
  // Count gaps in the line (would need original traced data)
  return 0;
}

function countBranches(points: { x: number; y: number }[]): number {
  // Count points with more than 2 neighbors (branch points)
  return 0;
}
```

---

## 6. Data Structures

### Complete Type Definitions

```typescript
// ============================================
// INPUT TYPES
// ============================================

interface PalmDetectionInput {
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
  options?: {
    minDetectionConfidence?: number;  // 0-1, default 0.7
    minTrackingConfidence?: number;   // 0-1, default 0.5
    maxNumHands?: number;             // default 1
  };
}

// ============================================
// MEDIAPIPE TYPES
// ============================================

interface HandLandmark {
  x: number;  // 0-1, normalized
  y: number;  // 0-1, normalized
  z: number;  // depth, relative to wrist
}

interface HandDetectionResult {
  landmarks: HandLandmark[];
  worldLandmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  confidence: number;
}

// ============================================
// FINGERTIP TYPES
// ============================================

interface Fingertip {
  finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
  position: {
    x: number;
    y: number;
    z: number;
  };
  normalized: {
    x: number;  // 0-1
    y: number;  // 0-1
  };
  pixel: {
    x: number;  // actual pixel position
    y: number;
  };
}

interface FingertipAnalysis {
  fingertips: Fingertip[];
  fingerLengths: {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  };
  fingerSpacing: {
    thumbToIndex: number;
    indexToMiddle: number;
    middleToRing: number;
    ringToPinky: number;
  };
}

// ============================================
// PALM LINE TYPES
// ============================================

type PalmLineType = 'heart' | 'head' | 'life' | 'fate' | 'unknown';

interface PalmLinePoint {
  x: number;
  y: number;
}

interface PalmLine {
  type: PalmLineType;
  points: PalmLinePoint[];
  confidence: number;
  characteristics: PalmLineCharacteristics;
}

interface PalmLineCharacteristics {
  // Basic metrics
  length: number;           // Normalized 0-1 relative to palm size
  depth: number;            // 0-1, how prominent/dark the line is
  
  // Shape metrics
  curvature: number;        // 0-1, how curved (0 = straight)
  curvatureDirection: 'up' | 'down' | 'straight';
  
  // Quality metrics
  clarity: number;          // 0-1, how clear/continuous
  breaks: number;           // Count of gaps/interruptions
  breakPositions: number[]; // Normalized positions of breaks (0-1 along line)
  
  // Branch analysis
  branches: number;         // Count of forks/branches
  branchPositions: number[];
  branchDirections: ('up' | 'down')[];
  
  // Endpoints
  startPosition: PalmLinePoint;  // Normalized
  endPosition: PalmLinePoint;
  
  // Special features
  islands: number;          // Small enclosed areas
  crosses: number;          // Intersections with other lines
  stars: number;            // Star-like formations
  chains: number;           // Chain-like patterns
}

// ============================================
// PALM MOUNT TYPES (for advanced readings)
// ============================================

interface PalmMount {
  name: 'jupiter' | 'saturn' | 'apollo' | 'mercury' | 'venus' | 'luna' | 'mars_positive' | 'mars_negative';
  position: PalmLinePoint;
  prominence: number;  // 0-1, how raised/developed
  size: number;        // relative size
}

// ============================================
// COMPLETE SCAN RESULT
// ============================================

interface PalmScanResult {
  // Metadata
  scanId: string;
  timestamp: Date;
  imageQuality: number;  // 0-1
  handedness: 'left' | 'right';
  
  // Hand detection
  handDetected: boolean;
  handConfidence: number;
  
  // Fingertips (from MediaPipe)
  fingertips: FingertipAnalysis;
  
  // Palm lines (from image processing)
  palmLines: {
    detected: PalmLine[];
    heartLine: PalmLine | null;
    headLine: PalmLine | null;
    lifeLine: PalmLine | null;
    fateLine: PalmLine | null;
    minorLines: PalmLine[];  // Other detected lines
  };
  
  // Palm shape analysis
  palmShape: {
    type: 'earth' | 'air' | 'water' | 'fire';
    aspectRatio: number;  // width/height
    fingerTopalm ratio: number;
  };
  
  // Mounts (optional, for advanced readings)
  mounts?: PalmMount[];
  
  // Raw data for debugging
  debug?: {
    processedImageData: ImageData;
    binaryImage: Uint8Array;
    skeletonImage: Uint8Array;
    allTracedLines: TracedLine[];
  };
}

// ============================================
// READING DATA (for AI interpretation)
// ============================================

interface PalmReadingData {
  // Heart line interpretation hints
  heartLine: {
    present: boolean;
    length: 'short' | 'medium' | 'long';
    depth: 'faint' | 'moderate' | 'deep';
    curve: 'straight' | 'slightly_curved' | 'deeply_curved';
    startsFrom: 'jupiter_mount' | 'saturn_mount' | 'between';
    endsAt: 'index_finger' | 'middle_finger' | 'between' | 'ring_finger';
    breaks: number;
    branches: 'none' | 'few' | 'many';
    branchDirection: 'upward' | 'downward' | 'both' | 'none';
    quality: 'chained' | 'clear' | 'wavy' | 'broken';
  } | null;
  
  // Head line interpretation hints
  headLine: {
    present: boolean;
    length: 'short' | 'medium' | 'long';
    depth: 'faint' | 'moderate' | 'deep';
    curve: 'straight' | 'slightly_curved' | 'deeply_curved';
    slope: 'horizontal' | 'slight_downward' | 'steep_downward';
    connectionToLifeLine: 'joined' | 'separate' | 'overlapping';
    breaks: number;
    forks: boolean;
    quality: 'clear' | 'wavy' | 'chained' | 'broken';
  } | null;
  
  // Life line interpretation hints  
  lifeLine: {
    present: boolean;
    length: 'short' | 'medium' | 'long' | 'very_long';
    depth: 'faint' | 'moderate' | 'deep';
    curve: 'tight' | 'moderate' | 'wide';  // How much it arcs around thumb
    startsFrom: 'index_base' | 'thumb_side' | 'joined_with_head';
    endsAt: 'wrist' | 'mid_palm' | 'moon_mount';
    breaks: number;
    breakPositions: ('early' | 'middle' | 'late')[];
    innerLines: boolean;  // Sister lines
    quality: 'clear' | 'chained' | 'broken' | 'feathered';
  } | null;
  
  // Fate line interpretation hints
  fateLine: {
    present: boolean;
    length: 'short' | 'medium' | 'long';
    depth: 'faint' | 'moderate' | 'deep';
    startsFrom: 'wrist' | 'life_line' | 'moon_mount' | 'mid_palm';
    endsAt: 'saturn_mount' | 'jupiter_mount' | 'apollo_mount' | 'mid_palm';
    breaks: number;
    branches: boolean;
    quality: 'clear' | 'wavy' | 'broken' | 'multiple';
  } | null;
  
  // Overall hand characteristics
  handCharacteristics: {
    dominantHand: boolean;
    handShape: 'earth' | 'air' | 'water' | 'fire';
    fingerLength: 'short' | 'medium' | 'long';
    palmTexture: 'soft' | 'medium' | 'firm';  // Would need touch, estimate from image
  };
  
  // Scan quality metadata
  scanQuality: {
    overall: number;  // 0-1
    lightingQuality: number;
    focusQuality: number;
    palmOpenness: number;  // How flat/open the palm is
    recommendations: string[];  // Tips to improve scan
  };
}
```

---

## 7. Integration Guide

### File Structure

```
src/
├── lib/
│   ├── palm-detection/
│   │   ├── index.ts              # Main exports
│   │   ├── mediapipe-detector.ts # MediaPipe hand detection
│   │   ├── palm-roi.ts           # ROI extraction
│   │   ├── image-processing.ts   # Grayscale, blur, threshold
│   │   ├── line-detection.ts     # Edge detection, tracing
│   │   ├── line-classification.ts# Line type classification
│   │   ├── line-analysis.ts      # Characteristic extraction
│   │   ├── reading-data.ts       # Convert to AI-readable format
│   │   └── types.ts              # All TypeScript interfaces
│   └── palm-detection.ts         # Legacy file (refactor to use above)
```

### Main Detection Pipeline

```typescript
// src/lib/palm-detection/index.ts

import { detectHand } from './mediapipe-detector';
import { extractPalmROI, extractPalmImage } from './palm-roi';
import { processImage } from './image-processing';
import { detectLines } from './line-detection';
import { classifyLines } from './line-classification';
import { analyzeLines } from './line-analysis';
import { generateReadingData } from './reading-data';
import type { PalmDetectionInput, PalmScanResult, PalmReadingData } from './types';

export async function detectPalm(input: PalmDetectionInput): Promise<PalmScanResult> {
  // Step 1: MediaPipe hand detection
  const handResult = await detectHand(input.source, input.options);
  
  if (!handResult.handDetected) {
    return createEmptyResult('No hand detected');
  }

  // Step 2: Extract fingertip data (already works)
  const fingertips = extractFingertips(handResult.landmarks);

  // Step 3: Extract palm region
  const canvas = getCanvasFromSource(input.source);
  const roi = extractPalmROI(handResult.landmarks, canvas.width, canvas.height);
  const palmImage = extractPalmImage(canvas, roi);

  // Step 4: Image processing pipeline
  const processed = processImage(palmImage);
  // Returns: { grayscale, blurred, enhanced, binary, skeleton }

  // Step 5: Line detection
  const tracedLines = detectLines(processed.skeleton, roi.width, roi.height);

  // Step 6: Line classification
  const classifiedLines = classifyLines(tracedLines, roi.width, roi.height);

  // Step 7: Detailed analysis
  const analyzedLines = analyzeLines(classifiedLines, palmImage);

  // Step 8: Build result
  return buildScanResult({
    handResult,
    fingertips,
    analyzedLines,
    roi,
    processed,
  });
}

export function generateReadingDataFromScan(scan: PalmScanResult): PalmReadingData {
  return generateReadingData(scan);
}
```

### Usage in Components

```typescript
// In your scanning component

import { detectPalm, generateReadingDataFromScan } from '@/lib/palm-detection';

async function handleCapture(videoElement: HTMLVideoElement) {
  const scanResult = await detectPalm({ source: videoElement });
  
  if (!scanResult.handDetected) {
    showError('Please position your palm clearly in frame');
    return;
  }

  // Store raw scan data
  await saveScanToSupabase(scanResult);

  // Generate AI-friendly reading data
  const readingData = generateReadingDataFromScan(scanResult);
  
  // Pass to Elysia for interpretation
  const reading = await generateReading(readingData);
}
```

---

## 8. Quality & Validation

### Scan Quality Checks

```typescript
interface QualityCheckResult {
  passed: boolean;
  score: number;
  issues: string[];
  recommendations: string[];
}

function checkScanQuality(
  handResult: HandDetectionResult,
  palmImage: ImageData,
  detectedLines: ClassifiedLine[]
): QualityCheckResult {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 1.0;

  // Check 1: Hand detection confidence
  if (handResult.confidence < 0.8) {
    score -= 0.2;
    issues.push('Low hand detection confidence');
    recommendations.push('Ensure your entire palm is visible in the frame');
  }

  // Check 2: Palm openness (fingers should be spread)
  const fingerSpread = calculateFingerSpread(handResult.landmarks);
  if (fingerSpread < 0.3) {
    score -= 0.15;
    issues.push('Fingers not spread enough');
    recommendations.push('Spread your fingers apart for a clearer scan');
  }

  // Check 3: Image brightness
  const brightness = calculateAverageBrightness(palmImage);
  if (brightness < 80) {
    score -= 0.2;
    issues.push('Image too dark');
    recommendations.push('Move to a better lit area');
  } else if (brightness > 200) {
    score -= 0.15;
    issues.push('Image too bright/washed out');
    recommendations.push('Reduce direct lighting on your palm');
  }

  // Check 4: Detected major lines
  const majorLinesFound = detectedLines.filter(
    l => ['heart', 'head', 'life'].includes(l.type) && l.confidence > 0.5
  ).length;
  
  if (majorLinesFound < 2) {
    score -= 0.25;
    issues.push('Could not detect major palm lines clearly');
    recommendations.push('Hold your palm flat and steady');
  }

  // Check 5: Image blur (using Laplacian variance)
  const sharpness = calculateSharpness(palmImage);
  if (sharpness < 100) {
    score -= 0.2;
    issues.push('Image is blurry');
    recommendations.push('Hold your hand steady while capturing');
  }

  return {
    passed: score >= 0.6,
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}

function calculateFingerSpread(landmarks: HandLandmark[]): number {
  // Calculate average angle between adjacent fingers
  const fingerTips = [4, 8, 12, 16, 20];
  const fingerBases = [2, 5, 9, 13, 17];
  
  let totalSpread = 0;
  for (let i = 0; i < 4; i++) {
    const v1 = {
      x: landmarks[fingerTips[i]].x - landmarks[fingerBases[i]].x,
      y: landmarks[fingerTips[i]].y - landmarks[fingerBases[i]].y,
    };
    const v2 = {
      x: landmarks[fingerTips[i + 1]].x - landmarks[fingerBases[i + 1]].x,
      y: landmarks[fingerTips[i + 1]].y - landmarks[fingerBases[i + 1]].y,
    };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    const angle = Math.acos(dot / (mag1 * mag2));
    totalSpread += angle;
  }
  
  return totalSpread / 4 / Math.PI; // Normalize to 0-1
}

function calculateAverageBrightness(imageData: ImageData): number {
  const data = imageData.data;
  let sum = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  
  return sum / (data.length / 4);
}

function calculateSharpness(imageData: ImageData): number {
  // Laplacian variance - higher = sharper
  const gray = toGrayscale(imageData);
  const width = imageData.width;
  const height = imageData.height;
  
  // Laplacian kernel
  const laplacian = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let val = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          val += gray[(y + ky) * width + (x + kx)] * laplacian[(ky + 1) * 3 + (kx + 1)];
        }
      }
      sum += val;
      sumSq += val * val;
      count++;
    }
  }
  
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  
  return variance;
}
```

### Recommended Thresholds

| Metric | Poor | Acceptable | Good | Excellent |
|--------|------|------------|------|-----------|
| Hand Confidence | <0.6 | 0.6-0.75 | 0.75-0.9 | >0.9 |
| Image Brightness | <60 or >220 | 60-80 or 180-220 | 80-180 | 100-160 |
| Sharpness (Laplacian) | <50 | 50-100 | 100-200 | >200 |
| Lines Detected | 0-1 | 2 | 3 | 4 |
| Finger Spread | <0.2 | 0.2-0.3 | 0.3-0.5 | >0.5 |

---

## Summary

This algorithm provides:

1. **Accurate fingertip detection** using MediaPipe landmarks (already working)
2. **Palm region extraction** using landmark-based ROI
3. **Palm line detection** using proper image processing (grayscale → blur → adaptive threshold → skeletonize → trace)
4. **Line classification** based on position, orientation, and curvature
5. **Detailed characteristic extraction** for AI interpretation
6. **Quality validation** to ensure good scans

The key insight is that **MediaPipe landmarks ≠ palm lines**. Palm lines require a separate image processing pipeline that analyzes skin creases, not skeletal joint positions.
