export type PalmLineType = "heart" | "head" | "life" | "fate" | "unknown";

export type Point = { x: number; y: number };

export type PalmLineOutput = {
  type: PalmLineType;
  name: string;
  color: string;
  points: Point[];
  confidence: number;
};

type PalmROI = {
  topLeft: Point;
  width: number;
  height: number;
};

type TracedLine = {
  points: Point[];
  length: number;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
};

type ClassifiedLine = {
  type: PalmLineType;
  points: Point[];
  confidence: number;
  characteristics: {
    length: number;
    averageDepth: number;
    curvature: number;
    breaks: number;
    branches: number;
  };
};

type PalmZones = {
  upperThird: { minY: number; maxY: number };
  middleThird: { minY: number; maxY: number };
  lowerHalf: { minY: number; maxY: number };
  centerVertical: { minX: number; maxX: number };
  thumbSide: { minX: number; maxX: number };
};

function toGrayscale(imageData: ImageData): Uint8Array {
  const gray = new Uint8Array(imageData.width * imageData.height);
  const data = imageData.data;
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }
  return gray;
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
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function convolve1D(data: Uint8Array, width: number, height: number, kernel: Float32Array, horizontal: boolean): Uint8Array {
  const result = new Uint8Array(data.length);
  const half = Math.floor(kernel.length / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const offset = k - half;
        let px: number;
        let py: number;
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

function gaussianBlur(gray: Uint8Array, width: number, height: number, sigma: number = 1.4): Uint8Array {
  const kernelSize = Math.max(3, Math.ceil(sigma * 6) | 1);
  const kernel = generateGaussianKernel(kernelSize, sigma);
  const temp = convolve1D(gray, width, height, kernel, true);
  return convolve1D(temp, width, height, kernel, false);
}

function enhanceContrast(gray: Uint8Array, width: number, height: number, tileSize: number = 32): Uint8Array {
  const result = new Uint8Array(gray.length);

  for (let ty = 0; ty < height; ty += tileSize) {
    for (let tx = 0; tx < width; tx += tileSize) {
      const tileW = Math.min(tileSize, width - tx);
      const tileH = Math.min(tileSize, height - ty);

      let min = 255;
      let max = 0;
      for (let y = ty; y < ty + tileH; y++) {
        for (let x = tx; x < tx + tileW; x++) {
          const val = gray[y * width + x];
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }

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

function computeIntegralImage(gray: Uint8Array, width: number, height: number): Float64Array {
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

function getIntegralSum(integral: Float64Array, width: number, x1: number, y1: number, x2: number, y2: number): number {
  const w = width + 1;
  x1++;
  y1++;
  x2++;
  y2++;
  return integral[y2 * w + x2] - integral[y1 * w + x2] - integral[y2 * w + x1] + integral[y1 * w + x1];
}

function adaptiveThreshold(gray: Uint8Array, width: number, height: number, blockSize: number = 15, C: number = 8): Uint8Array {
  const result = new Uint8Array(gray.length);
  const half = Math.floor(blockSize / 2);
  const integral = computeIntegralImage(gray, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half);
      const y1 = Math.max(0, y - half);
      const x2 = Math.min(width - 1, x + half);
      const y2 = Math.min(height - 1, y + half);

      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = getIntegralSum(integral, width, x1, y1, x2, y2);
      const mean = sum / area;

      const idx = y * width + x;
      result[idx] = gray[idx] < mean - C ? 255 : 0;
    }
  }

  return result;
}

function dilate(binary: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
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
            const v = binary[ny * width + nx];
            if (v > maxVal) maxVal = v;
          }
        }
      }
      result[y * width + x] = maxVal;
    }
  }

  return result;
}

function erode(binary: Uint8Array, width: number, height: number, kernelSize: number): Uint8Array {
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
            const v = binary[ny * width + nx];
            if (v < minVal) minVal = v;
          }
        }
      }
      result[y * width + x] = minVal;
    }
  }

  return result;
}

function morphologicalClose(binary: Uint8Array, width: number, height: number, kernelSize: number = 3): Uint8Array {
  const dilated = dilate(binary, width, height, kernelSize);
  return erode(dilated, width, height, kernelSize);
}

function morphologicalOpen(binary: Uint8Array, width: number, height: number, kernelSize: number = 2): Uint8Array {
  const eroded = erode(binary, width, height, kernelSize);
  return dilate(eroded, width, height, kernelSize);
}

