import { fabric } from 'fabric';
import '../../src/core/objects/CustomTextbox';

it('diag: frameH < 1 line', () => {
  const text = 'aab cc dd eeeeeeeeeee fg hh';
  for (const fh of [23, 22, 20, 15, 10]) {
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(fh);
    // 诊断输出已关闭（需要时取消注释）
    // const lines = tb._textLines.map((l) => l.join('')).join(' | ');
    // console.log(`frameH=${fh} lineH=${tb.getHeightOfLine(0).toFixed(2)} => ${lines}`);
  }
});
