import { GameLoop, Text, init, initKeys, keyPressed } from 'kontra'

const RAINBOW = ['#ff2d2d', '#ff8c00', '#ffd700', '#2ecc71', '#1e90ff', '#8b5cf6']
const BAND_SPACING = 9
const BAND_WIDTH = 8

const BASE_SPEED = 340
const MAX_SPEED_BONUS = 260
const GRAVITY = 2900
const JUMP_VELOCITY = -1000
const HERO_RADIUS = 14
const HERO_GROUND_GAP = 18

type Obstacle = { x: number; y: number; w: number; h: number; color: string }
type Pt = { x: number; y: number }
type Star = {
  x: number
  y: number
  r: number
  color: string
  alpha: number
  factor: number
  phase: number
}

const TRAIL_LENGTH = 500

const STAR_LAYERS = [
  { factor: 0.12, count: 45, rMin: 0.5, rMax: 1.1 },
  { factor: 0.28, count: 30, rMin: 0.8, rMax: 1.6 },
  { factor: 0.5, count: 18, rMin: 1.2, rMax: 2.2 },
]

export function startGame() {
  const canvasEl = document.getElementById('game') as HTMLCanvasElement
  canvasEl.width = window.innerWidth
  canvasEl.height = window.innerHeight

  const { canvas, context } = init('game')
  initKeys()

  const groundY = Math.floor(canvas.height * 0.72)
  const restY = groundY - HERO_GROUND_GAP

  const hero = {
    x: canvas.width / 2,
    y: restY,
    vy: 0,
    airborne: false,
    angle: 0,
  }

  let state: 'running' | 'over' = 'running'
  let speed = BASE_SPEED
  let distance = 0
  let scrollX = 0
  let spawnTimer = 1.2
  let colorIndex = 0
  let spaceWasDown = false

  const obstacles: Obstacle[] = []
  const trailPts: Pt[] = []

  const stars: Star[] = []
  for (const layer of STAR_LAYERS) {
    for (let i = 0; i < layer.count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * (groundY - 60),
        r: rand(layer.rMin, layer.rMax),
        color:
          Math.random() < 0.12
            ? RAINBOW[Math.floor(Math.random() * RAINBOW.length)]
            : '#ffffff',
        alpha: rand(0.3, 0.9),
        factor: layer.factor,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }
  let starScroll = 0

  const score = Text({
    text: '0 m',
    font: 'bold 20px system-ui, sans-serif',
    color: 'rgba(255, 255, 255, 0.85)',
    x: 20,
    y: 18,
  })

  const hint = Text({
    text: 'Press SPACE to jump',
    font: '14px system-ui, sans-serif',
    color: 'rgba(255, 255, 255, 0.6)',
    x: canvas.width / 2,
    y: canvas.height - 16,
    anchor: { x: 0.5, y: 1 },
  })

  const gameOverText = Text({
    text: 'Game Over - press SPACE to restart',
    font: 'bold 30px system-ui, sans-serif',
    color: '#ffffff',
    x: canvas.width / 2,
    y: canvas.height / 2 - 60,
    anchor: { x: 0.5, y: 0.5 },
  })

  function rand(min: number, max: number) {
    return min + Math.random() * (max - min)
  }

  function nextColor() {
    return RAINBOW[colorIndex++ % RAINBOW.length]
  }

  function spawnObstacle() {
    const x = canvas.width + 40
    if (Math.random() < 0.35) {
      const w = rand(24, 40)
      const h = rand(30, 46)
      obstacles.push({ x, y: groundY - h, w, h, color: nextColor() })
      if (Math.random() < 0.5) {
        const w2 = rand(24, 40)
        const h2 = rand(30, 46)
        obstacles.push({
          x: x + w + 14,
          y: groundY - h2,
          w: w2,
          h: h2,
          color: nextColor(),
        })
      }
    } else {
      const w = rand(16, 22)
      const h = rand(58, 86)
      obstacles.push({ x, y: groundY - h, w, h, color: nextColor() })
    }
  }

  function reset() {
    state = 'running'
    speed = BASE_SPEED
    distance = 0
    scrollX = 0
    spawnTimer = 1.2
    colorIndex = 0
    obstacles.length = 0
    hero.y = restY
    hero.vy = 0
    hero.airborne = false
    score.text = '0 m'
    trailPts.length = 0
  }

  function renderStars() {
    const t = performance.now() / 1000
    for (const s of stars) {
      const sx = (((s.x - starScroll * s.factor) % canvas.width) + canvas.width) % canvas.width
      context.globalAlpha = s.alpha * (0.72 + 0.28 * Math.sin(t * 2.4 + s.phase))
      context.fillStyle = s.color
      context.beginPath()
      context.arc(sx, s.y, s.r, 0, Math.PI * 2)
      context.fill()
    }
    context.globalAlpha = 1
  }

  function withAlpha(color: string, alpha: number) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  function drawTrail() {
    const n = trailPts.length
    if (n < 3) return

    const mid = (RAINBOW.length - 1) / 2
    const tailX = trailPts[0].x - distance
    const headX = trailPts[n - 1].x - distance

    context.save()
    context.beginPath()
    context.rect(0, 0, canvas.width, groundY)
    context.clip()
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (let i = 0; i < RAINBOW.length; i++) {
      const offset = (i - mid) * BAND_SPACING
      const grad = context.createLinearGradient(tailX, 0, headX, 0)
      grad.addColorStop(0, withAlpha(RAINBOW[i], 0))
      grad.addColorStop(1, withAlpha(RAINBOW[i], 1))
      context.strokeStyle = grad
      context.lineWidth = BAND_WIDTH

      const xs: number[] = []
      const ys: number[] = []
      for (let j = 0; j < n; j++) {
        const p = trailPts[j]
        const a = trailPts[Math.max(j - 1, 0)]
        const b = trailPts[Math.min(j + 1, n - 1)]
        let tx = b.x - a.x
        let ty = b.y - a.y
        const tl = Math.hypot(tx, ty)
        if (tl > 0.0001) {
          tx /= tl
          ty /= tl
        } else {
          tx = 1
          ty = 0
        }
        xs.push(p.x - distance - ty * offset)
        ys.push(p.y + tx * offset)
      }

      context.beginPath()
      context.moveTo(xs[0], ys[0])
      for (let j = 1; j < n - 1; j++) {
        context.quadraticCurveTo(xs[j], ys[j], (xs[j] + xs[j + 1]) / 2, (ys[j] + ys[j + 1]) / 2)
      }
      context.lineTo(xs[n - 1], ys[n - 1])
      context.stroke()
    }

    context.restore()
  }

  function renderPlayer() {
    context.save()
    context.translate(hero.x, hero.y)
    context.rotate(hero.angle)
    for (let i = 0; i < RAINBOW.length; i++) {
      context.beginPath()
      context.arc(0, 0, 16 - i * 1.5, 0, Math.PI * 2)
      context.strokeStyle = RAINBOW[i]
      context.lineWidth = 3
      context.stroke()
    }
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.moveTo(22, 0)
    context.lineTo(-10, -9)
    context.lineTo(-10, 9)
    context.closePath()
    context.fill()
    context.restore()
  }

  function renderGround() {
    context.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(0, groundY)
    context.lineTo(canvas.width, groundY)
    context.stroke()

    context.strokeStyle = 'rgba(255, 255, 255, 0.12)'
    context.lineWidth = 3
    const spacing = 90
    context.beginPath()
    for (let tx = -(scrollX % spacing); tx < canvas.width; tx += spacing) {
      context.moveTo(tx, groundY + 12)
      context.lineTo(tx + 26, groundY + 12)
    }
    context.stroke()
  }

  const loop = GameLoop({
    update(dtRaw: number) {
      const dt = Math.min(dtRaw, 1 / 30)
      const spaceDown = keyPressed('space')

      if (state === 'over') {
        if (spaceDown && !spaceWasDown) reset()
        spaceWasDown = spaceDown
        return
      }

      if (spaceDown && !spaceWasDown && !hero.airborne) {
        hero.vy = JUMP_VELOCITY
        hero.airborne = true
      }
      spaceWasDown = spaceDown

      speed = BASE_SPEED + Math.min(MAX_SPEED_BONUS, distance * 0.006)
      const dx = speed * dt

      if (hero.airborne) {
        hero.vy += GRAVITY * dt
        hero.y += hero.vy * dt
        if (hero.y >= restY) {
          hero.y = restY
          hero.vy = 0
          hero.airborne = false
        }
      }

      distance += dx
      scrollX += dx
      starScroll += dx
      score.text = `${Math.floor(distance / 10)} m`

      trailPts.push({ x: distance + hero.x, y: hero.y })
      while (trailPts.length > 2 && trailPts[trailPts.length - 1].x - trailPts[0].x > TRAIL_LENGTH) {
        trailPts.shift()
      }

      spawnTimer -= dt
      if (spawnTimer <= 0) {
        spawnObstacle()
        spawnTimer = rand(0.75, 1.45) * (BASE_SPEED / speed)
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i]
        o.x -= dx
        if (o.x + o.w < -20) obstacles.splice(i, 1)
      }

      for (const o of obstacles) {
        const nx = Math.max(o.x, Math.min(hero.x, o.x + o.w))
        const ny = Math.max(o.y, Math.min(hero.y, o.y + o.h))
        const ddx = hero.x - nx
        const ddy = hero.y - ny
        if (ddx * ddx + ddy * ddy < HERO_RADIUS * HERO_RADIUS) {
          state = 'over'
          break
        }
      }
    },
    render() {
      context.fillStyle = '#1b1035'
      context.fillRect(0, 0, canvas.width, canvas.height)

      renderStars()
      drawTrail()

      renderGround()
      for (const o of obstacles) {
        context.fillStyle = o.color
        context.fillRect(o.x, o.y, o.w, o.h)
      }

      renderPlayer()
      score.render()
      hint.render()
      if (state === 'over') gameOverText.render()
    },
  })

  loop.start()
}
