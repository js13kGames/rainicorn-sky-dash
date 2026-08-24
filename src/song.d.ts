interface SongData {
  i: number[]
  p: (number | undefined)[]
  c: { n: (number | undefined)[], f: (number | undefined)[] }[]
}

interface Song {
  songData: SongData[]
  rowLen: number
  patternLen: number
  endPattern: number
  numChannels: number
}

export const song: Song
