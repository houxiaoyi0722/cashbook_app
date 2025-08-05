// src/services/LocalDataService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

interface LocalBook {
  id: string;
  name: string;
  type: 'local' | 'remote';
  remoteBookId?: string;
  remoteServerId?: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalFlow {
  id: string;
  bookId: string;
  data: any;
  synced: boolean;
  syncTarget?: {
    serverId: string;
    bookId: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface SyncStatus {
  totalFlows: number;
  syncedFlows: number;
  unsyncedFlows: number;
  lastSyncTime?: string;
}

class LocalDataService {
  private readonly LOCAL_BOOKS_KEY = 'local_books';
  private readonly LOCAL_FLOWS_KEY = 'local_flows';
  private readonly SYNC_STATUS_KEY = 'sync_status';

  // ==================== 本地账本管理 ====================

  // 创建本地账本
  async createLocalBook(name: string): Promise<LocalBook> {
    const book: LocalBook = {
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type: 'local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const books = await this.getLocalBooks();
    books.push(book);
    await AsyncStorage.setItem(this.LOCAL_BOOKS_KEY, JSON.stringify(books));
    
    return book;
  }

  // 获取所有本地账本
  async getLocalBooks(): Promise<LocalBook[]> {
    try {
      const data = await AsyncStorage.getItem(this.LOCAL_BOOKS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('获取本地账本失败:', error);
      return [];
    }
  }

  // 更新本地账本
  async updateLocalBook(bookId: string, updates: Partial<LocalBook>): Promise<LocalBook | null> {
    const books = await this.getLocalBooks();
    const index = books.findIndex(book => book.id === bookId);
    
    if (index !== -1) {
      books[index] = {
        ...books[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await AsyncStorage.setItem(this.LOCAL_BOOKS_KEY, JSON.stringify(books));
      return books[index];
    }
    
    return null;
  }

  // 删除本地账本
  async deleteLocalBook(bookId: string): Promise<boolean> {
    try {
      const books = await this.getLocalBooks();
      const filteredBooks = books.filter(book => book.id !== bookId);
      await AsyncStorage.setItem(this.LOCAL_BOOKS_KEY, JSON.stringify(filteredBooks));
      
      // 同时删除该账本下的所有流水
      await this.deleteAllFlowsByBookId(bookId);
      
      return true;
    } catch (error) {
      console.error('删除本地账本失败:', error);
      return false;
    }
  }

  // ==================== 本地流水管理 ====================

  // 添加本地流水
  async addLocalFlow(bookId: string, flowData: any): Promise<LocalFlow> {
    const flow: LocalFlow = {
      id: `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      bookId,
      data: {
        ...flowData,
        bookId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      synced: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const flows = await this.getLocalFlows(bookId);
    flows.push(flow);
    await this.saveLocalFlows(bookId, flows);
    
    return flow;
  }

  // 获取指定账本的本地流水
  async getLocalFlows(bookId: string): Promise<LocalFlow[]> {
    try {
      const key = `${this.LOCAL_FLOWS_KEY}:${bookId}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('获取本地流水失败:', error);
      return [];
    }
  }

  // 获取所有本地流水
  async getAllLocalFlows(): Promise<LocalFlow[]> {
    try {
      const books = await this.getLocalBooks();
      const allFlows: LocalFlow[] = [];
      
      for (const book of books) {
        const flows = await this.getLocalFlows(book.id);
        allFlows.push(...flows);
      }
      
      return allFlows;
    } catch (error) {
      console.error('获取所有本地流水失败:', error);
      return [];
    }
  }

  // 更新本地流水
  async updateLocalFlow(flowId: string, updates: Partial<LocalFlow>): Promise<LocalFlow | null> {
    const books = await this.getLocalBooks();
    
    for (const book of books) {
      const flows = await this.getLocalFlows(book.id);
      const index = flows.findIndex(flow => flow.id === flowId);
      
      if (index !== -1) {
        flows[index] = {
          ...flows[index],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        await this.saveLocalFlows(book.id, flows);
        return flows[index];
      }
    }
    
    return null;
  }

  // 删除本地流水
  async deleteLocalFlow(flowId: string): Promise<boolean> {
    try {
      const books = await this.getLocalBooks();
      
      for (const book of books) {
        const flows = await this.getLocalFlows(book.id);
        const filteredFlows = flows.filter(flow => flow.id !== flowId);
        
        if (filteredFlows.length !== flows.length) {
          await this.saveLocalFlows(book.id, filteredFlows);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('删除本地流水失败:', error);
      return false;
    }
  }

  // 删除指定账本的所有流水
  private async deleteAllFlowsByBookId(bookId: string): Promise<void> {
    try {
      const key = `${this.LOCAL_FLOWS_KEY}:${bookId}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('删除账本流水失败:', error);
    }
  }

  // 保存本地流水到存储
  private async saveLocalFlows(bookId: string, flows: LocalFlow[]): Promise<void> {
    try {
      const key = `${this.LOCAL_FLOWS_KEY}:${bookId}`;
      await AsyncStorage.setItem(key, JSON.stringify(flows));
    } catch (error) {
      console.error('保存本地流水失败:', error);
    }
  }

  // ==================== 同步管理 ====================

  // 设置同步目标
  async setSyncTarget(flowId: string, serverId: string, remoteBookId: string): Promise<LocalFlow | null> {
    const flow = await this.updateLocalFlow(flowId, {
      syncTarget: { serverId, bookId: remoteBookId }
    });
    
    return flow;
  }

  // 标记流水为已同步
  async markFlowAsSynced(flowId: string): Promise<boolean> {
    const flow = await this.updateLocalFlow(flowId, { synced: true });
    return flow !== null;
  }

  // 获取未同步的流水
  async getUnsyncedFlows(): Promise<LocalFlow[]> {
    const allFlows = await this.getAllLocalFlows();
    return allFlows.filter(flow => !flow.synced);
  }

  // 获取指定账本未同步的流水
  async getUnsyncedFlowsByBook(bookId: string): Promise<LocalFlow[]> {
    const flows = await this.getLocalFlows(bookId);
    return flows.filter(flow => !flow.synced);
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
    
    const allFlows = await this.getAllLocalFlows();
    const syncedFlows = allFlows.filter(flow => flow.synced);
    
    return {
      totalFlows: allFlows.length,
      syncedFlows: syncedFlows.length,
      unsyncedFlows: allFlows.length - syncedFlows.length
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

  // ==================== 数据清理 ====================

  // 清理已同步的流水
  async cleanupSyncedFlows(): Promise<number> {
    try {
      const books = await this.getLocalBooks();
      let cleanedCount = 0;
      
      for (const book of books) {
        const flows = await this.getLocalFlows(book.id);
        const unsyncedFlows = flows.filter(flow => !flow.synced);
        
        if (unsyncedFlows.length !== flows.length) {
          await this.saveLocalFlows(book.id, unsyncedFlows);
          cleanedCount += flows.length - unsyncedFlows.length;
        }
      }
      
      return cleanedCount;
    } catch (error) {
      console.error('清理已同步流水失败:', error);
      return 0;
    }
  }

  // 清除所有本地数据
  async clearAllData(): Promise<void> {
    try {
      const books = await this.getLocalBooks();
      
      // 删除所有账本的流水
      for (const book of books) {
        await this.deleteAllFlowsByBookId(book.id);
      }
      
      // 删除账本和同步状态
      await AsyncStorage.multiRemove([
        this.LOCAL_BOOKS_KEY,
        this.SYNC_STATUS_KEY
      ]);
    } catch (error) {
      console.error('清除所有本地数据失败:', error);
    }
  }
}

export default new LocalDataService();