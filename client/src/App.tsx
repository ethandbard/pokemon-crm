import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { CurrentUserProvider } from './lib/useCurrentUser';
import { HomePage } from './pages/Home';
import { LookupPage } from './pages/Lookup';
import { ProfilePage } from './pages/Profile';
import { MovesPage } from './pages/Moves';
import { MoveProfilePage } from './pages/MoveProfile';
import { DashboardPage } from './pages/Dashboard';
import { TeamPage } from './pages/Team';
import { NotesPage } from './pages/Notes';
import { ActivityPage } from './pages/Activity';
import { TrainersPage } from './pages/Trainers';
import { TableauPage } from './pages/Tableau';

export default function App() {
  return (
    <ToastProvider>
      {/* Wraps the routes: the acting user decides who new notes and flags are
          filed under, so every page needs it. */}
      <CurrentUserProvider>
        <CommandPalette />
        <div className="flex h-full">
          <Sidebar />
          {/*
            `relative` is load-bearing: `.sr-only` is `position: absolute`, and
            without a positioned ancestor those elements resolve against the
            document instead of this pane. They then sit outside its overflow
            clipping and stretch <html> to the full page height, which shows up
            as a second scrollbar and empty space to scroll through.
          */}
          <main className="relative flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/lookup" element={<LookupPage />} />
              <Route path="/pokemon/:id" element={<ProfilePage />} />
              <Route path="/moves" element={<MovesPage />} />
              <Route path="/moves/:id" element={<MoveProfilePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/trainers" element={<TrainersPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/tableau" element={<TableauPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </CurrentUserProvider>
    </ToastProvider>
  );
}