function getNeighbors(data: Uint8Array, width: number, x: number, y: number): number[] {
  return [
    data[(y - 1) * width + x] > 0 ? 1 : 0,
    data[(y - 1) * width + x + 1] > 0 ? 1 : 0,
    data[y * width + x + 1] > 0 ? 1 : 0,
    data[(y + 1) * width + x + 1] > 0 ? 1 : 0,
    data[(y + 1) * width + x] > 0 ? 1 : 0,
    data[(y + 1) * width + x - 1] > 0 ? 1 : 0,
    data[y * width + x - 1] > 0 ? 1 : 0,
    data[(y - 1) * width + x - 1] > 0 ? 1 : 0,
  ];
}

function countNonZeroNeighbors(neighbors: number[]): number {
  let sum = 0;
  for (const n of neighbors) sum += n;
  return sum;
}

function countTransitions(neighbors: number[]): number {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (neighbors[i] === 0 && neighbors[(i + 1) % 8] === 1) count++;
  }
  return count;
}

function skeletonize(binary: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(binary);
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 80) {
    iterations++;
    changed = false;

    const toRemove1: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (result[idx] === 0) continue;

        const neighbors = getNeighbors(result, width, x, y);
        const B = countNonZeroNeighbors(neighbors);
        const A = countTransitions(neighbors);

        if (B >= 2 && B <= 6 && A === 1) {
          const p2 = neighbors[0];
          const p4 = neighbors[2];
          const p6 = neighbors[4];
          const p8 = neighbors[6];
          if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) {
            toRemove1.push(idx);
          }
        }
      }
    }

    for (const idx of toRemove1) {
      result[idx] = 0;
      changed = true;
    }

    const toRemove2: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (result[idx] === 0) continue;

        const neighbors = getNeighbors(result, width, x, y);
        const B = countNonZeroNeighbors(neighbors);
        const A = countTransitions(neighbors);

        if (B >= 2 && B <= 6 && A === 1) {
          const p2 = neighbors[0];
          const p4 = neighbors[2];
          const p6 = neighbors[4];
          const p8 = neighbors[6];
          if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) {
            toRemove2.push(idx);
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

function calculateBoundingBox(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}

function calculateLineLengthPixels(points: Point[]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

function orderLinePoints(points: Point[]): Point[] {
  if (points.length <= 2) return points;

  const pointSet = new Set(points.map((p) => `${p.x},${p.y}`));
  let startPoint = points[0];

  for (const point of points) {
    let neighborCount = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (pointSet.has(`${point.x + dx},${point.y + dy}`)) neighborCount++;
      }
    }
    if (neighborCount === 1) {
      startPoint = point;
      break;
    }
  }

  const ordered: Point[] = [startPoint];
  const used = new Set([`${startPoint.x},${startPoint.y}`]);

  while (ordered.length < points.length) {
    const current = ordered[ordered.length - 1];
    let found = false;

    for (let dx = -1; dx <= 1 && !found; dx++) {
      for (let dy = -1; dy <= 1 && !found; dy++) {
        if (dx === 0 && dy === 0) continue;
        const key = `${current.x + dx},${current.y + dy}`;
        if (pointSet.has(key) && !used.has(key)) {
          ordered.push({ x: current.x + dx, y: current.y + dy });
          used.add(key);
          found = true;
        }
      }
    }

    if (!found) break;
  }

  return ordered;
}

function traceSingleLine(skeleton: Uint8Array, visited: Uint8Array, width: number, height: number, startX: number, startY: number): Point[] {
  const points: Point[] = [];
  const stack: Point[] = [{ x: startX, y: startY }];
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    const idx = y * width + x;

    if (visited[idx]) continue;
    visited[idx] = 1;
    points.push({ x, y });

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

  return orderLinePoints(points);
}

function traceLines(skeleton: Uint8Array, width: number, height: number, minLength: number = 30): TracedLine[] {
  const visited = new Uint8Array(skeleton.length);
  const lines: TracedLine[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (skeleton[idx] === 0 || visited[idx]) continue;

      const points = traceSingleLine(skeleton, visited, width, height, x, y);
      if (points.length >= minLength) {
        const boundingBox = calculateBoundingBox(points);
        lines.push({ points, length: calculateLineLengthPixels(points), boundingBox });
      }
    }
  }

  return lines;
}

