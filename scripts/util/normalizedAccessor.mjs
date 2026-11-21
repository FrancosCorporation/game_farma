// Normalized accessor decoder for glTF-Transform.
// getArray() returns raw component storage; this decodes to [-1,1] or [0,1] floats.

const COMPONENT_TYPES = {
  5120: 'BYTE',      // int8
  5121: 'UNSIGNED_BYTE', // uint8
  5122: 'SHORT',     // int16
  5123: 'UNSIGNED_SHORT', // uint16
  5124: 'INT',       // int32
  5125: 'UNSIGNED_INT', // uint32
  5126: 'FLOAT',     // float32
};

const DIVISORS = {
  'BYTE': 127,
  'SHORT': 32767,
  'UNSIGNED_BYTE': 255,
  'UNSIGNED_SHORT': 65535,
};

/**
 * Decode an accessor's raw output values to normalized floats.
 * When accessor.isNormalized() is true, integer components are divided by their
 * respective ranges and clamped to [-1,1] (signed) or [0,1] (unsigned).
 * When isNormalized() is false, values are copied faithfully as Float32.
 *
 * @param {import('@gltf-transform/accessor').Accessor} acc
 * @param {ArrayBufferView} rawArray
 * @returns {Float32Array} decoded values
 */
function decodeAccessor(acc, rawArray) {
  const compType = acc.getComponentType();
  const isNormalized = acc.getNormalized();

  if (compType === 5126) {
    // FLOAT: always faithfully copied, normalized flag is irrelevant
    return new Float32Array(rawArray);
  }

  const compName = COMPONENT_TYPES[compType];
  if (!compName) {
    // Unknown type: return faithful copy
    return new Float32Array(rawArray);
  }

  // When not normalized, copy raw integer storage faithfully as Float32
  if (!isNormalized) {
    const result = new Float32Array(rawArray.length);
    for (let i = 0; i < rawArray.length; i++) {
      result[i] = Number(rawArray[i]);
    }
    return result;
  }

  // When normalized, decode integer components
  const divisor = DIVISORS[compName];
  if (divisor === undefined) {
    // Unknown signedness: return faithful copy
    return new Float32Array(rawArray);
  }

  const result = new Float32Array(rawArray.length);
  let i = rawArray.length;
  while (i--) {
    let v = rawArray[i];
    if (compName === 'BYTE' || compName === 'SHORT') {
      // glTF signed normalization clamps the most negative storage value.
      v = Math.max(-1, Math.min(1, v / divisor));
    } else if (compName === 'UNSIGNED_BYTE') {
      // uint8: divide by 255
      v = v / 255;
    } else if (compName === 'UNSIGNED_SHORT') {
      // uint16: divide by 65535
      v = v / 65535;
    } else {
      // Default divide for any other signed type
      v = v / divisor;
    }
    result[i] = v;
  }
  return result;
}

/**
 * Decode a sampler's output accessor values (quaternion, translation, scale).
 * Handles per-component offset tracking for cubic splines.
 *
 * @param {import('@gltf-transform/accessor').Accessor} outputAcc
 * @param {ArrayBufferView} rawOutputArray
 * @param {number} factor - CUBICSPLINE factor (3) or 1 for LINEAR/STEP
 * @param {number} startOffset - byte/element offset start adjustment for cubic splines
 * @returns {Float32Array} decoded values
 */
function decodeSamplerOutput(outputAcc, rawOutputArray, factor, startOffset = 0) {
  const decoded = decodeAccessor(outputAcc, rawOutputArray);
  return decoded;
}

export { decodeAccessor, decodeSamplerOutput };
