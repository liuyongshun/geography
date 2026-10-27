import * as THREE from 'three'

export type TerrainMetadata = {
  gridSize: number; minElevation: number; maxElevation: number
  widthMeters: number; heightMeters: number; bboxWGS84: [number, number, number, number]
}

/** A wider, real-elevation ring; earth-tone colors are an illustrative treatment. */
export function createEverestContext(
  metadata: TerrainMetadata, bytes: ArrayBuffer, summit: TerrainMetadata,
  summitSurface: (u: number, v: number) => THREE.Vector3,
) {
  if (bytes.byteLength !== metadata.gridSize ** 2 * 2) throw new Error('外围地形数据不完整')
  const values = new DataView(bytes)
  const scale = 180 / summit.widthMeters
  const [west, south, east, north] = metadata.bboxWGS84
  const [sw, ss, se, sn] = summit.bboxWGS84
  const geometry = new THREE.PlaneGeometry(1, 1, metadata.gridSize - 1, metadata.gridSize - 1)
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const colors: number[] = [], mainUvs: number[] = []
  const low = new THREE.Color('#65694c'), earth = new THREE.Color('#a18d6d')
  const rock = new THREE.Color('#a2a397'), snow = new THREE.Color('#dce4e3')
  const tint = new THREE.Color()
  for (let i = 0; i < positions.count; i++) {
    const u = (i % metadata.gridSize) / (metadata.gridSize - 1)
    const v = Math.floor(i / metadata.gridSize) / (metadata.gridSize - 1)
    const lon = west + u * (east - west), lat = north - v * (north - south)
    const mainU = (lon - sw) / (se - sw), mainV = (sn - lat) / (sn - ss)
    const elevation = metadata.minElevation + values.getUint16(i * 2, true) / 65535 * (metadata.maxElevation - metadata.minElevation)
    let height = (elevation - summit.minElevation) * scale
    const inland = Math.min(mainU, 1 - mainU, mainV, 1 - mainV)
    if (inland > 0) {
      const weight = THREE.MathUtils.smoothstep(inland, 0, .12)
      height = THREE.MathUtils.lerp(height, summitSurface(mainU, mainV).y - .3, weight)
    }
    positions.setXYZ(i, (mainU - .5) * 180, height, (mainV - .5) * summit.heightMeters * scale)
    mainUvs.push(mainU, mainV)
    if (elevation < 5200) tint.copy(low).lerp(earth, THREE.MathUtils.clamp((elevation - 4200) / 1000, 0, 1))
    else if (elevation < 6600) tint.copy(earth).lerp(rock, (elevation - 5200) / 1400)
    else tint.copy(rock).lerp(snow, THREE.MathUtils.clamp((elevation - 6600) / 1500, 0, 1))
    tint.multiplyScalar(.94 + Math.sin(u * 173 + Math.sin(v * 91)) * Math.sin(v * 157) * .05)
    colors.push(tint.r, tint.g, tint.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('contextMainUv', new THREE.Float32BufferAttribute(mainUvs, 2))
  geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, transparent: true, depthWrite: false })
  material.onBeforeCompile = shader => {
    shader.uniforms.contextHaze = { value: new THREE.Color('#2c465b') }
    shader.vertexShader = `attribute vec2 contextMainUv;\nvarying vec2 vContextUv;\nvarying vec2 vContextMainUv;\n${shader.vertexShader}`
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvContextUv = uv;\nvContextMainUv = contextMainUv;')
    shader.fragmentShader = `varying vec2 vContextUv;\nvarying vec2 vContextMainUv;\nuniform vec3 contextHaze;\n${shader.fragmentShader}`
      .replace('#include <opaque_fragment>', `
        vec2 q = abs(vContextUv - 0.5) - vec2(0.35);
        float boundary = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.15;
        float waviness = sin(vContextUv.x * 41.0 + sin(vContextUv.y * 25.0)) * sin(vContextUv.y * 37.0) * 0.008;
        float inland = -boundary + waviness;
        float outerAlpha = smoothstep(0.005, 0.10, inland);
        float mainInland = min(min(vContextMainUv.x, 1.0 - vContextMainUv.x), min(vContextMainUv.y, 1.0 - vContextMainUv.y));
        float innerAlpha = 1.0 - smoothstep(0.065, 0.16, mainInland);
        diffuseColor.a *= outerAlpha * innerAlpha;
        if (diffuseColor.a < 0.005) discard;
        float aerial = (1.0 - smoothstep(0.04, 0.30, inland)) * 0.8;
        outgoingLight = mix(outgoingLight, contextHaze, aerial);
        #include <opaque_fragment>
      `)
  }
  material.customProgramCacheKey = () => 'everest-earth-context-v1'
  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  mesh.renderOrder = 0
  return mesh
}
