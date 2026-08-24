export class CPlayer {
  init(song: Song): void
  generate(): number
  createAudioBuffer(context: AudioContext): AudioBuffer
}