function definePalmZones(palmWidth: number, palmHeight: number): PalmZones {
  return {
    upperThird: { minY: 0, maxY: palmHeight * 0.35 },
    middleThird: { minY: palmHeight * 0.25, maxY: palmHeight * 0.55 },
    lowerHalf: { minY: palmHeight * 0.3, maxY: palmHeight },
    centerVertical: { minX: palmWidth * 0.35, maxX: palmWidth * 0.65 },
    thumbSide: { minX: 0, maxX: palmWidth * 0.4 },
  };
}

function calculateCurvature(points: Point[]): number {
  if (points.length < 10) return 0;

  let totalCurvature = 0;
  const step = Math.max(1, Math.floor(points.length / 10));

  for (let i = step; i < points.length - step; i += step) {
    const p1 = points[i - step];
    const p2 = points[i];
    const p3 = points[i + step];

    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    const cross = v1.x * v2.y - v1.y * v2.x;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (mag1 > 0 && mag2 > 0) {
      totalCurvature += cross / (mag1 * mag2);
    }
  }

  return totalCurvature / (points.length / step);
}

function scoreLifeLineCurvature(points: Point[], palmWidth: number, palmHeight: number): number {
  if (points.length < 5) return 0;

  const start = points[0];
  const end = points[points.length - 1];
  const mid = points[Math.floor(points.length / 2)];

  const startsUpperLeft = start.y < palmHeight * 0.4 && start.x < palmWidth * 0.5;
  const endsLower = end.y > palmHeight * 0.6;
  const midBulgesRight = mid.x > start.x && mid.x > end.x;

  let score = 0;
  if (startsUpperLeft) score += 0.4;
  if (endsLower) score += 0.3;
  if (midBulgesRight) score += 0.3;

  return score;
}

function scoreAsHeartLine(line: TracedLine, zones: PalmZones, palmWidth: number): number {
  let score = 0;
  const bb = line.boundingBox;
  const centerY = (bb.minY + bb.maxY) / 2;

  if (centerY >= zones.upperThird.minY && centerY <= zones.upperThird.maxY) score += 0.3;

  const horizontalSpan = bb.maxX - bb.minX;
  const verticalSpan = bb.maxY - bb.minY;
  const aspectRatio = horizontalSpan / (verticalSpan + 1);

  if (aspectRatio > 2.5) score += 0.3;
  else if (aspectRatio > 1.5) score += 0.15;

  const lengthRatio = horizontalSpan / palmWidth;
  if (lengthRatio > 0.5) score += 0.2;
  else if (lengthRatio > 0.3) score += 0.1;

  const curvature = calculateCurvature(line.points);
  if (curvature > 0) score += 0.2;

  return Math.min(score, 1);
}

function scoreAsHeadLine(line: TracedLine, zones: PalmZones, palmWidth: number): number {
  let score = 0;
  const bb = line.boundingBox;
  const centerY = (bb.minY + bb.maxY) / 2;

  if (centerY >= zones.middleThird.minY && centerY <= zones.middleThird.maxY) score += 0.3;

  const horizontalSpan = bb.maxX - bb.minX;
  const verticalSpan = bb.maxY - bb.minY;
  const aspectRatio = horizontalSpan / (verticalSpan + 1);

  if (aspectRatio > 2) score += 0.3;
  else if (aspectRatio > 1.2) score += 0.15;

  const lengthRatio = horizontalSpan / palmWidth;
  if (lengthRatio > 0.4 && lengthRatio < 0.9) score += 0.2;

  const curvature = Math.abs(calculateCurvature(line.points));
  if (curvature < 0.3) score += 0.2;

  return Math.min(score, 1);
}

function scoreAsLifeLine(line: TracedLine, zones: PalmZones, palmWidth: number, palmHeight: number): number {
  let score = 0;
  const bb = line.boundingBox;

  const startsFromThumbSide = bb.minX < zones.thumbSide.maxX;
  const startsFromUpper = bb.minY < palmHeight * 0.5;
  if (startsFromThumbSide && startsFromUpper) score += 0.25;

  const verticalSpan = bb.maxY - bb.minY;
  const horizontalSpan = bb.maxX - bb.minX;
  if (verticalSpan > horizontalSpan * 0.8) score += 0.2;

  if (line.length > palmHeight * 0.5) score += 0.25;

  const curvatureScore = scoreLifeLineCurvature(line.points, palmWidth, palmHeight);
  score += curvatureScore * 0.3;

  return Math.min(score, 1);
}

