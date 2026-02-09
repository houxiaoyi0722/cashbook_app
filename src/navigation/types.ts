import {Flow, OcrFlow} from '../types';

export type MainStackParamList = {
  MainTabs: undefined;
  FlowForm: {
    flowId?: number;
    date?: string;
    currentFlow?: Flow;
    ocrFlow?: OcrFlow;
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
  Calendar: undefined;
  Statistics: undefined;
  Budget: undefined;
  AIChat: undefined;
  Settings: undefined;
};
