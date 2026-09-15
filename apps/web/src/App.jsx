import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home from './pages/public/Home';
import Watch from './pages/public/Watch';
import Events from './pages/public/Events';
import EventDetail from './pages/public/EventDetail';
import Recordings from './pages/public/Recordings';
import RecordingDetail from './pages/public/RecordingDetail';
import Login from './pages/public/Login';

import Dashboard from './pages/admin/Dashboard';
import Studio from './pages/admin/Studio';
import CameraMixer from './pages/admin/CameraMixer';
import AdminEvents from './pages/admin/Events';
import ChatMod from './pages/admin/ChatMod';
import AdminRecordings from './pages/admin/AdminRecordings';
import ProtectedRoute from './components/ui/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/watch" element={<Watch />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/recordings" element={<Recordings />} />
        <Route path="/recordings/:id" element={<RecordingDetail />} />
        <Route path="/login" element={<Login />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requireAdmin>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/studio"
          element={
            <ProtectedRoute requireSuperAdmin>
              <Studio />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/mixer"
          element={
            <ProtectedRoute requireAdmin>
              <CameraMixer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/events"
          element={
            <ProtectedRoute requireAdmin>
              <AdminEvents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/events/new"
          element={
            <ProtectedRoute requireAdmin>
              <AdminEvents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/events/:id"
          element={
            <ProtectedRoute requireAdmin>
              <AdminEvents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/chat"
          element={
            <ProtectedRoute requireAdmin>
              <ChatMod />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/recordings"
          element={
            <ProtectedRoute requireAdmin>
              <AdminRecordings />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
