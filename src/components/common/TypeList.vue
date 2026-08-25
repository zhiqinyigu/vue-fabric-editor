<!--
 * @Author: 秦少卫
 * @Date: 2024-06-11 16:17:17
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-12 15:43:54
 * @Description: 列表组件
-->

<template>
  <div class="material-type">
    <div v-for="item in materialTypeList" :key="item.id" class="item">
      <div class="top">
        <h3>{{ item.name }}</h3>
        <Button type="text" size="small" @click="emit('selectType', item.id)">查看更多</Button>
      </div>
      <div class="img-box">
        <div v-for="info in item.list" :key="info.id" class="img-item">
          <Image
            lazy
            :src="info.src"
            fit="contain"
            width="100%"
            height="100%"
            :alt="info.name"
            @click="(e) => emit('click', { info, e })"
            @dragend="(e) => emit('dragend', { info, e })"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from '@vue/composition-api';

const baseURL = process.env.VUE_APP_APIHOST;

export default {
  name: 'ImportJson',
  props: {
    typeApi: {
      type: Function,
    },
    typeListApi: {
      type: Function,
    },
    typeKey: {
      type: String,
    },
    formatData: {
      type: Function,
    },
  },
  setup(props, { emit }) {
    // 素材分类
    const materialTypeList = ref([]);
    const getMaterialTypesHandler = async () => {
      const res = await props.typeApi();
      materialTypeList.value = res.data.data.map((item) => {
        return {
          name: item.attributes.name,
          id: item.id,
          list: [],
        };
      });
    };

    const getMaterialsByTypeHandler = async () => {
      let i = 0;
      for (const item of materialTypeList.value) {
        const res = await props.typeListApi({
          populate: {
            img: '*',
          },
          filters: {
            [props.typeKey]: {
              $eq: item.id,
            },
          },
          pagination: {
            page: 1,
            pageSize: 8,
          },
        });
        materialTypeList.value[i].list = props.formatData(res.data.data);

        i++;
      }
    };

    onMounted(async () => {
      await getMaterialTypesHandler();
      await getMaterialsByTypeHandler();
    });

    return {
      emit,
      materialTypeList,
    };
  },
};
</script>
<style scoped lang="less">
.item {
  .top {
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
  }
}

.img-box {
  background: #f1f2f4;
  display: grid;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(4, 60px);
  grid-template-rows: repeat(2, 70px);
  grid-row-gap: 10px;
  justify-content: space-between;
  padding: 8px;
  background: #f1f2f4;
  border-radius: 10px;
  margin-bottom: 10px;
  .img-item {
    border-radius: 5px;
    padding: 5px;
    cursor: pointer;
    &:hover {
      background: #bababa;
    }
  }
}
</style>
