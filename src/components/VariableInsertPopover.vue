<!--
 * @Author: cyc
 * @Date: 2026-09-10 16:04:07
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 变量插入气泡面板
-->

<template>
  <!-- 变量表可用性由接入点在 append 槽位级守卫（v-if 提升到父级）；
       本组件仅在 adapter 已注入但列表未就绪/为空时展示空态 -->
  <Poptip v-model="open" placement="bottom-end" width="272" transfer class="var-insert-pop">
    <div
      class="vip-trigger"
      :class="{ 'is-disabled': disabled || previewing }"
      :title="$t('variable.insert_variable')"
    >
      <Icon type="md-code-working" size="22" />
    </div>
    <template #content>
      <div class="vip-panel">
        <div class="vip-search">
          <Input
            v-model="keyword"
            size="small"
            prefix="ios-search"
            :placeholder="$t('variable.search_placeholder')"
            @keydown.native.up.prevent="moveActive(-1)"
            @keydown.native.down.prevent="moveActive(1)"
            @keydown.native.enter.prevent="chooseActive"
            @keydown.native.esc.stop="close"
          />
        </div>
        <div class="vip-list">
          <div
            v-for="(item, idx) in visibleItems"
            :key="item.path"
            class="vip-item"
            :class="{ 'is-active': idx === activeIndex }"
            @mouseenter="activeIndex = idx"
            @click="choose(item)"
          >
            <div class="vip-item-main">
              <span class="vip-item-label" :title="item.description || item.label">
                {{ item.label }}
                <i v-if="item.required" class="vip-req">*</i>
              </span>
              <Tag :color="typeColor(item.type)">{{ typeName(item.type) }}</Tag>
            </div>
            <div class="vip-item-path">{{ item.path }}</div>
          </div>
          <div v-if="filtered.length === 0" class="vip-empty">
            {{ $t('variable.no_match') }}
          </div>
          <div v-if="truncated" class="vip-more">{{ $t('variable.max_list_tip') }}</div>
        </div>
      </div>
    </template>
  </Poptip>
</template>

<script>
import { ref, computed, watch, inject, onMounted } from '@vue/composition-api';
import { useI18n } from '@/hooks/useI18n';
import useTestData from '@/hooks/useTestData';

const MAX_VISIBLE = 50;

const TYPE_NAMES = {
  text: 'variable.type_text',
  image: 'variable.type_image',
  qrcode: 'variable.type_qrcode',
  barcode: 'variable.type_barcode',
};
const TYPE_COLORS = { text: 'blue', image: 'green', qrcode: 'geekblue', barcode: 'orange' };

/**
 * 变量插入下拉（Poptip）：按 type 严格过滤展示变量表，选中后仅 emit，不含任何写入逻辑。
 * - schema 未注入（无 adapter 且会话表为空）时不渲染触发器（零侵入）
 * - 预览态自动禁用；schema 懒加载（adapter 场景挂载时幂等拉取）
 */
export default {
  name: 'VariableInsertPopover',
  props: {
    /** 严格类型过滤：'text' | 'image' | 'qrcode' | 'barcode' */
    filterType: { type: String, default: '' },
    /** 外部禁用（如业务自定义场景） */
    disabled: { type: Boolean, default: false },
  },
  setup(props, { emit }) {
    const { t } = useI18n();
    const canvasEditor = inject('canvasEditor');
    const { schema, schemaLoading, ensureSchemaLoaded } = useTestData();

    const open = ref(false);
    const keyword = ref('');
    const activeIndex = ref(0);
    const previewing = ref(!!(canvasEditor.isPreviewing && canvasEditor.isPreviewing()));
    const hasAdapter = ref(!!(canvasEditor.getSchemaAdapter && canvasEditor.getSchemaAdapter()));

    // 预览态禁用
    canvasEditor.on &&
      canvasEditor.on('variable:previewChange', (val) => {
        previewing.value = val;
      });

    // adapter 场景懒加载（幂等，多实例共享同一 Promise）
    onMounted(() => {
      if (hasAdapter.value) ensureSchemaLoaded();
    });

    // 按 filterType 严格过滤 + 关键字模糊过滤（label / path / description）
    const filtered = computed(() => {
      const kw = keyword.value.trim().toLowerCase();
      return schema.value.filter((def) => {
        if (props.filterType && def.type !== props.filterType) return false;
        if (!kw) return true;
        return (
          (def.label || '').toLowerCase().includes(kw) ||
          (def.path || '').toLowerCase().includes(kw) ||
          (def.description || '').toLowerCase().includes(kw)
        );
      });
    });
    const visibleItems = computed(() => filtered.value.slice(0, MAX_VISIBLE));
    const truncated = computed(() => filtered.value.length > MAX_VISIBLE);

    watch(open, (val) => {
      if (val) {
        keyword.value = '';
        activeIndex.value = 0;
      }
    });

    const moveActive = (delta) => {
      const total = visibleItems.value.length;
      if (!total) return;
      activeIndex.value = (activeIndex.value + delta + total) % total;
    };
    const chooseActive = () => {
      const item = visibleItems.value[activeIndex.value];
      if (item) choose(item);
    };
    const choose = (item) => {
      if (props.disabled || previewing.value) return;
      emit('select', item.path);
      close();
    };
    const close = () => {
      open.value = false;
    };

    const typeName = (type) => t(TYPE_NAMES[type] || 'variable.type_text');
    const typeColor = (type) => TYPE_COLORS[type] || 'default';

    return {
      open,
      keyword,
      activeIndex,
      previewing,
      schemaLoading,
      filtered,
      visibleItems,
      truncated,
      moveActive,
      chooseActive,
      choose,
      close,
      typeName,
      typeColor,
    };
  },
};
</script>

<style lang="less" scoped>
.var-insert-pop {
  display: inline-flex;
  vertical-align: middle;
}
.vip-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 24px;
  cursor: pointer;
  color: #808695;
  transition: color 0.2s;

  &:hover {
    color: #2d8cf0;
  }
  &.is-disabled {
    color: #c5c8ce;
    cursor: not-allowed;
  }
}
.vip-panel {
  .vip-search {
    padding-bottom: 6px;
    border-bottom: 1px solid #e8eaec;
  }
  .vip-list {
    max-height: 240px;
    overflow-y: auto;
  }
  .vip-item {
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;

    &.is-active {
      background: #f3f8ff;
    }
  }
  .vip-item-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .vip-item-label {
    font-size: 13px;
    color: #515a6e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vip-req {
    color: #ed4014;
    font-style: normal;
    margin-left: 2px;
  }
  .vip-item-path {
    font-family: monospace;
    font-size: 12px;
    color: #2d8cf0;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vip-empty {
    padding: 16px 0;
    text-align: center;
    font-size: 12px;
    color: #808695;
  }
  .vip-more {
    padding: 6px 8px;
    font-size: 12px;
    color: #c5c8ce;
    text-align: center;
  }
}
</style>
