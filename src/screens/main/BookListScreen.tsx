import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Button, Icon, ListItem, FAB, Input } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBook } from '../../context/BookContext';
import { MainStackParamList } from '../../navigation/types';
import { Book } from '../../types';
import { api } from '../../services/api';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const BookListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { books, currentBook, fetchBooks, setCurrentBook, deleteBook, isLoading } = useBook();
  const [error, setError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [shareKeyInput, setShareKeyInput] = useState('');

  // 使用 useCallback 包装 loadBooks 函数，避免无限循环
  const loadBooks = useCallback(async () => {
    try {
      setError(null);
      setLocalLoading(true);
      await fetchBooks();
    } catch (err) {
      console.error('加载账本列表失败', err);
      setError(typeof err === 'string' ? err : '加载账本列表失败');
    } finally {
      setLocalLoading(false);
    }
  }, [fetchBooks]);

  // 处理选择账本
  const handleSelectBook = useCallback(async (book: Book) => {
    try {
      setLocalLoading(true);
      await setCurrentBook(book);
      navigation.navigate('MainTabs');
    } catch (err) {
      console.error('选择账本失败', err);
      Alert.alert('错误', typeof err === 'string' ? err : '选择账本失败');
    } finally {
      setLocalLoading(false);
    }
  }, [navigation, setCurrentBook]);

  // 处理添加账本
  const handleAddBook = useCallback(() => {
    navigation.navigate('BookForm', {});
  }, [navigation]);

  // 处理编辑账本
  const handleEditBook = useCallback((bookId: string) => {
    navigation.navigate('BookForm', { bookId });
  }, [navigation]);

  // 处理删除账本
  const handleDeleteBook = useCallback((book: Book) => {
    Alert.alert(
      '确认删除',
      `确定要删除账本"${book.bookName}"吗？此操作不可恢复，账本中的所有流水记录也将被删除。`,
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
              await deleteBook(book.id);
              Alert.alert('成功', '账本已删除');
            } catch (error) {
              console.error('删除账本失败', error);
              Alert.alert('错误', '删除账本失败');
            }
          },
        },
      ]
    );
  }, [deleteBook]);

  // 添加导入共享账本方法
  const handleImportSharedBook = useCallback(async () => {
    if (!shareKeyInput.trim()) {
      Alert.alert('错误', '请输入共享码');
      return;
    }

    try {
      setLocalLoading(true);
      // 调用导入共享账本的 API
      await api.book.inshare({ key: shareKeyInput.trim() })
      await fetchBooks();
      Alert.alert('成功', '共享账本已导入');
      setShareKeyInput('');
    } catch (error) {
      console.error('导入共享账本失败', error);
      Alert.alert('错误', '导入共享账本失败，请检查共享码是否正确');
    } finally {
      setLocalLoading(false);
    }
  }, [shareKeyInput, fetchBooks]);

  // 只在组件挂载时加载一次账本
  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  // 渲染账本项
  const renderBookItem = useCallback(({ item }: { item: Book }) => {
    const isSelected = currentBook?.id === item.id;

    return (
      <ListItem
        key={item.id}
        containerStyle={[
          styles.bookItem,
          isSelected && styles.selectedBookItem,
        ]}
        onPress={() => handleSelectBook(item)}
      >
        <Icon
          name="book"
          type="material"
          color={isSelected ? '#1976d2' : '#757575'}
        />
        <ListItem.Content>
          <ListItem.Title style={isSelected ? styles.selectedBookTitle : undefined}>
            {item.bookName}
          </ListItem.Title>
          {item.shareKey && (
            <ListItem.Subtitle>{item.shareKey}</ListItem.Subtitle>
          )}
          <Text style={styles.bookDate}>
            创建于 {new Date(item.createDate).toLocaleDateString()}
          </Text>
        </ListItem.Content>

        <View style={styles.bookActions} key={item.id}>
          <Button
            type="clear"
            icon={
              <Icon
                name="edit"
                type="material"
                color="#1976d2"
                size={20}
              />
            }
            onPress={() => handleEditBook(item.bookId)}
          />
          <Button
            type="clear"
            icon={
              <Icon
                name="delete"
                type="material"
                color="#f44336"
                size={20}
              />
            }
            onPress={() => handleDeleteBook(item)}
          />
        </View>
      </ListItem>
    );
  }, [currentBook, handleSelectBook, handleEditBook, handleDeleteBook]);

  // 渲染空列表
  const renderEmptyList = useCallback(() => (
    <Card containerStyle={styles.emptyCard}>
      <Card.Title>暂无账本</Card.Title>
      <Text style={styles.emptyText}>
        点击右下角的"+"按钮创建一个新账本
      </Text>
      <Button
        title="创建账本"
        icon={
          <Icon
            name="add"
            type="material"
            color="white"
            size={20}
          />
        }
        buttonStyle={styles.createButton}
        onPress={handleAddBook}
      />
    </Card>
  ), [handleAddBook]);

  if (error) {
    return (
      <View style={styles.container}>
        <Card containerStyle={styles.emptyCard}>
          <Text style={styles.emptyText}>加载失败: {error}</Text>
          <Button
            title="重试"
            onPress={() => {
              setLocalLoading(true);
              fetchBooks().finally(() => setLocalLoading(false));
            }}
            containerStyle={styles.createButton}
          />
        </Card>
      </View>
    );
  }

  if (localLoading || isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={styles.loader} size="large" color="#1976d2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card containerStyle={styles.headerCard}>
        <Card.Title>我的账本</Card.Title>
        <Text style={styles.headerText}>
          选择一个账本开始记账，或创建一个新账本
        </Text>

        {/* 添加导入共享账本的输入框 */}
        <View style={styles.importContainer}>
          <Input
            placeholder="输入共享码导入账本"
            value={shareKeyInput}
            onChangeText={setShareKeyInput}
            containerStyle={styles.importInput}
            rightIcon={
              <Icon
                name="arrow-forward"
                type="material"
                color="#1976d2"
                onPress={handleImportSharedBook}
              />
            }
          />
        </View>
      </Card>

      <FlatList
        data={books}
        renderItem={renderBookItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyList}
      />

      <FAB
        icon={
          <Icon
            name="add"
            type="material"
            color="white"
            size={24}
          />
        }
        color="#1976d2"
        placement="right"
        onPress={handleAddBook}
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
  listContent: {
    padding: 10,
  },
  bookItem: {
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: 'white',
  },
  selectedBookItem: {
    backgroundColor: '#e3f2fd',
  },
  selectedBookTitle: {
    color: '#1976d2',
    fontWeight: 'bold',
  },
  bookDate: {
    fontSize: 12,
    color: '#9e9e9e',
    marginTop: 5,
  },
  bookActions: {
    flexDirection: 'row',
  },
  emptyCard: {
    margin: 20,
    padding: 20,
    borderRadius: 10,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 20,
    color: '#757575',
  },
  createButton: {
    backgroundColor: '#1976d2',
    borderRadius: 5,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importContainer: {
    marginTop: 10,
    marginBottom: 5,
  },
  importInput: {
    paddingHorizontal: 0,
  },
});

export default BookListScreen;
