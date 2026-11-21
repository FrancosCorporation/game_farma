'use strict';

export const QUALITY_MODES = ['auto', 'low', 'balanced', 'high'];

export const QUALITY_STORAGE_KEY = 'farmacheck:quality';

function isAllowedMode(mode) {
  return typeof mode === 'string' && QUALITY_MODES.indexOf(mode) !== -1;
}

export function readQuality(storage, fallback = 'auto') {
  const safeFallback = isAllowedMode(fallback) ? fallback : 'auto';
  try {
    if (!storage || typeof storage.getItem !== 'function') {
      return safeFallback;
    }
    const raw = storage.getItem(QUALITY_STORAGE_KEY);
    if (raw === null || raw === undefined) {
      return safeFallback;
    }
    const value = typeof raw === 'string' ? raw.trim() : '';
    return isAllowedMode(value) ? value : safeFallback;
  } catch (_error) {
    return safeFallback;
  }
}

export function writeQuality(storage, mode) {
  if (!isAllowedMode(mode)) {
    throw new RangeError('Invalid quality mode: ' + JSON.stringify(mode));
  }
  if (!storage || typeof storage.setItem !== 'function') {
    return false;
  }
  try {
    storage.setItem(QUALITY_STORAGE_KEY, mode);
    return true;
  } catch (_error) {
    return false;
  }
}

function sanitizePixelRatio(devicePixelRatio) {
  const value = Number(devicePixelRatio);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function resolveQuality(mode, options = {}) {
  const settings = options || {};
  const mobile = settings.mobile === true;
  const pixelRatioDpr = sanitizePixelRatio(settings.devicePixelRatio);
  const reducedMotion = settings.reducedMotion === true;

  let effectiveMode = mode;
  if (!isAllowedMode(effectiveMode) || effectiveMode === 'auto') {
    effectiveMode = mobile ? 'low' : 'balanced';
  }

  if (effectiveMode === 'low') {
    return {
      mode: effectiveMode,
      maxFps: 30,
      pixelRatio: Math.min(1, pixelRatioDpr),
      shadows: false,
      postProcessing: false,
      reducedMotion: reducedMotion
    };
  }

  if (effectiveMode === 'high') {
    return {
      mode: effectiveMode,
      maxFps: 60,
      pixelRatio: Math.min(2, pixelRatioDpr),
      shadows: true,
      postProcessing: true,
      reducedMotion: reducedMotion
    };
  }

  return {
    mode: 'balanced',
    maxFps: 60,
    pixelRatio: Math.min(1.5, pixelRatioDpr),
    shadows: true,
    postProcessing: false,
    reducedMotion: reducedMotion
  };
}

export function shouldRenderFrame(now, lastFrameAt, maxFps) {
  const current = Number(now);
  const previous = Number(lastFrameAt);
  const rate = Number(maxFps);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || !Number.isFinite(rate) || rate <= 0) {
    return true;
  }
  return current - previous >= (1000 / rate) - 0.5;
}

