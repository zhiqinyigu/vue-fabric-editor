<!--
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 变量配置弹窗
-->

<template>
  <div class="variable-config-root">
    <Modal
      v-model="visible"
      :title="$t('variable.title')"
      width="1180"
      :styles="{ top: '80px', 'max-width': '95%' }"
    >
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

        <template v-if="!previewing">
          <!-- ② 变量表（单表：定义展示 + 测试值填写） -->
          <Divider plain orientation="left" class="var-divider">
            <span class="var-section-title">{{ $t('variable.schema_title') }}</span>
          </Divider>
          <div v-if="noSchemaHint" class="no-schema-hint">
            {{ $t('variable.schema_no_schema_hint') }}
          </div>
          <div v-if="schemaEmptyWarn" class="schema-warn">
            <Icon type="ios-alert" size="14" />
            {{ $t('variable.schema_empty_fail') }}
          </div>
          <div v-if="unknownList.length" class="unknown-summary">
            <Icon type="ios-warning" size="14" />
            {{ $t('variable.schema_unknown_title') }}（{{ unknownList.length }}）
            <Button type="text" size="small" @click="openBatch">
              {{ $t('variable.batch_create') }}
            </Button>
          </div>
          <Table
            class="variable-table"
            :columns="schemaColumns"
            :data="tableRows"
            size="small"
            :loading="schemaLoading"
            :row-class-name="rowClassName"
            :span-method="spanMethod"
            :no-data-text="$t('variable.no_variable')"
            @on-row-click="onRowClick"
          >
            <template slot="variable" slot-scope="{ row }">
              <div v-if="row.kind === 'toggle'" class="toggle-cell">
                <Icon :type="unusedExpanded ? 'ios-arrow-up' : 'ios-arrow-down'" size="14" />
                <span v-if="!unusedExpanded">
                  {{ $t('variable.group_unused') }}（{{ row.count }}）
                </span>
                <span v-else>{{ $t('variable.collapse') }}</span>
              </div>
              <div v-else class="var-cell">
                <div v-if="row.label && row.label !== row.path" class="var-cell-label">
                  {{ row.label }}
                </div>
                <div class="var-cell-path" :class="{ 'is-unknown': row.kind === 'unknown' }">
                  {{ row.path }}
                </div>
              </div>
            </template>
            <template slot="type" slot-scope="{ row }">
              <Tag :color="typeColor(row.type)">{{ typeName(row.type) }}</Tag>
            </template>
            <!-- 默认值仅展示；编辑入口在新建/编辑表单（支持多行文本） -->
            <template slot="defaultValue" slot-scope="{ row }">
              <span class="default-text" :class="{ 'is-empty': !row.defaultValue }">
                {{ row.defaultValue || '-' }}
              </span>
            </template>
            <template slot="testValue" slot-scope="{ row }">
              <Input
                class="cell-test-input"
                :value="testData[row.path] !== undefined ? testData[row.path] : ''"
                size="small"
                :placeholder="$t('variable.form_example_placeholder')"
                @on-change="(e) => onValueChange(row.path, e.target.value)"
                @keydown.native.tab="onTestValueKeydown"
              />
            </template>
            <template slot="action" slot-scope="{ row }">
              <Button
                v-if="row.kind === 'def'"
                type="text"
                size="small"
                class="action-icon-btn"
                :title="$t('variable.edit')"
                @click="openEdit(row)"
              >
                <Icon type="ios-create-outline" size="20" />
              </Button>
              <Button
                v-if="row.kind === 'def' && !row.imported"
                type="text"
                size="small"
                class="action-icon-btn danger-btn"
                :title="$t('variable.delete')"
                @click="onDelete(row)"
              >
                <Icon type="md-close" size="20" />
              </Button>
              <Button
                v-if="row.kind === 'unknown'"
                type="text"
                size="small"
                class="action-icon-btn"
                :title="$t('variable.adopt')"
                @click="adopt(row)"
              >
                <Icon type="ios-add-circle" size="20" />
              </Button>
            </template>
          </Table>
          <div class="schema-actions">
            <Button size="small" @click="openCreate">
              {{ $t('variable.new_variable') }}
            </Button>
            <Button size="small" @click="openBatch">
              {{ $t('variable.batch_create') }}
            </Button>
            <Button size="small" @click="doExportClipboard">
              {{ $t('variable.export_clipboard') }}
            </Button>
            <Button
              v-if="canSave"
              size="small"
              type="primary"
              :loading="saving"
              @click="doSaveSchema"
            >
              {{ $t('variable.save_schema') }}
            </Button>
            <Button v-else size="small" @click="doExportSchema">
              {{ $t('variable.export_schema') }}
            </Button>
          </div>
        </template>

        <!-- ③ 预览控制：移至 Modal footer（与关闭按钮同区） -->
      </div>
      <template #footer>
        <div class="modal-footer-bar">
          <div class="footer-left">
            <div v-if="previewing" class="preview-tag">
              <Icon type="ios-eye" size="14" />
              {{ $t('variable.previewing') }}
            </div>
          </div>
          <div class="footer-right">
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
            <Button @click="visible = false">{{ $t('variable.close') }}</Button>
          </div>
        </div>
      </template>
    </Modal>

    <!-- 新建 / 编辑 / 收编 表单 -->
    <Modal v-model="formVisible" :title="formTitle" width="480" :styles="{ top: '100px' }">
      <Form :label-width="80">
        <FormItem :label="$t('variable.form_path')" required>
          <Input v-model="form.path" :disabled="formMode !== 'create'" placeholder="course.name" />
          <div v-if="formMode !== 'create'" class="form-tip">
            {{ $t('variable.form_path_locked') }}
          </div>
        </FormItem>
        <FormItem :label="$t('variable.form_label')" required>
          <Input v-model="form.label" :placeholder="$t('variable.form_label')" />
        </FormItem>
        <FormItem :label="$t('variable.form_type')">
          <Select v-model="form.type">
            <Option value="text">{{ $t('variable.type_text') }}</Option>
            <Option value="image">{{ $t('variable.type_image') }}</Option>
            <Option value="qrcode">{{ $t('variable.type_qrcode') }}</Option>
            <Option value="barcode">{{ $t('variable.type_barcode') }}</Option>
          </Select>
        </FormItem>
        <FormItem :label="$t('variable.form_example')">
          <Input v-model="form.example" :placeholder="$t('variable.form_example_placeholder')" />
        </FormItem>
        <FormItem :label="$t('variable.form_default')">
          <Input
            v-model="form.defaultValue"
            type="textarea"
            :rows="2"
            :placeholder="$t('variable.default_value_tip')"
          />
        </FormItem>
        <FormItem :label="$t('variable.form_desc')">
          <Input v-model="form.description" type="textarea" :rows="2" />
        </FormItem>
      </Form>
      <template #footer>
        <Button @click="formVisible = false">{{ $t('variable.close') }}</Button>
        <Button type="primary" :loading="saving" @click="submitForm">
          {{ $t('variable.apply') }}
        </Button>
      </template>
    </Modal>

    <!-- 批量创建：每行一条（path[,名称[,预览值]]）或直接粘贴导出的变量表 JSON，实时解析预览 -->
    <Modal
      v-model="batchVisible"
      :title="$t('variable.batch_create')"
      width="520"
      :styles="{ top: '100px' }"
    >
      <div class="batch-form">
        <div class="batch-toolbar">
          <div class="batch-type-row">
            <span class="batch-type-label">{{ $t('variable.batch_type') }}</span>
            <Select v-model="batchType" size="small" style="width: 140px">
              <Option value="text">{{ $t('variable.type_text') }}</Option>
              <Option value="image">{{ $t('variable.type_image') }}</Option>
              <Option value="qrcode">{{ $t('variable.type_qrcode') }}</Option>
              <Option value="barcode">{{ $t('variable.type_barcode') }}</Option>
            </Select>
          </div>
        </div>
        <div class="batch-hint">{{ $t('variable.batch_hint') }}</div>
        <Input
          v-model="batchText"
          type="textarea"
          :rows="7"
          :placeholder="$t('variable.batch_placeholder')"
        />
        <div v-if="parsedRows.length" class="batch-preview">
          <div class="batch-summary">
            <span class="batch-summary-ok">
              <Icon type="ios-checkmark-circle" size="14" />
              {{ $t('variable.batch_summary_ok', { n: batchOkCount }) }}
            </span>
            <span v-if="parsedRows.length - batchOkCount > 0" class="batch-summary-dup">
              <Icon type="ios-close-circle" size="14" />
              {{ $t('variable.batch_summary_dup', { m: parsedRows.length - batchOkCount }) }}
            </span>
          </div>
          <div
            v-for="(r, i) in parsedRows"
            :key="r.path + '-' + i"
            class="batch-row"
            :class="{ 'is-dup': r.dup }"
          >
            <Icon
              :type="r.dup ? 'ios-close-circle' : 'ios-checkmark-circle'"
              size="14"
              class="batch-row-icon"
              :class="{ 'is-dup': r.dup }"
            />
            <span class="var-path">{{ r.path }}</span>
            <span class="batch-row-label">{{ r.label || '-' }}</span>
            <span v-if="r.example" class="batch-row-example">{{ r.example }}</span>
            <span v-if="r.dup" class="batch-dup-text">{{ $t('variable.batch_dup_skip') }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <Button @click="batchVisible = false">{{ $t('variable.close') }}</Button>
        <Button
          type="primary"
          :loading="saving"
          :disabled="batchOkCount === 0"
          @click="submitBatch"
        >
          {{ $t('variable.batch_btn', { n: batchOkCount }) }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<script>
import { computed, reactive, ref, watch, inject } from '@vue/composition-api';
import { Message, Modal } from 'view-design';
import { useI18n } from '@/hooks/useI18n';
import useTestData from '@/hooks/useTestData';
import { mergeVariableSchema, validateVariableDef } from '@/core/variableSchema';

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
    const canvasEditor = inject('canvasEditor');
    const {
      delimiter,
      variables,
      testData,
      previewing,
      schema,
      schemaLoading,
      refreshVariables,
      setDelimiter,
      updateTestData,
      enterPreview,
      exitPreview,
      ensureSchemaLoaded,
      addCustomVariable,
      updateCustomVariable,
      removeCustomVariable,
      saveSchema,
      exportSchema,
      isImportedVariable,
    } = useTestData();

    const visible = computed({
      get: () => props.value,
      set: (val) => emit('input', val),
    });

    const start = ref(delimiter.value.start);
    const end = ref(delimiter.value.end);
    const delimiterChanged = ref(false);

    /* ---------- 变量表（单表：定义 + 测试值） ---------- */
    // 画布扫描快照：弹窗打开时收集（弹窗期间画布不可编辑，无需监听变更）
    const entries = ref([]);
    const refreshEntries = () => {
      entries.value =
        canvasEditor.getVariableEntries && canvasEditor.getVariableEntries()
          ? canvasEditor.getVariableEntries()
          : [];
    };
    const alignment = computed(() => mergeVariableSchema(schema.value, entries.value));
    // 行模型：定义行（导入/自定义）+ 未定义行（画布扫描、可收编）
    const toDefRow = (def) => ({
      kind: 'def',
      imported: isImportedVariable(def.path),
      ...def,
    });
    const toUnknownRow = (u) => ({
      kind: 'unknown',
      path: u.path,
      label: '',
      type: u.suggestedType || 'text',
      example: '',
      defaultValue: '',
      description: '',
      used: true,
    });
    // 使用中：画布引用中的定义行 + 未定义行（收编候选，恒为使用中）
    const usedRows = computed(() => [
      ...alignment.value.defined.filter((def) => def.used).map(toDefRow),
      ...alignment.value.unknown.map(toUnknownRow),
    ]);
    // 未使用：schema 已定义但画布未引用
    const unusedRows = computed(() =>
      alignment.value.defined.filter((def) => !def.used).map(toDefRow)
    );
    // 展示行：使用中 + （展开时的未使用）+ 末行折叠栏（点击展开后未使用行插入其上方，折叠栏始终最后一行）
    const unusedExpanded = ref(false);
    const tableRows = computed(() => [
      ...usedRows.value,
      ...(unusedExpanded.value ? unusedRows.value : []),
      ...(unusedRows.value.length ? [{ kind: 'toggle', count: unusedRows.value.length }] : []),
    ]);
    const unknownList = computed(() => alignment.value.unknown);
    const hasAdapter = computed(() => {
      const adapter = canvasEditor.getSchemaAdapter && canvasEditor.getSchemaAdapter();
      return !!adapter;
    });
    // 未注入 schema（无 adapter 且会话表为空）：表格展示画布扫描行（等价旧测试数据表）+ 引导文案
    const noSchemaHint = computed(() => !hasAdapter.value && schema.value.length === 0);
    // 有 adapter 但拉取后仍为空：加载失败或接口返回空
    const schemaEmptyWarn = computed(
      () => hasAdapter.value && schema.value.length === 0 && !schemaLoading.value
    );
    const canSave = computed(() => {
      const adapter = canvasEditor.getSchemaAdapter && canvasEditor.getSchemaAdapter();
      return !!(adapter && typeof adapter.save === 'function');
    });

    const typeNames = {
      text: 'variable.type_text',
      image: 'variable.type_image',
      qrcode: 'variable.type_qrcode',
      barcode: 'variable.type_barcode',
    };
    const typeColors = { text: 'blue', image: 'green', qrcode: 'geekblue', barcode: 'orange' };
    const typeName = (type) => t(typeNames[type] || 'variable.type_text');
    const typeColor = (type) => typeColors[type] || 'default';

    const schemaColumns = [
      { title: t('variable.variable'), slot: 'variable', minWidth: 170 },
      { title: t('variable.col_type'), slot: 'type', width: 110 },
      { title: t('variable.form_default'), slot: 'defaultValue', width: 130 },
      { title: t('variable.form_example'), slot: 'testValue', minWidth: 170 },
      { title: t('variable.col_action'), slot: 'action', width: 100 },
    ];
    // 使用状态不用列展示：已使用行浅蓝底色示意（未使用行保持白底，文字对比度完整，不似禁用）；
    // 折叠栏行（kind=toggle）灰底整行可点击。
    // 注意 view-design 的 rowClassName 签名是 (row, index)，首参即行对象
    const rowClassName = (row) => {
      if (row.kind === 'toggle') return 'is-toggle-row';
      return row.used ? 'is-used-row' : '';
    };
    // 末行折叠栏：首列横向合并占满整行，其余单元格以 0 跨度隐藏
    const spanMethod = ({ row, columnIndex }) => {
      if (row.kind !== 'toggle') return {};
      return columnIndex === 0
        ? { rowspan: 1, colspan: schemaColumns.length }
        : { rowspan: 0, colspan: 0 };
    };
    const onRowClick = (row) => {
      if (row.kind === 'toggle') unusedExpanded.value = !unusedExpanded.value;
    };

    /* ---------- 新建 / 编辑 / 收编 表单 ---------- */
    const formVisible = ref(false);
    const formMode = ref('create'); // create | edit | adopt
    const editingPath = ref('');
    const saving = ref(false);
    const form = reactive({
      path: '',
      label: '',
      type: 'text',
      example: '',
      defaultValue: '',
      description: '',
    });
    const formTitle = computed(() =>
      formMode.value === 'create'
        ? t('variable.new_variable')
        : formMode.value === 'adopt'
        ? t('variable.adopt_variable')
        : t('variable.edit_variable')
    );

    const resetForm = () => {
      Object.assign(form, {
        path: '',
        label: '',
        type: 'text',
        example: '',
        defaultValue: '',
        description: '',
      });
    };
    const openCreate = () => {
      formMode.value = 'create';
      editingPath.value = '';
      resetForm();
      formVisible.value = true;
    };
    const openEdit = (row) => {
      formMode.value = 'edit';
      editingPath.value = row.path;
      // 预览值与表格「预览值」列同源（example ≙ testData）：会话值优先，回退 def 预设
      const sessionValue = testData.value[row.path];
      Object.assign(form, {
        path: row.path,
        label: row.label,
        type: row.type,
        example: sessionValue !== undefined ? sessionValue : row.example || '',
        defaultValue: row.defaultValue,
        description: row.description,
      });
      formVisible.value = true;
    };
    // 收编未定义变量：path/type 由画布扫描预填且锁定，仅需补名称
    const adopt = (row) => {
      formMode.value = 'adopt';
      editingPath.value = row.path;
      // 同上：画布变量可能已在预览值列填过会话值，收编表单沿用
      const sessionValue = testData.value[row.path];
      Object.assign(form, {
        path: row.path,
        label: '',
        type: row.type || 'text',
        example: sessionValue !== undefined ? sessionValue : '',
        defaultValue: '',
        description: '',
      });
      formVisible.value = true;
    };

    const errorText = {
      empty_path: 'variable.error_empty_path',
      path_whitespace: 'variable.error_path_whitespace',
      path_delimiter: 'variable.error_path_delimiter',
      path_duplicate: 'variable.error_path_duplicate',
      empty_label: 'variable.error_empty_label',
      imported_readonly: 'variable.error_imported_readonly',
    };

    const submitForm = async () => {
      const payload = { ...form };
      const existingPaths = schema.value.map((d) => d.path).filter((p) => p !== editingPath.value);
      const { valid, errors } = validateVariableDef(payload, {
        existingPaths,
        delimiter: delimiter.value,
      });
      if (!valid) {
        Message.error(t(errorText[errors[0]] || 'variable.error_empty_path'));
        return;
      }
      saving.value = true;
      try {
        if (formMode.value === 'edit') {
          await updateCustomVariable(editingPath.value, payload);
        } else {
          await addCustomVariable(payload);
        }
        // 测试值与表单同源：以表单值为准回写会话测试数据（最后写入生效，空串权威）
        const targetPath = formMode.value === 'edit' ? editingPath.value : form.path;
        updateTestData(targetPath, payload.example || '');
        formVisible.value = false;
        Message.success(t('variable.save_schema_success'));
      } catch (err) {
        const code = err && err.code;
        if (code === 'invalid_variable_def' && err.errors && err.errors.length) {
          Message.error(t(errorText[err.errors[0]] || err.errors[0]));
        } else if (code === 'imported_readonly') {
          Message.error(t(errorText.imported_readonly));
        } else {
          Message.error((err && err.message) || String(err));
        }
      } finally {
        saving.value = false;
      }
    };

    const onDelete = (row) => {
      Modal.confirm({
        title: t('variable.delete_confirm'),
        onOk: () =>
          removeCustomVariable(row.path)
            .then(() => Message.success(t('variable.delete_success')))
            .catch((err) => Message.error((err && err.message) || String(err))),
      });
    };

    /* ---------- 批量创建 ---------- */
    const batchVisible = ref(false);
    const batchType = ref('text');
    const batchText = ref('');
    // 解析粘贴文本：形似 JSON 时按导出格式识别（exportVariableSchema 裸数组 /
    // variableMeta {schema:[...]} 形状 / 旧契约 name 字段，def 全字段随行携带），
    // 否则按行解析 path[,名称[,预览值]]（逗号/｜/|/Tab 分隔，1-3 层；名称留空回退为 path）
    const parsedRows = computed(() => {
      const existing = new Set(schema.value.map((d) => d.path));
      const seen = new Set();
      const rows = [];
      const push = (path, label, example, extra) => {
        const p = (path || '').trim();
        if (!p) return;
        const dup = existing.has(p) || seen.has(p);
        seen.add(p);
        rows.push({
          path: p,
          label: (label || '').trim(),
          example: (example || '').trim(),
          ...extra,
          dup,
        });
      };
      const raw = batchText.value.trim();
      if (raw.startsWith('[') || raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          const defs = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.schema)
            ? parsed.schema
            : [];
          defs.forEach((d) => {
            push(d.path, d.label || d.name, d.example, {
              type: Object.keys(typeNames).includes(d.type) ? d.type : undefined,
              defaultValue: d.defaultValue,
              description: d.description,
            });
          });
        } catch (e) {
          // 形似 JSON 但解析失败：不产出任何行，由用户修正粘贴内容
        }
        return rows;
      }
      batchText.value.split(/\r?\n/).forEach((line) => {
        const text = line.trim();
        if (!text) return;
        const parts = text.split(/[，,｜|\t]/);
        push(parts[0], parts[1], parts.length > 2 ? parts.slice(2).join(',') : '', {});
      });
      return rows;
    });
    const batchOkCount = computed(() => parsedRows.value.filter((r) => !r.dup).length);

    const openBatch = () => {
      // 预载画布未定义变量行（path 预填、label 留空待填），一次填完即"一键收编全部"
      batchText.value = unknownList.value.map((u) => u.path).join('\n');
      // 统一类型按未定义行推断类型的众数预选
      const counts = {};
      unknownList.value.forEach((u) => {
        const key = u.suggestedType || 'text';
        counts[key] = (counts[key] || 0) + 1;
      });
      const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      batchType.value = top || 'text';
      batchVisible.value = true;
    };
    const submitBatch = async () => {
      const rows = parsedRows.value.filter((r) => !r.dup);
      if (!rows.length) return;
      saving.value = true;
      let results;
      try {
        results = await Promise.allSettled(
          rows.map((r) =>
            addCustomVariable({
              path: r.path,
              label: r.label || r.path, // 批量 label 留空回退为 path
              // JSON 行携带各自类型/默认值/描述；行格式统一取「统一类型」
              type: r.type || batchType.value,
              example: r.example || '',
              defaultValue: r.defaultValue || '',
              description: r.description || '',
            })
          )
        );
      } finally {
        saving.value = false;
      }
      // 预览值非空的行：预填会话测试数据（example 的会话编辑态，与单表单提交同语义）
      rows.forEach((r, i) => {
        if (results[i].status === 'fulfilled' && r.example) {
          updateTestData(r.path, r.example);
        }
      });
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok > 0) {
        batchVisible.value = false;
        Message.success(t('variable.batch_result', { n: ok, m: fail }));
      } else {
        const err = results[0] && results[0].reason;
        Message.error((err && err.message) || String(err));
      }
    };

    /* ---------- 保存 / 导出 ---------- */
    const doSaveSchema = async () => {
      saving.value = true;
      try {
        await saveSchema();
        Message.success(t('variable.save_schema_success'));
      } catch (err) {
        Message.error((err && err.message) || String(err));
      } finally {
        saving.value = false;
      }
    };
    const doExportSchema = () => {
      const blob = new Blob([exportSchema()], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchorEl = document.createElement('a');
      anchorEl.href = url;
      anchorEl.download = 'variable-schema.json';
      document.body.appendChild(anchorEl);
      anchorEl.click();
      anchorEl.remove();
      URL.revokeObjectURL(url);
      Message.success(t('variable.export_schema_success'));
    };
    // 导出到粘贴板：与批量创建/导入流程衔接（可直接粘贴变量表 JSON）
    const doExportClipboard = () => {
      const text = exportSchema() || '';
      const success = () => Message.success(t('variable.export_clipboard_success'));
      const failed = () => Message.error(t('variable.export_clipboard_fail'));
      // 非安全上下文（http）下 Clipboard API 不可用：回退 execCommand + 隐藏 textarea
      const legacyCopy = () => {
        const textareaEl = document.createElement('textarea');
        textareaEl.value = text;
        textareaEl.setAttribute('readonly', '');
        textareaEl.style.position = 'fixed';
        textareaEl.style.opacity = '0';
        document.body.appendChild(textareaEl);
        textareaEl.select();
        let ok = false;
        try {
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
        document.body.removeChild(textareaEl);
        return ok;
      };
      if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(success, () => {
          if (!legacyCopy()) failed();
        });
      } else if (legacyCopy()) {
        success();
      } else {
        failed();
      }
    };

    /* ---------- 弹窗打开 ---------- */
    watch(
      () => props.value,
      (val) => {
        if (val) {
          start.value = delimiter.value.start;
          end.value = delimiter.value.end;
          delimiterChanged.value = false;
          unusedExpanded.value = false;
          refreshVariables();
          refreshEntries();
          if (hasAdapter.value) {
            // 懒加载变量表；成功/失败都刷新对齐视图（失败时保持扫描兜底）
            ensureSchemaLoaded().then(() => refreshEntries());
          }
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
      refreshEntries();
    };
    const onValueChange = (path, value) => {
      updateTestData(path, value);
    };
    // 测试值输入框：Tab/Shift+Tab 在行间跳转，避免落入操作列按钮
    const onTestValueKeydown = (e) => {
      if (e.keyCode !== 9) return;
      const inputs = Array.from(
        document.querySelectorAll('.variable-table .cell-test-input input')
      );
      const cur = inputs.indexOf(e.target);
      if (cur === -1) return;
      const next = e.shiftKey ? inputs[cur - 1] : inputs[cur + 1];
      if (next) {
        e.preventDefault();
        next.focus();
        next.select();
      }
    };
    const doEnterPreview = () => {
      enterPreview();
      // 缺数据字段（无测试值/默认值兜底）预览隐藏，与渲染器"元素消失"同语义：可读性提示
      const hiddenCount =
        canvasEditor.getHiddenPreviewCount && canvasEditor.getHiddenPreviewCount();
      if (hiddenCount > 0) {
        Message.warning(t('variable.preview_hidden_hint'));
      }
      // 预览时关闭模态框，露出画布查看真实数据渲染效果；
      // 退出预览入口在属性面板"变量配置"区域（attributeVariable.vue）
      visible.value = false;
    };
    const doExitPreview = () => exitPreview();

    return {
      visible,
      start,
      end,
      delimiterChanged,
      variables,
      previewing,
      testData,
      tableRows,
      unknownList,
      noSchemaHint,
      schemaEmptyWarn,
      schemaLoading,
      schemaColumns,
      rowClassName,
      spanMethod,
      onRowClick,
      unusedExpanded,
      canSave,
      saving,
      formVisible,
      formMode,
      form,
      formTitle,
      typeName,
      typeColor,
      openCreate,
      openEdit,
      adopt,
      submitForm,
      onDelete,
      batchVisible,
      batchType,
      batchText,
      parsedRows,
      batchOkCount,
      openBatch,
      submitBatch,
      doSaveSchema,
      doExportSchema,
      doExportClipboard,
      applyDelimiter,
      onValueChange,
      onTestValueKeydown,
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
  .var-cell {
    line-height: 1.4;
    padding: 2px 0;
  }
  .var-cell-label {
    font-size: 12px;
    color: #515a6e;
  }
  .var-cell-path {
    font-family: monospace;
    font-size: 12px;
    color: #2d8cf0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    &.is-unknown {
      color: #ed4014;
    }
  }
  .default-text {
    display: inline-block;
    max-width: 100%;
    font-size: 12px;
    color: #515a6e;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
    &.is-empty {
      color: #c5c8ce;
    }
  }
  .action-icon-btn {
    padding: 0 4px;
    color: #515a6e;
    &:hover {
      color: #2d8cf0;
    }
    &.danger-btn:hover {
      color: #ed4014;
    }
  }
  .no-schema-hint {
    margin-bottom: 8px;
    padding: 8px 10px;
    font-size: 12px;
    color: #808695;
    background: #f6f7f9;
    border-radius: 4px;
  }
  .schema-warn {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    font-size: 12px;
    color: #ff9900;
    background: #fff9ed;
    border-radius: 4px;
    padding: 6px 8px;
  }
  .unknown-summary {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    font-size: 12px;
    color: #ff9900;
    background: #fff9ed;
    border-radius: 4px;
    padding: 4px 8px;
  }
  .schema-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }
  .danger-btn {
    color: #ed4014;
  }
  // 已使用变量行以浅蓝底色示意（未使用行保持白底；悬停加深可辨）
  .variable-table {
    /deep/ .is-used-row td {
      background-color: #f0faff;
    }
    /deep/ .is-used-row.ivu-table-row-hover td {
      background-color: #d5ecfa;
    }
    // 末行折叠栏：灰底整行可点击，悬停加深
    /deep/ .is-toggle-row {
      cursor: pointer;
      td {
        background-color: #f8f8f9;
      }
    }
    /deep/ .is-toggle-row.ivu-table-row-hover td {
      background-color: #e9eaec;
    }
    .toggle-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 12px;
      color: #515a6e;
      user-select: none;
    }
  }
}

