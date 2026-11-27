import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import WorkspacePage from './pages/WorkspacePage'

const ProductionsPage = lazy(() => import('./pages/ProductionsPage'))
const ProductionDetailPage = lazy(() => import('./pages/ProductionDetailPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const VideosPage = lazy(() => import('./pages/VideosPage'))
const TrendsPage = lazy(() => import('./pages/TrendsPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const YoutubeStudioPage = lazy(() => import('./pages/YoutubeStudioPage'))
const InstagramStudioPage = lazy(() => import('./pages/InstagramStudioPage'))
const ScriptStudioPage = lazy(() => import('./pages/ScriptStudioPage'))
const VideoStudioPage = lazy(() => import('./pages/VideoStudioPage'))
const DesignStudioPage = lazy(() => import('./pages/DesignStudioPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const WorkforcePage = lazy(() => import('./pages/WorkforcePage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const VerificationPage = lazy(() => import('./pages/VerificationPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-2 text-[11px] text-txt-faint">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-cyan/25 border-t-cyan"
          role="status"
          aria-label="Loading page"
        />
        Loading…
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<WorkspacePage />} />
          <Route path="/c/:sessionId" element={<WorkspacePage />} />
          <Route path="/productions" element={<ProductionsPage />} />
          <Route path="/productions/:id" element={<ProductionDetailPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/youtube" element={<YoutubeStudioPage />} />
          <Route path="/instagram" element={<InstagramStudioPage />} />
          <Route path="/script" element={<ScriptStudioPage />} />
          <Route path="/video-studio" element={<VideoStudioPage />} />
          <Route path="/design" element={<DesignStudioPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/workforce" element={<WorkforcePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/verification" element={<VerificationPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