function scoreAsFateLine(line: TracedLine, zones: PalmZones, palmHeight: number): number {
  let score = 0;
  const bb = line.boundingBox;
  const centerX = (bb.minX + bb.maxX) / 2;

  if (centerX >= zones.centerVertical.minX && centerX <= zones.centerVertical.maxX) score += 0.3;

  const horizontalSpan = bb.maxX - bb.minX;
  const verticalSpan = bb.maxY - bb.minY;
  const aspectRatio = verticalSpan / (horizontalSpan + 1);

  if (aspectRatio > 2) score += 0.3;
  else if (aspectRatio > 1.2) score += 0.15;

  const spansMiddleToBottom = bb.minY < palmHeight * 0.6 && bb.maxY > palmHeight * 0.7;
  if (spansMiddleToBottom) score += 0.2;

  const curvature = Math.abs(calculateCurvature(line.points));
  if (curvature < 0.2) score += 0.2;

  return Math.min(score, 1);
}

function resolveConflicts(classified: ClassifiedLine[]): ClassifiedLine[] {
  const byType: Map<PalmLineType, ClassifiedLine[]> = new Map();

  for (const line of classified) {
    if (line.type === "unknown") continue;
    if (!byType.has(line.type)) byType.set(line.type, []);
    byType.get(line.type)!.push(line);
  }

  const resolved: ClassifiedLine[] = [];

  for (const [type, lines] of byType) {
    lines.sort((a, b) => b.confidence - a.confidence);
    resolved.push(lines[0]);
  }

  return resolved;
}

function analyzeLineCharacteristics(line: TracedLine, palmWidth: number, palmHeight: number): ClassifiedLine["characteristics"] {
  return {
    length: line.length / Math.max(palmWidth, palmHeight),
    averageDepth: 0.5,
    curvature: Math.abs(calculateCurvature(line.points)),
    breaks: 0,
    branches: 0,
  };
}

function classifyLines(tracedLines: TracedLine[], palmWidth: number, palmHeight: number): ClassifiedLine[] {
  const zones = definePalmZones(palmWidth, palmHeight);
  const classified: ClassifiedLine[] = [];

  for (const line of tracedLines) {
    const scores = {
      heart: scoreAsHeartLine(line, zones, palmWidth),
      head: scoreAsHeadLine(line, zones, palmWidth),
      life: scoreAsLifeLine(line, zones, palmWidth, palmHeight),
      fate: scoreAsFateLine(line, zones, palmHeight),
    };

    let bestType: PalmLineType = "unknown";
    let bestScore = 0.3;

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

  return resolveConflicts(classified);
}

function downsamplePoints(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

const LINE_STYLE: Record<Exclude<PalmLineType, "unknown">, { name: string; color: string }> = {
  heart: { name: "Heart Line", color: "#EF4444" },
  head: { name: "Head Line", color: "#EAB308" },
  life: { name: "Life Line", color: "#06B6D4" },
  fate: { name: "Fate Line", color: "#EC4899" },
};

export function detectPalmLinesFromROIImageData(params: {
  palmImageData: ImageData;
  roi: PalmROI;
  imageWidth: number;
  imageHeight: number;
  outputSize: number;
}): PalmLineOutput[] {
  const { palmImageData, roi, imageWidth, imageHeight, outputSize } = params;

  const width = palmImageData.width;
  const height = palmImageData.height;

  const gray = toGrayscale(palmImageData);
  const blurred = gaussianBlur(gray, width, height, 1.4);
  const enhanced = enhanceContrast(blurred, width, height, 32);
  const binary = adaptiveThreshold(enhanced, width, height, 15, 8);
  const closed = morphologicalClose(binary, width, height, 3);
  const opened = morphologicalOpen(closed, width, height, 2);
  const skeleton = skeletonize(opened, width, height);

  const traced = traceLines(skeleton, width, height, 40);
  const classified = classifyLines(traced, width, height);

  const outputs: PalmLineOutput[] = [];
  for (const line of classified) {
    if (line.type === "unknown") continue;

    const style = LINE_STYLE[line.type];
    const mapped = downsamplePoints(line.points, 90).map((p) => {
      const roiX = (p.x / outputSize) * roi.width;
      const roiY = (p.y / outputSize) * roi.height;
      return {
        x: (roi.topLeft.x + roiX) / imageWidth,
        y: (roi.topLeft.y + roiY) / imageHeight,
      };
    });

    outputs.push({
      type: line.type,
      name: style.name,
      color: style.color,
      points: mapped,
      confidence: line.confidence,
    });
  }

  return outputs;
}
