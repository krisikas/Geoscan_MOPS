import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Sidebar from './components/sidebar/Sidebar'
import Loader from './components/loader/Loader'
import BackgroundWaves from './components/backgroundWaves/BackgroundWaves'

import MainPage from './pages/MainPage/MainPage'
import MissionPage from './pages/MissionPage/MissionPage'
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
            path="/mission" 
            element={
              <ProtectedRoute>
                <MissionPage 
                  onStartFlight={handleStartFlight} 
                  loadingMessage={loadingMessage} 
                  infoMessage={infoMessage} 
                  error={error} 
                />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/mission/:projectId" 
            element={
              <ProtectedRoute>
                <MissionPage 
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
          <Route 
            path="/result/:projectId" 
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