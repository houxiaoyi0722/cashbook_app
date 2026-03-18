import {Flow, OCRResult} from '../types';

export type MainStackParamList = {
  MainTabs: undefined;
  FlowForm: {
    flowId?: number;
    date?: string;
    currentFlow?: Flow;
    ocrResult?: OCRResult; // 添加 OCRResult 参数
  };
  FlowDetail: {
    currentFlow: Flow;
  };
  BookForm: {
    bookId?: string;
  };
  BookList: undefined;
  ServerList: undefined;
  ServerForm: {
    serverId?: string;
  };
  Login: undefined;
  Logs: undefined;
  SyncManagement: undefined;
  AIConfig: undefined;
  AIConfigEdit: {
    configId?: string;
  };
};

export type MainTabParamList = {
  Calendar: { sharedImageUri?: string } | undefined;
  Statistics: undefined;
  Budget: undefined;
  AIChat: { sharedImageUri?: string; sharedImageUris?: string[] } | undefined;
  Settings: undefined;
};
