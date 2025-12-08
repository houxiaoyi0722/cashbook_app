import {Flow} from '../types';

export type MainStackParamList = {
  MainTabs: undefined;
  FlowForm: {
    flowId?: number;
    date?: string;
    currentFlow?: Flow;
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
};

export type MainTabParamList = {
  Calendar: undefined;
  Statistics: undefined;
  Budget: undefined;
  AIChat: undefined;
  Settings: undefined;
};
