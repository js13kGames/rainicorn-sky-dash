import unicornSheet from './assets/unicorn.png?url&no-inline'

const RAINBOW = ['#ff2d2d', '#ff8c00', '#ffd700', '#2ecc71', '#1e90ff', '#8b5cf6']
const BAND_SPACING = 9
const BAND_WIDTH = 8

const RUN_SPEED = 420
const SPRITE = new Image()
SPRITE.src = unicornSheet
const SPRITE_SIZE = 32
const SPRITE_SCALE = 4
const RUN_FRAME_START = 0
const RUN_FRAME_COUNT = 4
const JUMP_FRAME_START = 4
const JUMP_FRAME_COUNT = 6
const IDLE_FRAME = 10
const GROUND_FRAME = 12
const CROSSHAIR_FRAME = 11
const PLATFORM_FRAME = 13
const PLATFORM_SOLID_FRAME = 14
const PLATFORM_HIT_H = 14 * SPRITE_SCALE

const GRAVITY = 2900
const JUMP_VELOCITY = -1000
const JUMP_DURATION = (2 * Math.abs(JUMP_VELOCITY)) / GRAVITY
const GAME_DURATION = 15
const HERO_RADIUS = 14
const UNICORN_FOOT_OFFSET = 40

type Platform = { x: number; y: number; w: number; h: number; solid: number }
type TrailPt = { x: number; y: number; age: number }
type Projectile = { x: number; y: number; vx: number; vy: number; life: number }
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string }
type Star = {
  x: number
  y: number
  r: number
  color: string
  alpha: number
  factor: number
  phase: number
}

const TRAIL_LIFETIME = 1.6

const STAR_LAYERS = [
  { factor: 0.12, count: 45, rMin: 0.5, rMax: 1.1 },
  { factor: 0.28, count: 30, rMin: 0.8, rMax: 1.6 },
  { factor: 0.5, count: 18, rMin: 1.2, rMax: 2.2 },
]

