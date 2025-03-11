export type MainStackParamList = {
  MainTabs: undefined;
  FlowForm: {
    flowId?: number;
    date?: string;
  };
  FlowDetail: {
    flowId: number;
  };
  BookForm: {
    bookId?: number;
  };
  BookList: undefined;
  ServerList: undefined;
  ServerForm: {
    serverId?: string;
  };
  Login: undefined;
};

export type MainTabParamList = {
  Calendar: undefined;
  Statistics: undefined;
  Settings: undefined;
}; 