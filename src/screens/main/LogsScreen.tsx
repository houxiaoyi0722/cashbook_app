import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Button, Card, Divider, Icon } from '@rneui/themed';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { logger } from '../../services/LogService';
import RNFS from 'react-native-fs';

type LogFile = {
  path: string;
  name: string;
  size: string;
  date: string;
};

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const LogsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [totalSize, setTotalSize] = useState('0 B');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 安全地获取日志目录路径
  const getLogDirectoryPath = () => {
    return Platform.OS === 'android'
      ? `${RNFS.ExternalDirectoryPath}/cashbook_logs`
      : `${RNFS.DocumentDirectoryPath}/cashbook_logs`;
  };

  // 确保日志目录存在
  const ensureLogDirectory = async () => {
    try {
      const logDir = getLogDirectoryPath();
      const exists = await RNFS.exists(logDir);
      
      if (!exists) {
        await RNFS.mkdir(logDir);
        console.log('已创建日志目录:', logDir);
      }
      return logDir;
    } catch (error) {
      console.error('确保日志目录存在时出错:', error);
      return null;
    }
  };

  // 直接从文件系统获取日志文件
  const getLogFilesFromFS = async () => {
    try {
      const logDir = getLogDirectoryPath();
      const exists = await RNFS.exists(logDir);
      
      if (!exists) {
        return [];
      }
      
      const files = await RNFS.readDir(logDir);
      return files.filter(file => file.isFile());
    } catch (error) {
      console.error('从文件系统获取日志文件失败:', error);
      return [];
    }
  };

  // 获取日志文件信息
  const fetchLogFiles = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // 确保日志目录存在
      await ensureLogDirectory();
      
      // 直接从文件系统获取日志文件
      const fsFiles = await getLogFilesFromFS();
      
      console.log('找到日志文件数量:', fsFiles.length);
      
      const files: LogFile[] = [];
      let totalBytes = 0;

      // 如果有文件，则处理每个文件
      if (fsFiles && fsFiles.length > 0) {
        for (const file of fsFiles) {
          try {
            const fileName = file.name;
            const fileSize = file.size;
            totalBytes += fileSize;

            files.push({
              path: file.path,
              name: fileName,
              size: formatBytes(fileSize),
              date: new Date(file.mtime || Date.now()).toLocaleString(),
            });
          } catch (err) {
            console.error('处理文件信息失败:', err);
          }
        }

        // 按修改时间倒序排序
        files.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }

      setLogFiles(files);
      setTotalSize(formatBytes(totalBytes));

      // 手动记录日志
      try {
        await logger.info('LogsScreen', '成功获取日志文件列表');
      } catch (logError) {
        console.warn('记录日志失败:', logError);
      }
    } catch (error) {
      console.error('获取日志文件列表失败:', error);
      setErrorMessage('获取日志文件失败，请稍后重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 格式化字节数
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) {return '0 B';}

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // 清理所有日志
  const handleClearLogs = () => {
    Alert.alert(
      '确认清理',
      '确定要清理所有日志文件吗？此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // 尝试使用库的方法清理
              try {
                await logger.deleteAllLogs();
              } catch (libError) {
                console.warn('使用库方法清理日志失败:', libError);
              }

              // 手动删除日志目录中的所有文件
              try {
                const logDir = getLogDirectoryPath();
                const exists = await RNFS.exists(logDir);
                
                if (exists) {
                  const files = await RNFS.readDir(logDir);
                  for (const file of files) {
                    if (file.isFile()) {
                      await RNFS.unlink(file.path);
                    }
                  }
                }
              } catch (dirError) {
                console.warn('手动清理日志文件失败:', dirError);
              }

              // 重新初始化日志服务以创建新的日志文件
              try {
                await logger.initialize();
              } catch (initError) {
                console.warn('重新初始化日志服务失败:', initError);
              }

              setTimeout(() => {
                logger.info('LogsScreen', '成功清理所有日志文件');
              }, 500);

              Alert.alert('成功', '已清理所有日志文件');
              fetchLogFiles();
            } catch (error) {
              console.error('清理日志文件失败:', error);
              Alert.alert('错误', '清理日志文件失败，请稍后重试');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 发送日志文件
  const handleSendLogs = async () => {
    setLoading(true);
    try {
      if (logFiles.length === 0) {
        Alert.alert('提示', '当前没有日志文件可发送');
        setLoading(false);
        return;
      }

      // 尝试使用库的方法发送
      try {
        await logger.sendLogsByEmail({
          subject: 'Cashbook App 日志文件 - ' + new Date().toLocaleString(),
        });
      } catch (sendError) {
        // 如果库方法失败，使用替代方法
        Alert.alert('提示', '发送日志文件失败，请稍后重试');
        console.error('发送日志文件失败:', sendError);
      }

      setTimeout(() => {
        logger.info('LogsScreen', '成功发送日志文件');
      }, 500);
    } catch (error) {
      console.error('发送日志文件失败:', error);
      Alert.alert('错误', '发送日志文件失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 手动创建测试日志文件（用于测试）
  const handleCreateTestLog = async () => {
    setLoading(true);
    try {
      const logDir = await ensureLogDirectory();
      if (!logDir) {
        Alert.alert('错误', '无法创建日志目录');
        setLoading(false);
        return;
      }

      // 创建一个测试日志文件
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testFilePath = `${logDir}/test-log-${timestamp}.txt`;
      const content = `这是一个测试日志文件\n创建时间: ${new Date().toLocaleString()}\n`;

      await RNFS.writeFile(testFilePath, content, 'utf8');
      console.log('测试日志文件已创建:', testFilePath);

      Alert.alert('成功', '测试日志文件已创建');
      fetchLogFiles();
    } catch (error) {
      console.error('创建测试日志文件失败:', error);
      Alert.alert('错误', '创建测试日志文件失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建一条应用日志（用于测试）
  const handleCreateAppLog = async () => {
    setLoading(true);
    try {
      // 确保日志目录存在
      await ensureLogDirectory();
      
      // 记录不同级别的日志
      console.log('开始记录测试日志');
      
      // 测试控制台日志捕获
      console.log('这是一条console.log测试日志');
      console.info('这是一条console.info测试日志');
      console.warn('这是一条console.warn测试日志');
      console.error('这是一条console.error测试日志');
      
      // 使用 await 确保日志已写入
      await logger.debug('LogsScreen', '这是一条调试日志');
      await logger.info('LogsScreen', '这是一条信息日志');
      await logger.warn('LogsScreen', '这是一条警告日志');
      await logger.error('LogsScreen', '这是一条错误日志', new Error('测试错误'));
      
      console.log('日志记录完成');
      
      Alert.alert('成功', '已创建应用日志记录');
      
      // 等待较长时间让日志写入文件系统
      setTimeout(() => {
        fetchLogFiles();
      }, 2000);
    } catch (error) {
      console.error('创建应用日志失败:', error);
      Alert.alert('错误', '创建应用日志失败');
    } finally {
      setLoading(false);
    }
  };

  // 刷新日志列表
  const onRefresh = () => {
    setRefreshing(true);
    fetchLogFiles();
  };

  // 组件挂载时获取日志文件列表
  useEffect(() => {
    fetchLogFiles();
    
    // 记录页面访问日志
    try {
      logger.debug('LogsScreen', '访问日志管理页面');
    } catch (error) {
      console.warn('记录访问日志失败:', error);
    }
    
    return () => {
      try {
        logger.debug('LogsScreen', '离开日志管理页面');
      } catch (error) {
        console.warn('记录离开日志失败:', error);
      }
    };
  }, []);

  // 渲染日志文件项
  const renderLogFileItem = ({ item }: { item: LogFile }) => (
    <Card containerStyle={styles.fileCard}>
      <View style={styles.fileHeader}>
        <Icon name="description" type="material" size={20} color="#1976d2" />
        <Text style={styles.fileName} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      <Divider style={styles.divider} />
      <View style={styles.fileInfo}>
        <Text style={styles.fileInfoText}>
          <Text style={styles.fileInfoLabel}>大小：</Text>
          {item.size}
        </Text>
        <Text style={styles.fileInfoText}>
          <Text style={styles.fileInfoLabel}>修改时间：</Text>
          {item.date}
        </Text>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" type="material" size={24} color="#1976d2" />
          </TouchableOpacity>
          <Text style={styles.title}>日志管理</Text>
          <View style={styles.placeholder} />
        </View>

        <Card containerStyle={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>日志文件数</Text>
              <Text style={styles.summaryValue}>{logFiles.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>总大小</Text>
              <Text style={styles.summaryValue}>{totalSize}</Text>
            </View>
          </View>
        </Card>

        <View style={styles.actionsContainer}>
          <Button
            title="发送日志"
            icon={{
              name: 'send',
              type: 'material',
              color: 'white',
              size: 20,
            }}
            buttonStyle={[styles.actionButton, { backgroundColor: '#4caf50' }]}
            onPress={handleSendLogs}
            disabled={loading || logFiles.length === 0}
          />
          <Button
            title="清理日志"
            icon={{
              name: 'delete',
              type: 'material',
              color: 'white',
              size: 20,
            }}
            buttonStyle={[styles.actionButton, { backgroundColor: '#f44336' }]}
            onPress={handleClearLogs}
            disabled={loading || logFiles.length === 0}
          />
        </View>

        {/* 添加测试按钮 */}
        {__DEV__ && (
          <View style={styles.devContainer}>
            <View style={styles.devButtonRow}>
              <Button
                title="创建测试日志"
                icon={{
                  name: 'add',
                  type: 'material',
                  color: 'white',
                  size: 18,
                }}
                buttonStyle={[styles.devButton, { backgroundColor: '#9c27b0' }]}
                onPress={handleCreateTestLog}
                disabled={loading}
              />
              <Button
                title="创建应用日志"
                icon={{
                  name: 'bug-report',
                  type: 'material',
                  color: 'white',
                  size: 18,
                }}
                buttonStyle={[styles.devButton, { backgroundColor: '#ff9800' }]}
                onPress={handleCreateAppLog}
                disabled={loading}
              />
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>日志文件列表</Text>

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorContainer}>
            <Icon name="error" type="material" size={48} color="#f44336" />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Button
              title="重试"
              buttonStyle={styles.retryButton}
              onPress={fetchLogFiles}
            />
          </View>
        ) : logFiles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="description" type="material" size={48} color="#e0e0e0" />
            <Text style={styles.emptyText}>暂无日志文件</Text>
            {__DEV__ && (
              <Text style={styles.emptySubText}>
                您可以点击上方的按钮创建测试日志或应用日志
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={logFiles}
            renderItem={renderLogFileItem}
            keyExtractor={(item) => item.path}
            contentContainerStyle={styles.fileList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#1976d2']}
                tintColor="#1976d2"
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'white',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 32,
  },
  summaryCard: {
    margin: 12,
    borderRadius: 10,
    padding: 15,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  summaryDivider: {
    height: '100%',
    width: 1,
    backgroundColor: '#e0e0e0',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  devContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  devButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 16,
  },
  devButton: {
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  fileList: {
    paddingBottom: 16,
  },
  fileCard: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 8,
    padding: 12,
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 8,
    flex: 1,
  },
  divider: {
    marginVertical: 8,
  },
  fileInfo: {
    marginTop: 4,
  },
  fileInfoText: {
    fontSize: 13,
    color: '#666',
    marginVertical: 2,
  },
  fileInfoLabel: {
    fontWeight: 'bold',
    color: '#444',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 50,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
  },
  emptySubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#9e9e9e',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

export default LogsScreen;
