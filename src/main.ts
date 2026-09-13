import './style.css'
import { startGame } from './game.ts'

const menu = document.getElementById('menu') as HTMLDivElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement

startBtn.addEventListener('click', () => {
  menu.style.display = 'none'
  startGame()
})