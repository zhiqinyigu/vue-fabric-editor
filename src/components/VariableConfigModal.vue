<!--
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 变量配置弹窗
-->

<template>
  <Modal v-model="visible" :title="$t('variable.title')" width="600" :styles="{ top: '80px' }">
    <div class="variable-config">
      <!-- ① 变量包裹符配置 -->
      <Divider plain orientation="left" class="var-divider">
        <span class="var-section-title">{{ $t('variable.delimiter_title') }}</span>
      </Divider>
      <div class="delimiter-row">
        <div class="delimiter-field">
          <span class="delimiter-label">{{ $t('variable.start') }}</span>
          <Input v-model="start" :placeholder="'{{'" size="small" />
        </div>
        <div class="delimiter-field">
          <span class="delimiter-label">{{ $t('variable.end') }}</span>
          <Input v-model="end" :placeholder="'}}'" size="small" />
        </div>
        <Button size="small" type="primary" ghost @click="applyDelimiter">
          {{ $t('variable.apply') }}
        </Button>
      </div>
      <div class="delimiter-example">
        {{ $t('variable.example') }}：{{ start }}user.name{{ end }}　·　&lt;%= user.name %&gt;
      </div>
      <div v-if="delimiterChanged" class="delimiter-warn">
        <Icon type="ios-alert" size="14" />
        {{ $t('variable.delimiter_changed') }}
      </div>

      <!-- ② 测试数据映射表（预览模式下隐藏，避免展示"暂无变量"等编辑态内容） -->
      <template v-if="!previewing">
        <Divider plain orientation="left" class="var-divider">
          <span class="var-section-title">{{ $t('variable.testdata_title') }}</span>
        </Divider>
        <div v-if="variables.length === 0" class="no-variable">
          {{ $t('variable.no_variable') }}
        </div>
        <Table
          v-else
          :columns="columns"
          :data="rows"
          size="small"
          :no-data-text="$t('variable.no_variable')"
        >
          <template slot="path" slot-scope="{ row }">
            <span class="var-path">{{ row.path }}</span>
          </template>
          <template slot="value" slot-scope="{ row }">
            <Input
              :value="row.value"
              size="small"
              :placeholder="$t('variable.input_test_value')"
              @on-change="(e) => onValueChange(row.path, e.target.value)"
            />
          </template>
        </Table>
      </template>

      <!-- 预览控制 -->
      <div class="preview-actions">
        <div v-if="previewing" class="preview-tag">
          <Icon type="ios-eye" size="14" />
          {{ $t('variable.previewing') }}
        </div>
        <div class="preview-btns">
          <Button
            v-if="!previewing"
            type="primary"
            :disabled="variables.length === 0"
            @click="doEnterPreview"
          >
            {{ $t('variable.preview') }}
          </Button>
          <Button v-else type="warning" @click="doExitPreview">
            {{ $t('variable.restore') }}
          </Button>
        </div>
      </div>
    </div>
    <template #footer>
      <Button @click="visible = false">{{ $t('variable.close') }}</Button>
    </template>
  </Modal>
</template>

<script>
import { computed, ref, watch } from '@vue/composition-api';
import { useI18n } from '@/hooks/useI18n';
import useTestData from '@/hooks/useTestData';

export default {
  name: 'VariableConfigModal',
  props: {
    value: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const { t } = useI18n();
    const {
      delimiter,
      variables,
      testData,
      previewing,
      refreshVariables,
      setDelimiter,
      updateTestData,
      enterPreview,
      exitPreview,
    } = useTestData();

    const visible = computed({
      get: () => props.value,
      set: (val) => emit('input', val),
    });

    const start = ref(delimiter.value.start);
    const end = ref(delimiter.value.end);
    const delimiterChanged = ref(false);

    watch(
      () => props.value,
      (val) => {
        if (val) {
          start.value = delimiter.value.start;
          end.value = delimiter.value.end;
          delimiterChanged.value = false;
          refreshVariables();
        }
      }
    );

    const applyDelimiter = () => {
      setDelimiter({ start: start.value, end: end.value });
      // 包裹符变更后映射表已重新收集，短暂提示
      delimiterChanged.value = true;
      window.setTimeout(() => {
        delimiterChanged.value = false;
      }, 3000);
    };
    const onValueChange = (path, value) => {
      updateTestData(path, value);
    };
    const doEnterPreview = () => {
      enterPreview();
      // 预览时关闭模态框，露出画布查看真实数据渲染效果；
      // 退出预览入口在属性面板"变量配置"区域（attributeVariable.vue）
      visible.value = false;
    };
    const doExitPreview = () => exitPreview();

    const columns = [
      { title: t('variable.variable'), slot: 'path', key: 'path', minWidth: 120 },
      { title: t('variable.test_value'), slot: 'value', key: 'value', minWidth: 160 },
    ];
    const rows = computed(() =>
      variables.value.map((path) => ({
        path,
        value: testData.value[path] !== undefined ? testData.value[path] : '',
      }))
    );

    return {
      visible,
      start,
      end,
      delimiterChanged,
      variables,
      previewing,
      rows,
      columns,
      applyDelimiter,
      onValueChange,
      doEnterPreview,
      doExitPreview,
    };
  },
};
</script>

<style lang="less" scoped>
.variable-config {
  .var-divider {
    margin: 8px 0;
  }
  .var-section-title {
    font-weight: 600;
    font-size: 14px;
    color: #333;
  }
  .delimiter-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .delimiter-field {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }
  .delimiter-label {
    color: #808695;
    font-size: 13px;
    white-space: nowrap;
  }
  .delimiter-example {
    margin-top: 8px;
    font-size: 12px;
    color: #808695;
    background: #f6f7f9;
    border-radius: 4px;
    padding: 6px 10px;
  }
  .delimiter-warn {
    margin-top: 8px;
    font-size: 12px;
    color: #ed4014;
  }
  .no-variable {
    padding: 16px 0;
    text-align: center;
    color: #808695;
    font-size: 13px;
    background: #fafafa;
    border-radius: 4px;
  }
  .var-path {
    font-family: monospace;
    color: #2d8cf0;
    font-size: 13px;
  }
  .preview-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
  }
  .preview-tag {
    color: #ff9900;
    font-size: 13px;
  }
}
</style>
