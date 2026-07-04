import { useCallback, useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import './App.css'
import Sidebar from './components/sidebar/Sidebar'
import Loader from './components/loader/Loader'
import BackgroundWaves from './components/backgroundWaves/BackgroundWaves'

import MainPage from './pages/MainPage/MainPage'
import StartPage from './pages/StartPage/StartPage'
import ResultPage from './pages/ResultPage/ResultPage'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function App() {
  const [imageUrl, setImageUrl] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [loadingMessage, setLoadingMessage] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)
  const [error, setError] = useState(null)
  
  // Управление темой
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    if (theme === 'dark') {
      root.classList.add('dark-theme')
      body.classList.add('dark-theme')
    } else {
      root.classList.remove('dark-theme')
      body.classList.remove('dark-theme')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl)
      }
    }
  }, [imageUrl])

  const resolveSessionId = useCallback(async () => {
    if (sessionId) {
      return sessionId
    }
    const response = await fetch(`${API_BASE_URL}/session/current`)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.detail ?? 'Сессия не найдена')
    }
    if (!payload?.session_id) {
      throw new Error('Бэкенд не вернул идентификатор сессии')
    }
    setSessionId(payload.session_id)
    return payload.session_id
  }, [sessionId])

  const handleStartFlight = useCallback(async () => {
    setError(null)
    setInfoMessage(null)
    setLoadingMessage('Стартуем полёт и сбор данных…')
    try {
      const response = await fetch(`${API_BASE_URL}/start/fly`, {
        method: 'POST',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.detail ?? 'Не удалось запустить полёт')
      }
      if (payload?.session_id) {
        setSessionId(payload.session_id)
      }
      setInfoMessage('Пайплайн съёмки запущен')
    } catch (startError) {
      setError(startError.message ?? 'Сбой запуска полёта')
    } finally {
      setLoadingMessage(null)
    }
  }, [])

  const handleUploadFolderForMetashape = useCallback(async (files) => {
    setError(null)
    setInfoMessage(null)
    setLoadingMessage('Загружаем фотографии и обрабатываем Metashape…')
    try {
      const formData = new FormData()
      Array.from(files).forEach((file) => {
        formData.append('files', file)
      })
      const response = await fetch(`${API_BASE_URL}/data/upload-and-process-metashape`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.detail ?? 'Не удалось обработать фотографии')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setImageUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return url
      })
      setInfoMessage('Metashape обработка завершена')
    } catch (uploadError) {
      setError(uploadError.message ?? 'Не удалось загрузить и обработать фотографии')
    } finally {
      setLoadingMessage(null)
    }
  }, [])

  const handleUploadSingleForAI = useCallback(async (file) => {
    setError(null)
    setInfoMessage(null)
    setLoadingMessage('Загружаем фото и обрабатываем AI…')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${API_BASE_URL}/data/upload-and-process-ai`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        let errorMessage = 'Не удалось обработать фото'
        try {
          const payload = await response.json()
          errorMessage = payload?.detail ?? errorMessage
        } catch {
          if (response.status === 503) {
            errorMessage = 'Модель AI недоступна. Убедитесь, что файл best.pt находится в папке backend/'
          } else if (response.status === 500) {
            errorMessage = 'Ошибка сервера при обработке изображения'
          }
        }
        throw new Error(errorMessage)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setImageUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return url
      })
      setInfoMessage('AI обработка завершена')
    } catch (uploadError) {
      setError(uploadError.message ?? 'Не удалось загрузить и обработать фото')
    } finally {
      setLoadingMessage(null)
    }
  }, [])

  return (
    <div className={`app ${theme === 'dark' ? 'dark-theme' : ''}`}>
      <BackgroundWaves />
      <Sidebar theme={theme} onToggleTheme={toggleTheme} />
      
      <main className="app-content">
        {loadingMessage && (
          <div className="loader-overlay">
            <Loader />
            <span className="loader-overlay__text">{loadingMessage}</span>
          </div>
        )}
      
        <div className="app-status-panel">
          {infoMessage && (
            <span className="app-status app-status--info">{infoMessage}</span>
          )}
          {error && <span className="app-status app-status--error">{error}</span>}
        </div>
      
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route 
            path="/start" 
            element={
              <StartPage 
                onStartFlight={handleStartFlight} 
                loadingMessage={loadingMessage} 
                infoMessage={infoMessage} 
                error={error} 
              />
            } 
          />
          <Route 
            path="/result" 
            element={
              <ResultPage 
                imageUrl={imageUrl} 
                onUploadFolderForMetashape={handleUploadFolderForMetashape} 
                onUploadSingleForAI={handleUploadSingleForAI}
                loadingMessage={loadingMessage}
              />
            } 
          />
        </Routes>
      </main>
   </div>
  )
}

export default App