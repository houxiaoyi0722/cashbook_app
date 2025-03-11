import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Book } from '../types';
import api from '../services/api';

interface BookContextType {
  currentBook: Book | null;
  books: Book[];
  isLoading: boolean;
  setCurrentBook: (book: Book | null) => Promise<void>;
  fetchBooks: () => Promise<void>;
  createBook: (data: string) => Promise<Book>;
  updateBook: (bookId: number, data: Partial<Omit<Book, 'id' | 'createDate' | 'userId'>>) => Promise<Book>;
  deleteBook: (bookId: number) => Promise<void>;
}

const BookContext = createContext<BookContextType | undefined>(undefined);

const STORAGE_KEY = 'current_book';

export const BookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 从本地存储加载当前账本
    const loadCurrentBook = async () => {
      try {
        const savedBook = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedBook) {
          setCurrentBook(JSON.parse(savedBook));
        }
      } catch (error) {
        console.error('加载当前账本失败', error);
      }
    };

    loadCurrentBook();
  }, []);

  const handleSetCurrentBook = useCallback(async (book: Book | null) => {
    try {
      if (book) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(book));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
      setCurrentBook(book);
    } catch (error) {
      console.error('保存当前账本失败', error);
    }
  }, []);

  const fetchBooks = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.book.list();
      if (response.c === 200) {
        setBooks(response.d);
      }
    } catch (error) {
      console.error('获取账本列表失败', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createBook = useCallback(async (data: string) => {
    const response = await api.book.create(data);
    if (response.c === 200) {
      await fetchBooks();
      return response.d;
    }
    throw new Error(response.m);
  }, [fetchBooks]);

  const updateBook = useCallback(async (bookId: number, data: Partial<Omit<Book, 'id' | 'createDate' | 'userId'>>) => {
    const response = await api.book.update(bookId, data);
    if (response.c === 200) {
      await fetchBooks();
      if (currentBook?.id === bookId) {
        await handleSetCurrentBook(response.d);
      }
      return response.d;
    }
    throw new Error(response.m);
  }, [fetchBooks, currentBook, handleSetCurrentBook]);

  const deleteBook = useCallback(async (bookId: number) => {
    const response = await api.book.delete(bookId);
    if (response.c === 200) {
      await fetchBooks();
      if (currentBook?.id === bookId) {
        await handleSetCurrentBook(null);
      }
      return;
    }
    throw new Error(response.m);
  }, [fetchBooks, currentBook, handleSetCurrentBook]);

  return (
    <BookContext.Provider
      value={{
        currentBook,
        books,
        isLoading,
        setCurrentBook: handleSetCurrentBook,
        fetchBooks,
        createBook,
        updateBook,
        deleteBook,
      }}
    >
      {children}
    </BookContext.Provider>
  );
};

export const useBook = () => {
  const context = useContext(BookContext);
  if (context === undefined) {
    throw new Error('useBook must be used within a BookProvider');
  }
  return context;
};
