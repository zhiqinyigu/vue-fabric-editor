<template>
  <div style="display: inline-block">
    <Dropdown @on-click="clickHandler">
      <a href="javascript:void(0)">
        {{ $t('importFiles.file') }}
        <Icon type="ios-arrow-down"></Icon>
      </a>
      <template #list>
        <DropdownMenu>
          <DropdownItem name="createDesign">
            {{ $t('importFiles.createDesign.title') }}
          </DropdownItem>
          <DropdownItem name="importFiles">{{ $t('importFiles.importFiles') }}</DropdownItem>
          <DropdownItem name="importJsonStr">{{ $t('importFiles.importJsonStr') }}</DropdownItem>
          <DropdownItem name="psd">PSD</DropdownItem>
        </DropdownMenu>
      </template>
    </Dropdown>

    <!-- 创建设计 -->
    <ModalSzie
      ref="modalSizeRef"
      :title="$t('importFiles.createDesign.title')"
      @set="customSizeCreate"
    ></ModalSzie>

    <!-- 从JSON字符串导入 -->
    <Modal
      v-model="showJsonModal"
      :title="$t('importFiles.importJsonStr')"
      @on-ok="confirmImportJson"
      @on-cancel="showJsonModal = false"
    >
      <Input
        v-model="jsonStr"
        show-word-limit
        type="textarea"
        :placeholder="$t('importFiles.importJsonStrPlaceholder')"
      />
    </Modal>
  </div>
</template>

<script>
import { ref } from '@vue/composition-api';
import { Message } from 'view-design';
import { useEditorContext } from '@/hooks/useEditorContext';
import { useI18n } from '@/hooks/useI18n';
import ModalSzie from '@/components/common/ModalSzie';

export default {
  name: 'TopbarImport',
  components: { ModalSzie },
  setup() {
    const { api } = useEditorContext();
    const { t } = useI18n();
    const modalSizeRef = ref(null);
    const showJsonModal = ref(false);
    const jsonStr = ref('');

    const clickHandler = (type) => {
      const handleMap = {
        importFiles: () => api.editor.insert(),
        createDesign: () => modalSizeRef.value.showSetSize(),
        psd: () => api.editor.insertPSD && api.editor.insertPSD().finally(() => {}),
        importJsonStr: () => {
          jsonStr.value = '';
          showJsonModal.value = true;
        },
      };
      handleMap[type] && handleMap[type]();
    };

    const customSizeCreate = (w, h) => {
      api.setSize(w, h);
      api.clear();
    };

    const confirmImportJson = () => {
      try {
        const parsed = JSON.parse(jsonStr.value);
        if (!parsed || !parsed.objects) {
          Message.error(t('importFiles.importJsonStrError'));
          return;
        }
        api.loadJSON(parsed);
        showJsonModal.value = false;
        Message.success(t('importFiles.importJsonStrSuccess'));
      } catch (e) {
        Message.error(t('importFiles.importJsonStrError'));
      }
    };

    return {
      modalSizeRef,
      clickHandler,
      customSizeCreate,
      showJsonModal,
      jsonStr,
      confirmImportJson,
    };
  },
};
</script>
<style scoped lang="less">
/deep/ .ivu-select-dropdown {
  z-index: 999;
}
</style>
