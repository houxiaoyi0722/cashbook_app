import React, { useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { Button, Card, Text, Icon, ListItem, FAB } from '@rneui/themed';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { ServerConfig } from '../../types';

type Props = NativeStackScreenProps<MainStackParamList, 'ServerList'>;

const ServerListScreen: React.FC<Props> = ({ navigation }) => {
  const {
    serverConfigs,
    serverConfig: currentServer,
    refreshServerConfigs,
    deleteServerConfig,
    switchServer,
    isLoading
  } = useAuth();

  useEffect(() => {
    refreshServerConfigs();
  }, [refreshServerConfigs]);

  const handleAddServer = () => {
    navigation.navigate('ServerForm', {});
  };

  const handleEditServer = (serverId: string) => {
    navigation.navigate('ServerForm', { serverId });
  };

  const handleDeleteServer = (server: ServerConfig) => {
    Alert.alert(
      '确认删除',
      `确定要删除服务器"${server.name}"吗？`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteServerConfig(server.id);
              Alert.alert('成功', '服务器已删除');
            } catch (error) {
              console.error('删除服务器失败', error);
              Alert.alert('错误', '删除服务器失败');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleSelectServer = async (server: ServerConfig) => {
    try {
      await switchServer(server.id);
      navigation.navigate('Login');
    } catch (error) {
      console.error('切换服务器失败', error);
      Alert.alert('错误', '切换服务器失败');
    }
  };

  const renderServerItem = (server: ServerConfig) => {
    const isSelected = currentServer?.id === server.id;
    return (
      <ListItem
        key={server.id}
        containerStyle={[
          styles.serverItem,
          isSelected && styles.selectedServerItem,
        ]}
        onPress={() => handleSelectServer(server)}
      >
        <Icon
          name="server"
          type="material-community"
          color={isSelected ? '#1976d2' : '#757575'}
          size={24}
        />
        <ListItem.Content>
          <ListItem.Title style={isSelected ? styles.selectedServerTitle : undefined}>
            {server.name}
          </ListItem.Title>
          <ListItem.Subtitle>{server.url}</ListItem.Subtitle>
        </ListItem.Content>

        <View style={styles.serverActions}>
          <Button
            key={`edit-${server.id}`}
            type="clear"
            icon={
              <Icon
                name="edit"
                type="material"
                color="#1976d2"
                size={20}
              />
            }
            onPress={() => handleEditServer(server.id)}
          />
          <Button
            key={`delete-${server.id}`}
            type="clear"
            icon={
              <Icon
                name="delete"
                type="material"
                color="#f44336"
                size={20}
              />
            }
            onPress={() => handleDeleteServer(server)}
          />
        </View>
      </ListItem>
    );
  };

  return (
    <View style={styles.container}>
      <Card containerStyle={styles.headerCard}>
        <Card.Title>服务器列表</Card.Title>
        <Text style={styles.headerText}>
          选择一个服务器连接到记账应用，或添加一个新服务器
        </Text>
      </Card>

      <ScrollView contentContainerStyle={styles.serverList}>
        {isLoading ? (
          <Card containerStyle={styles.messageCard}>
            <Text style={styles.messageText}>加载中...</Text>
          </Card>
        ) : serverConfigs.length === 0 ? (
          <Card containerStyle={styles.messageCard}>
            <Text style={styles.messageText}>
              暂无服务器配置，请点击右下角的"+"按钮添加服务器
            </Text>
          </Card>
        ) : (
          serverConfigs.map((server) => renderServerItem(server))
        )}
      </ScrollView>

      <FAB
        icon={
          <Icon
            name="add"
            color="white"
            size={24}
          />
        }
        color="#1976d2"
        placement="right"
        onPress={handleAddServer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerCard: {
    margin: 10,
    borderRadius: 10,
  },
  headerText: {
    textAlign: 'center',
    marginBottom: 10,
    color: '#757575',
  },
  serverList: {
    padding: 10,
  },
  serverItem: {
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: 'white',
  },
  selectedServerItem: {
    backgroundColor: '#e3f2fd',
  },
  selectedServerTitle: {
    color: '#1976d2',
    fontWeight: 'bold',
  },
  serverActions: {
    flexDirection: 'row',
  },
  messageCard: {
    margin: 10,
    padding: 20,
    borderRadius: 10,
  },
  messageText: {
    textAlign: 'center',
    color: '#757575',
  },
});

export default ServerListScreen;
