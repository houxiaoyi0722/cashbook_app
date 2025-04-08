// 服务器配置类型
export interface ServerConfig {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
}

// 用户信息类型
export interface UserInfo {
  id: number;
  name: string;
  email: string;
  token: string;
}

// 账本类型
export interface Book {
  id: number;
  bookId: string;
  bookName: string;
  shareKey?: string;
  createDate: string;
  userId: string;
}

// 流水类型
export interface Flow {
  id: number;
  bookId: string;
  name: string;
  money: number;
  flowType: '收入' | '支出' | '不计收支';
  industryType: string;
  payType: string;
  description?: string;
  attribution?: string;
  day: string;
  createdAt: string;
  updatedAt: string;
}

// 分页响应类型
export interface PageResponse<T> {
  total: number;
  data: T[];
  pages: number;
  totalIn?: number;
  totalOut?: number;
  notInOut?: number;
}

// API响应类型
export interface ApiResponse<T = any> {
  c: number;
  m: string;
  d: T;
}

// 分析数据类型
export interface AnalyticsItem {
  type: string;
  inSum: number;
  outSum: number;
  zeroSum: number;
}

// 月度分析类型
export interface MonthAnalysis {
  month: string;
  inSum: string;
  outSum: string;
  zeroSum: string;
  maxInType: string;
  maxInTypeSum: string;
  maxOutType: string;
  maxOutTypeSum: string;
  maxIn: Flow;
  maxOut: Flow;
  maxZero: Flow;
}

// 日历标记类型
export interface CalendarMark {
  [date: string]: {
    selected: boolean,
    marked?: boolean;
    dotColor?: string;
    customStyles?: {
      container?: {
        backgroundColor?: string;
      };
      text?: {
        color?: string;
      };
    };
  };
}

// 预算类型
export interface Budget {
  id: string;
  bookId: string;
  month: string;
  totalAmount: number;
  categoryBudgets: {
    [category: string]: number;
  };
  createdAt: string;
  updatedAt: string;
}

// 日历数据类型
export interface DailyData {
  [date: string]: {
    inSum: number;
    outSum: number;
    zeroSum: number;
  };
}
