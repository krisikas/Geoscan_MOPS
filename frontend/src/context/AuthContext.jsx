import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Имитация проверки сессии
    const storedUser = localStorage.getItem('mops_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    // Имитация API запроса
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockUser = { id: 1, name: 'Инженер', email };
        if (password) {
          // Имитация проверки пароля
        }
        setUser(mockUser);
        localStorage.setItem('mops_user', JSON.stringify(mockUser));
        resolve(mockUser);
      }, 600);
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('mops_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
