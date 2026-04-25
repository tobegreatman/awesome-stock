<template>
  <section class="panel-card glass-card">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">股票池</h2>
        <p class="panel-copy">输入股票代码即可更新观察列表，支持逗号、空格或换行分隔。</p>
      </div>
      <button class="control-button" type="button" @click="expanded = !expanded">
        {{ expanded ? '收起编辑' : '编辑代码' }}
      </button>
    </div>

    <div class="pool-chips">
      <span v-for="code in modelValue" :key="code" class="micro-chip">{{ code }}</span>
    </div>

    <div v-if="expanded">
      <div class="search-shell">
        <label class="sr-only" for="stock-search">搜索股票</label>
        <input
          id="stock-search"
          v-model.trim="searchQuery"
          class="search-input"
          type="text"
          placeholder="搜索股票代码或名称，例如 比亚迪 / 300750"
          aria-autocomplete="list"
          :aria-expanded="showSuggestionPanel ? 'true' : 'false'"
          @focus="handleSearchFocus"
          @blur="handleSearchBlur"
          @keydown.down.prevent="moveActiveSuggestion(1)"
          @keydown.up.prevent="moveActiveSuggestion(-1)"
          @keydown.enter.prevent="selectActiveSuggestion"
          @keydown.esc.prevent="dismissSuggestions"
        />
        <div v-if="showSuggestionPanel" class="suggestion-list">
          <div v-if="loadingSuggestions" class="subtle-note">搜索中…</div>
          <div v-else-if="suggestionError" class="subtle-note">{{ suggestionError }}</div>
          <button
            v-for="(item, index) in suggestions"
            :key="item.quoteId || item.code"
            class="suggestion-item"
            :class="{ 'is-active': index === activeSuggestionIndex }"
            type="button"
            @mousedown.prevent
            @mouseenter="activeSuggestionIndex = index"
            @click="appendCode(item.code)"
          >
            <span>
              <strong>{{ item.name }}</strong>
              <small>{{ item.market }}</small>
            </span>
            <span>{{ item.code }}</span>
          </button>
          <div v-if="!loadingSuggestions && !suggestionError && !suggestions.length" class="subtle-note">没有找到匹配股票。</div>
        </div>
        <p v-if="searchFeedback" class="search-feedback">{{ searchFeedback }}</p>
      </div>

      <textarea v-model="draft" class="pool-editor__box" spellcheck="false"></textarea>
      <p class="pool-editor__footnote">示例：600519, 000001, 300750</p>
      <div class="pool-editor__actions">
        <button class="pill-button--ghost" type="button" @click="resetDraft">重置</button>
        <button class="pill-button" type="button" @click="applyCodes">应用股票池</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getStockSuggestions } from '@/services/api'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['submit'])

const expanded = ref(false)
const draft = ref(props.modelValue.join(', '))
const searchQuery = ref('')
const suggestions = ref([])
const loadingSuggestions = ref(false)
const suggestionError = ref('')
const searchFeedback = ref('')
const activeSuggestionIndex = ref(-1)
const isSuggestionOpen = ref(false)
let searchTimer
let blurTimer
let suggestionRequestId = 0

const showSuggestionPanel = computed(() => {
  if (!isSuggestionOpen.value || searchQuery.value.trim().length < 2) {
    return false
  }

  return loadingSuggestions.value || Boolean(suggestionError.value) || suggestions.value.length >= 0
})

watch(
  () => props.modelValue,
  (next) => {
    draft.value = next.join(', ')
  },
  { deep: true },
)

watch(searchQuery, (nextQuery) => {
  clearTimeout(searchTimer)
  activeSuggestionIndex.value = -1

  if (nextQuery.trim()) {
    searchFeedback.value = ''
  }

  if (nextQuery.trim().length < 2) {
    suggestions.value = []
    loadingSuggestions.value = false
    suggestionError.value = ''
    isSuggestionOpen.value = false
    return
  }

  isSuggestionOpen.value = true

  searchTimer = setTimeout(async () => {
    const requestId = ++suggestionRequestId
    loadingSuggestions.value = true
    suggestionError.value = ''

    try {
      const payload = await getStockSuggestions(nextQuery)
      if (requestId !== suggestionRequestId) {
        return
      }

      suggestions.value = payload.items || []
      activeSuggestionIndex.value = suggestions.value.length ? 0 : -1
    } catch (error) {
      if (requestId === suggestionRequestId) {
        suggestions.value = []
        suggestionError.value = error.message || '搜索失败，请稍后重试'
      }
    } finally {
      if (requestId === suggestionRequestId) {
        loadingSuggestions.value = false
      }
    }
  }, 240)
})

function normalizeCodes(text) {
  const items = text
    .split(/[\s,;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  return [...new Set(items)].filter((item) => /^\d{5,6}$/.test(item)).slice(0, 12)
}

function applyCodes() {
  const parsed = normalizeCodes(draft.value)
  if (!parsed.length) {
    return
  }

  emit('submit', parsed)
  expanded.value = false
}

function resetDraft() {
  draft.value = props.modelValue.join(', ')
}

function appendCode(code) {
  const existingCodes = normalizeCodes(draft.value)
  if (existingCodes.includes(code)) {
    searchFeedback.value = `${code} 已在股票池中`
    searchQuery.value = ''
    dismissSuggestions()
    return
  }

  const parsed = normalizeCodes(`${draft.value}, ${code}`)
  draft.value = parsed.join(', ')
  searchQuery.value = ''
  searchFeedback.value = ''
  dismissSuggestions()
}

function handleSearchFocus() {
  if (searchQuery.value.trim().length >= 2) {
    isSuggestionOpen.value = true
  }
}

function handleSearchBlur() {
  clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    dismissSuggestions()
  }, 120)
}

function moveActiveSuggestion(step) {
  if (!suggestions.value.length) {
    return
  }

  isSuggestionOpen.value = true

  if (activeSuggestionIndex.value === -1) {
    activeSuggestionIndex.value = step > 0 ? 0 : suggestions.value.length - 1
    return
  }

  activeSuggestionIndex.value = (activeSuggestionIndex.value + step + suggestions.value.length) % suggestions.value.length
}

function selectActiveSuggestion() {
  if (!showSuggestionPanel.value || loadingSuggestions.value || !suggestions.value.length) {
    return
  }

  const target = suggestions.value[activeSuggestionIndex.value] || suggestions.value[0]
  if (target) {
    appendCode(target.code)
  }
}

function dismissSuggestions() {
  isSuggestionOpen.value = false
  activeSuggestionIndex.value = -1
}

onBeforeUnmount(() => {
  clearTimeout(searchTimer)
  clearTimeout(blurTimer)
})
</script>