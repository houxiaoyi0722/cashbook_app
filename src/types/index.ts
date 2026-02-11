// 服务器配置类型
export interface ServerConfig {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  loggingEnabled?: boolean; // 日志记录开关，默认为 false
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
  invoice?: string;
  day: string;
  createdAt: string;
  updatedAt: string;
}

export interface OcrFlow {
  name: string;
  money: number;
  flowType: '收入' | '支出' | '不计收支';
  industryType: string;
  payType: string;
  description?: string;
  attribution?: string;
  invoice?: string;
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
  id?: number;
  bookId: string;
  userId?: number;
  month: string;
  budget: number;
  used: number;
}

// 固定支出类型
export interface FixedFlow {
  id?: number;
  bookId: string;
  userId?: number;
  month: string;
  money: number;
  name: string;
  description?: string | null;
  flowType?: string | null;
  industryType?: string | null;
  payType?: string | null;
  attribution: string;
}

// 日历数据类型
export interface DailyData {
  [date: string]: {
    inSum: number;
    outSum: number;
    zeroSum: number;
  };
}

// ==================== AI 聊天消息类型 ====================

// 基础消息接口
export interface BaseMessage {
  id: string;
  isUser: boolean;
  type: string;
  timestamp: Date;
  collapsed?: boolean;
  error?: boolean;
  loading?: boolean;
  metadata?: Record<string, any>;
}

// 文本消息
export interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
}

// 思考消息
export interface ThinkingMessage extends BaseMessage {
  type: 'thinking';
  thinkingContent: string;
}

// 工具调用消息
export interface ToolCallMessage extends BaseMessage {
  type: 'tool_call';
  toolName: string;
  arguments: any;
  loading?: boolean;
  resultMessage? : ToolResultMessage
}

// 工具结果消息
export interface ToolResultMessage extends BaseMessage {
  type: 'tool_result';
  toolName: string;
  success: boolean;
  result?: any;
  errorMessage?: string;
  duration?: number;
}

// 图片消息
export interface ImageMessage extends BaseMessage {
  type: 'image';
  imageUri: string;
  caption?: string;
}

// OCR识别结果
export interface OCRResult {
  flow: OcrFlow | null | undefined;
  imageUri?: string; // 图片的URI
}

// AI复合消息 - 包含一次AI回复的所有部分
export interface AIMessage extends BaseMessage {
  type: 'ai';
  messageList: Array<BaseMessage>; // 消息列表，包含文本、思考、工具调用等
  collapsed?: boolean; // 是否折叠（用于思考内容和工具详情）
}

// 消息联合类型
export type Message = TextMessage | ThinkingMessage | ToolCallMessage | ToolResultMessage | ImageMessage | AIMessage;

// 工厂函数

// 创建文本消息
export function createTextMessage(
  content: string,
  isUser: boolean,
  options?: {
    id?: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
    collapsed?: boolean;
    error?: boolean;
    loading?: boolean;
  }
): TextMessage {
  return {
    id: options?.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'text',
    isUser,
    content,
    timestamp: options?.timestamp || new Date(),
    collapsed: options?.collapsed,
    error: options?.error,
    loading: options?.loading,
  };
}

// 创建思考消息
export function createThinkingMessage(
  thinkingContent: string,
  options?: {
    id?: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
    collapsed?: boolean;
    error?: boolean;
    loading?: boolean;
  }
): ThinkingMessage {
  return {
    id: options?.id || `thinking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'thinking',
    isUser: false,
    thinkingContent,
    timestamp: options?.timestamp || new Date(),
    collapsed: options?.collapsed,
    error: options?.error,
    loading: options?.loading,
  };
}

// 创建工具调用消息
export function createToolCallMessage(
  toolName: string,
  arguments_: any,
  options?: {
    id?: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
    collapsed?: boolean;
    loading?: boolean;
    error?: boolean;
  }
): ToolCallMessage {
  return {
    id: options?.id || `tool_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'tool_call',
    isUser: false,
    toolName,
    arguments: arguments_,
    timestamp: options?.timestamp || new Date(),
    collapsed: options?.collapsed,
    loading: options?.loading,
    error: options?.error,
  };
}

// 创建工具结果消息
export function createToolResultMessage(
  toolName: string,
  success: boolean,
  options?: {
    id?: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
    collapsed?: boolean;
    result?: any;
    errorMessage?: string;
    duration?: number;
    error?: boolean;
    loading?: boolean;
  }
): ToolResultMessage {
  return {
    id: options?.id || `tool_result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'tool_result',
    isUser: false,
    toolName,
    success,
    timestamp: options?.timestamp || new Date(),
    collapsed: options?.collapsed,
    result: options?.result,
    errorMessage: options?.errorMessage,
    duration: options?.duration,
    error: options?.error,
    loading: options?.loading,
  };
}

// 创建图片消息
export function createImageMessage(
  imageUri: string,
  isUser: boolean,
  options?: {
    id?: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
    collapsed?: boolean;
    error?: boolean;
    loading?: boolean;
    caption?: string;
  }
): ImageMessage {
  return {
    id: options?.id || `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'image',
    isUser,
    imageUri,
    caption: options?.caption,
    timestamp: options?.timestamp || new Date(),
    collapsed: options?.collapsed,
    error: options?.error,
    loading: options?.loading,
  };
}

// 创建AI复合消息
export function createAIMessage(
  messageList: Array<BaseMessage>,
  options?: {
    id?: string;
    timestamp?: Date;
    metadata?: Record<string, any>;
    collapsed?: boolean;
    error?: boolean;
    loading?: boolean;
  }
): AIMessage {
  return {
    id: options?.id || `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'ai',
    isUser: false,
    messageList,
    timestamp: options?.timestamp || new Date(),
    collapsed: options?.collapsed,
    error: options?.error,
    loading: options?.loading,
  };
}
