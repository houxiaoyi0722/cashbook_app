import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Icon, ListItem, FAB } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { ServerConfig } from '../../types';
import serverConfigManager from "../../services/serverConfig.ts";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const ServerListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { serverConfigs, deleteServerConfig, switchServer, isLoading } = useAuth();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  // 初始化时设置当前选中的服务器
  useEffect(() => {
    const init = async () => {
      const currentServer = await serverConfigManager.getCurrentServer();
      if (currentServer) {
        handleSelectServer(currentServer.id)
        setSelectedServerId(currentServer.id);
      }
    }
    init();
  }, []);

  // 处理服务器选择
  const handleSelectServer = useCallback(async (serverId: string) => {
    try {
      setSelectedServerId(serverId);
      await switchServer(serverId);
      requestAnimationFrame(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        });
      });
    } catch (error) {
      console.error('切换服务器失败', error);
      Alert.alert(
          '登录失败',
          `登录失败${error}`,
          [{ text: '确定' }]
      );
    }
  }, [switchServer]);

  // 处理服务器删除
  const handleDeleteServer = useCallback((server: ServerConfig) => {
    Alert.alert(
      '确认删除',
      `确定要删除服务器 "${server.name}" 吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteServerConfig(server.id);
            } catch (error) {
              console.error('删除服务器失败', error);
              Alert.alert('错误', '删除服务器失败');
            }
          },
        },
      ]
    );
  }, [deleteServerConfig]);

  // 处理添加服务器
  const handleAddServer = useCallback(() => {
    navigation.navigate('ServerForm', {});
  }, [navigation]);

  // 处理编辑服务器
  const handleEditServer = useCallback((server: ServerConfig) => {
    navigation.navigate('ServerForm', { serverId: server.id });
  }, [navigation]);

  // 渲染服务器项
  const renderServerItem = useCallback(({ item }: { item: ServerConfig }) => {
    const isSelected = item.id === selectedServerId;

    return (
      <ListItem
        containerStyle={[
          styles.serverItem,
          isSelected && styles.selectedServerItem,
        ]}
        onPress={() => handleSelectServer(item.id)}
      >
        <ListItem.Content>
          <ListItem.Title style={styles.serverName}>{item.name}</ListItem.Title>
          <ListItem.Subtitle style={styles.serverUrl}>{item.url}</ListItem.Subtitle>
        </ListItem.Content>

        <View style={styles.serverActions}>
          {isSelected && (
            <Icon
              name="check-circle"
              type="material"
              color="#4caf50"
              size={24}
              containerStyle={styles.selectedIcon}
            />
          )}

          <TouchableOpacity
            onPress={() => handleEditServer(item)}
            style={styles.actionButton}
          >
            <Icon name="edit" type="material" color="#2196f3" size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleDeleteServer(item)}
            style={styles.actionButton}
          >
            <Icon name="delete" type="material" color="#f44336" size={20} />
          </TouchableOpacity>
        </View>
      </ListItem>
    );
  }, [handleSelectServer, handleEditServer, handleDeleteServer, selectedServerId]);

  return (
    <View style={styles.container}>
      <Text h4 style={styles.title}>服务器列表</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#1976d2" style={styles.loading} />
      ) : (
        <>
          {serverConfigs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无服务器配置</Text>
              <Text style={styles.emptySubText}>请点击右下角按钮添加服务器</Text>
            </View>
          ) : (
            <FlatList
              data={serverConfigs}
              renderItem={renderServerItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
            />
          )}

          <FAB
            icon={<Icon name="add" color="white" />}
            color="#1976d2"
            placement="right"
            style={styles.fab}
            onPress={handleAddServer}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    margin: 16,
    marginBottom: 8,
  },
  listContent: {
    padding: 16,
  },
  serverItem: {
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: 'white',
  },
  selectedServerItem: {
    backgroundColor: '#e3f2fd',
  },
  serverName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  serverUrl: {
    fontSize: 14,
    color: '#757575',
  },
  serverActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedIcon: {
    marginRight: 8,
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
  fab: {
    margin: 16,
  },
  loading: {
    flex: 1,
  },
});

export default ServerListScreen;
