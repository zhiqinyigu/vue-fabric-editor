<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-05-31 16:58:12
 * @Description: 导入JSON文件
-->

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
import { Message, Spin } from 'view-design';
import useSelect from '@/hooks/select';
import useMaterial from '@/hooks/useMaterial';
import { useI18n } from '@/hooks/useI18n';
import ModalSzie from '@/components/common/ModalSzie';

export default {
  name: 'ImportJson',
  components: { ModalSzie },
  setup() {
    const { t } = useI18n();
    const { canvasEditor } = useSelect();
    const { createTmpl, routerToId } = useMaterial();
    const modalSizeRef = ref(null);
    const showJsonModal = ref(false);
    const jsonStr = ref('');

    const clickHandler = (type) => {
      const handleMap = {
        // 导入文件
        importFiles: canvasEditor.insert,
        // 创建文件
        createDesign,
        // psd
        psd: () => {
          // Spin.show({
          //   render: (h) => h('div', t('alert.loading_data')),
          // });
          canvasEditor.insertPSD().finally(Spin.hide);
        },
        // 从JSON字符串导入
        importJsonStr: () => {
          jsonStr.value = '';
          showJsonModal.value = true;
        },
      };
      handleMap[type]?.();
    };

    const createDesign = () => {
      modalSizeRef.value.showSetSize();
    };

    const confirmImportJson = () => {
      try {
        const parsed = JSON.parse(jsonStr.value);
        if (!parsed || !parsed.objects) {
          Message.error(t('importFiles.importJsonStrError'));
          return;
        }
        canvasEditor.loadJSON(parsed);
        showJsonModal.value = false;
        Message.success(t('importFiles.importJsonStrSuccess'));
      } catch (e) {
        Message.error(t('importFiles.importJsonStrError'));
      }
    };

    const customSizeCreate = async (w, h) => {
      const res = await createTmpl(w, h);
      routerToId(res.data.data.id);
      Message.success('创建成功');
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
h3 {
  margin-bottom: 10px;
}
.divider {
  margin-top: 0;
}
</style>
