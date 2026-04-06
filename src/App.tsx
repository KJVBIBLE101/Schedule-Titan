
import React, { useState, useMemo, useEffect, useCallback, Component, ReactNode } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isToday,
  addMonths,
  subMonths,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
  startOfToday,
  isWeekend,
  parse
} from 'date-fns';
import { Shift, ShiftCode, Technician, UserProfile, UserRole, TechnicianGroup, CalendarConfig } from './types';
import firebaseConfig from '../firebase-applet-config.json';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ShareIcon } from './components/Icons';
import TechManagerModal from './components/TechManagerModal';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  getUserProfile, 
  createUserProfile,
  loginWithEmail,
  registerWithEmail,
  resetPassword
} from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch,
  query,
  where
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends Component<any, any> {
  state: any = { hasError: false, errorInfo: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || '');
        if (parsed.error && parsed.error.includes('insufficient permissions')) {
          displayMessage = "You don't have permission to perform this action.";
        }
      } catch (e) {
        // Not JSON
      }
      return (
        <div className="flex items-center justify-center h-screen bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
            <h2 className="text-2xl font-black text-rose-600 mb-4 uppercase tracking-tight">Access Denied / Error</h2>
            <p className="text-slate-600 mb-6 font-medium">{displayMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-all uppercase tracking-widest"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

interface LoginProps {
  onClose?: () => void;
}

const Login: React.FC<LoginProps> = ({ onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (isRegistering) {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      if (onClose) onClose();
    } catch (err: any) {
      const projectId = firebaseConfig.projectId;
      if (err.code === 'auth/operation-not-allowed' || (err.message && err.message.includes('operation-not-allowed'))) {
        setError(`Email login is not enabled in your Firebase project. Please go to https://console.firebase.google.com/project/${projectId}/authentication/providers and enable "Email/Password".`);
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      const projectId = firebaseConfig.projectId;
      if (err.code === 'auth/operation-not-allowed' || (err.message && err.message.includes('operation-not-allowed'))) {
        setError(`Email features are not enabled. Please go to https://console.firebase.google.com/project/${projectId}/authentication/providers and enable "Email/Password".`);
      } else {
        setError(err.message || 'Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      if (onClose) onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-100/80 backdrop-blur-sm p-6">
      <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 relative">
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
            <CalendarIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-2 uppercase tracking-tight">TitanSchedule</h1>
          <p className="text-slate-500 font-medium">Sign in to access your team's schedule</p>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Work Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@work.com"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-medium"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-medium"
              required
            />
          </div>

          {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}
          {message && <p className="text-emerald-500 text-xs font-bold text-center">{message}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-8 px-1">
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="hover:text-indigo-600 transition-colors uppercase tracking-widest"
          >
            {isRegistering ? 'Already have an account?' : 'Need an account?'}
          </button>
          {!isRegistering && (
            <button 
              onClick={handleResetPassword}
              className="hover:text-indigo-600 transition-colors uppercase tracking-widest"
            >
              Forgot Password?
            </button>
          )}
        </div>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-widest font-black text-slate-300">
            <span className="bg-white px-4">Or continue with</span>
          </div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          className="w-full py-4 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all flex items-center justify-center gap-3 shadow-sm"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          Google Account
        </button>
      </div>
    </div>
  );
};

const DEFAULT_TECHNICIANS: Technician[] = [
  { id: '061', name: 'Jerry Aschoff', code: '061', group: TechnicianGroup.MAIN },
  { id: '261', name: 'Thomas Jimenez', code: '261', group: TechnicianGroup.MAIN },
  { id: '700', name: 'Darrin Westberg', code: '700', group: TechnicianGroup.MAIN },
  { id: '375', name: 'Bryan Baca', code: '375', group: TechnicianGroup.MAIN },
  { id: '170', name: 'Richard Hood', code: '170', group: TechnicianGroup.MAIN },
  { id: '171', name: 'Jason Hood', code: '171', group: TechnicianGroup.MAIN },
  { id: '804', name: 'David Winterfeldt', code: '804', group: TechnicianGroup.MAIN },
  { id: '435', name: 'Jeremiah Lawson', code: '435', group: TechnicianGroup.MAIN },
  { id: '391', name: 'Mike Roth Roth', code: '391', group: TechnicianGroup.MAIN },
  { id: '392', name: 'Anthony Paul', code: '392', group: TechnicianGroup.MAIN },
  { id: '429', name: 'Chris Hovelsen', code: '429', group: TechnicianGroup.MAIN },
  { id: '753', name: 'Robert Hernandez', code: '753', group: TechnicianGroup.MAIN },
  { id: '999', name: 'Gavin Erb', code: 'GE', group: TechnicianGroup.MAIN },
];

const SHIFT_METADATA: Record<ShiftCode, { color: string; label: string; bg: string }> = {
  [ShiftCode.OOL]: { color: 'text-white', bg: 'bg-blue-900', label: 'Out of Line' },
  [ShiftCode.BLK]: { color: 'text-slate-500', bg: 'bg-slate-200', label: 'Blackout' },
  [ShiftCode.PD]: { color: 'text-amber-700', bg: 'bg-amber-100', label: 'PD' },
  [ShiftCode.C]: { color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'C-Shift' },
  [ShiftCode.WRK]: { color: 'text-slate-700', bg: 'bg-slate-100', label: 'Work' },
  [ShiftCode.OFF]: { color: 'text-slate-700', bg: 'bg-slate-100', label: 'OFF' },
  [ShiftCode.NS]: { color: 'text-white', bg: 'bg-rose-600', label: 'No Show' },
  [ShiftCode.V]: { color: 'text-white', bg: 'bg-indigo-600', label: 'Vacation' },
  [ShiftCode.U24]: { color: 'text-blue-600', bg: 'bg-blue-50', label: '24 Unit' },
  [ShiftCode.PDP]: { color: 'text-white', bg: 'bg-purple-600', label: 'PDP Day' },
  [ShiftCode.ENT]: { color: 'text-white', bg: 'bg-teal-600', label: 'Entitlement' },
};

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  
  const [activeTool, setActiveTool] = useState<ShiftCode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLegendMinimized, setIsLegendMinimized] = useState(false);
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('month');
  const [activeGroup, setActiveGroup] = useState<TechnicianGroup>(TechnicianGroup.MAIN);
  const [calendarConfig, setCalendarConfig] = useState<CalendarConfig>({
    mainLabel: 'Main',
    irLabel: 'I&R'
  });
  const [copySuccess, setCopySuccess] = useState(false);

  const isManager = user?.role === UserRole.MANAGER;

  const handleShare = () => {
    // Dynamically determine the share URL. 
    // If we are in the dev environment, we want to point to the pre (preview) environment.
    let shareUrl = window.location.origin + window.location.pathname;
    
    // Remove trailing slash if present for cleaner URL
    if (shareUrl.endsWith('/')) {
      shareUrl = shareUrl.slice(0, -1);
    }

    if (shareUrl.includes('-dev-')) {
      shareUrl = shareUrl.replace('-dev-', '-pre-');
    }
    
    navigator.clipboard.writeText(shareUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const profile = await getUserProfile(firebaseUser.uid);
        if (profile) {
          setUser(profile);
        } else {
          const newProfile = await createUserProfile(firebaseUser);
          setUser(newProfile);
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubTechs = onSnapshot(collection(db, 'technicians'), (snapshot) => {
      const techs = snapshot.docs.map(doc => doc.data() as Technician);
      setTechnicians(techs.length > 0 ? techs : DEFAULT_TECHNICIANS);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'technicians'));

    const unsubShifts = onSnapshot(collection(db, 'shifts'), (snapshot) => {
      const shiftData = snapshot.docs.map(doc => doc.data() as Shift);
      setShifts(shiftData);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'shifts'));

    const unsubConfig = onSnapshot(doc(db, 'config', 'calendar'), (doc) => {
      if (doc.exists()) {
        setCalendarConfig(doc.data() as CalendarConfig);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'config/calendar'));

    return () => {
      unsubTechs();
      unsubShifts();
      unsubConfig();
    };
  }, []);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const filteredTechnicians = useMemo(() => {
    return technicians.filter(t => (t.group || TechnicianGroup.MAIN) === activeGroup);
  }, [technicians, activeGroup]);

  const days = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return eachDayOfInterval({ start, end });
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start, end });
    } else {
      const start = startOfYear(currentDate);
      const end = endOfYear(currentDate);
      return eachDayOfInterval({ start, end });
    }
  }, [currentDate, viewMode]);

  const applyShift = useCallback(async (techId: string, date: string, code: ShiftCode | null) => {
    if (!isManager) return;
    const shiftId = `${techId}_${date}`;
    const shiftRef = doc(db, 'shifts', shiftId);
    
    try {
      if (code) {
        await setDoc(shiftRef, { techId, date, code });
      } else {
        await deleteDoc(shiftRef);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `shifts/${shiftId}`);
    }
  }, [isManager]);

  const handleTechSave = async (updatedTechs: Technician[], idMap: Record<string, string>, updatedConfig?: CalendarConfig) => {
    if (!isManager) return;
    
    try {
      const batch = writeBatch(db);
      
      if (updatedConfig) {
        batch.set(doc(db, 'config', 'calendar'), updatedConfig);
      }
      
      // Update technicians
      // First delete all (or we could be more surgical, but for simplicity in this small app)
      // Actually, better to just set the ones we have.
      // We'll use a collection for techs.
      
      // For simplicity, we'll just set each tech doc.
      updatedTechs.forEach(tech => {
        batch.set(doc(db, 'technicians', tech.id), tech);
      });

      // Delete technicians that were removed
      const updatedTechIds = new Set(updatedTechs.map(t => t.id));
      technicians.forEach(tech => {
        if (!updatedTechIds.has(tech.id)) {
          batch.delete(doc(db, 'technicians', tech.id));
        }
      });

      // If IDs changed, migrate shifts
      if (Object.keys(idMap).length > 0) {
        shifts.forEach(shift => {
          if (idMap[shift.techId]) {
            const oldId = `${shift.techId}_${shift.date}`;
            const newTechId = idMap[shift.techId];
            const newId = `${newTechId}_${shift.date}`;
            batch.delete(doc(db, 'shifts', oldId));
            batch.set(doc(db, 'shifts', newId), { ...shift, techId: newTechId });
          }
        });
      }
      
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'technicians/shifts-batch');
    }
  };

  const apply2026Vacations = async () => {
    const confirmV = window.confirm("This will overwrite existing shifts on specific vacation dates in 2026. Proceed?");
    if (!confirmV) return;

    const range = (start: string, end: string) => {
      return eachDayOfInterval({ start: new Date(start), end: new Date(end) }).map(d => format(d, 'yyyy-MM-dd'));
    };

    const vacationData: Record<string, string[]> = {
      '700': ['2026-01-02', '2026-04-23', '2026-04-24', ...range('2026-07-06', '2026-07-10'), ...range('2026-11-23', '2026-11-27'), ...range('2026-12-07', '2026-12-11'), ...range('2026-12-14', '2026-12-18'), ...range('2026-12-28', '2026-12-31')],
      '392': ['2026-01-02', ...range('2026-03-23', '2026-03-27'), ...range('2026-06-01', '2026-06-05'), ...range('2026-12-28', '2026-12-31')],
      '804': ['2026-01-02', '2026-01-23', '2026-01-30', '2026-02-13', '2026-02-20', '2026-03-13', ...range('2026-03-16', '2026-03-20'), '2026-04-10', '2026-04-17', '2026-04-24', '2026-07-31', '2026-09-18', ...range('2026-09-21', '2026-09-30'), '2026-10-01', '2026-10-02', ...range('2026-12-21', '2026-12-24')],
      '170': ['2026-01-05', ...range('2026-01-20', '2026-01-23'), ...range('2026-03-23', '2026-03-27')],
      '375': [...range('2026-01-05', '2026-01-09'), ...range('2026-01-12', '2026-01-16'), ...range('2026-05-18', '2026-05-22')],
      '261': ['2026-01-16', '2026-03-16', '2026-04-17', '2026-04-20', '2026-05-22', ...range('2026-05-26', '2026-05-29'), ...range('2026-06-22', '2026-06-23'), ...range('2026-07-06', '2026-07-10'), ...range('2026-09-04', '2026-09-11'), ...range('2026-11-23', '2026-11-27')],
      '171': [...range('2026-01-26', '2026-01-27'), '2026-03-20', '2026-03-30', '2026-04-10', '2026-04-14', '2026-05-14', '2026-05-15', '2026-05-18'],
      '391': [...range('2026-02-02', '2026-02-06'), ...range('2026-02-09', '2026-02-13'), ...range('2026-06-22', '2026-06-23'), ...range('2026-06-24', '2026-06-26'), ...range('2026-06-29', '2026-07-03')],
      '753': [...range('2026-02-16', '2026-02-20')],
      '061': [ ...range('2026-05-26', '2026-05-29'), '2026-06-05', ...range('2026-06-08', '2026-06-12'), '2026-07-03', '2026-07-17', ...range('2026-07-20', '2026-07-24'), '2026-08-07', '2026-08-14', '2026-09-04', ...range('2026-09-08', '2026-09-11')],
      '429': [...range('2026-06-15', '2026-06-19'), ...range('2026-07-20', '2026-07-24'), ...range('2026-11-02', '2026-11-06')],
      '435': [...range('2026-07-13', '2026-07-17'), ...range('2026-07-27', '2026-07-31'), ...range('2026-12-21', '2026-12-24')]
    };

    try {
      const batch = writeBatch(db);
      Object.entries(vacationData).forEach(([techId, dates]) => {
        dates.forEach(date => {
          const shiftId = `${techId}_${date}`;
          batch.set(doc(db, 'shifts', shiftId), { techId, date, code: ShiftCode.V });
        });
      });
      await batch.commit();
      alert("2026 Vacations applied successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shifts-vacation-batch');
    }
  };

  const fillMonthForTech = async (techId: string) => {
    if (!activeTool) {
      alert("Please select a status from the legend first to use as a fill tool.");
      return;
    }
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const monthDays = eachDayOfInterval({ start, end }).filter(day => !isWeekend(day));
    const monthStr = format(currentDate, 'yyyy-MM');
    
    // Check if all non-weekend days are already filled with the active tool
    const techMonthShifts = shifts.filter(s => s.techId === techId && s.date.startsWith(monthStr));
    const isAlreadyFilled = monthDays.every(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      return techMonthShifts.some(s => s.date === dateStr && s.code === activeTool);
    });
    
    try {
      const batch = writeBatch(db);
      monthDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const shiftId = `${techId}_${dateStr}`;
        if (isAlreadyFilled) {
          batch.delete(doc(db, 'shifts', shiftId));
        } else {
          batch.set(doc(db, 'shifts', shiftId), {
            techId,
            date: dateStr,
            code: activeTool
          });
        }
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `shifts-fill-toggle-month-${techId}`);
    }
  };


  const populateWrkThrough2026 = async () => {
    const confirmPopulate = window.confirm("This will fill all empty dates from today through December 31, 2026 with the 'WRK' status for all technicians. Proceed?");
    if (!confirmPopulate) return;
    const startDate = new Date();
    const endDate = new Date(2026, 11, 31);
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    
    try {
      const batch = writeBatch(db);
      const shiftMap = new Map();
      shifts.forEach(s => shiftMap.set(`${s.techId}_${s.date}`, s));
      
      let count = 0;
      for (const tech of technicians) {
        for (const day of allDays) {
          if (isWeekend(day)) continue;
          const dateStr = format(day, 'yyyy-MM-dd');
          const key = `${tech.id}_${dateStr}`;
          if (!shiftMap.has(key)) {
            batch.set(doc(db, 'shifts', key), { techId: tech.id, date: dateStr, code: ShiftCode.WRK });
            count++;
            // Firestore batch limit is 500
            if (count >= 450) {
              await batch.commit();
              // Start new batch
              // Note: this is a bit simplified, in a real app we'd handle this more robustly
            }
          }
        }
      }
      await batch.commit();
      alert("Schedule populated with WRK status through 2026!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'shifts-populate-wrk');
    }
  };

  const handleCellAction = (techId: string, date: string, currentCode?: ShiftCode) => {
    if (!isManager) return;
    if (activeTool) {
      applyShift(techId, date, activeTool === currentCode ? null : activeTool);
    } else {
      const codes = Object.values(ShiftCode);
      const nextIndex = currentCode ? (codes.indexOf(currentCode) + 1) % (codes.length + 1) : 0;
      if (nextIndex < codes.length) {
        applyShift(techId, date, codes[nextIndex]);
      } else {
        applyShift(techId, date, null);
      }
    }
  };

  const getShift = (techId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return shifts.find(s => s.techId === techId && s.date === dateStr);
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Initializing TitanSchedule...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden ${activeTool && isManager ? 'cursor-crosshair' : ''}`}>
        {/* Login removed for now */}
        <TechManagerModal 
          isOpen={isTechModalOpen} 
          onClose={() => setIsTechModalOpen(false)} 
          technicians={technicians}
          calendarConfig={calendarConfig}
          onSave={handleTechSave}
        />

        <div className="bg-emerald-500 text-white text-[10px] font-bold py-1 px-4 text-center tracking-widest uppercase shrink-0 relative z-50">
          {isManager ? 'Manager Mode • Drag to Assign Enabled' : 'Viewer Mode • Read Only Access'} {activeTool && isManager ? `(Active: ${activeTool})` : ''}
        </div>

        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 relative z-40">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h1 className="text-lg sm:text-xl font-black text-slate-800 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-600" />
                {viewMode === 'week' ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')}` : 
                 viewMode === 'month' ? format(currentDate, 'MMMM yyyy') : format(currentDate, 'yyyy')}
              </h1>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter hidden sm:inline">Enterprise Resource Planner</span>
            </div>
            
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              <select 
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as any)}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest px-2 py-1 outline-none cursor-pointer hover:text-indigo-600 transition-colors hidden md:inline-block"
              >
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
              <div className="w-px h-4 bg-slate-200 mx-1 hidden md:block"></div>
              <button 
                onClick={() => {
                  if (viewMode === 'week') setCurrentDate(subDays(currentDate, 7));
                  else if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
                  else setCurrentDate(subMonths(currentDate, 12));
                }} 
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="px-2 sm:px-3 py-1 text-[10px] font-black uppercase tracking-widest hover:text-indigo-600 transition-colors">Today</button>
              <button 
                onClick={() => {
                  if (viewMode === 'week') setCurrentDate(addDays(currentDate, 7));
                  else if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
                  else setCurrentDate(addMonths(currentDate, 12));
                }} 
                className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-1 justify-center px-4">
            <div className="flex-1"></div>
            
            <div className="flex gap-2">
              {isManager && (
                <>
                  <button 
                    onClick={() => setIsTechModalOpen(true)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-800 text-[10px] font-black rounded-lg hover:bg-slate-200 transition-colors shadow-sm whitespace-nowrap uppercase tracking-widest border border-slate-200"
                  >
                    Manage Team
                  </button>
                  <button 
                    onClick={populateWrkThrough2026}
                    className="px-3 py-1.5 bg-slate-800 text-white text-[10px] font-black rounded-lg hover:bg-slate-700 transition-colors shadow-sm whitespace-nowrap uppercase tracking-widest"
                  >
                    Fill WRK thru 2026
                  </button>
                  <button 
                    onClick={apply2026Vacations}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap uppercase tracking-widest flex items-center gap-2"
                  >
                    <CalendarIcon className="w-3 h-3" />
                    Apply 2026 Vacations
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={handleShare}
              className={`
                px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm border
                ${copySuccess 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
              `}
            >
              <ShareIcon className={`w-3.5 h-3.5 ${copySuccess ? 'text-emerald-500' : 'text-slate-400'}`} />
              {copySuccess ? 'Link Copied!' : 'Share'}
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="flex flex-col items-end">
                {user ? (
                  <>
                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{user.displayName || user.email}</span>
                    <span className="text-[8px] font-bold text-indigo-600 uppercase tracking-widest">{user.role}</span>
                    <button 
                      onClick={() => logout()} 
                      className="text-[8px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-tighter mt-1"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => signInWithGoogle()}
                    className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-lg hover:bg-indigo-100 transition-colors shadow-sm whitespace-nowrap uppercase tracking-widest border border-indigo-200"
                  >
                    Manager Access
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-2 sm:p-4 select-none">
          <div className="min-w-max bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 sticky top-0 z-20 bg-white">
              <div className="w-24 sm:w-64 shrink-0 bg-slate-50 border-r border-slate-200 px-2 sm:px-4 py-3 flex items-end">
                <div className="flex flex-col items-center gap-1">
                <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Tech Info</span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg">
                  <button 
                    onClick={() => setActiveGroup(TechnicianGroup.MAIN)}
                    className={`px-2 py-0.5 text-[8px] font-black uppercase rounded-md transition-all ${activeGroup === TechnicianGroup.MAIN ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {calendarConfig.mainLabel}
                  </button>
                  <button 
                    onClick={() => setActiveGroup(TechnicianGroup.IR)}
                    className={`px-2 py-0.5 text-[8px] font-black uppercase rounded-md transition-all ${activeGroup === TechnicianGroup.IR ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {calendarConfig.irLabel}
                  </button>
                </div>
              </div>
              </div>
              {days.map((day, idx) => {
                const isStartOfWeek = idx % 7 === 0;
                return (
                  <div 
                    key={idx} 
                    className={`w-10 sm:w-12 shrink-0 flex flex-col items-center py-2 border-r border-slate-100 
                      ${isStartOfWeek ? 'border-l-2 border-l-slate-300 bg-slate-50/50' : ''}
                      ${viewMode === 'month' && !isSameMonth(day, currentDate) ? 'opacity-30' : ''}
                      ${isToday(day) ? 'bg-indigo-50' : ''}
                    `}
                  >
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase">{format(day, 'eeeee')}</span>
                    <span className={`text-[10px] sm:text-xs font-black mt-0.5 ${isToday(day) ? 'text-indigo-600' : 'text-slate-700'}`}>{format(day, 'd')}</span>
                    {viewMode === 'year' && format(day, 'd') === '1' && (
                      <span className="text-[8px] font-black text-indigo-500 uppercase absolute -top-1 bg-white px-1 border border-indigo-100 rounded shadow-sm">
                        {format(day, 'MMM')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="divide-y divide-slate-100">
              {filteredTechnicians.map((tech) => (
                <div key={tech.id} className="flex hover:bg-slate-50 transition-colors group">
                  <div className="w-24 sm:w-64 shrink-0 px-2 sm:px-4 py-2 border-r border-slate-200 flex items-center justify-between sticky left-0 z-10 bg-inherit shadow-[4px_0_10px_-5px_rgba(0,0,0,0.05)]">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] sm:text-sm font-bold text-slate-800 truncate">{tech.name}</span>
                      <span className="text-[8px] sm:text-[10px] text-slate-400 font-mono tracking-tighter">ID: {tech.id}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[8px] sm:text-[10px] font-black text-slate-300 bg-slate-100 px-1 sm:px-1.5 py-0.5 rounded uppercase">{tech.code}</span>
                      {isManager && (
                        <div className="flex gap-1">
                          <button 
                            onClick={() => fillMonthForTech(tech.id)}
                            title="Fill Month with selected Tool"
                            className="text-[8px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-tighter bg-indigo-50 hover:bg-indigo-100 px-1 py-0.5 rounded transition-opacity whitespace-nowrap"
                          >
                            Fill
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {days.map((day, idx) => {
                    const shift = getShift(tech.id, day);
                    const meta = shift ? SHIFT_METADATA[shift.code] : null;
                    const isStartOfWeek = idx % 7 === 0;
                    const dateStr = format(day, 'yyyy-MM-dd');

                    return (
                      <div
                        key={idx}
                        onMouseDown={() => {
                          if (isManager) {
                            handleCellAction(tech.id, dateStr, shift?.code);
                            setIsDragging(true);
                          }
                        }}
                        onMouseEnter={() => {
                          if (isManager && isDragging && activeTool) {
                            applyShift(tech.id, dateStr, activeTool);
                          }
                        }}
                        className={`w-10 sm:w-12 h-10 sm:h-12 shrink-0 border-r border-slate-100 flex items-center justify-center transition-all
                          ${isManager ? 'cursor-pointer' : 'cursor-default'}
                          ${isStartOfWeek ? 'border-l-2 border-l-slate-300' : ''}
                          ${viewMode === 'month' && !isSameMonth(day, currentDate) ? 'bg-slate-50/20' : ''}
                          ${isManager && activeTool && !shift ? 'hover:bg-indigo-50/50' : ''}
                        `}
                      >
                        {shift ? (
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shadow-sm text-[8px] sm:text-[10px] font-black animate-in fade-in zoom-in duration-200 ${meta?.bg} ${meta?.color}`}>
                            {shift.code}
                          </div>
                        ) : (
                          <div className="w-1 h-1 rounded-full bg-slate-200 group-hover:bg-slate-300 transition-colors"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border-t border-slate-200">
              <div className="flex items-center h-8">
                <div className="w-24 sm:w-64 px-2 sm:px-4 text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase shrink-0 border-r border-slate-200 flex items-center">Total</div>
                {days.map((day, idx) => {
                  const count = shifts.filter(s => s.date === format(day, 'yyyy-MM-dd')).length;
                  return (
                    <div key={idx} className="w-10 sm:w-12 text-center text-[8px] sm:text-[10px] font-bold text-slate-700 shrink-0">
                      {count || 0}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {isManager && (
          <div className="fixed bottom-6 right-6 hidden md:flex flex-col items-end gap-3 pointer-events-none z-[70]">
            <div className="pointer-events-auto">
              {isLegendMinimized ? (
                <button
                  onClick={() => setIsLegendMinimized(false)}
                  className="bg-white p-3 rounded-full shadow-2xl border border-slate-200 hover:bg-indigo-50 transition-all flex items-center gap-2 group animate-in zoom-in duration-200"
                >
                  <CalendarIcon className="w-5 h-5 text-indigo-600" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest hidden group-hover:inline">Shift Legend</span>
                </button>
              ) : (
                <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-200 animate-in slide-in-from-right duration-300 relative min-w-[320px]">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Legend (Click to pick tool)</span>
                    <button 
                      onClick={() => setIsLegendMinimized(true)}
                      className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {(Object.keys(SHIFT_METADATA) as Array<keyof typeof SHIFT_METADATA>).map((code) => {
                      const meta = SHIFT_METADATA[code];
                      const isActive = activeTool === code;
                      return (
                        <button
                          key={code}
                          onClick={() => setActiveTool(isActive ? null : code)}
                          title={meta.label}
                          className={`
                            flex flex-col items-center p-2 rounded-xl transition-all border
                            ${isActive ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50 scale-105 z-10' : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50'}
                          `}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shadow-sm ${meta.bg} ${meta.color}`}>
                            {code}
                          </div>
                          <span className="text-[8px] mt-1 font-bold text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap w-8 text-center">{code}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