/* ---------- 以下选择器渲染于 .variable-config 之外（主 Modal footer / 表单弹窗 / 批量弹窗），须置于顶层 ---------- */
.var-path {
  font-family: monospace;
  color: #2d8cf0;
  font-size: 13px;
}
.form-tip {
  font-size: 12px;
  color: #c5c8ce;
  margin-top: 4px;
}
.modal-footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  .footer-right {
    display: flex;
    gap: 8px;
  }
  .preview-tag {
    color: #ff9900;
    font-size: 13px;
  }
}
.batch-form {
  .batch-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .batch-type-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .batch-type-label {
    font-size: 13px;
    color: #515a6e;
  }
  .batch-hint {
    font-size: 12px;
    color: #c5c8ce;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /deep/ textarea.ivu-input {
    font-family: monospace;
    font-size: 12px;
  }
  .batch-preview {
    margin-top: 12px;
    max-height: 200px;
    overflow-y: auto;
    background: #f8f9fb;
    border: 1px solid #e8eaec;
    border-radius: 4px;
    padding: 6px 10px;
  }
  .batch-summary {
    display: flex;
    gap: 12px;
    padding: 4px 2px 8px;
    margin-bottom: 4px;
    border-bottom: 1px dashed #e8eaec;
    font-size: 12px;
    .batch-summary-ok {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #19be6b;
    }
    .batch-summary-dup {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #ed4014;
    }
  }
  .batch-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 4px;
    font-size: 12px;
    border-radius: 3px;
    transition: background-color 0.15s;
    &:hover {
      background: #fff;
    }
    .batch-row-icon {
      flex: none;
      color: #19be6b;
      &.is-dup {
        color: #ed4014;
      }
    }
    .batch-row-label {
      color: #515a6e;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: right;
    }
    .batch-row-example {
      flex: none;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #808695;
    }
    .batch-dup-text {
      flex: none;
      color: #ed4014;
    }
    &.is-dup {
      background: #fdf0ed;
      &:hover {
        background: #fbe9e4;
      }
      .var-path {
        color: #ed4014;
      }
    }
  }
}
</style>
