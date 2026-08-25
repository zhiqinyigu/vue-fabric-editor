<!--
 * @Author: 秦少卫
 * @Date: 2024-06-11 16:04:59
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-12 16:37:40
 * @Description: 搜索组件
-->

<template>
  <div class="search-box">
    <Button
      v-if="typeValue || searchKeyWord"
      type="text"
      class="back-btn"
      icon="ios-arrow-back"
      @click="clear"
    ></Button>

    <Select v-model="typeValue" class="select" :disabled="loading" @on-change="change">
      <Option v-for="item in typeList" :key="item.value" :value="item.value">
        {{ item.label }}
      </Option>
    </Select>
    <Input
      v-model="searchKeyWord"
      class="input"
      :placeholder="`在${typeText}中搜索`"
      :disabled="loading"
      clearable
      search
      @on-change="inputChange"
      @on-search="change"
    />
  </div>
</template>

<script>
import { ref, computed, onMounted } from '@vue/composition-api';
import { debounce } from 'lodash-es';

export default {
  name: 'ImportJson',
  props: {
    typeListApi: {
      type: Function,
      Object: () => ({}),
    },
  },
  setup(props, { emit }) {
    const loading = ref(false);

    const typeValue = ref('');
    const searchKeyWord = ref('');
    const typeList = ref([]);
    const typeText = computed(() => {
      const info = typeList.value.find((item) => item.value === typeValue.value);
      return (info && info.label) || '全部';
    });

    onMounted(async () => {
      loading.value = true;

      try {
        const res = await props.typeListApi();
        const list = res.data.data.map((item) => {
          return {
            value: item.id,
            label: item.attributes.name,
          };
        });
        typeList.value = [
          {
            label: '全部',
            value: '',
          },
          ...list,
        ];
      } catch (error) {
        console.log(error);
      }

      loading.value = false;
    });

    const change = () => {
      emit('change', { searchKeyWord: searchKeyWord.value, typeValue: typeValue.value });
    };

    // const getValue = () => {
    //   return { type: typeValue.value, searchKeyWord };
    // };
    const clear = () => {
      typeValue.value = '';
      searchKeyWord.value = '';
      change();
    };

    const setType = (type) => {
      typeValue.value = type;
    };

    const inputChange = debounce(change, 300);

    return {
      loading,
      typeValue,
      searchKeyWord,
      typeList,
      typeText,
      change,
      clear,
      setType,
      inputChange,
    };
  },
};
</script>
<style scoped lang="less">
.search-box {
  padding-top: 10px;
  display: flex;

  .back-btn {
    margin-right: 10px;
  }
  .input {
    margin-left: 10px;
  }
  .select {
    width: 100px;
  }
}
</style>
