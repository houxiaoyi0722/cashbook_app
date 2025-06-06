import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator, Text as RNText } from 'react-native';
import { Text, Icon, ListItem } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { ServerConfig } from '../../types';
import serverConfigManager from '../../services/serverConfig.ts';
import { useTheme, getColors } from '../../context/ThemeContext';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const ServerListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { serverConfig, serverConfigs, deleteServerConfig, switchServer, isLoading, isLoggedIn, isLogOut } = useAuth();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  // 初始化时设置当前选中的服务器
  useEffect(() => {
    const init = async () => {

      const storageServer = await serverConfigManager.getCurrentServer();
      // 未登录状态下自动选择服务器登录
      console.log('isLoggedIn',isLoggedIn);
      if (storageServer && !isLoggedIn && !isLogOut) {
        handleSelectServer(storageServer.id);
        setSelectedServerId(storageServer.id);
      }
      if (serverConfig) {
        setSelectedServerId(serverConfig.id);
      }
    };
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
  }, []);

  // 处理编辑服务器
  const handleEditServer = useCallback((server: ServerConfig) => {
    navigation.navigate('ServerForm', { serverId: server.id });
  }, []);

  // 渲染服务器项
  const renderServerItem = useCallback(({ item }: { item: ServerConfig }) => {
    const isSelected = item.id === selectedServerId;
    return (
      <TouchableOpacity
        style={[
          styles.customServerItem,
          isSelected && styles.selectedServerItem,
          { 
            backgroundColor: isSelected ? colors.primary + '20' : colors.card,
            borderColor: colors.border 
          }
        ]}
        onPress={() => handleSelectServer(item.id)}
      >
        <View style={styles.serverContent}>
          <Text style={[styles.serverName, { color: colors.text }]}>{item.name}</Text>
          <Text style={[styles.serverUrl, { color: colors.secondaryText }]}>{item.url}</Text>
        </View>

        <View style={styles.serverActions}>
          {isSelected && (
            <Icon
              name="check-circle"
              type="material"
              color={colors.success}
              size={24}
              containerStyle={styles.selectedIcon}
            />
          )}

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleEditServer(item);
            }}
            style={styles.actionButton}
          >
            <Icon name="edit" type="material" color={colors.primary} size={20} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteServer(item);
            }}
            style={styles.actionButton}
          >
            <Icon name="delete" type="material" color={colors.error} size={20} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }, [handleSelectServer, handleEditServer, handleDeleteServer, selectedServerId, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
      ) : (
        <>
          {serverConfigs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.text }]}>暂无服务器配置</Text>
              <Text style={[styles.emptySubText, { color: colors.secondaryText }]}>请点击右下角按钮添加服务器</Text>
            </View>
          ) : (
            <FlatList
              data={serverConfigs}
              renderItem={renderServerItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
            />
          )}

          <TouchableOpacity
            style={[styles.customFab, { backgroundColor: colors.primary }]}
            onPress={handleAddServer}
            activeOpacity={0.8}
          >
            <RNText style={styles.fabText}>+</RNText>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    margin: 16,
    marginBottom: 8,
  },
  listContent: {
    padding: 16,
  },
  customServerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectedServerItem: {
    borderWidth: 1,
  },
  serverContent: {
    flex: 1,
  },
  serverName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  serverUrl: {
    fontSize: 14,
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
    textAlign: 'center',
  },
  customFab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  fabText: {
    color: 'white',
    fontSize: 30,
    marginTop: -2,
  },
  loading: {
    marginTop: 20,
  },
});

export default ServerListScreen;
