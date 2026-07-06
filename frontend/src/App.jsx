import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Sidebar from './components/sidebar/Sidebar'
import Loader from './components/loader/Loader'
import BackgroundWaves from './components/backgroundWaves/BackgroundWaves'

import MainPage from './pages/MainPage/MainPage'
import StartPage from './pages/StartPage/StartPage'
import ResultPage from './pages/ResultPage/ResultPage'
import AuthPage from './pages/AuthPage/AuthPage'

import { AuthProvider, useAuth } from './context/AuthContext'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  return children;
};

function AppContent() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [imageUrl, setImageUrl] = useState(null)
  const [loadingMessage, setLoadingMessage] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)
  const [error, setError] = useState(null)
  
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth' || location.pathname === '/';

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  const handleStartFlight = useCallback(async () => {
    setError(null)
    setInfoMessage(null)
    setLoadingMessage('Стартуем полёт и сбор данных…')
    try {
      const token = localStorage.getItem('mops_token');
      const response = await fetch(`${API_BASE_URL}/start/fly`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.status === 401) {
        logout()
        navigate('/auth')
        return
      }
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.detail ?? 'Не удалось запустить полёт')
      setInfoMessage('Пайплайн съёмки запущен')
    } catch (startError) {
      setError(startError.message ?? 'Сбой запуска полёта')
    } finally {
      setLoadingMessage(null)
    }
  }, [logout, navigate])

  const handleUploadFolderForMetashape = useCallback(async (files) => {
    setError(null)
    setInfoMessage(null)
    setLoadingMessage('Загружаем фотографии и обрабатываем Metashape…')
    try {
      const formData = new FormData()
      Array.from(files).forEach((file) => formData.append('files', file))
      const token = localStorage.getItem('mops_token');
      const response = await fetch(`${API_BASE_URL}/data/upload-and-process-metashape`, {
        method: 'POST', 
        body: formData,
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.status === 401) {
        logout()
        navigate('/auth')
        return
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.detail ?? 'Не удалось обработать фотографии')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      setInfoMessage('Metashape обработка завершена')
    } catch (uploadError) {
      setError(uploadError.message ?? 'Не удалось загрузить и обработать фотографии')
    } finally {
      setLoadingMessage(null)
    }
  }, [logout, navigate])

  const handleUploadSingleForAI = useCallback(async (file) => {
    setError(null)
    setInfoMessage(null)
    setLoadingMessage('Загружаем фото и обрабатываем AI…')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('mops_token');
      const response = await fetch(`${API_BASE_URL}/data/upload-and-process-ai`, {
        method: 'POST', 
        body: formData,
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.status === 401) {
        logout()
        navigate('/auth')
        return
      }
      if (!response.ok) {
        let errorMessage = 'Не удалось обработать фото'
        try {
          const payload = await response.json()
          errorMessage = payload?.detail ?? errorMessage
        } catch {
          if (response.status === 503) errorMessage = 'Модель AI недоступна.'
          else if (response.status === 500) errorMessage = 'Ошибка сервера при обработке изображения'
        }
        throw new Error(errorMessage)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
      setInfoMessage('AI обработка завершена')
    } catch (uploadError) {
      setError(uploadError.message ?? 'Не удалось загрузить и обработать фото')
    } finally {
      setLoadingMessage(null)
    }
  }, [logout, navigate])

  return (
    <div className="app">
      <BackgroundWaves />
      {/* Hide Sidebar on auth and main landing page for a cleaner look */}
      {!isAuthPage && <Sidebar />}
      
      <main className="app-content">
        {loadingMessage && (
          <div className="loader-overlay">
            <Loader />
            <span className="loader-overlay__text">{loadingMessage}</span>
          </div>
        )}
      
        <div className="app-status-panel">
          {infoMessage && <span className="app-status app-status--info">{infoMessage}</span>}
          {error && <span className="app-status app-status--error">{error}</span>}
        </div>
      
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route 
            path="/start" 
            element={
              <ProtectedRoute>
                <StartPage 
                  onStartFlight={handleStartFlight} 
                  loadingMessage={loadingMessage} 
                  infoMessage={infoMessage} 
                  error={error} 
                />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/result" 
            element={
              <ProtectedRoute>
                <ResultPage />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </main>
   </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}