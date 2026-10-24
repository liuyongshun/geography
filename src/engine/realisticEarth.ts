import * as THREE from 'three'

export type RealisticEarthOptions = {
  segments?: number
  atmosphereScale?: number
  atmosphereStrength?: number
  nightIntensity?: number
}

export type RealisticEarth = {
  surface: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  setSunDirection: (direction: THREE.Vector3) => void
  disposeTextures: () => void
}

const surfaceVertexShader = `
  varying vec2 vUv;
  varying vec3 vLocalNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vUv = uv;
    vLocalNormal = normalize(normal);
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const surfaceFragmentShader = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  uniform float nightIntensity;
  uniform float globalOpacity;
  varying vec2 vUv;
  varying vec3 vLocalNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 dayColor = texture2D(dayMap, vUv).rgb;
    vec3 nightColor = texture2D(nightMap, vUv).rgb;
    float sunlight = dot(normalize(vLocalNormal), normalize(sunDirection));
    float dayMix = smoothstep(-0.12, 0.18, sunlight);
    float diffuse = 0.34 + 0.82 * max(sunlight, 0.0);

    vec3 color = dayColor * diffuse * dayMix;
    color += dayColor * 0.028 * (1.0 - dayMix);
    color += nightColor * nightIntensity * (1.0 - dayMix);

    float twilight = (1.0 - smoothstep(0.0, 0.10, abs(sunlight))) * 0.12;
    color += vec3(0.22, 0.055, 0.018) * twilight;

    vec3 viewDir = normalize(vViewPosition);
    float rim = pow(1.0 - max(dot(normalize(vViewNormal), viewDir), 0.0), 3.2);
    float ocean = smoothstep(0.015, 0.16, dayColor.b - dayColor.r);
    color += vec3(0.08, 0.20, 0.32) * rim * ocean * dayMix * 0.42;

    gl_FragColor = vec4(color, globalOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const atmosphereVertexShader = `
  varying vec3 vLocalNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vLocalNormal = normalize(normal);
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const atmosphereFragmentShader = `
  uniform vec3 sunDirection;
  uniform float atmosphereStrength;
  uniform float globalOpacity;
  varying vec3 vLocalNormal;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(normalize(vViewNormal), viewDir), 0.0), 3.1);
    float sunFacing = smoothstep(-0.32, 0.42, dot(normalize(vLocalNormal), normalize(sunDirection)));
    float alpha = fresnel * (0.18 + 0.82 * sunFacing) * atmosphereStrength;
    vec3 color = mix(vec3(0.035, 0.17, 0.42), vec3(0.20, 0.68, 1.0), sunFacing);
    gl_FragColor = vec4(color, alpha * globalOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** 统一的真实地球：4K 日景、夜间灯光、晨昏过渡和大气散射。 */
export function createRealisticEarth(
  renderer: THREE.WebGLRenderer,
  radius: number,
  initialSunDirection: THREE.Vector3,
  options: RealisticEarthOptions = {},
): RealisticEarth {
  const loader = new THREE.TextureLoader()
  const dayTexture = loader.load('/textures/earth-blue-marble.jpg')
  const nightTexture = loader.load('/textures/earth-night.jpg')
  dayTexture.colorSpace = THREE.SRGBColorSpace
  nightTexture.colorSpace = THREE.SRGBColorSpace
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  dayTexture.anisotropy = anisotropy
  nightTexture.anisotropy = anisotropy

  const direction = initialSunDirection.clone().normalize()
  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayTexture },
      nightMap: { value: nightTexture },
      sunDirection: { value: direction.clone() },
      nightIntensity: { value: options.nightIntensity ?? 1.35 },
      globalOpacity: { value: 1 },
    },
    vertexShader: surfaceVertexShader,
    fragmentShader: surfaceFragmentShader,
  })
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: direction.clone() },
      atmosphereStrength: { value: options.atmosphereStrength ?? 0.88 },
      globalOpacity: { value: 1 },
    },
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  })

  const segments = options.segments ?? 96
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.round(segments * 0.75)),
    surfaceMaterial,
  )
  surface.name = 'realistic-earth-surface'
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(
      radius * (options.atmosphereScale ?? 1.045),
      Math.max(48, Math.round(segments * 0.75)),
      Math.max(36, Math.round(segments * 0.56)),
    ),
    atmosphereMaterial,
  )
  atmosphere.name = 'realistic-earth-atmosphere'
  atmosphere.renderOrder = 3

  return {
    surface,
    atmosphere,
    setSunDirection(nextDirection: THREE.Vector3) {
      const next = nextDirection.clone().normalize()
      surfaceMaterial.uniforms.sunDirection!.value.copy(next)
      atmosphereMaterial.uniforms.sunDirection!.value.copy(next)
    },
    disposeTextures() {
      dayTexture.dispose()
      nightTexture.dispose()
    },
  }
}

/** 为所有真实地球场景统一启用电影级色调映射。 */
export function configureEarthRenderer(renderer: THREE.WebGLRenderer, exposure = 1.08) {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = exposure
}
