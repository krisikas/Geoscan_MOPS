import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft } from 'lucide-react';
import './AuthPage.css';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate('/result');
    } catch (err) {
      setError(err.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container page-transition">
      <Link to="/" className="auth-back-link">
        <ArrowLeft size={16} /> На главную
      </Link>
      
      <div className="auth-card">
        <h2 className="auth-title">{isLogin ? 'Вход в систему' : 'Регистрация'}</h2>
        <p className="auth-subtitle">
          {isLogin 
            ? 'Войдите, чтобы получить доступ к панели управления БПЛА и результатам сканирования.'
            : 'Создайте аккаунт для работы с системой мониторинга GEOSCAN MOPS.'}
        </p>
        
        {error && <div className="auth-error" style={{color: 'red', marginBottom: '15px'}}>{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="form-group">
              <label>Ваше имя</label>
              <input 
                type="text" 
                placeholder="Иван Иванов"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Электронная почта</label>
            <input 
              type="email" 
              placeholder="engineer@geoscan.aero"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? 'Обработка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>
        
        <div className="auth-footer">
          {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'} 
          <button 
            type="button" 
            className="auth-toggle-btn"
            onClick={() => { setIsLogin(!isLogin); setError(null); }}
          >
            {isLogin ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </div>
      </div>
    </div>
  );
}
