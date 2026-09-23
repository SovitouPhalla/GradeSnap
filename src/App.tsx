import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { ExamsListPage } from './pages/ExamsListPage'
import { ExamCreatePage } from './pages/ExamCreatePage'
import { ExamDetailPage } from './pages/ExamDetailPage'
import { ScanPage } from './pages/ScanPage'
import { ReviewPage } from './pages/ReviewPage'
import { ResultsPage } from './pages/ResultsPage'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/exams"
            element={
              <ProtectedRoute>
                <ExamsListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams/new"
            element={
              <ProtectedRoute>
                <ExamCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams/:examId"
            element={
              <ProtectedRoute>
                <ExamDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams/:examId/scan"
            element={
              <ProtectedRoute>
                <ScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams/:examId/submissions/:submissionId/review"
            element={
              <ProtectedRoute>
                <ReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/exams/:examId/results"
            element={
              <ProtectedRoute>
                <ResultsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/exams" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
