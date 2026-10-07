// トーナメント表（1対1の勝ち抜き戦）の組み合わせを作る
// 不戦勝はできるだけ少なくする：各回戦で人数が奇数のときだけ、1人が次の回戦へ不戦勝で進む
// 前の回戦で不戦勝だった人は、次の回戦では必ず試合をする位置（先頭）に置き、続けて不戦勝にならないようにする

export type Side = 'player1' | 'player2'

export type BracketMatch = {
  round: number // 1 から（その試合が行われる回戦）
  slot: number // その回戦の中の位置（0 から）
  player1: number | null // 参加者（tournament_entries.id）。前の試合の勝者が入る側は、決まるまで null
  player2: number | null
  next: { round: number; slot: number; side: Side } | null // 勝者の進み先（決勝は null）
}

// 0 以上 n 未満の乱数（偏りが出ないよう crypto を使う）
function randomInt(n: number): number {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / n) * n
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % n
}

// 配列をランダムに並べ替える（元の配列は変えない）
function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// その回戦に出る人：参加者そのもの、または前の試合の勝者
type Source = { entry: number } | { match: BracketMatch }

// 参加者をランダムに並べて、全試合を作る（2人以上。試合数は 参加者数 − 1）
export function buildBracket(entryIds: number[]): BracketMatch[] {
  const matches: BracketMatch[] = []
  let sources: Source[] = shuffle(entryIds).map((entry) => ({ entry }))
  for (let round = 1; sources.length > 1; round++) {
    const next: Source[] = []
    // 奇数なら最後の1人が不戦勝。次の回戦では先頭に置く
    if (sources.length % 2 === 1) next.push(sources[sources.length - 1])
    for (let slot = 0; slot < Math.floor(sources.length / 2); slot++) {
      const match: BracketMatch = { round, slot, player1: null, player2: null, next: null }
      const sides: [Side, Source][] = [
        ['player1', sources[slot * 2]],
        ['player2', sources[slot * 2 + 1]],
      ]
      for (const [side, source] of sides) {
        if ('entry' in source) match[side] = source.entry
        else source.match.next = { round, slot, side }
      }
      matches.push(match)
      next.push({ match })
    }
    sources = next
  }
  return matches
}
