import * as THREE from 'three'
import type { TerrainMetadata } from './everestContext'

/** Exact sight-line test on the same rectilinear, triangulated surface used by the GPU. */
export function createTerrainOcclusion(xs: number[], zs: number[], positions: Float32Array) {
  const cell = (axis: number[], value: number) => {
    let low = 0, high = axis.length - 1
    while (high - low > 1) { const mid = (low + high) >> 1; if (axis[mid] <= value) low = mid; else high = mid }
    return Math.min(low, axis.length - 2)
  }
  const at = (col: number, row: number) => positions[(row * xs.length + col) * 3 + 1]
  return (from: THREE.Vector3, to: THREE.Vector3) => {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z
    let enter = 0, leave = 1
    for (const [origin, direction, axis] of [[from.x, dx, xs], [from.z, dz, zs]] as const) {
      if (Math.abs(direction) < 1e-10) { if (origin < axis[0] || origin > axis[axis.length - 1]) return false; continue }
      const a = (axis[0] - origin) / direction, b = (axis[axis.length - 1] - origin) / direction
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b))
    }
    if (enter > leave) return false
    const cuts = [enter, leave]
    for (const [origin, direction, axis] of [[from.x, dx, xs], [from.z, dz, zs]] as const) {
      if (Math.abs(direction) < 1e-10) continue
      for (const value of axis) { const t = (value - origin) / direction; if (t > enter && t < leave) cuts.push(t) }
    }
    cuts.sort((a, b) => a - b)
    const blocked = (t: number) => {
      const x = from.x + dx * t, z = from.z + dz * t
      const col = cell(xs, x), row = cell(zs, z)
      const u = THREE.MathUtils.clamp((x - xs[col]) / (xs[col + 1] - xs[col]), 0, 1)
      const v = THREE.MathUtils.clamp((z - zs[row]) / (zs[row + 1] - zs[row]), 0, 1)
      const a = at(col, row), b = at(col, row + 1), c = at(col + 1, row), d = at(col + 1, row + 1)
      const height = u + v <= 1 ? a + (c - a) * u + (b - a) * v : d + (b - d) * (1 - u) + (c - d) * (1 - v)
      return from.y + dy * t < height - .08
    }
    // The height difference is linear within each triangle. Test cell boundaries and
    // the diagonal crossing so even a narrow ridge cannot fall between samples.
    for (let i = 0; i < cuts.length; i++) {
      if (blocked(cuts[i])) return true
      if (i === cuts.length - 1 || cuts[i + 1] - cuts[i] < 1e-10) continue
      const mid = (cuts[i] + cuts[i + 1]) / 2
      const col = cell(xs, from.x + dx * mid), row = cell(zs, from.z + dz * mid)
      const w = xs[col + 1] - xs[col], h = zs[row + 1] - zs[row]
      const denominator = dx / w + dz / h
      if (Math.abs(denominator) < 1e-10) continue
      const diagonal = (1 - (from.x - xs[col]) / w - (from.z - zs[row]) / h) / denominator
      if (diagonal > cuts[i] && diagonal < cuts[i + 1] && blocked(diagonal)) return true
    }
    return false
  }
}

const BACKGROUND = `
uniform vec3 terrainSkyTop;
uniform vec3 terrainSkyBottom;
vec3 terrainSky(vec2 uv) {
  vec2 offset = (uv - vec2(0.54, 0.40)) * vec2(1.5, 1.8);
  float glow = exp(-dot(offset, offset) * 3.0) * 0.012;
  return mix(terrainSkyBottom, terrainSkyTop, pow(clamp(uv.y, 0.0, 1.0), 0.75)) + glow;
}
`

function axis(minimum: number, maximum: number, coreSize: number) {
  const values: number[] = []
  if (minimum < 0) for (let i = 0; i < 40; i++) values.push(THREE.MathUtils.lerp(minimum, 0, i / 40))
  for (let i = 0; i < coreSize; i++) values.push(i / (coreSize - 1))
  if (maximum > 1) for (let i = 1; i <= 40; i++) values.push(THREE.MathUtils.lerp(1, maximum, i / 40))
  return values
}

