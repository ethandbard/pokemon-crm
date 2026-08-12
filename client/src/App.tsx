import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { HomePage } from './pages/Home';
import { LookupPage } from './pages/Lookup';
import { ProfilePage } from './pages/Profile';
import { DashboardPage } from './pages/Dashboard';
import { NotesPage } from './pages/Notes';
import { ActivityPage } from './pages/Activity';
import { TableauPage } from './pages/Tableau';

export default function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lookup" element={<LookupPage />} />
          <Route path="/pokemon/:id" element={<ProfilePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/tableau" element={<TableauPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
