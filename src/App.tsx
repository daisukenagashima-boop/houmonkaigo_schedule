import React, { useState } from 'react';
import { AuthProvider, AuthGuard, useAuth } from './components/AuthGuard';
import Dashboard from './components/Dashboard';
import ClientList from './components/ClientList';
import RecordForm from './components/RecordForm';
import RecordHistory from './components/RecordHistory';
import ScheduleList from './components/ScheduleList';
import StaffManagement from './components/StaffManagement';
import CarePlansAndMonitoring from './components/CarePlansAndMonitoring';
import ConferenceManagement from './components/ConferenceManagement';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  LogOut, 
  Menu, 
  X,
  PlusCircle,
  Calendar,
  UserCircle,
  Home,
  FileCheck,
  Building2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Schedule } from './types';

type View = 'dashboard' | 'clients' | 'history' | 'schedule' | 'staff' | 'monitoring' | 'conference';

function MainLayout() {
  const { profile, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRecordFormOpen, setIsRecordFormOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  const navItems = [
    { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
    { id: 'schedule', label: '本日の訪問予定', icon: Calendar },
    { id: 'clients', label: '利用者管理', icon: Users },
    { id: 'monitoring', label: 'AIモニタリング・計画', icon: FileCheck },
    { id: 'conference', label: 'サービス担当者会議', icon: Building2 },
    { id: 'history', label: '記録履歴', icon: History },
    ...(profile?.role === 'admin' ? [{ id: 'staff', label: 'スタッフ管理', icon: UserCircle }] : []),
  ];

  const handleSelectSchedule = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setIsRecordFormOpen(true);
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard 
            onNewRecord={() => {
              setSelectedSchedule(null);
              setIsRecordFormOpen(true);
            }} 
            onViewClients={() => setCurrentView('clients')}
            onViewHistory={() => setCurrentView('history')}
            onViewSchedule={() => setCurrentView('schedule')}
            onViewStaff={() => setCurrentView('staff')}
            onViewMonitoring={() => setCurrentView('monitoring')}
            onViewConference={() => setCurrentView('conference')}
          />
        );
      case 'schedule':
        return <ScheduleList onSelectSchedule={handleSelectSchedule} />;
      case 'clients':
        return <ClientList />;
      case 'history':
        return <RecordHistory />;
      case 'staff':
        return <StaffManagement />;
      case 'monitoring':
        return <CarePlansAndMonitoring />;
      case 'conference':
        return <ConferenceManagement />;
      default:
        return (
          <Dashboard 
            onNewRecord={() => {
              setSelectedSchedule(null);
              setIsRecordFormOpen(true);
            }} 
            onViewClients={() => setCurrentView('clients')}
            onViewHistory={() => setCurrentView('history')}
            onViewSchedule={() => setCurrentView('schedule')}
            onViewStaff={() => setCurrentView('staff')}
            onViewMonitoring={() => setCurrentView('monitoring')}
            onViewConference={() => setCurrentView('conference')}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 lg:pl-72">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white rounded-xl shadow-lg border border-slate-100"
      >
        <Menu className="w-6 h-6 text-slate-600" />
      </button>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-100 transition-transform duration-300 lg:translate-x-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center justify-between mb-10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                <Home className="w-6 h-6" />
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">ながらかいごhome</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-slate-50 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id as View);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold transition-all",
                  currentView === item.id
                    ? "bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-50"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="pt-6 border-t border-slate-100 space-y-4 flex-shrink-0">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold flex-shrink-0">
                {profile?.name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{profile?.name}</p>
                <p className="text-xs text-slate-500 truncate">{profile?.role === 'admin' ? '管理者' : 'スタッフ'}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold text-red-500 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-5 h-5" />
              ログアウト
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto pt-16 lg:pt-0">
        <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Record Form Modal */}
      <AnimatePresence>
        {isRecordFormOpen && (
          <RecordForm 
            onClose={() => {
              setIsRecordFormOpen(false);
              setSelectedSchedule(null);
            }} 
            onSuccess={() => {
              setIsRecordFormOpen(false);
              setSelectedSchedule(null);
              setCurrentView('history');
            }}
            initialData={selectedSchedule ? {
              scheduleId: selectedSchedule.id,
              clientId: selectedSchedule.clientId,
              startTime: selectedSchedule.startTime,
              endTime: selectedSchedule.endTime,
              serviceType: '訪問介護',
              careType: selectedSchedule.careType
            } : undefined}
          />
        )}
      </AnimatePresence>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => {
          setSelectedSchedule(null);
          setIsRecordFormOpen(true);
        }}
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 active:scale-90 transition-transform"
      >
        <PlusCircle className="w-8 h-8" />
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <MainLayout />
      </AuthGuard>
    </AuthProvider>
  );
}

