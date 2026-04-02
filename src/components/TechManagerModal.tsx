
import React, { useState, useEffect } from 'react';
import { Technician, UserProfile, UserRole, TechnicianGroup, CalendarConfig } from '../types';
import { db, resetPassword } from '../firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

interface TechManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  technicians: Technician[];
  calendarConfig: CalendarConfig;
  onSave: (updatedTechs: Technician[], idMap: Record<string, string>, updatedConfig?: CalendarConfig) => void;
}

const TechManagerModal: React.FC<TechManagerModalProps> = ({ isOpen, onClose, technicians, calendarConfig, onSave }) => {
  const [localTechs, setLocalTechs] = useState<Technician[]>(technicians);
  const [localConfig, setLocalConfig] = useState<CalendarConfig>(calendarConfig);
  const [activeTab, setActiveTab] = useState<'techs' | 'users' | 'config'>('techs');
  const [activeGroupTab, setActiveGroupTab] = useState<TechnicianGroup>(TechnicianGroup.MAIN);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [resetStatus, setResetStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setLocalTechs(technicians);
      setLocalConfig(calendarConfig);
    }
  }, [isOpen, technicians, calendarConfig]);

  useEffect(() => {
    if (isOpen && activeTab === 'users') {
      fetchUsers();
    }
  }, [isOpen, activeTab]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const fetchedUsers: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        fetchedUsers.push(doc.data() as UserProfile);
      });
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    setResetStatus({ ...resetStatus, [email]: 'Sending...' });
    try {
      await resetPassword(email);
      setResetStatus({ ...resetStatus, [email]: 'Sent!' });
      setTimeout(() => {
        setResetStatus(prev => {
          const next = { ...prev };
          delete next[email];
          return next;
        });
      }, 3000);
    } catch (error: any) {
      setResetStatus({ ...resetStatus, [email]: 'Error' });
    }
  };

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { role: newRole }, { merge: true });
      setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  const handleAddTech = () => {
    const newId = Math.random().toString(36).substr(2, 3);
    setLocalTechs([...localTechs, { id: newId, name: 'New Technician', code: newId, group: activeGroupTab }]);
  };

  const handleRemoveTech = (id: string) => {
    setLocalTechs(localTechs.filter(t => t.id !== id));
  };

  const handleUpdateTech = (id: string, name: string, code: string, group: TechnicianGroup) => {
    setLocalTechs(localTechs.map(t => t.id === id ? { ...t, name, code, group } : t));
  };

  const handleSave = () => {
    onSave(localTechs, {}, localConfig);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Team Management</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-slate-100">
          <button 
            onClick={() => setActiveTab('techs')}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'techs' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Technicians
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            User Access
          </button>
          <button 
            onClick={() => setActiveTab('config')}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'config' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            Settings
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'techs' ? (
            <div className="space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                <button 
                  onClick={() => setActiveGroupTab(TechnicianGroup.MAIN)}
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeGroupTab === TechnicianGroup.MAIN ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {localConfig.mainLabel}
                </button>
                <button 
                  onClick={() => setActiveGroupTab(TechnicianGroup.IR)}
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeGroupTab === TechnicianGroup.IR ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {localConfig.irLabel}
                </button>
              </div>

              {localTechs.filter(t => (t.group || TechnicianGroup.MAIN) === activeGroupTab).map((tech) => (
                <div key={tech.id} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-black text-xs">
                    {tech.id}
                  </div>
                  <div className="flex-1 flex gap-2 items-center">
                    <input 
                      type="text"
                      placeholder="Name"
                      value={tech.name}
                      onChange={(e) => handleUpdateTech(tech.id, e.target.value, tech.code, tech.group || TechnicianGroup.MAIN)}
                      className="flex-1 bg-transparent border-none focus:ring-0 font-bold text-slate-700"
                    />
                    <input 
                      type="text"
                      placeholder="Code"
                      value={tech.code}
                      onChange={(e) => handleUpdateTech(tech.id, tech.name, e.target.value, tech.group || TechnicianGroup.MAIN)}
                      className="w-16 bg-transparent border-none focus:ring-0 font-mono text-xs text-slate-500"
                    />
                  </div>
                  <button 
                    onClick={() => handleRemoveTech(tech.id)}
                    className="p-2 text-rose-400 hover:text-rose-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
              <button 
                onClick={handleAddTech}
                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all"
              >
                + Add Technician to {activeGroupTab === TechnicianGroup.MAIN ? localConfig.mainLabel : localConfig.irLabel}
              </button>
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-4">
              {loadingUsers ? (
                <div className="text-center py-10 text-slate-400 font-bold animate-pulse">Loading Users...</div>
              ) : (
                users.map((user) => (
                  <div key={user.uid} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                      {user.photoURL ? <img src={user.photoURL} alt="" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 font-black text-xs">{user.displayName?.[0] || user.email[0]}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-slate-800 truncate">{user.displayName || 'No Name'}</div>
                      <div className="text-[10px] font-bold text-slate-400 truncate">{user.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select 
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                        className="text-[10px] font-black uppercase tracking-widest bg-white border-slate-200 rounded-lg py-1 pl-2 pr-8 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value={UserRole.VIEWER}>Viewer</option>
                        <option value={UserRole.MANAGER}>Manager</option>
                      </select>
                      <button 
                        onClick={() => handleResetPassword(user.email)}
                        className="px-3 py-1 bg-white border border-slate-200 text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        {resetStatus[user.email] || 'Reset Pass'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Calendar Labels</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Main Calendar Label</label>
                    <input 
                      type="text"
                      value={localConfig.mainLabel}
                      onChange={(e) => setLocalConfig({ ...localConfig, mainLabel: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">I&R Calendar Label</label>
                    <input 
                      type="text"
                      value={localConfig.irLabel}
                      onChange={(e) => setLocalConfig({ ...localConfig, irLabel: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-3 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default TechManagerModal;
