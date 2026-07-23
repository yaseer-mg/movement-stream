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
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/studio" element={<Studio />} />
        <Route path="/admin/mixer" element={<CameraMixer />} />
        <Route path="/admin/events" element={<AdminEvents />} />
        <Route path="/admin/events/new" element={<AdminEvents />} />
        <Route path="/admin/events/:id" element={<AdminEvents />} />
        <Route path="/admin/chat" element={<ChatMod />} />
        <Route path="/admin/recordings" element={<AdminRecordings />} />
      </Routes>
    </BrowserRouter>
  );
}
