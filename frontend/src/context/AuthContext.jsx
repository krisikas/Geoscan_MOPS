import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);
const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('mops_user');
    
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include'
      })
      .then(res => {
        if (!res.ok) throw new Error('Token invalid');
        return res.json();
      })
      .then(data => {
        setUser(data);
        localStorage.setItem('mops_user', JSON.stringify(data));
      })
      .catch(() => {
        logout();
      });
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Ошибка входа');
    }
    setUser(data);
    localStorage.setItem('mops_user', JSON.stringify(data));
    return data;
  };

  const register = async (name, email, password) => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
      credentials: 'include'
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Ошибка регистрации');
    }
    setUser(data);
    localStorage.setItem('mops_user', JSON.stringify(data));
    return data;
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('mops_user');
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch(e) {}
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
