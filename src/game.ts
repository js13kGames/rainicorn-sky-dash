import { GameLoop, Text, init, initKeys, keyPressed } from 'kontra'

const RAINBOW = ['#ff2d2d', '#ff8c00', '#ffd700', '#2ecc71', '#1e90ff', '#8b5cf6']
const BAND_SPACING = 9
const BAND_WIDTH = 8

export function startGame() {
  const canvasEl = document.getElementById('game') as HTMLCanvasElement
  canvasEl.width = window.innerWidth
  canvasEl.height = window.innerHeight

  const { canvas, context } = init('game')
  initKeys()

  const SPEED = 260
  const TURN_RATE = 3.4

  const offscreen = document.createElement('canvas')
  offscreen.width = canvas.width
  offscreen.height = canvas.height
  const offCtx = offscreen.getContext('2d')

  if (!offCtx) return
  const paint = offCtx

  paint.lineCap = 'round'
  paint.lineJoin = 'round'

  const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    angle: -Math.PI / 2,
  }

  let prevX = player.x
  let prevY = player.y
  let wrapped = false

  const hint = Text({
    text: 'Hold A to turn left, D to turn right',
    font: '14px system-ui, sans-serif',
    color: 'rgba(255, 255, 255, 0.6)',
    x: canvas.width / 2,
    y: canvas.height - 16,
    anchor: { x: 0.5, y: 1 },
  })

  function paintBands() {
    if (wrapped || (player.x === prevX && player.y === prevY)) return

    const nx = -Math.sin(player.angle)
    const ny = Math.cos(player.angle)
    const mid = (RAINBOW.length - 1) / 2

    for (let i = 0; i < RAINBOW.length; i++) {
      const offset = (i - mid) * BAND_SPACING
      paint.strokeStyle = RAINBOW[i]
      paint.lineWidth = BAND_WIDTH
      paint.beginPath()
      paint.moveTo(prevX + nx * offset, prevY + ny * offset)
      paint.lineTo(player.x + nx * offset, player.y + ny * offset)
      paint.stroke()
    }
  }

  function renderPlayer() {
    context.save()
    context.translate(player.x, player.y)
    context.rotate(player.angle)
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

  const loop = GameLoop({
    update(dt: number) {
      if (keyPressed('a')) player.angle -= TURN_RATE * dt
      if (keyPressed('d')) player.angle += TURN_RATE * dt

      player.x += Math.cos(player.angle) * SPEED * dt
      player.y += Math.sin(player.angle) * SPEED * dt

      wrapped = false
      if (player.x < 0) {
        player.x += canvas.width
        wrapped = true
      } else if (player.x > canvas.width) {
        player.x -= canvas.width
        wrapped = true
      }
      if (player.y < 0) {
        player.y += canvas.height
        wrapped = true
      } else if (player.y > canvas.height) {
        player.y -= canvas.height
        wrapped = true
      }

      if (wrapped) {
        prevX = player.x
        prevY = player.y
      }
    },
    render() {
      paint.fillStyle = 'rgba(27, 16, 53, 0.02)'
      paint.fillRect(0, 0, offscreen.width, offscreen.height)

      paintBands()
      prevX = player.x
      prevY = player.y

      context.fillStyle = '#1b1035'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(offscreen, 0, 0)

      renderPlayer()
      hint.render()
    },
  })

  loop.start()
}
