import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { LookupPage } from './pages/Lookup';
import { ProfilePage } from './pages/Profile';
import { DashboardPage } from './pages/Dashboard';
import { NotesPage } from './pages/Notes';
import { TableauPage } from './pages/Tableau';

export default function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<LookupPage />} />
          <Route path="/pokemon/:id" element={<ProfilePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/tableau" element={<TableauPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
