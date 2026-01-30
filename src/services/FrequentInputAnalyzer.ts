// src/services/FrequentInputAnalyzer.ts
import { userInputHistoryService, FrequentInputAnalysis } from './UserInputHistoryService';
import { aiService } from './AIService';

/**
 * 高频输入分析器服务
 * 负责定期分析用户输入历史，生成高频输入报告，并发送给AI整理
 */
class FrequentInputAnalyzer {
  private readonly MIN_INPUTS_FOR_ANALYSIS = 10; // 最少需要10条输入才进行分析
  private isAnalyzing: boolean = false;

  /**
   * 检查是否需要进行分析
   */
  async checkAndAnalyze(): Promise<boolean> {
    // 防止重复分析
    if (this.isAnalyzing) {
      console.log('分析正在进行中，跳过本次检查');
      return false;
    }

    // 检查是否有足够的输入数据
    const stats = await userInputHistoryService.getStatistics();
    if (stats.totalRecords < this.MIN_INPUTS_FOR_ANALYSIS) {
      console.log(`输入记录不足（${stats.totalRecords}/${this.MIN_INPUTS_FOR_ANALYSIS}），跳过分析`);
      return false;
    }

    // 开始分析
    return this.performAnalysis();
  }

  /**
   * 执行分析
   */
  private async performAnalysis(): Promise<boolean> {
    this.isAnalyzing = true;
    console.log('开始高频输入分析...');

    try {
      // 1. 分析高频输入
      const analysis = await userInputHistoryService.analyzeFrequentInputs();

      if (analysis.totalInputs === 0) {
        console.log('没有找到有效的输入数据，跳过AI整理');
        this.isAnalyzing = false;
        return false;
      }

      console.log(`分析完成：共${analysis.totalInputs}条输入，${analysis.uniqueInputs}条唯一输入`);
      console.log('高频输入：', analysis.frequentInputs.map(f => `${f.text} (${f.count}次)`));

      // 2. 检查是否需要发送给AI整理
      await this.sendToAIForSuggestion(analysis);

      // 3. 更新最后分析时间
      this.isAnalyzing = false;

      return true;
    } catch (error) {
      console.error('高频输入分析失败:', error);
      this.isAnalyzing = false;
      return false;
    }
  }

  /**
   * 发送高频输入给AI整理
   */
  private async sendToAIForSuggestion(analysis: FrequentInputAnalysis): Promise<void> {
    try {
      // 使用UserInputHistoryService的sendToAIForSuggestion方法
      await userInputHistoryService.sendToAIForSuggestion(analysis, aiService);
      console.log('AI整理完成，建议已保存');
    } catch (error) {
      console.error('发送给AI整理失败:', error);
      // 即使AI整理失败，也不影响主要功能
    }
  }

  /**
   * 手动触发分析
   */
  async triggerManualAnalysis(): Promise<boolean> {
    console.log('手动触发高频输入分析...');
    return this.checkAndAnalyze();
  }

  /**
   * 获取分析状态
   */
  getAnalysisStatus(): {
    isAnalyzing: boolean;
  } {
    return {
      isAnalyzing: this.isAnalyzing,
    };
  }

  /**
   * 初始化分析器
   */
  async initialize(): Promise<void> {
    console.log('初始化高频输入分析器...');
    // 启动定时检查
    this.startPeriodicCheck();
  }

  /**
   * 启动定期检查
   */
  private startPeriodicCheck(): void {
    // 每30分钟检查一次是否需要分析
    setInterval(() => {
      this.checkAndAnalyze().catch(error => {
        console.error('定期检查失败:', error);
      });
    }, 30 * 60 * 1000); // 30分钟

    console.log('高频输入分析器定时检查已启动（每30分钟检查一次）');
  }
}

// 导出单例
export const frequentInputAnalyzer = new FrequentInputAnalyzer();
