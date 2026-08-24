import './style.css'
import { playSong } from './audio.ts'
import { startGame } from './game.ts'

const menu = document.getElementById('menu') as HTMLDivElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const progress = document.getElementById('progress') as HTMLDivElement
const progressFill = document.getElementById('progress-fill') as HTMLDivElement

startBtn.addEventListener('click', async () => {
  startBtn.style.display = 'none'
  progress.style.display = 'flex'

  await playSong((p) => {
    progressFill.style.width = `${Math.round(p * 100)}%`
  })

  menu.style.display = 'none'
  startGame()
})
