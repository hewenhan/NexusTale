/**
 * Step 140: 背包入包 + 任务完成仪式
 *
 * 显示完毕后：逐个入包（可能 UI 阻塞等待丢弃），然后展示仪式。
 */

import { v4 as uuidv4 } from 'uuid';
import type { TurnContext } from './types';

export async function stepBagAndCeremony(ctx: TurnContext): Promise<void> {
  const {
    deps: { addMessage, updateState, waitForTypewriter, setPendingCeremony, addItemToBag },
    resolution, questResult, pendingBagItems,
  } = ctx;

  // ── 逐个入包 ──
  const rollingInvRef = { current: resolution!.newInventory };
  for (const item of pendingBagItems) {
    await addItemToBag(item, rollingInvRef);
  }

  // ── 任务完成仪式 ──
  if (questResult?.questCeremony) {
    updateState({ lastCeremony: questResult.questCeremony });
    await waitForTypewriter();
    setPendingCeremony(questResult.questCeremony);
    addMessage({
      id: uuidv4(),
      role: 'narrator',
      text: questResult.questCeremony.epilogue,
      timestamp: Date.now(),
    });
  }
}
