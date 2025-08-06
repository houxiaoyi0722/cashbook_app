// src/services/LocalDataService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// 本地流水类型
interface LocalFlow {
  id: string;
  data: any; // 流水数据
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

// 同步状态类型
interface SyncStatus {
  lastSyncTime: string;
  totalFlows: number;
  syncedFlows: number;
}

class LocalDataService {
  private readonly LOCAL_FLOWS_KEY = 'local_flows';
  private readonly SYNC_STATUS_KEY = 'sync_status';

  // ==================== 本地流水管理 ====================

  // 添加本地流水（不再需要bookId参数）
  async addLocalFlow(flowData: any): Promise<LocalFlow> {
    const flow: LocalFlow = {
      id: `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data: {
        ...flowData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      synced: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const flows = await this.getAllLocalFlows();
    flows.push(flow);
    await this.saveLocalFlows(flows);

    return flow;
  }

  // 获取所有本地流水
  async getAllLocalFlows(): Promise<LocalFlow[]> {
    try {
      const data = await AsyncStorage.getItem(this.LOCAL_FLOWS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('获取所有本地流水失败:', error);
      return [];
    }
  }

  // 更新本地流水
  async updateLocalFlow(flowId: string, updates: Partial<LocalFlow>): Promise<LocalFlow | null> {
    try {
      const flows = await this.getAllLocalFlows();
      const index = flows.findIndex(f => f.id === flowId);

      if (index !== -1) {
        flows[index] = {
          ...flows[index],
          ...updates,
          updatedAt: new Date().toISOString()
        };

        await this.saveLocalFlows(flows);
        return flows[index];
      }
      return null;
    } catch (error) {
      console.error('更新本地流水失败:', error);
      return null;
    }
  }

  // 删除本地流水
  async deleteLocalFlow(flowId: string): Promise<boolean> {
    try {
      const flows = await this.getAllLocalFlows();
      const filteredFlows = flows.filter(f => f.id !== flowId);

      await this.saveLocalFlows(filteredFlows);
      return true;
    } catch (error) {
      console.error('删除本地流水失败:', error);
      return false;
    }
  }

  // 保存本地流水到存储
  private async saveLocalFlows(flows: LocalFlow[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.LOCAL_FLOWS_KEY, JSON.stringify(flows));
    } catch (error) {
      console.error('保存本地流水失败:', error);
    }
  }

  // ==================== 同步管理 ====================

  // 获取未同步的流水
  async getUnsyncedFlows(): Promise<LocalFlow[]> {
    const allFlows = await this.getAllLocalFlows();
    return allFlows.filter(flow => !flow.synced);
  }

  // 标记流水为已同步
  async markFlowAsSynced(flowId: string): Promise<void> {
    await this.updateLocalFlow(flowId, { synced: true });
  }

  // 获取同步状态
  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const data = await AsyncStorage.getItem(this.SYNC_STATUS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('获取同步状态失败:', error);
    }

    // 默认状态
    const allFlows = await this.getAllLocalFlows();
    const syncedCount = allFlows.filter(f => f.synced).length;
    return {
      lastSyncTime: '',
      totalFlows: allFlows.length,
      syncedFlows: syncedCount,
    };
  }

  // 更新同步状态
  async updateSyncStatus(status: Partial<SyncStatus>): Promise<void> {
    try {
      const current = await this.getSyncStatus();
      const updated = { ...current, ...status };
      await AsyncStorage.setItem(this.SYNC_STATUS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('更新同步状态失败:', error);
    }
  }

  // 清理已同步的流水（可选功能）
  async cleanupSyncedFlows(): Promise<number> {
    try {
      const flows = await this.getAllLocalFlows();
      const unsyncedFlows = flows.filter(f => !f.synced);
      const cleanedCount = flows.length - unsyncedFlows.length;

      await this.saveLocalFlows(unsyncedFlows);
      return cleanedCount;
    } catch (error) {
      console.error('清理已同步流水失败:', error);
      return 0;
    }
  }

  // 清除所有本地数据
  async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.LOCAL_FLOWS_KEY);
      await AsyncStorage.removeItem(this.SYNC_STATUS_KEY);
    } catch (error) {
      console.error('清除所有本地数据失败:', error);
    }
  }
}

export default new LocalDataService();
