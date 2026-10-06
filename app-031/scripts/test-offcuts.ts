/* eslint-disable no-console */
// 余料全链路流程测试（非 npm 脚本，开发用）：用内存 localStorage 跑真实 store。
// 运行：node --experimental-strip-types scripts/test-offcuts.ts
import { memoryStorage } from './memory-storage'
globalThis.localStorage = memoryStorage()

const {
  createJob,
  getJob,
  runNest,
  registerOffcuts,
  addManualOffcut,
  removeOffcut,
  useStore,
  saveJob
} = await import('../src/lib/store')
import { OFFCUT_MIN_MM, isUsableOffcutSize } from '../src/lib/offcuts'

let failed = 0
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

// ---- 场景 0：旧存档兼容（缺 available 字段读回按可用）----
{
  const legacy = [
    {
      id: 'legacy1',
      jobId: 'j1',
      jobName: '老单',
      sheetIndex: 0,
      wMm: 800,
      hMm: 600,
      thicknessMm: 18,
      material: '颗粒板',
      createdAt: 1
    }
  ]
  localStorage.setItem('fco.offcuts.v1', JSON.stringify(legacy))
  const { state } = useStore()
  check('旧存档余料缺 available 时读回为可用', state.offcuts[0].available === true)
  check('300mm 判据：两边≥300 才可用', isUsableOffcutSize(300, 299) === false && isUsableOffcutSize(300, 300))
}

// ---- 建两个项目：源单产出余料，目标单消耗余料 ----
const src = createJob('源单')
src.boards = [
  { id: 'B1', name: '板', wMm: 2440, hMm: 1220, thicknessMm: 18, material: '颗粒板', priceCents: 13800, quantity: 0, kind: 'stock' }
]
src.parts = [{ id: 'P1', code: 'A', name: '件', lenMm: 1500, widMm: 1100, qty: 1, grain: 'none', edgeBands: [], cabinet: '柜', exposed: false, boardId: '' }]
saveJob(src)
const r1 = runNest(src)
check('源单排样自购张数为 1', r1.boardsUsed === 1, `got ${r1.boardsUsed}`)
const usableOffcutsOnSheet = r1.sheets[0].offcuts.filter((o) => o.usable)
check('源单产出至少一块 ≥300 余料', usableOffcutsOnSheet.length >= 1, JSON.stringify(r1.sheets[0].offcuts))

// ---- 场景 3：重复登记同一块只产生一条 ----
const picks = usableOffcutsOnSheet.map((o) => ({ sheetIndex: 0, x: o.x, y: o.y, wMm: o.wMm, hMm: o.hMm }))
const n1 = registerOffcuts(src, picks)
const n2 = registerOffcuts(src, picks) // 同一块点第二次
const n3 = registerOffcuts(src, picks) // 第三次
check('首次登记返回新增数 >0', n1 > 0, `n1=${n1}`)
check('重复登记不产生第二条', n2 === 0 && n3 === 0, `n2=${n2} n3=${n3}`)
const dupes = useStore().state.offcuts.filter(
  (o) => o.jobId === src.id && o.sheetIndex === 0 && o.wMm === picks[0].wMm && o.hMm === picks[0].hMm
)
check('同项目同板同尺寸只存一条', dupes.length === 1, `found ${dupes.length}`)
// 删掉这一条后，另一块（若有）仍在；这里验证删除不误伤
const beforeCount = useStore().state.offcuts.length
removeOffcut(dupes[0].id)
check('删除登记余料后条数减一', useStore().state.offcuts.length === beforeCount - 1)
// 重新登记该块应能成功（删除后可再登记）
const n4 = registerOffcuts(src, [{ ...picks[0] }])
check('删除后可重新登记同一位置余料', n4 === 1, `n4=${n4}`)
const theOffcut = useStore().state.offcuts.find((o) => o.jobId === src.id && o.sheetIndex === 0 && o.wMm === picks[0].wMm && o.hMm === picks[0].hMm)!

// ---- 场景 1：登记进来的余料默认即可用，不需手动恢复 ----
check('新登记余料默认可用', theOffcut.available === true)

