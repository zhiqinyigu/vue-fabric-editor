<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-05-11 15:49:01
 * @Description: 保存文件（纯净版，无业务/路由依赖）
 * 导出/复制均为编辑器能力，业务自持数据持久化。
 -->

<template>
  <div class="save-box">
    <Dropdown placement="bottom-end" @on-click="saveWith">
      <Button type="primary">
        {{ $t('save.down') }}
        <Icon type="ios-arrow-down"></Icon>
      </Button>
      <template #list>
        <DropdownMenu>
          <DropdownItem name="saveImg">{{ $t('save.save_as_picture') }}</DropdownItem>
          <DropdownItem name="clipboard" divided>{{ $t('save.copy_to_clipboard') }}</DropdownItem>
          <DropdownItem name="saveJson" divided>{{ $t('save.save_as_json') }}</DropdownItem>
        </DropdownMenu>
      </template>
    </Dropdown>
  </div>
</template>

<script>
import { Message } from 'view-design';
import { debounce } from 'lodash-es';
import useSelect from '@/hooks/select';

export default {
  name: 'SaveBar',
  setup() {
    const { canvasEditor } = useSelect();

    const cbMap = {
      async clipboard() {
        try {
          await canvasEditor.clipboard();
          Message.success('复制成功');
        } catch (error) {
          Message.error('复制失败');
        }
      },
      saveJson() {
        canvasEditor.saveJson();
      },
      saveImg() {
        canvasEditor.saveImg();
      },
    };

    const saveWith = debounce(function (type) {
      cbMap[type] && typeof cbMap[type] === 'function' && cbMap[type]();
    }, 300);

    return {
      saveWith,
    };
  },
};
</script>
