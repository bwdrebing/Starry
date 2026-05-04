import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getHankin3DTriangles } from './hankin'

export default function PyramidCanvas({
  shapes,
  theta, delta, peakHeight,
  parquetDirection, thetaMin, thetaMax,
  parquetFunction, linearAngle,
  centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale,
}) {
  const containerRef = useRef(null)
  const threeRef = useRef(null)

  // Boot Three.js scene once on mount
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth || 800
    const H = container.clientHeight || 600

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050510)

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 50000)
    camera.position.set(0, -550, 420)
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.target.set(0, 0, 0)
    controls.minDistance = 50
    controls.maxDistance = 8000

    // Lighting — ambient fill + two directional sources
    scene.add(new THREE.AmbientLight(0x1a1a40, 3))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(200, -400, 600)
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0x5070ff, 0.8)
    rim.position.set(-300, 300, 100)
    scene.add(rim)

    threeRef.current = { scene, camera, renderer, controls }

    let animId
    const animate = () => {
      animId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    ro.observe(container)

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, [])

  // Rebuild pyramid mesh whenever shapes or parameters change
  useEffect(() => {
    const three = threeRef.current
    if (!three || !shapes || shapes.length === 0) return
    const { scene } = three

    const old = scene.getObjectByName('pyramids')
    if (old) { old.geometry.dispose(); old.material.dispose(); scene.remove(old) }

    const triangles = getHankin3DTriangles(
      shapes, theta, delta, peakHeight,
      parquetDirection, thetaMin, thetaMax,
      parquetFunction, 0, 1,
      linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale,
    )
    if (triangles.length === 0) return

    const positions = []
    const normals   = []
    const colors    = []

    const ph = Math.max(peakHeight, 1)

    const vertColor = z => {
      const t = Math.max(0, Math.min(1, z / ph))
      // dark indigo at z=0 → bright blue-white at z=peakHeight
      return [0.04 + t * 0.56, 0.08 + t * 0.72, 0.28 + t * 0.65]
    }

    for (const [A, B, C] of triangles) {
      // Canvas coords → Three.js: flip Y axis
      const ax = A[0], ay = -A[1], az = A[2]
      const bx = B[0], by = -B[1], bz = B[2]
      const cx = C[0], cy = -C[1], cz = C[2]

      positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)

      // Flat face normal via cross product
      const ux = bx - ax, uy = by - ay, uz = bz - az
      const vx = cx - ax, vy = cy - ay, vz = cz - az
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      normals.push(nx / nl, ny / nl, nz / nl, nx / nl, ny / nl, nz / nl, nx / nl, ny / nl, nz / nl)

      colors.push(...vertColor(A[2]), ...vertColor(B[2]), ...vertColor(C[2]))
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3))
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3))

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 90,
      specular: new THREE.Color(0.25, 0.35, 0.6),
    })

    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = 'pyramids'
    scene.add(mesh)
  }, [shapes, theta, delta, peakHeight, parquetDirection, thetaMin, thetaMax,
      parquetFunction, linearAngle, centerX, centerY, ellipseAngle, ellipseMajorScale, ellipseMinorScale])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
}
