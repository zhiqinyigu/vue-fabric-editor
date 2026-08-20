/*
 * 在线图片上传适配器示例（L1：能力驱动升级）
 *
 * 注册 asset.uploadImage 后，内置 imagePickerModal 会自动出现"上传图片"Tab。
 * 上传本地图片到业务后台/CDN，返回在线地址，回填到 URL 输入框由用户确认后插入。
 *
 * 业务项目用任意请求库实现即可（axios / fetch / 小程序 upload 等）。
 */
export const assetAdapter = {
  async uploadImage(file) {
    // 示例：这里仅演示契约；业务替换为真实上传。
    // const form = new FormData()
    // form.append('file', file)
    // const { data } = await axios.post('https://your-cdn.example.com/upload', form)
    // return { url: data.url }

    // Mock：本地读为 dataURL（仅演示流程，实际应返回 http 地址）
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { url };
  },
};

export default assetAdapter;