export function startGame() {
  const canvas = document.getElementById('game') as HTMLCanvasElement
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  canvas.style.cursor = 'none'

  const context = canvas.getContext('2d')!

  // --- AUDIO API SETUP ---
  let audioCtx: AudioContext | null = null

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
  }

  function playSound(type: OscillatorType, startFreq: number, endFreq: number, duration: number, vol: number) {
    if (!audioCtx) return
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)

    osc.type = type
    const now = audioCtx.currentTime
    osc.frequency.setValueAtTime(startFreq, now)
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration)
    
    gain.gain.setValueAtTime(vol, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration) // Äänen voimakkuus hiipuu nopeasti

    osc.start(now)
    osc.stop(now + duration)
  }
  // -----------------------

  let keys = new Set<string>()
  let mouseDown = false
  let mouseX = canvas.width / 2
  let mouseY = canvas.height / 2
  
  addEventListener('keydown', (e) => {
    initAudio() // Selaimet vaativat käyttäjän interaktion ennen äänen toistamista
    keys.add(e.code)
    if (e.code === 'KeyW' || e.code === 'ArrowUp') e.preventDefault()
  })
  addEventListener('keyup', (e) => {
    keys.delete(e.code)
  })
  addEventListener('blur', () => {
    keys.clear()
    mouseDown = false
  })

  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX
    mouseY = e.clientY
  })
  canvas.addEventListener('mousedown', (e) => {
    initAudio() // Äänet sallitaan myös hiiren painalluksesta
    if (e.button === 0) mouseDown = true
  })
  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false
  })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  const groundY = Math.floor(canvas.height * 0.72)
  const restY = groundY - UNICORN_FOOT_OFFSET

  const hero = {
    x: canvas.width / 2,
    y: restY,
    vx: 0,
    vy: 0,
    airborne: false,
    facing: 1,
  }

  let state: 'running' | 'over' = 'running'
  let distance = 0
  let score = 0
  let timeLeft = GAME_DURATION
  let scrollX = 0
  let wWasDown = false
  let animTime = 0
  let airTime = 0

  const platforms: Platform[] = []
  const trailPts: TrailPt[] = []
  const projectiles: Projectile[] = []
  const particles: Particle[] = []
  
  const layerYs: number[] = []
  let rightCursors: number[] = []
  let leftCursors: number[] = []
  const LAYER_SPACING_Y = 140
  
  for (let y = groundY - LAYER_SPACING_Y; y >= 90; y -= LAYER_SPACING_Y) {
    layerYs.push(y)
  }
  if (layerYs.length === 0) layerYs.push(groundY - 140)

  seedPlatforms()
  
  let shootCooldown = 0
  const SHOOT_INTERVAL = 0.18
  const PROJECTILE_SPEED = 650
  const PROJECTILE_RADIUS = 5

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

  function rand(min: number, max: number) {
    return min + Math.random() * (max - min)
  }

  function spawnLedge(x: number, y: number, count: number) {
    const size = SPRITE_SIZE * SPRITE_SCALE
    for (let i = 0; i < count; i++) {
      platforms.push({ x: x + i * size, y, w: size, h: size, solid: 0 })
    }
  }

  function spawnPlatformGroup() {
    const size = SPRITE_SIZE * SPRITE_SCALE
    for (let i = 0; i < layerYs.length; i++) {
      if (rightCursors[i] < scrollX + canvas.width + 800) {
        if (Math.random() < 0.85) {
          const gap = rand(-40, 160)
          const startX = rightCursors[i] + gap
          const count = 1 + Math.floor(Math.random() * 4)
          spawnLedge(startX, layerYs[i], count)
          rightCursors[i] = startX + count * size
        } else {
          rightCursors[i] += rand(200, 450)
        }
      }
    }
  }

  function spawnPlatformGroupLeft() {
    const size = SPRITE_SIZE * SPRITE_SCALE
    for (let i = 0; i < layerYs.length; i++) {
      if (leftCursors[i] > scrollX - 800) {
        if (Math.random() < 0.85) {
          const gap = rand(-40, 160)
          const count = 1 + Math.floor(Math.random() * 4)
          const startX = leftCursors[i] - gap - (count * size)
          spawnLedge(startX, layerYs[i], count)
          leftCursors[i] = startX
        } else {
          leftCursors[i] -= rand(200, 450)
        }
      }
    }
  }

  function seedPlatforms() {
    const startX = -800
    rightCursors = layerYs.map(() => startX)
    leftCursors = layerYs.map(() => startX)

    while (Math.min(...rightCursors) < canvas.width + 800) {
      spawnPlatformGroup()
    }
  }

  function reset() {
    state = 'running'
    distance = 0
    score = 0
    timeLeft = GAME_DURATION
    scrollX = 0
    platforms.length = 0
    seedPlatforms()
    projectiles.length = 0
    particles.length = 0
    shootCooldown = 0
    hero.x = canvas.width / 2
    hero.y = restY
    hero.vx = 0
    hero.vy = 0
    hero.airborne = false
    hero.facing = 1
    wWasDown = false
    animTime = 0
    airTime = 0
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
    const pts = trailPts
    const n = pts.length
    if (n < 2) return

    const mid = (RAINBOW.length - 1) / 2

    context.save()
    context.beginPath()
    context.rect(0, 0, canvas.width, groundY)
    context.clip()
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (let i = 0; i < RAINBOW.length; i++) {
      const offset = (i - mid) * BAND_SPACING
      context.lineWidth = BAND_WIDTH

      const xs: number[] = []
      const ys: number[] = []
      for (let j = 0; j < n; j++) {
        const p = pts[j]
        const a = pts[Math.max(j - 1, 0)]
        const b = pts[Math.min(j + 1, n - 1)]
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
        xs.push(p.x - ty * offset)
        ys.push(p.y + tx * offset)
      }

      for (let j = 0; j < n - 1; j++) {
        const age = Math.max(pts[j].age, pts[j + 1].age)
        const alpha = Math.max(0, 1 - age / TRAIL_LIFETIME)
        context.strokeStyle = withAlpha(RAINBOW[i], alpha)
        context.beginPath()
        context.moveTo(xs[j], ys[j])
        context.lineTo(xs[j + 1], ys[j + 1])
        context.stroke()
      }
    }

    context.restore()
  }

  function renderPlayer() {
    const scale = SPRITE_SIZE * SPRITE_SCALE
    const half = scale / 2
    context.save()
    context.translate(hero.x, hero.y)
    if (hero.facing < 0) context.scale(-1, 1)
    let frame = IDLE_FRAME
    if (hero.airborne) {
      const p = Math.min(1, airTime / JUMP_DURATION)
      frame =
        JUMP_FRAME_START + Math.round(p * (JUMP_FRAME_COUNT - 1))
    } else if (hero.vx !== 0) {
      const speedBoost = Math.min(1, Math.abs(hero.vx) / RUN_SPEED) * 6
      frame =
        RUN_FRAME_START +
        (Math.floor(animTime * (9 + speedBoost)) % RUN_FRAME_COUNT)
    }
    context.drawImage(
      SPRITE,
      frame * SPRITE_SIZE,
      0,
      SPRITE_SIZE,
      SPRITE_SIZE,
      -half,
      -half,
      scale,
      scale,
    )
    context.restore()
  }

  function renderCrosshair() {
    context.save()
    context.translate(mouseX, mouseY)
    context.drawImage(
      SPRITE,
      CROSSHAIR_FRAME * SPRITE_SIZE,
      0,
      SPRITE_SIZE,
      SPRITE_SIZE,
      -SPRITE_SIZE / 2,
      -SPRITE_SIZE / 2,
      SPRITE_SIZE,
      SPRITE_SIZE,
    )
    context.restore()
  }

  function renderGround() {
    const tile = SPRITE_SIZE * SPRITE_SCALE
    const startX = -(((scrollX % tile) + tile) % tile)
    const cols = Math.ceil(canvas.width / tile) + 1
    for (let c = 0; c < cols; c++) {
      context.drawImage(
        SPRITE,
        GROUND_FRAME * SPRITE_SIZE,
        0,
        SPRITE_SIZE,
        SPRITE_SIZE,
        startX + c * tile,
        groundY,
        tile,
        tile,
      )
    }
  }

  function drawHud() {
    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.font = 'bold 20px system-ui, sans-serif'
    context.fillStyle = 'rgba(255, 255, 255, 0.85)'
    context.fillText(`${Math.floor(distance / 10)} m`, 20, 18)
    context.font = 'bold 16px system-ui, sans-serif'
    context.fillStyle = 'rgba(255, 200, 60, 0.9)'
    context.fillText(`\u2726 ${score}`, 20, 44)

    context.textAlign = 'center'
    context.textBaseline = 'top'
    const barW = 260
    const barH = 10
    const barX = canvas.width / 2 - barW / 2
    const barY = 16
    const frac = Math.max(0, Math.min(1, timeLeft / GAME_DURATION))
    context.beginPath()
    context.roundRect(barX, barY, barW, barH, barH / 2)
    context.fillStyle = 'rgba(255, 255, 255, 0.18)'
    context.fill()
    if (frac > 0) {
      const grad = context.createLinearGradient(barX, 0, barX + barW, 0)
      if (hero.y >= restY) {
        grad.addColorStop(0, '#ff2d2d')
        grad.addColorStop(1, '#ff8c00')
      } else {
        for (let c = 0; c < RAINBOW.length; c++) {
          grad.addColorStop(c / (RAINBOW.length - 1), RAINBOW[c])
        }
      }
      context.beginPath()
      context.roundRect(barX, barY, Math.max(barH, barW * frac), barH, barH / 2)
      context.fillStyle = grad
      context.fill()
    }

    context.textAlign = 'center'
    context.textBaseline = 'alphabetic'
    context.font = '14px system-ui, sans-serif'
    context.fillStyle = 'rgba(255, 255, 255, 0.6)'
    context.fillText('W jump \u00b7 A/D move \u00b7 Click shoot', canvas.width / 2, canvas.height - 16)

    if (state === 'over') {
      context.font = 'bold 34px system-ui, sans-serif'
      context.fillStyle = '#ffffff'
      context.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 88)
      context.font = 'bold 24px system-ui, sans-serif'
      context.fillStyle = 'rgba(255, 200, 60, 0.95)'
      context.fillText(`Your score: ${score}`, canvas.width / 2, canvas.height / 2 - 38)
      context.font = 'bold 22px system-ui, sans-serif'
      context.fillStyle = 'rgba(255, 255, 255, 0.85)'
      context.fillText(`Distance: ${Math.floor(distance / 10)} m`, canvas.width / 2, canvas.height / 2 + 2)
      context.font = '16px system-ui, sans-serif'
      context.fillStyle = 'rgba(255, 255, 255, 0.7)'
      context.fillText('Press Space to restart', canvas.width / 2, canvas.height / 2 + 44)
    }
  }

  function update(dt: number) {
    if (state === 'over') {
      if (keys.has('Space') && !wWasDown) reset()
      return
    }

    timeLeft -= dt
    if (timeLeft <= 0) {
      timeLeft = 0
      state = 'over'
      return
    }

    const wDown = keys.has('KeyW') || keys.has('ArrowUp')
    const aDown = keys.has('KeyA') || keys.has('ArrowLeft')
    const dDown = keys.has('KeyD') || keys.has('ArrowRight')

    const runSpeed = RUN_SPEED
    const targetVx = (dDown ? runSpeed : 0) - (aDown ? runSpeed : 0)
    if (hero.airborne) {
      const airControl = 2.5
      hero.vx += (targetVx - hero.vx) * Math.min(1, airControl * dt)
    } else {
      hero.vx = targetVx
    }
    if (hero.vx > 0) hero.facing = 1
    if (hero.vx < 0) hero.facing = -1

    if (wDown && !wWasDown && !hero.airborne) {
      hero.vy = JUMP_VELOCITY
      hero.airborne = true
      airTime = 0
      // Soitetaan hyppy-ääni (matalasta korkeaan 'boing')
      playSound('sine', 300, 700, 0.2, 0.2)
    }
    wWasDown = wDown

    const aimDx = mouseX - hero.x
    const aimDy = mouseY - hero.y

    shootCooldown -= dt
    if (mouseDown && shootCooldown <= 0) {
      shootCooldown = SHOOT_INTERVAL
      const a = Math.atan2(aimDy, aimDx)
      projectiles.push({
        x: hero.x,
        y: hero.y,
        vx: Math.cos(a) * PROJECTILE_SPEED,
        vy: Math.sin(a) * PROJECTILE_SPEED,
        life: 1.2,
      })
      // Soitetaan ammuksen ääni (korkeasta matalaan 'pew')
      playSound('square', 800, 150, 0.1, 0.05)
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      if (p.life <= 0) { projectiles.splice(i, 1); continue }

      for (let k = platforms.length - 1; k >= 0; k--) {
        const pl = platforms[k]
        const sxp = pl.x - scrollX
        const cx = Math.max(sxp, Math.min(p.x, sxp + pl.w))
        const cy = Math.max(pl.y, Math.min(p.y, pl.y + PLATFORM_HIT_H))
        const ddx = p.x - cx
        const ddy = p.y - cy
        if (ddx * ddx + ddy * ddy < PROJECTILE_RADIUS * PROJECTILE_RADIUS) {
          // Vain koskemattomia tasoja (0) voi ampua
          if (pl.solid === 0) {
            // Soitetaan osumaääni tasoon osuessa
            playSound('sawtooth', 150, 40, 0.15, 0.1)

            score += 10
            timeLeft += 1.5 
            pl.solid = 4.0 
            for (let b = 0; b < 14; b++) {
              const a = Math.random() * Math.PI * 2
              const sp = rand(80, 220)
              particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                life: rand(0.3, 0.7),
                color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)],
              })
            }
          }
          projectiles.splice(i, 1)
          break
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 400 * dt
      p.life -= dt
      if (p.life <= 0) particles.splice(i, 1)
    }

    const prevX = hero.x
    const half = 24
    hero.x = Math.max(half, Math.min(canvas.width - half, hero.x + hero.vx * dt))
    const dx = hero.x - prevX

    if (hero.airborne) {
      airTime += dt
      hero.vy += GRAVITY * dt
      const prevY = hero.y
      hero.y += hero.vy * dt

      for (const pl of platforms) {
        if (pl.solid <= 0) continue
        const standY = pl.y - UNICORN_FOOT_OFFSET
        const sxp = pl.x - scrollX
        const overX =
          hero.x + HERO_RADIUS >= sxp && hero.x - HERO_RADIUS <= sxp + pl.w
        const crossing =
          (prevY <= standY && hero.y >= standY) ||
          (prevY > standY && hero.y <= standY)
        if (overX && crossing) {
          hero.y = standY
          hero.vy = 0
          hero.airborne = false
          break
        }
      }

      if (hero.y >= restY) {
        hero.y = restY
        hero.vy = 0
        hero.airborne = false
      }
    } else {
      let supported = hero.y >= restY
      if (!supported) {
        for (const pl of platforms) {
          if (
            pl.solid > 0 &&
            Math.abs(hero.y - (pl.y - UNICORN_FOOT_OFFSET)) < 1 &&
            hero.x + HERO_RADIUS >= pl.x - scrollX &&
            hero.x - HERO_RADIUS <= pl.x - scrollX + pl.w
          ) {
            supported = true
            break
          }
        }
      }
      if (!supported) {
        hero.airborne = true
        hero.vy = 0
        airTime = 0
      } else if (hero.y >= restY) {
        timeLeft -= dt * 4 
      }
    }

    distance += Math.abs(dx)
    scrollX += dx
    starScroll += dx
    animTime += dt

    for (const tp of trailPts) tp.age += dt

    const lastPt = trailPts[trailPts.length - 1]
    if (!lastPt || Math.hypot(hero.x - lastPt.x, hero.y - lastPt.y) > 3) {
      trailPts.push({ x: hero.x, y: hero.y, age: 0 })
    }
    while (trailPts.length > 0 && trailPts[0].age > TRAIL_LIFETIME) trailPts.shift()

    while (Math.min(...rightCursors) < scrollX + canvas.width + 800) {
      spawnPlatformGroup()
    }
    while (Math.max(...leftCursors) > scrollX - 800) {
      spawnPlatformGroupLeft()
    }

    // Päivitetään tasojen ajastimia TAI TUHOTaan ne lopullisesti
    for (let i = platforms.length - 1; i >= 0; i--) {
      const pl = platforms[i]
      if (pl.solid > 0) {
        pl.solid -= dt
        if (pl.solid <= 0) {
          platforms.splice(i, 1) // Taso katoaa lopullisesti, tyhjyys jää!
          continue
        }
      }
      const sx = pl.x - scrollX
      if (sx + pl.w < -1000 || sx > canvas.width + 1000) platforms.splice(i, 1)
    }
  }

  function render() {
    context.fillStyle = '#1b1035'
    context.fillRect(0, 0, canvas.width, canvas.height)

    renderStars()
    drawTrail()

    renderGround()
    for (const pl of platforms) {
      const isBlinking = pl.solid > 0 && pl.solid < 1 && Math.floor(pl.solid * 15) % 2 === 0
      const frame = (pl.solid > 0 && !isBlinking) ? PLATFORM_SOLID_FRAME : PLATFORM_FRAME
      
      context.drawImage(
        SPRITE,
        frame * SPRITE_SIZE,
        0,
        SPRITE_SIZE,
        SPRITE_SIZE,
        pl.x - scrollX,
        pl.y,
        pl.w,
        pl.h,
      )
    }

    for (const p of projectiles) {
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.arc(p.x, p.y, 4, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = 'rgba(255, 200, 60, 0.5)'
      context.beginPath()
      context.arc(p.x, p.y, 7, 0, Math.PI * 2)
      context.fill()
    }

    for (const p of particles) {
      context.globalAlpha = Math.max(0, p.life * 2)
      context.fillStyle = p.color
      context.beginPath()
      context.arc(p.x, p.y, 3, 0, Math.PI * 2)
      context.fill()
    }
    context.globalAlpha = 1

    renderPlayer()
    renderCrosshair()
    drawHud()
  }

  let last = performance.now()
  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    update(dt)
    render()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