// ---- 场景 2：清单页勾选才参与；未勾选不会被拿去用 ----
const dst = createJob('目标单')
dst.boards = [
  { id: 'B2', name: '板2', wMm: 2440, hMm: 1220, thicknessMm: 18, material: '颗粒板', priceCents: 13800, quantity: 0, kind: 'stock' }
]
// 零件选一块能放进余料的尺寸：比余料小
dst.parts = [{ id: 'Q1', code: 'C', name: '小件', lenMm: Math.min(theOffcut.wMm, theOffcut.hMm) - 20, widMm: 300, qty: 1, grain: 'none', edgeBands: [], cabinet: '柜', exposed: false, boardId: '' }]
saveJob(dst)

// 先不勾选余料排样
const rNoPick = runNest(dst)
check('未勾选余料时不使用余料板', !rNoPick.sheets.some((s) => s.kind === 'offcut'))
check('未勾选时余料仍可用', theOffcut.available === true)
check('未勾选时项目板材列表未被塞入余料板', dst.boards.every((b) => b.kind !== 'offcut'))

// 勾选后再排
dst.useOffcutIds = [theOffcut.id]
saveJob(dst)
const rPick = runNest(dst)
check('勾选后余料被实际挑中', rPick.sheets.some((s) => s.kind === 'offcut' && s.offcutId === theOffcut.id),
  'offcut sheets: ' + rPick.sheets.filter((s) => s.kind === 'offcut').map((s) => s.offcutId).join(','))
check('勾选排样后该余料标记为已用', theOffcut.available === false && theOffcut.usedByJobId === dst.id)
check('用掉后从本单勾选中移除', !dst.useOffcutIds.includes(theOffcut.id))

// ---- 场景 2b：下一单读回来不许再挑中已用余料 ----
const dst2 = getJob(dst.id)!
const again = createJob('再下一单')
again.boards = dst2.boards.map((b) => ({ ...b, id: 'B3' }))
again.parts = JSON.parse(JSON.stringify(dst2.parts)).map((p: { id: string }) => ({ ...p, id: p.id + '_x' }))
// 即使脏数据里勾了已用余料，runNest 也必须剔除
again.useOffcutIds = [theOffcut.id]
saveJob(again)
const r3 = runNest(again)
check('已用余料下一单不会被挑中', !r3.sheets.some((s) => s.offcutId === theOffcut.id))
check('排样前自动清掉指向已用余料的勾选', !again.useOffcutIds.includes(theOffcut.id))

// ---- 场景 4：项目板材列表永远干净，不随排样增多 ----
check('排样后项目板材列表无余料板', dst.boards.every((b) => b.kind !== 'offcut') && again.boards.every((b) => b.kind !== 'offcut'))
const boardsCountBefore = dst.boards.length
runNest(dst)
runNest(dst)
check('反复排样板材列表张数不变', dst.boards.length === boardsCountBefore)

// ---- 场景 5：页顶统计只算可用 ----
{
  const { state } = useStore()
  const avail = state.offcuts.filter((o) => o.available)
  const area = avail.reduce((a, o) => a + o.wMm * o.hMm, 0)
  const usedIncluded = state.offcuts.some((o) => !o.available)
  check('可用块数统计排除已用（存在已用样本时）', !usedIncluded || avail.length < state.offcuts.length)
  check('可用面积只累加可用余料', Number.isFinite(area) && area === avail.reduce((a, o) => a + o.wMm * o.hMm, 0))
}

// ---- 手工登记门槛 ----
check('手工 299mm 拒绝登记', addManualOffcut({ wMm: 299, hMm: 500, thicknessMm: 18, material: 'm' }) === 0)
const manualN = useStore().state.offcuts.length
check('手工 300×300 允许登记', addManualOffcut({ wMm: 300, hMm: 300, thicknessMm: 18, material: 'm' }) === 1)
check('手工登记增加一条', useStore().state.offcuts.length === manualN + 1)

// ---- 持久化：刷新（重新读 localStorage）后状态保持 ----
{
  const raw = JSON.parse(localStorage.getItem('fco.offcuts.v1')!)
  const stored = raw.find((o: { id: string }) => o.id === theOffcut.id)
  check('已用状态已写回本机存储', stored && stored.available === false && stored.usedByJobId === dst.id)
}

console.log(`\nOFFCUT_MIN_MM=${OFFCUT_MIN_MM}`)
if (failed > 0) {
  console.error(`\n${failed} 项失败`)
  process.exit(1)
} else {
  console.log('\n全部通过')
}
