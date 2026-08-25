<!--
 * @Descripttion:
 * @version:
 * @Author: June
 * @Date: 2023-05-20 09:18:28
 * @LastEditors: 秦少卫
 * @LastEditTime: 2023-07-29 22:24:03
-->
<template>
  <Dropdown placement="bottom-end" @on-click="setLang">
    <Button type="text">
      {{ lang }}
      <Icon type="ios-arrow-down"></Icon>
    </Button>
    <template #list>
      <DropdownMenu>
        <DropdownItem v-for="item in langList" :key="item.langType" :name="item.langType">
          {{ item.langName }}
        </DropdownItem>
      </DropdownMenu>
    </template>
  </Dropdown>
</template>

<script>
import { getCurrentInstance, ref, reactive, computed } from '@vue/composition-api';
import { setLocal } from '@/utils/local';
import { LANG } from '@/config/constants/app';

export default {
  name: 'SaveBar',
  setup() {
    const update = getCurrentInstance();
    const vm = update && (update.proxy || update.root);
    const locale = ref(vm.$i18n.locale);

    const LANGMAP = {
      zh: '中文',
      en: 'En',
    };

    const langList = reactive(
      Object.keys(LANGMAP).map((key) => ({ langType: key, langName: LANGMAP[key] }))
    );

    const lang = computed(() => {
      return LANGMAP[locale.value];
    });

    // 设置语言
    const setLang = (type) => {
      locale.value = type;
      vm.$i18n.locale = type;
      setLocal(LANG, type);
    };

    return {
      lang,
      langList,
      setLang,
    };
  },
};
</script>

<style scoped lang="less"></style>