/** One height surface, split into non-overlapping Uint16-indexed patches for WebView2/ANGLE. */
export function createStableEverestTerrain(
  core: TerrainMetadata, context: TerrainMetadata, contextBytes: ArrayBuffer,
  texture: THREE.Texture, coreSurface: (u: number, v: number) => THREE.Vector3,
) {
  if (contextBytes.byteLength !== context.gridSize ** 2 * 2) throw new Error('外围地形数据不完整')
  const [west, south, east, north] = core.bboxWGS84
  const [cw, cs, ce, cn] = context.bboxWGS84
  const scale = 180 / core.widthMeters
  const minU = (cw - west) / (east - west), maxU = (ce - west) / (east - west)
  const minV = (north - cn) / (north - south), maxV = (north - cs) / (north - south)
  const xs = axis(minU, maxU, core.gridSize), zs = axis(minV, maxV, core.gridSize)
  const width = xs.length, height = zs.length
  const data = new DataView(contextBytes)
  const sampleContext = (u: number, v: number) => {
    const x = THREE.MathUtils.clamp((u - minU) / (maxU - minU), 0, 1) * (context.gridSize - 1)
    const z = THREE.MathUtils.clamp((v - minV) / (maxV - minV), 0, 1) * (context.gridSize - 1)
    const ix = Math.floor(x), iz = Math.floor(z)
    const read = (col: number, row: number) => data.getUint16((Math.min(row, context.gridSize - 1) * context.gridSize + Math.min(col, context.gridSize - 1)) * 2, true)
    const q = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(read(ix, iz), read(ix + 1, iz), x - ix),
      THREE.MathUtils.lerp(read(ix, iz + 1), read(ix + 1, iz + 1), x - ix), z - iz,
    )
    return context.minElevation + q / 65535 * (context.maxElevation - context.minElevation)
  }
  const positions = new Float32Array(width * height * 3)
  const tints = new Float32Array(positions.length)
  const normals = new Float32Array(positions.length)
  const low = new THREE.Color('#65694c'), earth = new THREE.Color('#a18d6d')
  const rock = new THREE.Color('#a2a397'), snow = new THREE.Color('#dce4e3'), color = new THREE.Color()
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const u = xs[col], v = zs[row], index = (row * width + col) * 3
    const elevation = sampleContext(u, v)
    const outside = Math.max(-u, u - 1, -v, v - 1, 0)
    let y = (elevation - core.minElevation) * scale
    if (outside === 0) y = coreSurface(u, v).y
    else if (outside < .12) {
      // Only the outer shoulder blends source heights. The entire core DEM is unchanged.
      const boundary = coreSurface(THREE.MathUtils.clamp(u, 0, 1), THREE.MathUtils.clamp(v, 0, 1)).y
      y = THREE.MathUtils.lerp(boundary, y, THREE.MathUtils.smoothstep(outside, 0, .12))
    }
    positions.set([(u - .5) * 180, y, (v - .5) * core.heightMeters * scale], index)
    if (elevation < 5200) color.copy(low).lerp(earth, THREE.MathUtils.clamp((elevation - 4200) / 1000, 0, 1))
    else if (elevation < 6600) color.copy(earth).lerp(rock, (elevation - 5200) / 1400)
    else color.copy(rock).lerp(snow, THREE.MathUtils.clamp((elevation - 6600) / 1500, 0, 1))
    color.multiplyScalar(.94 + Math.sin(u * 173 + Math.sin(v * 91)) * Math.sin(v * 157) * .05)
    tints.set([color.r, color.g, color.b], index)
  }
  // Compute shared normals before splitting so chunk borders do not acquire lighting seams.
  const dx = new THREE.Vector3(), dz = new THREE.Vector3(), normal = new THREE.Vector3()
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const left = (row * width + Math.max(0, col - 1)) * 3, right = (row * width + Math.min(width - 1, col + 1)) * 3
    const top = (Math.max(0, row - 1) * width + col) * 3, bottom = (Math.min(height - 1, row + 1) * width + col) * 3
    dx.set(positions[right] - positions[left], positions[right + 1] - positions[left + 1], positions[right + 2] - positions[left + 2])
    dz.set(positions[bottom] - positions[top], positions[bottom + 1] - positions[top + 1], positions[bottom + 2] - positions[top + 2])
    normal.crossVectors(dz, dx).normalize()
    normals.set([normal.x, normal.y, normal.z], (row * width + col) * 3)
  }

  const resolution = new THREE.Vector2(1, 1)
  const sky = { terrainSkyTop: { value: new THREE.Color('#0c182b') }, terrainSkyBottom: { value: new THREE.Color('#415362') } }
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0, transparent: false, depthWrite: true })
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, sky, { terrainResolution: { value: resolution } })
    shader.vertexShader = `attribute vec3 terrainTint;\nattribute vec2 terrainOuterUv;\nvarying vec3 vTerrainTint;\nvarying vec2 vTerrainOuterUv;\n${shader.vertexShader}`
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTerrainTint = terrainTint;\nvTerrainOuterUv = terrainOuterUv;')
    shader.fragmentShader = `varying vec3 vTerrainTint;\nvarying vec2 vTerrainOuterUv;\nuniform vec2 terrainResolution;\n${BACKGROUND}\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `
        vec4 satellite = texture2D(map, vMapUv);
        float mainInland = min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y));
        diffuseColor.rgb *= mix(vTerrainTint, satellite.rgb, smoothstep(0.0, 0.12, mainInland));
      `)
      .replace('#include <colorspace_fragment>', `
        #include <colorspace_fragment>
        vec2 q = abs(vTerrainOuterUv - 0.5) - vec2(0.35);
        float boundary = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.15;
        float waviness = sin(vTerrainOuterUv.x * 41.0 + sin(vTerrainOuterUv.y * 25.0)) * sin(vTerrainOuterUv.y * 37.0) * 0.008;
        float inland = -boundary + waviness;
        float fade = smoothstep(0.005, 0.10, inland);
        float haze = (1.0 - smoothstep(0.04, 0.30, inland)) * 0.8;
        vec3 background = linearToOutputTexel(vec4(terrainSky(gl_FragCoord.xy / terrainResolution), 1.0)).rgb;
        gl_FragColor.rgb = mix(background, gl_FragColor.rgb, fade * (1.0 - haze));
        gl_FragColor.a = 1.0;
      `)
  }
  material.customProgramCacheKey = () => 'everest-single-opaque-surface-v1'

  const group = new THREE.Group(), geometries: THREE.BufferGeometry[] = []
  for (let row = 0; row < height - 1; row += 128) for (let col = 0; col < width - 1; col += 128) {
    const cellsX = Math.min(128, width - col - 1), cellsZ = Math.min(128, height - row - 1)
    const pw = cellsX + 1, ph = cellsZ + 1, vertexCount = pw * ph
    const p = new Float32Array(vertexCount * 3), n = new Float32Array(p.length), c = new Float32Array(p.length)
    const uv = new Float32Array(vertexCount * 2), outerUv = new Float32Array(uv.length)
    for (let r = 0; r < ph; r++) for (let x = 0; x < pw; x++) {
      const source = ((row + r) * width + col + x) * 3, target = (r * pw + x) * 3, texel = (r * pw + x) * 2
      p.set(positions.subarray(source, source + 3), target)
      n.set(normals.subarray(source, source + 3), target)
      c.set(tints.subarray(source, source + 3), target)
      uv.set([xs[col + x], 1 - zs[row + r]], texel)
      outerUv.set([(xs[col + x] - minU) / (maxU - minU), (zs[row + r] - minV) / (maxV - minV)], texel)
    }
    const indices = new Uint16Array(cellsX * cellsZ * 6)
    let cursor = 0
    for (let r = 0; r < cellsZ; r++) for (let x = 0; x < cellsX; x++) {
      const a = r * pw + x, b = a + pw
      indices.set([a, b, a + 1, b, b + 1, a + 1], cursor); cursor += 6
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(p, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(n, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geometry.setAttribute('terrainTint', new THREE.BufferAttribute(c, 3))
    geometry.setAttribute('terrainOuterUv', new THREE.BufferAttribute(outerUv, 2))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true; mesh.receiveShadow = true
    group.add(mesh); geometries.push(geometry)
  }

  const backgroundGeometry = new THREE.PlaneGeometry(2, 2)
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: { ...sky, terrainResolution: { value: resolution } }, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `${BACKGROUND}\nuniform vec2 terrainResolution;\nvoid main() { gl_FragColor = vec4(terrainSky(gl_FragCoord.xy / terrainResolution), 1.0);\n#include <colorspace_fragment>\n}`,
  })
  const backdrop = new THREE.Mesh(backgroundGeometry, backgroundMaterial)
  backdrop.frustumCulled = false; backdrop.renderOrder = -100
  const isOccluded = createTerrainOcclusion(xs.map(u => (u - .5) * 180), zs.map(v => (v - .5) * core.heightMeters * scale), positions)
  return { group, material, geometries, backdrop, backgroundGeometry, backgroundMaterial, resolution, isOccluded }
}
