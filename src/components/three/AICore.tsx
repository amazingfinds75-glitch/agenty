import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { ActivityMode } from '../../lib/types'
import { cx } from '../../lib/utils'

export type CoreQuality = 'high' | 'balanced' | 'low'

interface AICoreProps {
  activity?: ActivityMode
  quality?: CoreQuality
  reducedMotion?: boolean
  className?: string
}

const ENERGY: Record<ActivityMode, number> = {
  idle: 0.24,
  prompt: 0.95,
  research: 0.68,
  writing: 0.45,
  production: 0.85,
  checking: 0.55,
  complete: 1,
}

function makeEnvironment(renderer: THREE.WebGLRenderer) {
  const width = 512
  const height = 256
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const base = ctx.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0, '#0b1119')
  base.addColorStop(0.5, '#050709')
  base.addColorStop(1, '#020304')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  const glow = (x: number, y: number, radius: number, color: string) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
    grad.addColorStop(0, color)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
  }
  glow(150, 70, 190, 'rgba(0,212,255,0.5)')
  glow(390, 150, 210, 'rgba(139,92,246,0.4)')
  glow(256, 24, 240, 'rgba(255,255,255,0.28)')

  ctx.fillStyle = 'rgba(190,240,255,0.05)'
  for (let y = 104; y < 150; y += 6) ctx.fillRect(0, y, width, 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(texture)
  return { envMap: target.texture, texture, target, pmrem }
}

function glassMaterial(tint: string, withTransmission: boolean) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint),
    emissive: new THREE.Color('#08222e'),
    emissiveIntensity: 0.05,
    metalness: 0,
    roughness: withTransmission ? 0.14 : 0.24,
    transmission: withTransmission ? 0.82 : 0,
    thickness: withTransmission ? 0.6 : 0.25,
    ior: 1.42,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    envMapIntensity: withTransmission ? 1.4 : 1.6,
    transparent: true,
    opacity: withTransmission ? 0.9 : 0.26,
    flatShading: true,
  })
}

interface GlassWall {
  material: THREE.MeshPhysicalMaterial
  config: {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
    tint: string
    accent: 'cyan' | 'violet'
    transmission: number
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

export function AICore({ activity = 'idle', quality = 'balanced', reducedMotion = false, className }: AICoreProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const activityRef = useRef<ActivityMode>(activity)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    activityRef.current = activity
  }, [activity])

  useEffect(() => {
    if (!mountRef.current) return
    if (!webglAvailable()) {
      setFailed(true)
      return
    }
    const mount = mountRef.current
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: quality === 'high',
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      setFailed(true)
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'balanced' ? 1.6 : 1.25)
    renderer.setPixelRatio(dpr)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.inset = '0'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 0, 8.4)
    const root = new THREE.Group()
    scene.add(root)

    const disposables: Array<{ dispose: () => void }> = []
    const cyan = new THREE.Color('#00D4FF')
    const violet = new THREE.Color('#8B5CF6')
    const withTransmission = quality !== 'low'

    const env = makeEnvironment(renderer)
    if (env) {
      scene.environment = env.envMap
      disposables.push(env.texture, env.envMap, env.target, env.pmrem)
    }
    scene.environmentIntensity = 1.05

    const keyCyan = new THREE.PointLight('#7fe9ff', 20, 18, 2)
    keyCyan.position.set(-4.6, 2.8, 4.6)
    scene.add(keyCyan)
    const keyViolet = new THREE.PointLight('#a78bfa', 16, 18, 2)
    keyViolet.position.set(4.8, -1.8, 3.6)
    scene.add(keyViolet)
    const keyWhite = new THREE.PointLight('#ffffff', 10, 16, 2)
    keyWhite.position.set(0, 4.8, 2.4)
    scene.add(keyWhite)

