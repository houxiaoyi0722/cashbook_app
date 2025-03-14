import React, { createContext, useContext, useState, useCallback } from 'react';
import { Book } from '../types';
import api from '../services/api';

interface BookContextType {
  books: Book[];
  isLoading: boolean;
  fetchBooks: () => Promise<void>;
  createBook: (data: string) => Promise<Book>;
  shareBook: (id: number | undefined) => Promise<Book>;
  updateBook: (bookId: string, data: Book) => Promise<Book>;
  deleteBook: (bookId: number) => Promise<void>;
}

const BookContext = createContext<BookContextType | undefined>(undefined);


export const BookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

  const shareBook = useCallback(async (id: number | undefined) => {
    const response = await api.book.share({id});
    if (response.c === 200) {
      await fetchBooks();
      return response.d;
    }
    throw new Error(response.m);
  }, [fetchBooks]);

  const updateBook = useCallback(async (bookId: string, data: Book) => {
    const response = await api.book.update(data);
    if (response.c === 200) {
      await fetchBooks();
      return response.d;
    }
    throw new Error(response.m);
  }, [fetchBooks]);

  const deleteBook = useCallback(async (bookId: number) => {
    const response = await api.book.delete(bookId);
    if (response.c === 200) {
      await fetchBooks();
      return;
    }
    throw new Error(response.m);
  }, [fetchBooks]);

  return (
    <BookContext.Provider
      value={{
        books,
        isLoading,
        fetchBooks,
        createBook,
        shareBook,
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
