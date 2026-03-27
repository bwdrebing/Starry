import { useEffect, useRef } from 'react'

const TINTS = [
  [220, 230, 255],
  [255, 245, 220],
  [255, 255, 255],
  [200, 220, 255],
]

class Star {
  constructor(W, H) {
    this.W = W
    this.H = H
    this.reset()
  }
  reset() {
    this.x = Math.random() * this.W
    this.y = Math.random() * this.H
    this.radius = Math.random() * 1.4 + 0.2
    this.baseAlpha = Math.random() * 0.6 + 0.3
    this.alpha = this.baseAlpha
    this.twinkleSpeed = Math.random() * 0.02 + 0.005
    this.twinkleOffset = Math.random() * Math.PI * 2
    this.color = TINTS[Math.floor(Math.random() * TINTS.length)]
  }
  update(t) {
    this.alpha = this.baseAlpha + Math.sin(t * this.twinkleSpeed + this.twinkleOffset) * 0.25
    this.alpha = Math.max(0.05, Math.min(1, this.alpha))
  }
  draw(ctx) {
    const [r, g, b] = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${r},${g},${b},${this.alpha})`
    ctx.fill()
  }
}

class ShootingStar {
  constructor(W, H, initial = false) {
    this.W = W
    this.H = H
    this.reset(initial)
  }
  reset(initial = false) {
    this.x = Math.random() * this.W * 1.5 - this.W * 0.25
    this.y = Math.random() * this.H * 0.5
    const angle = (Math.random() * 20 + 20) * Math.PI / 180
    const speed = Math.random() * 8 + 6
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.length = Math.random() * 80 + 60
    this.life = 1.0
    this.decay = Math.random() * 0.015 + 0.008
    this.delay = initial ? Math.random() * 300 : 0
  }
  update() {
    if (this.delay > 0) { this.delay--; return }
    this.x += this.vx
    this.y += this.vy
    this.life -= this.decay
    if (this.life <= 0) this.reset()
  }
  draw(ctx) {
    if (this.delay > 0 || this.life <= 0) return
    const tailX = this.x - this.vx * (this.length / 12)
    const tailY = this.y - this.vy * (this.length / 12)
    const grad = ctx.createLinearGradient(tailX, tailY, this.x, this.y)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(1, `rgba(255,255,255,${this.life * 0.9})`)
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(this.x, this.y)
    ctx.strokeStyle = grad
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function drawBackground(ctx, W, H) {
  const grad = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.5, Math.max(W, H))
  grad.addColorStop(0, '#0a0a1a')
  grad.addColorStop(0.4, '#050510')
  grad.addColorStop(1, '#000005')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  const neb = ctx.createRadialGradient(W * 0.3, H * 0.4, 0, W * 0.3, H * 0.4, W * 0.4)
  neb.addColorStop(0, 'rgba(30,20,80,0.15)')
  neb.addColorStop(0.5, 'rgba(10,5,40,0.08)')
  neb.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = neb
  ctx.fillRect(0, 0, W, H)

  const neb2 = ctx.createRadialGradient(W * 0.7, H * 0.6, 0, W * 0.7, H * 0.6, W * 0.35)
  neb2.addColorStop(0, 'rgba(20,40,80,0.12)')
  neb2.addColorStop(0.5, 'rgba(5,15,40,0.06)')
  neb2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = neb2
  ctx.fillRect(0, 0, W, H)
}

export default function StarryCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId
    let stars = []
    let shootingStars = []

    function init() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const W = canvas.width
      const H = canvas.height
      stars = Array.from({ length: 300 }, () => new Star(W, H))
      shootingStars = Array.from({ length: 5 }, () => new ShootingStar(W, H, true))
    }

    let t = 0
    function animate() {
      animId = requestAnimationFrame(animate)
      const W = canvas.width
      const H = canvas.height
      drawBackground(ctx, W, H)
      t++
      for (const s of stars) { s.update(t); s.draw(ctx) }
      for (const ss of shootingStars) { ss.update(); ss.draw(ctx) }
    }

    function onResize() {
      init()
    }

    init()
    animate()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '1rem',
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        fontFamily: 'Georgia, serif',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        Starry
      </div>
    </>
  )
}
