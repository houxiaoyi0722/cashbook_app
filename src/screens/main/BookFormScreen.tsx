import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Card, Button, Input } from '@rneui/themed';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBook } from '../../context/BookContext';
import { MainStackParamList } from '../../navigation/types';
import Clipboard from '@react-native-clipboard/clipboard';
import { useTheme, getColors } from '../../context/ThemeContext';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, 'BookForm'>;

const BookFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { bookId } = route.params || {};
  const { isDarkMode } = useTheme();
  const colors = getColors(isDarkMode);

  const { createBook, shareBook, updateBook, books} = useBook();

  const [name, setName] = useState('');
  const [shareKey, setShareKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isShared, setIsShared] = useState(false);

  // 获取账本详情
  useEffect(() => {
    const fetchBookDetail = async () => {
      if (!bookId) {return;}

      try {
        setIsFetching(true);
        let book = books.find(item => item.bookId == bookId);
        setName(book!.bookName);
        if (book?.shareKey) {
          setShareKey(book.shareKey);
          setIsShared(true);
        }
      } catch (error) {
        console.error('获取账本详情失败', error);
        Alert.alert('错误', '获取账本详情失败');
        navigation.goBack();
      } finally {
        setIsFetching(false);
      }
    };

    fetchBookDetail();
  }, [bookId, books, navigation]);

  // 验证表单
  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert('错误', '请输入账本名称');
      return false;
    }

    return true;
  };

  // 处理保存
  const handleSave = async () => {
    if (!validateForm()) {return;}

    try {
      setIsLoading(true);

      if (bookId) {
        // 更新账本
        let data = books.find(item => item.bookId == bookId)!;
        data.bookName = name;
        await updateBook(bookId, data);
      } else {
        // 创建账本
        await createBook(name);
      }

      navigation.goBack();
    } catch (error) {
      console.error('保存账本失败', error);
      Alert.alert('错误', '保存账本失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理共享账本
  const handleShareBook = async () => {
    try {
      setIsLoading(true);
      // 创建账本
      let book = books.find(item => item.bookId == bookId);
      book = await shareBook(book?.id);
      setShareKey(book.shareKey!);
      setIsShared(true);
    } catch (error) {
      console.error('生成共享码失败', error);
      Alert.alert('错误', '生成共享码失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyShareKey = async () => {
    if (shareKey) {
      try {
        Clipboard.setString(shareKey);
        Alert.alert('已复制到剪贴板');
      } catch (error) {
        Alert.alert('复制失败');
      }
    } else {
      Alert.alert('共享码为空');
    }
  };

  if (isFetching) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        <Card containerStyle={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Card.Title style={{ color: colors.text }}>{bookId ? '编辑账本' : '创建账本'}</Card.Title>

          <Input
            label="账本名称"
            placeholder="请输入账本名称"
            value={name}
            onChangeText={setName}
            disabled={isLoading}
            labelStyle={{ color: colors.text }}
            inputStyle={[{ color: colors.text }, { paddingVertical: 0 }]}
            placeholderTextColor={colors.secondaryText}
            leftIcon={{ type: 'material', name: 'book', color: colors.primary }}
            errorMessage={name.trim() ? '' : '账本名称不能为空'}
            errorStyle={{ color: colors.error }}
          />

          {isShared && (
            <Input
              label="共享码"
              placeholder="共享码"
              value={shareKey}
              onChangeText={setShareKey}
              disabled
              labelStyle={{ color: colors.text }}
              inputStyle={[{ color: colors.text }, { paddingVertical: 0 }]}
              leftIcon={{ type: 'material', name: 'share', color: colors.primary }}
              rightIcon={{
                type: 'material',
                name: 'content-copy', // 复制图标
                color: colors.primary,
                onPress: () => handleCopyShareKey(),
              }}
            />
          )}

          {!isShared && (
            <Button
              title="生成共享码"
              type="outline"
              icon={{ type: 'material', name: 'share', color: colors.primary, size: 20 }}
              onPress={handleShareBook}
              containerStyle={styles.shareButton}
              disabled={isLoading}
              titleStyle={{ color: colors.primary }}
              buttonStyle={{ borderColor: colors.primary }}
            />
          )}

          <View style={styles.buttonContainer}>
            <Button
              title="取消"
              type="outline"
              containerStyle={styles.button}
              onPress={() => navigation.goBack()}
              disabled={isLoading}
              titleStyle={{ color: colors.primary }}
              buttonStyle={{ borderColor: colors.primary }}
            />

            <Button
              title={isLoading ? '保存中...' : '保存'}
              containerStyle={styles.button}
              onPress={handleSave}
              disabled={isLoading}
              titleStyle={{ color: 'white' }}
              buttonStyle={{ backgroundColor: colors.primary }}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    margin: 10,
    borderRadius: 10,
    padding: 15,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    width: '48%',
  },
  shareButton: {
    marginBottom: 20,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default BookFormScreen;
