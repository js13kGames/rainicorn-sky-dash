import { CPlayer } from './player-small.js'
import { song } from './song.js'

let audioContext: AudioContext | null = null
let songSource: AudioBufferSourceNode | null = null

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }
  return audioContext
}

export function playSong(onProgress?: (progress: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioContext()

    const player = new CPlayer()
    player.init(song)

    function generateChunk() {
      const progress = player.generate()
      if (onProgress) onProgress(progress)
      if (progress >= 1) {
        const buffer = player.createAudioBuffer(ctx)

        if (songSource) {
          songSource.stop()
        }

        songSource = ctx.createBufferSource()
        songSource.buffer = buffer
        songSource.loop = true
        songSource.connect(ctx.destination)
        songSource.start()
        resolve()
        return
      }
      requestAnimationFrame(generateChunk)
    }

    generateChunk()
  })
}
