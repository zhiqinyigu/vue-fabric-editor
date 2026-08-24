import { colord } from 'colord';

export function isClient() {
  return typeof window !== 'undefined';
}

export function copyText(value) {
  if (!isClient()) return;

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

const LINEAR_GRADIENT_REGEX = /^linear-gradient\((.*)\)$/;
const RADIAL_GRADIENT_REGEX = /^radial-gradient\((.*)\)$/;
const ANGLE_REGEX = /(\d+)deg/;
const RADIAL_POSITION_REGEX = /circle at (\d+)% (\d+)%/;
const PERCENTAGE_REGEX = /(\d+)%$/;

function parseColorAndPercentage(trimmed) {
  // Find percentage at the end: "color 50%"
  const percentMatch = trimmed.match(PERCENTAGE_REGEX);
  if (!percentMatch) {
    return null;
  }

  const percentage = Number.parseInt(percentMatch[1], 10);
  // Extract color part (everything before the last space and percentage)
  const lastSpaceIndex = trimmed.lastIndexOf(' ');
  if (lastSpaceIndex === -1) {
    return null;
  }

  const colorStr = trimmed.slice(0, lastSpaceIndex).trim();
  if (!colorStr) {
    return null;
  }

  return { color: colorStr, percentage };
}

function splitGradientParts(content) {
  const parts = [];
  let currentPart = '';
  let depth = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') {
      depth++;
      currentPart += char;
    } else if (char === ')') {
      depth--;
      currentPart += char;
    } else if (char === ',' && depth === 0) {
      parts.push(currentPart.trim());
      currentPart = '';
    } else {
      currentPart += char;
    }
  }

  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }

  return parts;
}

function parseStops(parts) {
  const stops = [];
  let stopId = 1;

  for (const part of parts) {
    const trimmed = part.trim();

    // Extract color and percentage
    const parsed = parseColorAndPercentage(trimmed);
    if (parsed) {
      try {
        const color = colord(parsed.color);
        if (color.isValid()) {
          stops.push({
            id: stopId++,
            percentage: parsed.percentage,
            color,
          });
        }
      } catch {
        // Invalid color, skip
      }
    } else {
      // No percentage, try to parse as color only
      try {
        const color = colord(trimmed);
        if (color.isValid()) {
          stops.push({
            id: stopId++,
            percentage: stops.length === 0 ? 0 : 100,
            color,
          });
        }
      } catch {
        // Invalid, skip
      }
    }
  }

  return stops;
}

function parseLinearGradient(value) {
  const match = value.match(LINEAR_GRADIENT_REGEX);
  if (!match) return null;

  const content = match[1];
  const parts = splitGradientParts(content);

  let angle = 90; // default
  const stopParts = [];

  for (const part of parts) {
    const trimmed = part.trim();

    // Extract angle
    if (trimmed.includes('deg')) {
      const angleMatch = trimmed.match(ANGLE_REGEX);
      if (angleMatch) {
        angle = Number.parseInt(angleMatch[1], 10);
      }
      continue;
    }

    stopParts.push(trimmed);
  }

  const stops = parseStops(stopParts);

  if (stops.length > 0) {
    return {
      mode: 'linear-gradient',
      config: {
        angle,
        positionX: 0,
        positionY: 50,
        stops,
      },
    };
  }

  return null;
}

function parseRadialGradient(value) {
  const match = value.match(RADIAL_GRADIENT_REGEX);
  if (!match) return null;

  const content = match[1];
  const parts = splitGradientParts(content);

  let positionX = 0;
  let positionY = 50;
  const stopParts = [];

  for (const part of parts) {
    const trimmed = part.trim();

    // Extract position
    if (trimmed.includes('circle at')) {
      const posMatch = trimmed.match(RADIAL_POSITION_REGEX);
      if (posMatch) {
        positionX = Number.parseInt(posMatch[1], 10);
        positionY = Number.parseInt(posMatch[2], 10);
      }
      continue;
    }

    stopParts.push(trimmed);
  }

  const stops = parseStops(stopParts);

  if (stops.length > 0) {
    return {
      mode: 'radial-gradient',
      config: {
        angle: 90,
        positionX,
        positionY,
        stops,
      },
    };
  }

  return null;
}

export function parseGradient(value) {
  if (!value) return null;

  const cleanValue = value.replace(/;$/, '').trim();
  const colorMode = detectColorMode(cleanValue);

  switch (colorMode) {
    case 'linear-gradient':
      return parseLinearGradient(cleanValue);
    case 'radial-gradient':
      return parseRadialGradient(cleanValue);
    default:
      return null;
  }
}

export function detectColorMode(value) {
  if (!value) return 'monochrome';

  const cleanValue = value.replace(/;$/, '').trim();
  if (cleanValue.includes('linear-gradient')) return 'linear-gradient';
  if (cleanValue.includes('radial-gradient')) return 'radial-gradient';
  return 'monochrome';
}
