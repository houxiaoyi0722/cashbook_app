import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Text, Card, Icon, ListItem, Dialog, Input } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { MainStackParamList } from '../../navigation/types';
import { version } from '../../../package.json';
import updateService from '../../services/updateService';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout } = useAuth();

  const [isChangePasswordVisible, setIsChangePasswordVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 处理退出登录
  const handleLogout = async () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '确定',
          onPress: async () => {
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'ServerList' }],
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 处理切换服务器
  const handleSwitchServer = () => {
    navigation.navigate('ServerList');
  };

  // 处理修改密码
  const handleChangePassword = async () => {
    if (!validatePasswordForm()) return;

    try {
      setIsLoading(true);
      // 调用修改密码API
      // const response = await api.auth.changePassword(oldPassword, newPassword);

      // if (response.c === 200) {
      //   Alert.alert('成功', '密码修改成功');
      //   setIsChangePasswordVisible(false);
      //   resetPasswordForm();
      // } else {
      //   Alert.alert('错误', response.m || '密码修改失败');
      // }

      // 模拟API调用
      setTimeout(() => {
        Alert.alert('成功', '密码修改成功');
        setIsChangePasswordVisible(false);
        resetPasswordForm();
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      console.error('修改密码失败', error);
      Alert.alert('错误', '修改密码失败');
      setIsLoading(false);
    }
  };

  // 验证密码表单
  const validatePasswordForm = () => {
    if (!oldPassword) {
      Alert.alert('错误', '请输入原密码');
      return false;
    }

    if (!newPassword) {
      Alert.alert('错误', '请输入新密码');
      return false;
    }

    if (newPassword.length < 6) {
      Alert.alert('错误', '新密码长度不能少于6位');
      return false;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('错误', '两次输入的新密码不一致');
      return false;
    }

    return true;
  };

  // 重置密码表单
  const resetPasswordForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  // 渲染用户信息
  const renderUserInfo = () => (
    <Card containerStyle={styles.card}>
      <View style={styles.userInfoContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{userInfo?.name || '未登录'}</Text>
          <Text style={styles.userEmail}>{userInfo?.email || ''}</Text>
        </View>
      </View>
    </Card>
  );

  // 渲染账户设置
  const renderAccountSettings = () => (
    <Card containerStyle={styles.card}>
      <Card.Title>账户设置</Card.Title>

      <ListItem onPress={() => setIsChangePasswordVisible(true)} bottomDivider key="change-password">
        <Icon name="lock" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>修改密码</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      <ListItem onPress={handleSwitchServer} bottomDivider key="switch-server">
        <Icon name="swap-horiz" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>切换服务器</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>

      <ListItem onPress={handleLogout} key="logout">
        <Icon name="logout" type="material" color="#f44336" />
        <ListItem.Content>
          <ListItem.Title style={{ color: '#f44336' }}>退出登录</ListItem.Title>
        </ListItem.Content>
        <ListItem.Chevron />
      </ListItem>
    </Card>
  );

  // 渲染关于信息
  const renderAboutInfo = () => (
    <Card containerStyle={styles.card}>
      <Card.Title>关于</Card.Title>

      <ListItem bottomDivider key="version">
        <Icon name="info" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>版本</ListItem.Title>
          <ListItem.Subtitle>{version || '1.0.0'}</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>

      <ListItem key="developer">
        <Icon name="code" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>开发者</ListItem.Title>
          <ListItem.Subtitle>sang</ListItem.Subtitle>
        </ListItem.Content>
      </ListItem>
      <ListItem key="developer" onPress={() => updateService.checkForUpdates()}>
        <Icon name="code" type="material" color="#1976d2" />
        <ListItem.Content>
          <ListItem.Title>检查更新</ListItem.Title>
        </ListItem.Content>
      </ListItem>
    </Card>
  );

  // 渲染修改密码对话框
  const renderChangePasswordDialog = () => (
    <Dialog
      isVisible={isChangePasswordVisible}
      onBackdropPress={() => !isLoading && setIsChangePasswordVisible(false)}
      overlayStyle={styles.dialog}
    >
      <Dialog.Title title="修改密码" />

      <Input
        placeholder="原密码"
        secureTextEntry
        leftIcon={{ type: 'material', name: 'lock' }}
        value={oldPassword}
        onChangeText={setOldPassword}
        disabled={isLoading}
      />

      <Input
        placeholder="新密码"
        secureTextEntry
        leftIcon={{ type: 'material', name: 'lock-outline' }}
        value={newPassword}
        onChangeText={setNewPassword}
        disabled={isLoading}
      />

      <Input
        placeholder="确认新密码"
        secureTextEntry
        leftIcon={{ type: 'material', name: 'lock-outline' }}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        disabled={isLoading}
      />

      <Dialog.Actions>
        <Dialog.Button
          title="取消"
          onPress={() => setIsChangePasswordVisible(false)}
          disabled={isLoading}
        />
        <Dialog.Button
          title={isLoading ? '提交中...' : '提交'}
          onPress={handleChangePassword}
          disabled={isLoading}
        />
      </Dialog.Actions>
    </Dialog>
  );

  return (
    <View style={styles.container}>
      <ScrollView>
        {renderUserInfo()}
        {renderAccountSettings()}
        {renderAboutInfo()}
      </ScrollView>

      {renderChangePasswordDialog()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userDetails: {
    marginLeft: 15,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 14,
    color: '#757575',
  },
  dialog: {
    borderRadius: 10,
    padding: 20,
  },
  settingItem: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 8,
  },
  settingText: {
    fontSize: 16,
  },
});

export default SettingsScreen;
