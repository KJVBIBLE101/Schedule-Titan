import React, { useState, useEffect } from 'react';
import { Technician, UserProfile, UserRole, CalendarConfig, GroupData } from '../types';
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
  const getInitialConfig = (config: CalendarConfig): CalendarConfig => {
    if (config.groups && config.groups.length > 0) return config;
    return {
      ...config,
      groups: [
        { id: 'MAIN', name: config.mainLabel || 'Main' },
        { id: 'IR', name: config.irLabel || 'I&R' }
      ]
    };
  };

  const [localTechs, setLocalTechs] = useState<Technician[]>(technicians);
  const [localConfig, setLocalConfig] = useState<CalendarConfig>(getInitialConfig(calendarConfig));
  const [activeTab, setActiveTab] = useState<'techs' | 'users' | 'config'>('techs');
  
  // Default to first group ID
  const defaultTab = localConfig.groups && localConfig.groups.length > 0 ? localConfig.groups[0].id : 'MAIN';
  const [activeGroupTab, setActiveGroupTab] = useState<string>(defaultTab);
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [resetStatus, setResetStatus] = useState<Record<string, string>>({});
  
  const [draggedTechId, setDraggedTechId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalTechs(technicians.sort((a, b) => (a.order || 0) - (b.order || 0)));
      const newConfig = getInitialConfig(calendarConfig);
      setLocalConfig(newConfig);
      if (newConfig.groups && newConfig.groups.length > 0 && !newConfig.groups.find(g => g.id === activeGroupTab)) {
        setActiveGroupTab(newConfig.groups[0].id);
      }
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
    const order = localTechs.length;
    setLocalTechs([...localTechs, { id: newId, name: 'New Technician', code: newId, group: activeGroupTab, order }]);
  };

  const handleRemoveTech = (id: string) => {
    setLocalTechs(localTechs.filter(t => t.id !== id));
  };

  const handleUpdateTech = (id: string, name: string, code: string, group: string) => {
    setLocalTechs(localTechs.map(t => t.id === id ? { ...t, name, code, group } : t));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTechId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedTechId || draggedTechId === id) return;
    
    setLocalTechs(prev => {
      const prevGroup = prev.filter(t => (t.group || 'MAIN') === activeGroupTab).sort((a, b) => (a.order || 0) - (b.order || 0));
      const draggedIndex = prevGroup.findIndex(t => t.id === draggedTechId);
      const targetIndex = prevGroup.findIndex(t => t.id === id);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const newGroup = [...prevGroup];
      const [draggedTech] = newGroup.splice(draggedIndex, 1);
      newGroup.splice(targetIndex, 0, draggedTech);
      
      // Update orders for this group
      const newTechs = [...prev];
      newGroup.forEach((tech, idx) => {
        const globalIndex = newTechs.findIndex(t => t.id === tech.id);
        if (globalIndex !== -1) {
          newTechs[globalIndex] = { ...tech, order: idx };
        }
      });
      return newTechs;
    });
  };

  const handleDragEnd = () => {
    setDraggedTechId(null);
  };

  const handleSave = () => {
    onSave(localTechs, {}, localConfig);
    onClose();
  };

  const addGroup = () => {
    const newId = 'GROUP_' + Math.random().toString(36).substr(2, 4).toUpperCase();
    const newGroups = [...(localConfig.groups || []), { id: newId, name: 'New Group' }];
    setLocalConfig({ ...localConfig, groups: newGroups });
  };

  const removeGroup = (groupId: string) => {
    if ((localConfig.groups || []).length <= 1) return;
    const newGroups = (localConfig.groups || []).filter(g => g.id !== groupId);
    setLocalConfig({ ...localConfig, groups: newGroups });
    if (activeGroupTab === groupId) {
      setActiveGroupTab(newGroups[0].id);
    }
  };

  const updateGroupName = (groupId: string, name: string) => {
    const newGroups = (localConfig.groups || []).map(g => g.id === groupId ? { ...g, name } : g);
    setLocalConfig({ ...localConfig, groups: newGroups });
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
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4 overflow-x-auto">
                {(localConfig.groups || []).map(group => (
                  <button 
                    key={group.id}
                    onClick={() => setActiveGroupTab(group.id)}
                    className={`flex-1 whitespace-nowrap min-w-[80px] py-2 px-3 text-[10px] font-black uppercase rounded-lg transition-all ${activeGroupTab === group.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {group.name}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {localTechs
                  .filter(t => (t.group || 'MAIN') === activeGroupTab)
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((tech) => (
                  <div 
                    key={tech.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, tech.id)}
                    onDragOver={(e) => handleDragOver(e, tech.id)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 bg-slate-50 p-3 rounded-xl border transition-all ${draggedTechId === tech.id ? 'opacity-50 border-indigo-300 scale-[0.98]' : 'border-slate-100 cursor-move hover:border-slate-300'}`}
                  >
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-black text-xs shrink-0 cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                    <div className="flex-1 flex gap-2 items-center">
                      <input 
                        type="text"
                        placeholder="Name"
                        value={tech.name}
                        onChange={(e) => handleUpdateTech(tech.id, e.target.value, tech.code, tech.group || activeGroupTab)}
                        className="flex-1 bg-transparent border-none focus:ring-0 font-bold text-slate-700 min-w-0"
                      />
                      <input 
                        type="text"
                        placeholder="Code"
                        value={tech.code}
                        onChange={(e) => handleUpdateTech(tech.id, tech.name, e.target.value, tech.group || activeGroupTab)}
                        className="w-16 shrink-0 bg-transparent border-none focus:ring-0 font-mono text-xs text-slate-500"
                      />
                    </div>
                    <button 
                      onClick={() => handleRemoveTech(tech.id)}
                      className="p-2 text-rose-400 hover:text-rose-600 transition-colors shrink-0"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button 
                onClick={handleAddTech}
                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-500 transition-all focus:outline-none"
              >
                + Add Technician
              </button>
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-4">
              {loadingUsers ? (
                <div className="text-center py-10 text-slate-400 font-bold animate-pulse">Loading Users...</div>
              ) : (
                users.map((user) => (
                  <div key={user.uid} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden shrink-0">
                      {user.photoURL ? <img src={user.photoURL} alt="" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 font-black text-xs">{user.displayName?.[0] || user.email[0]}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-slate-800 truncate">{user.displayName || 'No Name'}</div>
                      <div className="text-[10px] font-bold text-slate-400 truncate">{user.email}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Calendar Group Labels</h3>
                  <button 
                    onClick={addGroup}
                    className="text-[10px] font-black text-indigo-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all uppercase"
                  >
                    + Add Group
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {(localConfig.groups || []).map((group, index) => (
                    <div key={group.id} className="flex gap-2 items-center">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Group {index + 1} Label</label>
                        <input 
                          type="text"
                          value={group.name}
                          onChange={(e) => updateGroupName(group.id, e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                      <button 
                        onClick={() => removeGroup(group.id)}
                        disabled={(localConfig.groups || []).length <= 1}
                        className={`mt-4 p-2 rounded-xl transition-all ${(localConfig.groups || []).length <= 1 ? 'text-slate-300 cursor-not-allowed' : 'text-rose-400 hover:bg-rose-50 hover:text-rose-600'}`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {(localConfig.groups || []).length <= 1 && (
                    <p className="text-[10px] text-amber-600 font-bold ml-1 mt-1">At least one group must be present.</p>
                  )}
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
