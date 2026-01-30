// src/services/initUserInputAnalysis.ts
import { userInputAnalysisManager } from './UserInputAnalysisManager';

/**
 * 初始化用户输入分析系统
 * 这个函数应该在应用启动时调用
 */
export async function initUserInputAnalysis(): Promise<void> {
  try {
    console.log('开始初始化用户输入分析系统...');

    // 初始化用户输入分析管理器
    await userInputAnalysisManager.initialize();

    console.log('用户输入分析系统初始化完成');

    // 记录初始化事件
    await userInputAnalysisManager.recordUserInput(
      '系统初始化',
      undefined,
      'system_event'
    );

  } catch (error) {
    console.error('初始化用户输入分析系统失败:', error);
    // 即使初始化失败，也不影响应用的主要功能
  }
}
