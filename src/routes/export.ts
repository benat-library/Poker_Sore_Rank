import type { Context } from 'hono'
import type { AppEnv } from '../types'
import { errorJson, parseId } from '../lib/http'

// CSVの1項目を整形する（カンマ・改行・ダブルクォートを含む場合は囲んでエスケープする）
function csvField(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

// Excelで開いたときに数式として実行されないよう、先頭が = + - @ などの文字列には ' を付ける
function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

type ScoreRow = {
  id: number
  user_name: string
  discord_id: string | null
  amount: number
  played_on: string
  created_at: string
  final_chips: number | null
  rebuys: number | null
}

// ランキングの全スコアをCSV（UTF-8 BOM付き）で返す
export async function exportCsv(c: Context<AppEnv>) {
  const id = parseId(c.req.param('id') ?? '')
  if (id === null) return errorJson(c, 400, 'ランキングIDが正しくありません')

  // DBとの往復を1回にするため、存在確認とスコア取得をまとめて送る
  const [ranking, scores] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id FROM rankings WHERE id = ? AND deleted_at IS NULL').bind(id),
    c.env.DB.prepare(
      `SELECT id, user_name, discord_id, amount, played_on, created_at, final_chips, rebuys FROM scores
       WHERE ranking_id = ? AND deleted_at IS NULL ORDER BY played_on, id`
    ).bind(id),
  ])
  if (ranking.results.length === 0) return errorJson(c, 404, 'ランキングが見つかりません')
  const results = scores.results as ScoreRow[]

  const lines = [
    'id,user_name,amount,played_on,created_at,final_chips,rebuys,discord_id',
    ...results.map((r) =>
      [r.id, csvField(safeText(r.user_name)), r.amount, r.played_on, r.created_at, r.final_chips ?? '', r.rebuys ?? '', r.discord_id ?? ''].join(',')
    ),
  ]
  // 先頭の ﻿ がBOM（Excelで日本語が文字化けしないようにする）。改行はExcelに合わせて CRLF
  const body = '﻿' + lines.join('\r\n') + '\r\n'

  return c.body(body, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="ranking-${id}.csv"`,
    'Cache-Control': 'no-store',
  })
}
