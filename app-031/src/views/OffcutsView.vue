<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useStore, removeOffcut, toggleOffcut, addManualOffcut } from '../lib/store'
import { toast } from '../lib/ui'
import { OFFCUT_MIN_MM } from '../lib/offcuts'

const { state } = useStore()
const showForm = ref(false)
const form = reactive({ wMm: 800, hMm: 500, thicknessMm: 18, material: '颗粒板' })

const sorted = computed(() =>
  [...state.offcuts].sort((a, b) => Number(b.available) - Number(a.available) || b.createdAt - a.createdAt)
)
// 页顶两项只累加「当前仍可用」的余料；已用掉的不计
const availableOffcuts = computed(() => state.offcuts.filter((o) => o.available))
const availCount = computed(() => availableOffcuts.value.length)
// 面积按平方毫米（整数 mm × mm）累加，再 /1e6 折成平方米
const availAreaMm2 = computed(() =>
  availableOffcuts.value.reduce((a, o) => a + o.wMm * o.hMm, 0)
)

function add(): void {
  if (form.wMm < OFFCUT_MIN_MM || form.hMm < OFFCUT_MIN_MM) {
    toast(`可用余料要求两边都不小于 ${OFFCUT_MIN_MM}mm`, 'bad')
    return
  }
  const n = addManualOffcut({ ...form })
  if (!n) {
    toast(`可用余料要求两边都不小于 ${OFFCUT_MIN_MM}mm`, 'bad')
    return
  }
  toast('余料已登记', 'good')
  showForm.value = false
}
function del(id: string): void {
  removeOffcut(id)
  toast('已删除')
}
</script>

<template>
  <div>
    <section class="panel head">
      <div>
        <h1 style="font-size: 19px">余料登记与再利用</h1>
        <p class="muted" style="margin: 6px 0 0">
          当前 {{ availCount }} 块可用，合计 {{ (availAreaMm2 / 1e6).toFixed(2) }}m²
          （尺寸取毫米整数，面积按平方毫米累加再折平方米、保留 2 位；已用掉的不计入）。
          仅两边都 ≥{{ OFFCUT_MIN_MM }}mm 的才为可用余料；在零件清单页勾选后，余料会作为小板材仅参与该单排样。
        </p>
      </div>
      <div class="spacer" />
      <button class="primary" @click="showForm = !showForm">＋ 手工登记余料</button>
    </section>

    <section v-if="showForm" class="panel form-box">
      <div class="row wrap" style="align-items: flex-end">
        <label class="field" style="width: 120px"><span>长 (mm)</span><input v-model.number="form.wMm" type="number" /></label>
        <label class="field" style="width: 120px"><span>宽 (mm)</span><input v-model.number="form.hMm" type="number" /></label>
        <label class="field" style="width: 120px"><span>厚度 (mm)</span><input v-model.number="form.thicknessMm" type="number" /></label>
        <label class="field" style="width: 160px"><span>材质</span><input v-model="form.material" /></label>
        <button class="primary" @click="add">保存</button>
      </div>
      <p class="small muted">
        手工余料一般来自其他批次/测量得到的剩余板；开料产生的余料在排样页一键登记。
        登记要求两边都 ≥{{ OFFCUT_MIN_MM }}mm（长、宽单位 mm，取整数）。
      </p>
    </section>

    <section class="panel" style="margin-top: 14px">
      <table class="grid">
        <thead>
          <tr>
            <th>状态</th><th>尺寸(mm)</th><th>厚度/材质</th><th>面积</th>
            <th>来源</th><th>登记时间</th><th style="width: 150px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in sorted" :key="o.id" :class="{ used: !o.available }">
            <td>
              <span :class="['tag', o.available ? 'good' : '']">{{ o.available ? '可优先使用' : '已用掉' }}</span>
            </td>
            <td><b>{{ o.wMm }}×{{ o.hMm }}</b></td>
            <td>{{ o.thicknessMm }}mm {{ o.material }}</td>
            <td>{{ (o.wMm * o.hMm / 1e6).toFixed(2) }}m²</td>
            <td>{{ o.jobName }}（第 {{ o.sheetIndex + 1 }} 张）</td>
            <td>{{ new Date(o.createdAt).toLocaleDateString('zh-CN') }}</td>
            <td>
              <button class="sm" @click="toggleOffcut(o.id)">{{ o.available ? '标记已用' : '恢复可用' }}</button>
              <button class="sm ghost-danger" @click="del(o.id)">删除</button>
            </td>
          </tr>
          <tr v-if="sorted.length === 0">
            <td colspan="7" class="muted" style="text-align: center; padding: 26px">
              还没有登记余料。完成排样后，在排样结果页把 ≥300×300mm 的余料登记进来。
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.form-box {
  margin-top: 14px;
}
tr.used {
  opacity: 0.55;
}
</style>
