import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ApiResponse, ServerConfig, Book, Flow, AnalyticsItem, MonthAnalysis} from '../types';

// 创建API实例
const createApiInstance = (baseURL: string): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    timeout: 20000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // 请求拦截器
  instance.interceptors.request.use(
    async (config) => {
      const token = await AsyncStorage.getItem('auth_token');
      if (token && config.headers) {
        config.headers.Authorization = token;
      }

      // 记录请求日志
      console.log(`🚀 REQUEST: ${config.method?.toUpperCase()} ${config.url}`, {
        headers: config.headers,
        params: config.params,
        data: config.data,
      });

      return config;
    },
    (error) => {
      console.log('❌ REQUEST ERROR:', error);
      return Promise.reject(error);
    }
  );

  // 响应拦截器
  instance.interceptors.response.use(
    (response) => {
      // 记录响应日志
      console.log(`✅ RESPONSE: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        data: response.data,
      });

      return response;
    },
    (error) => {
      // 记录错误日志
      console.log('❌ RESPONSE ERROR:', {
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });

      // 处理401错误，清除token并重定向到登录页面
      if (error.response && error.response.status === 401) {
        AsyncStorage.removeItem('auth_token');
        AsyncStorage.removeItem('current_user');
        // 在实际应用中，这里应该触发导航到登录页面
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

// API类
class Api {
  private instance: AxiosInstance | null = null;
  private serverConfig: ServerConfig | null = null;

  // 初始化API实例
  init(serverConfig: ServerConfig) {
    this.serverConfig = serverConfig;
    this.instance = createApiInstance(serverConfig.url);
    console.log(`🔌 API initialized with server: ${serverConfig.url}`);
  }

  // 获取当前服务器配置
  getServerConfig(): ServerConfig | null {
    return this.serverConfig;
  }

  // 登录
  async login(username: string, password: string) {
    if (!this.instance) {throw new Error('API实例未初始化');}
    console.log(`🔑 Attempting login for user: ${username}`);
    const response = await this.instance.post<ApiResponse<any>>('/api/login', {
      username,
      password,
    });
    return response.data;
  }

  // 更新密码
  async changePassword(old: string, newPassword: string) {
    if (!this.instance) {throw new Error('API实例未初始化');}
    console.log('🔐 Attempting to change password');
    const response = await this.instance.post<ApiResponse<string>>(
      '/api/entry/user/changePassword',
      {
        old,
        new: newPassword,
        againNew: newPassword,
      }
    );
    return response.data;
  }

  // 更新密码
  async config() {
    if (!this.instance) {throw new Error('API实例未初始化');}
    console.log('🔐 Attempting to config');
    const response = await this.instance.get<ApiResponse<{
      title: string,
      description: string,
      keywords: string,
      version: string,
      openRegister: boolean
    }>>('/api/config');
    return response.data;
  }

  // 账本相关API
  book = {
    // 获取账本列表
    list: async (): Promise<ApiResponse<Book[]>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('📚 Fetching book list');
      const response = await this.instance.post<ApiResponse<Book[]>>('/api/entry/book/list', {});
      console.log('📚 Fetching book list response:', response.data);
      return response.data;
    },

    // 获取账本
    get: async (bookId: number): Promise<ApiResponse<Book>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📖 Fetching book details: ${bookId}`);
      const response = await this.instance.post<ApiResponse<Book>>(`/api/entry/book${bookId}`);
      return response.data;
    },

    // 添加账本
    create: async (data: string): Promise<ApiResponse<Book>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📝 Creating new book: ${data}`);
      const response = await this.instance.post<ApiResponse<Book>>('/api/entry/book/add', {
        'bookName': data,
      });
      return response.data;
    },

    // 分享账本
    share: async (data: any): Promise<ApiResponse<Book>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('🔗 Sharing book: ', data);
      const response = await this.instance.post<ApiResponse<Book>>('/api/entry/book/share', data);
      return response.data;
    },

    // 添加分享账本
    inshare: async (data: any): Promise<ApiResponse<string>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('📥 Importing shared book: ', data);
      const response = await this.instance.post<ApiResponse<string>>('/api/entry/book/inshare', data);
      return response.data;
    },

    // 更新账本
    update: async (data: Book): Promise<ApiResponse<Book>> => {
      console.log('✏️ Updating book:', data);
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post<ApiResponse<Book>>('/api/entry/book/update', data);
      return response.data;
    },

    // 删除账本
    delete: async (id: number): Promise<ApiResponse<void>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`🗑️ Deleting book: ${id}`);
      const response = await this.instance.post<ApiResponse<void>>('/api/entry/book/del',{id});
      return response.data;
    },
  };

  // 流水相关API
  flow = {
    // 分页获取流水列表
    page: async (params: {
      pageNum: number;
      pageSize: number;
      bookId: string;
      startDay?: string;
      endDay?: string;
      flowType?: string;
      industryType?: string;
      payType?: string;
      moneySort?: string;
      attribution?: string;
      name?: string;
      description?: string;
    }): Promise<ApiResponse<{
      total: number;
      pages: number;
      totalIn: number;
      totalOut: number;
      notInOut: number;
      data: Flow[];
    }>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📊 Fetching flows page ${params.pageNum} for book ${params.bookId}`, params);
      const response = await this.instance.post<ApiResponse<{
        total: number;
        pages: number;
        totalIn: number;
        totalOut: number;
        notInOut: number;
        data: Flow[];
      }>>('/api/entry/flow/page', params);
      return response.data;
    },

    // 添加流水
    create: async (data: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<Flow>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('➕ Creating new flow: ', data);
      const response = await this.instance.post<ApiResponse<Flow>>('/api/entry/flow/add', data);
      return response.data;
    },

    // 更新流水
    update: async (data: Partial<Omit<Flow, 'createdAt' | 'updatedAt'>>): Promise<ApiResponse<Flow>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('✏️ Updating flow: ', data);
      const response = await this.instance.post<ApiResponse<Flow>>('/api/entry/flow/update', data);
      return response.data;
    },

    // 删除流水
    delete: async (id: number, bookId: string): Promise<ApiResponse<void>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`🗑️ Deleting flow: ${id} from book ${bookId}`);
      const response = await this.instance.post<ApiResponse<void>>('/api/entry/flow/del',{
        id, bookId,
      });
      return response.data;
    },

    // 归属人列表
    attributions: async (bookId: string): Promise<ApiResponse<string[]>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📋 Fetching attributions details: ${bookId}`);
      const response = await this.instance.post<ApiResponse<string[]>>('/api/entry/flow/getAttributions',{bookId});
      return response.data;
    },

    // 支出类型列表
    industryType: async (bookId: string, flowType: string): Promise<ApiResponse<[{industryType: string}]>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📋 Fetching industryType details: ${bookId} ${flowType}`);
      const response = await this.instance.post<ApiResponse<[{industryType: string}]>>('/api/entry/flow/type/getIndustryType',{bookId,flowType});
      return response.data;
    },

    // 支出类型列表
    payType: async (bookId: string): Promise<ApiResponse<[{payType: string}]>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📋 Fetching payType details: ${bookId}`);
      const response = await this.instance.post<ApiResponse<[{payType: string}]>>('/api/entry/flow/type/getPayType',{bookId});
      return response.data;
    },

    // 获取重复流水
    getDuplicateFlows: async (params: {
      bookId: string;
      criteria: {
        name: boolean;
        description: boolean;
        industryType: boolean;
        flowType: boolean;
        payType: boolean;
      }
    }): Promise<ApiResponse<{
      duplicateGroups: Flow[][];
      totalGroups: number;
      totalDuplicates: number;
    }>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('🔍 Fetching duplicate flows with criteria:', params);
      const response = await this.instance.post('/api/entry/flow/deduplication/autos', params);
      return response.data;
    },

    // 获取平账候选数据
    getBalanceCandidates: async (params: {
      bookId: string;
    }): Promise<ApiResponse<Array<{
      out: Flow;
      in: Flow;
    }>>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`🔍 Fetching balance candidates for book: ${params.bookId}`);
      const response = await this.instance.post('/api/entry/flow/condidate/autos', params);
      return response.data;
    },

    // 确认平账
    confirmBalance: async (params: {
      outId: number;
      inIds: number[];
      bookId: string;
    }): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`✅ Confirming balance for outId: ${params.outId}, inIds: ${params.inIds.join(',')}`);
      const response = await this.instance.post('/api/entry/flow/condidate/confirm', params);
      return response.data;
    },

    // 忽略平账项
    ignoreBalanceItem: async (params: {
      id: number;
      bookId: string;
    }): Promise<ApiResponse<Flow>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`🚫 Ignoring balance item: ${params.id}`);
      const response = await this.instance.post('/api/entry/flow/condidate/ignore', params);
      return response.data;
    },

    // 忽略所有平账项
    ignoreAllBalanceItems: async (params: {
      bookId: string;
      ids: number[];
    }): Promise<ApiResponse<number>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`🚫 Ignoring all balance items: ${params.ids.join(',')}`);
      const response = await this.instance.post('/api/entry/flow/condidate/ignoreAll', params);
      return response.data;
    },

    // 小票上传
    uploadInvoice: async (id: number, bookId: string, image: any): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const formData = new FormData();
      formData.append('id', id.toString());
      formData.append('bookId', bookId);
      formData.append('invoice', {
        uri: image.uri,
        type: 'image/jpeg',
        name: image.fileName || 'invoice.jpg',
      });

      console.log(`📤 Uploading invoice for flow: ${id}`);
      const response = await this.instance.post('/api/entry/flow/invoice/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },

    // 获取小票图片URL
    getInvoiceUrl: (invoiceName: string): string => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      return `${this.serverConfig?.url}/api/entry/flow/invoice/show?invoice=${invoiceName}`;
    },

    // 删除小票
    deleteInvoice: async (id: number, bookId: string, invoice: string): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`🗑️ Deleting invoice: ${invoice} for flow: ${id}`);
      const response = await this.instance.post('/api/entry/flow/invoice/del', {
        id,
        bookId,
        invoice,
      });
      return response.data;
    },
  };

  // 分析相关API
  analytics = {
    // 流水归属统计
    attribution: async (params: {
      bookId: string;
      flowType: string;
      startDay: string;
      endDay: string;
    }) => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('📊 Fetching attribution analytics: ', params);
      const response = await this.instance.post<ApiResponse<any>>('/api/entry/analytics/attribution', params);
      return response.data;
    },

    // 每月流水统计
    month: async (bookId: string): Promise<ApiResponse<AnalyticsItem[]>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📅 Fetching monthly analytics for book: ${bookId}`);
      const response = await this.instance.post('/api/entry/analytics/month',{bookId});
      return response.data;
    },

    // 每日流水统计
    daily: async (bookId: string): Promise<ApiResponse<Array<{
      type: string;
      inSum: number;
      outSum: number;
      zeroSum: number;
    }>>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📆 Fetching daily analytics for book: ${bookId}`);
      const response = await this.instance.post('/api/entry/analytics/daily',{bookId});
      return response.data;
    },

    // 支付方式统计
    payType: async (params: {
      bookId: string;
      flowType: string;
      startDay: string;
      endDay: string;
    }): Promise<ApiResponse<Array<{
      type: string;
      inSum: number;
      outSum: number;
      zeroSum: number;
    }>>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('💳 Fetching payment type analytics: ', params);
      const response = await this.instance.post('/api/entry/analytics/payType', params);
      return response.data;
    },

    // 支出类型统计
    industryType: async (params: {
      bookId: string;
      flowType: string;
      startDay: string;
      endDay: string;
    }): Promise<ApiResponse<Array<{
      type: string;
      inSum: number;
      outSum: number;
      zeroSum: number;
    }>>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log('🏭 Fetching industry type analytics: ', params);
      const response = await this.instance.post('/api/entry/analytics/industryType', params);
      return response.data;
    },

    // 当月分析
    monthAnalysis: async (month: string, bookId: string): Promise<ApiResponse<MonthAnalysis>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      console.log(`📊 Fetching month analysis for ${month}, book: ${bookId}`);
      const response = await this.instance.post('/api/entry/analytics/monthAnalysis', { month, bookId });
      return response.data;
    },
  };

  // 预算相关API
  budget = {
    // 获取当月预算
    list: async (bookId: string, month: string): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post('/api/entry/budget/list', { bookId, month });
      return response.data;
    },

    // 更新预算
    update: async (data: { bookId: string, month: string, budget: number, id?: number }): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post('/api/entry/budget/update', data);
      return response.data;
    },

    // 刷新已用额度
    reloadUsedAmount: async (bookId: string, month: string): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post('/api/entry/budget/reloadUsedAmount', { bookId, month });
      return response.data;
    },
  };

  // 固定支出相关API
  fixedFlow = {
    // 获取固定支出列表
    list: async (bookId: string, month: string): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post('/api/entry/fixedFlow/list', { bookId, month });
      return response.data;
    },

    // 添加固定支出
    add: async (data: {
      bookId: string,
      month: string,
      startMonth: string,
      endMonth: string,
      name: string,
      money: number,
      attribution: string,
      description?: string,
      flowType?: string,
      industryType?: string,
      payType?: string
    }): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post('/api/entry/fixedFlow/add', data);
      return response.data;
    },

    // 更新固定支出
    update: async (data: any): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post('/api/entry/fixedFlow/update', data);
      return response.data;
    },

    // 删除固定支出
    delete: async (id: number, bookId: string): Promise<ApiResponse<any>> => {
      if (!this.instance) {throw new Error('API实例未初始化');}
      const response = await this.instance.post('/api/entry/fixedFlow/del', { id, bookId });
      return response.data;
    },
  };
}

// 导出单例
export const api = new Api();
export default api;