    // static glass architecture — large panes, beams and fins, no rotating shapes
    const boxGeo = new THREE.BoxGeometry(1, 1, 1)
    const edgeGeo = new THREE.EdgesGeometry(boxGeo)
    const edgeCyanMat = new THREE.LineBasicMaterial({
      color: cyan,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const edgeVioletMat = new THREE.LineBasicMaterial({
      color: violet,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    disposables.push(boxGeo, edgeGeo, edgeCyanMat, edgeVioletMat)

    const walls: GlassWall[] = [
      {
        config: {
          position: [0.2, 0.2, -4.5],
          rotation: [0, 0, 0],
          scale: [10, 6, 0.05],
          tint: '#1b3140',
          accent: 'cyan',
          transmission: 0.25,
        },
        material: new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#1b3140'),
          emissive: new THREE.Color('#08222e'),
          emissiveIntensity: 0.04,
          metalness: 0,
          roughness: 0.42,
          transmission: withTransmission ? 0.22 : 0,
          thickness: 0.3,
          envMapIntensity: 0.8,
          transparent: true,
          opacity: withTransmission ? 0.34 : 0.09,
          side: THREE.DoubleSide,
        }),
      },
      {
        config: {
          position: [4.6, 0.6, -1.4],
          rotation: [0.03, -0.7, 0.1],
          scale: [3.0, 4.4, 0.05],
          tint: '#35617c',
          accent: 'cyan',
          transmission: 0.82,
        },
        material: glassMaterial('#35617c', withTransmission),
      },
      {
        config: {
          position: [-4.7, -0.1, -1.0],
          rotation: [0.02, 0.7, -0.08],
          scale: [2.7, 3.8, 0.05],
          tint: '#413567',
          accent: 'violet',
          transmission: 0.82,
        },
        material: glassMaterial('#413567', withTransmission),
      },
      {
        config: {
          position: [0.4, 2.7, 0.6],
          rotation: [0.12, -0.22, 0.04],
          scale: [7.2, 0.42, 0.05],
          tint: '#2f5a72',
          accent: 'cyan',
          transmission: 0.82,
        },
        material: glassMaterial('#2f5a72', withTransmission),
      },
      {
        config: {
          position: [0.2, -2.5, 1.0],
          rotation: [-0.06, 0.16, 0],
          scale: [6.6, 0.4, 0.06],
          tint: '#2b546b',
          accent: 'cyan',
          transmission: 0.82,
        },
        material: glassMaterial('#2b546b', withTransmission),
      },
      {
        config: {
          position: [3.0, -1.6, 1.9],
          rotation: [0.04, -1.0, 0.05],
          scale: [1.5, 2.1, 0.04],
          tint: '#33566f',
          accent: 'cyan',
          transmission: 0.82,
        },
        material: glassMaterial('#33566f', withTransmission),
      },
      {
        config: {
          position: [-2.9, 1.7, 1.6],
          rotation: [-0.02, 1.05, -0.04],
          scale: [1.3, 1.8, 0.04],
          tint: '#453a6c',
          accent: 'violet',
          transmission: 0.82,
        },
        material: glassMaterial('#453a6c', withTransmission),
      },
    ]

    for (const wall of walls) {
      const { position, rotation, scale, accent } = wall.config
      const mesh = new THREE.Mesh(boxGeo, wall.material)
      mesh.position.set(...position)
      mesh.rotation.set(...rotation)
      mesh.scale.set(...scale)
      const edges = new THREE.LineSegments(edgeGeo, accent === 'cyan' ? edgeCyanMat : edgeVioletMat)
      mesh.add(edges)
      root.add(mesh)
      disposables.push(wall.material)
    }

    // slow drifting dust for depth
    const count = quality === 'high' ? 1100 : quality === 'balanced' ? 700 : 320
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const radius = 2.6 + Math.pow(Math.random(), 1.5) * 4.6
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.cos(phi) * 0.7
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
      const color = cyan.clone().lerp(violet, Math.random())
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const particleMat = new THREE.PointsMaterial({
      size: quality === 'low' ? 0.042 : 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    root.add(particles)
    disposables.push(particleGeo, particleMat)

    let pulse = 0
    let lastActivity: ActivityMode = activity

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1
      pointer.ty = (event.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    const resize = () => {
      const rect = mount.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    const startedAt = performance.now()
    let lastFrame = startedAt
    let rafId = 0
    let alive = true
    let energy = ENERGY[activity]

    const renderFrame = () => {
      const now = performance.now()
      const dt = Math.min((now - lastFrame) / 1000, 0.05)
      lastFrame = now
      const time = (now - startedAt) / 1000
      const current = activityRef.current
      if (current !== lastActivity) {
        lastActivity = current
        pulse = current === 'complete' || current === 'prompt' ? 1.2 : 0.8
      }
      energy += (ENERGY[current] - energy) * Math.min(1, dt * 2.2)

      for (const wall of walls) {
        wall.material.emissiveIntensity = 0.05 + energy * 0.16 + pulse * 0.3
      }
      edgeCyanMat.opacity = 0.12 + energy * 0.16
      edgeVioletMat.opacity = 0.1 + energy * 0.12
      particleMat.opacity = 0.3 + energy * 0.26
      particles.rotation.y += dt * (0.008 + energy * 0.02)

      if (pulse > 0) pulse = Math.max(0, pulse - dt * 0.7)

      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.5)
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.5)
      if (!reducedMotion) {
        root.rotation.y = pointer.x * 0.06
        root.rotation.x = pointer.y * 0.035
        camera.position.x = pointer.x * 0.28
        camera.position.y = -pointer.y * 0.18
      }
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }

    const loop = () => {
      if (!alive) return
      if (!document.hidden) renderFrame()
      rafId = requestAnimationFrame(loop)
    }

    renderFrame()
    if (!reducedMotion) loop()

    const onVisibility = () => {
      if (!document.hidden && !reducedMotion) {
        lastFrame = performance.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onContextLost = (event: Event) => {
      event.preventDefault()
      alive = false
      cancelAnimationFrame(rafId)
      setFailed(true)
    }
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)

    return () => {
      alive = false
      cancelAnimationFrame(rafId)
      observer.disconnect()
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      disposables.forEach((item) => item.dispose())
      renderer.dispose()
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [quality, reducedMotion])

  if (failed) return <CoreFallback activity={activity} className={className} />

  return <div ref={mountRef} className={cx('pointer-events-none absolute inset-0', className)} aria-hidden="true" />
}

export function CoreFallback({ activity = 'idle', className }: { activity?: ActivityMode; className?: string }) {
  return (
    <div className={cx('pointer-events-none absolute inset-0 flex items-center justify-center', className)} aria-hidden="true">
      <div className="absolute inset-0 bg-dot opacity-[0.12] mask-radial" />
      <div className={cx('relative h-[48%] max-h-[340px] w-[38%] max-w-[300px]', activity !== 'idle' && 'animate-pulse-soft')}>
        <div className="glass-shard absolute inset-0" style={{ transform: 'rotate(-14deg) skewY(4deg)' }} />
        <div className="glass-shard absolute inset-x-[16%] inset-y-[12%]" style={{ transform: 'rotate(17deg) skewY(-6deg)' }} />
        <div className="glass-shard absolute inset-x-[32%] inset-y-[24%]" style={{ transform: 'rotate(44deg)' }} />
      </div>
    </div>
  )
}
