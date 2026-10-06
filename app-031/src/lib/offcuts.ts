// 余料领域共用规则：尺寸判据、判重键、旧存档兼容默认值。
// 全链路（余料页、清单页勾选、排样内核、结果页登记、本机存储）一律以这里为准。
import type { RegisteredOffcut } from '../types'
import boardsData from '../data/boards.json'

/** 可用余料门槛：两边都不小于该值（mm）才算可用，其余只作碎料。 */
export const OFFCUT_MIN_MM: number = boardsData.defaults.offcutMinMm

/**
 * 余料是否可再利用：长、宽两边都 ≥ 300mm（按毫米整数比较）。
 * 面积由调用方按 平方毫米（wMm*hMm）累加，展示时再 /1e6 折成平方米（保留 2 位）。
 */
export function isUsableOffcutSize(wMm: number, hMm: number): boolean {
  return wMm >= OFFCUT_MIN_MM && hMm >= OFFCUT_MIN_MM
}

/**
 * 同一张板上同一块余料的判重键：项目 + 板号（sheetIndex）+ 尺寸（毫米整数）。
 * 同键只允许登记一条，结果页重复点登记也不会产生第二条。
 */
export function offcutKey(
  jobId: string,
  sheetIndex: number,
  wMm: number,
  hMm: number
): string {
  return `${jobId}#${sheetIndex}#${Math.round(wMm)}x${Math.round(hMm)}`
}

/** 已登记余料的判重键（手工登记 sheetIndex = -1）。 */
export function registeredOffcutKey(o: RegisteredOffcut): string {
  return offcutKey(o.jobId, o.sheetIndex, o.wMm, o.hMm)
}

/**
 * 旧存档兼容：早先存下的余料可能缺少 available / usedByJobId / createdAt 等字段。
 * 缺可用状态时按「可用」接着用（登记本意就是留给后续单子消耗）。
 */
export function normalizeOffcut(raw: RegisteredOffcut): RegisteredOffcut {
  return {
    ...raw,
    wMm: Math.round(raw.wMm),
    hMm: Math.round(raw.hMm),
    thicknessMm: raw.thicknessMm ?? 0,
    material: raw.material ?? '',
    sheetIndex: Number.isFinite(raw.sheetIndex) ? raw.sheetIndex : -1,
    createdAt: raw.createdAt ?? 0,
    available: typeof raw.available === 'boolean' ? raw.available : true,
    usedByJobId: raw.usedByJobId
  }
}
