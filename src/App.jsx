import React, { useState, useEffect } from 'react';
import { Plus, Save, Trash2, FolderPlus, X, ChevronRight, Edit2, Eye, EyeOff, LogOut, User, History } from 'lucide-react';
import { supabase } from './lib/supabase';

// --- KONSTANTER ---
// Standard medarbejdere til login-skærmen (dette er stadig hardcoded for nemheds skyld)
const EMPLOYEES = [
  { id: 'u1', name: 'Morten', initials: 'MO', color: 'bg-blue-100 text-blue-700' },
  { id: 'u2', name: 'Sarah', initials: 'SA', color: 'bg-pink-100 text-pink-700' },
  { id: 'u3', name: 'Jens', initials: 'JE', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'u4', name: 'Lise', initials: 'LI', color: 'bg-green-100 text-green-700' },
];

export default function TimeTracker() {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState(null); 
  const [view, setView] = useState('loading'); // loading, login, home, log, create-project, history
  
  const [projects, setProjects] = useState([]);
  const [logs, setLogs] = useState([]);
  
  // Selection & Forms
  const [selectedProject, setSelectedProject] = useState(null);
  const [duration, setDuration] = useState(1.0);
  const [newProjectName, setNewProjectName] = useState('');
  
  // UI States
  const [isEditingProjects, setIsEditingProjects] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Tjek om brugeren er logget ind (gemt på telefonen)
    const savedUser = localStorage.getItem('he_user');
    
    if (savedUser) {
        setCurrentUser(JSON.parse(savedUser));
        setView('home');
        fetchData(); // Hent data fra Supabase
    } else {
        setView('login');
    }
  }, []);

  // Hent data fra Supabase
  const fetchData = async () => {
    setIsLoadingData(true);
    
    // Hent projekter
    const { data: projectsData, error: projError } = await supabase
      .from('he_time_projects')
      .select('*')
      .order('name');
    
    if (projectsData) setProjects(projectsData);
    if (projError) console.error('Fejl ved hentning af projekter:', projError);

    // Hent logs (henter de seneste 100 for nu)
    const { data: logsData, error: logsError } = await supabase
      .from('he_time_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (logsData) setLogs(logsData);
    if (logsError) console.error('Fejl ved hentning af logs:', logsError);
    
    setIsLoadingData(false);
  };

  // --- ACTIONS ---

  const handleLogin = (user) => {
      localStorage.setItem('he_user', JSON.stringify(user));
      setCurrentUser(user);
      setView('home');
      fetchData();
  };

  const handleLogout = () => {
      if(confirm("Er du sikker på du vil logge ud?")) {
        localStorage.removeItem('he_user');
        setCurrentUser(null);
        setView('login');
        setProjects([]);
        setLogs([]);
      }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    
    const newProject = {
      id: crypto.randomUUID(), // Generer et unikt ID
      name: newProjectName,
      color: 'bg-indigo-500 text-white',
      is_hidden: false
    };

    // Optimistisk UI opdatering
    setProjects(prev => [...prev, newProject]);
    setNewProjectName('');
    setSelectedProject(newProject);
    setView('log');

    // Gem i Supabase
    const { error } = await supabase
      .from('he_time_projects')
      .insert([newProject]);

    if (error) {
        alert('Kunne ikke oprette projekt: ' + error.message);
        // Rul tilbage hvis fejl (her kunne man lave mere avanceret fejlhåndtering)
    }
  };

  const handleLogTime = async () => {
    const newLog = {
      // Vi lader Supabase generere ID hvis vi bruger bigserial, men her sender vi timestamp som ID eller lader den være
      id: Date.now(), 
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      project_color: selectedProject.color,
      hours: duration,
      timestamp: new Date().toISOString(),
      user_data: currentUser // Gemmer hele brugerobjektet som JSONB
    };
    
    // Optimistisk UI opdatering
    setLogs(prev => [newLog, ...prev]);
    setDuration(1.0);
    setSelectedProject(null);
    setView('home');

    // Gem i Supabase
    const { error } = await supabase
      .from('he_time_logs')
      .insert([newLog]);

    if (error) {
        console.error('Kunne ikke gemme tid:', error);
        alert('Fejl ved gemning af tid. Tjek din internetforbindelse.');
    }
  };

  const handleUpdateLog = async (id, newHours) => {
    // Optimistisk opdatering
    setLogs(logs.map(l => l.id === id ? { ...l, hours: newHours } : l));
    setEditingLog(null);

    // Opdater i Supabase
    const { error } = await supabase
        .from('he_time_logs')
        .update({ hours: newHours })
        .eq('id', id);
    
    if (error) console.error("Fejl ved opdatering:", error);
  };

  const deleteLog = async (id) => {
    // Optimistisk opdatering
    setLogs(logs.filter(l => l.id !== id));
    setEditingLog(null);

    // Slet i Supabase
    const { error } = await supabase
        .from('he_time_logs')
        .delete()
        .eq('id', id);

    if (error) console.error("Fejl ved sletning:", error);
  };

  const toggleProjectVisibility = async (e, projectId, currentStatus) => {
    e.stopPropagation();
    
    // Optimistisk opdatering
    setProjects(projects.map(p => 
      p.id === projectId ? { ...p, is_hidden: !currentStatus } : p
    ));

    // Opdater i Supabase
    await supabase
        .from('he_time_projects')
        .update({ is_hidden: !currentStatus })
        .eq('id', projectId);
  };

  // --- HELPER COMPONENTS ---
  
  const Header = ({ title, left, right }) => (
    <div className="absolute top-0 left-0 right-0 h-[60px] sm:h-[70px] bg-white/80 backdrop-blur-xl border-b border-slate-200/50 flex items-end pb-3 px-4 justify-between z-20">
      <div className="w-16 flex justify-start">{left}</div>
      <h1 className="font-semibold text-slate-900 text-lg">{title}</h1>
      <div className="w-16 flex justify-end">{right}</div>
    </div>
  );

  // --- VIEWS ---

  // 0. LOGIN SCREEN
  const renderLogin = () => (
      <div className="flex flex-col h-full bg-white p-6 justify-center animate-in fade-in duration-500">
          <div className="mb-10 text-center">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Velkommen 👋</h1>
              <p className="text-slate-500">Hvem skal bruge denne telefon?</p>
          </div>

          <div className="space-y-4">
              {EMPLOYEES.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => handleLogin(emp)}
                    className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all flex items-center gap-4 text-left shadow-sm"
                  >
                      <div className={`w-12 h-12 rounded-full ${emp.color} flex items-center justify-center font-bold text-lg`}>
                          {emp.initials}
                      </div>
                      <div>
                          <p className="font-bold text-slate-900">{emp.name}</p>
                          <p className="text-xs text-slate-400">Tryk for at logge ind</p>
                      </div>
                  </button>
              ))}
          </div>
          
          <p className="mt-8 text-center text-xs text-slate-300">
              Dette valg gemmes på enheden.
          </p>
      </div>
  );

  // 1. HOME SCREEN
  const renderHome = () => {
    const visibleProjects = projects.filter(p => !p.is_hidden);
    const hiddenProjects = projects.filter(p => p.is_hidden);

    // Filtrer logs til kun at vise mine egne "i dag" for overskuelighed
    const myLogsToday = logs.filter(l => {
        const isMe = l.user_data?.id === currentUser?.id;
        const isToday = new Date(l.timestamp).toDateString() === new Date().toDateString();
        return isMe && isToday;
    });

    return (
      <div className="flex flex-col h-full bg-[#F2F2F7]">
        <Header 
          title="Tidsregistrering" 
          left={
            <button onClick={handleLogout} className="text-slate-400 p-1 hover:text-slate-600">
                 <div className={`w-8 h-8 rounded-full ${currentUser?.color} flex items-center justify-center text-xs font-bold ring-2 ring-white`}>
                    {currentUser?.initials}
                </div>
            </button>
          }
          right={
            <button 
              onClick={() => setIsEditingProjects(!isEditingProjects)} 
              className="text-blue-500 font-medium text-base active:opacity-50 transition-opacity"
            >
              {isEditingProjects ? 'Færdig' : 'Rediger'}
            </button>
          }
        />

        <div className="flex-1 overflow-y-auto pt-[80px] px-4 pb-20 space-y-6">
          
          {/* Main Action Grid */}
          <div>
            <div className="flex justify-between items-end mb-2 px-2">
              <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Aktive Projekter</h2>
            </div>
            
            {isLoadingData && projects.length === 0 ? (
                <div className="text-center py-10 text-slate-400">Henter projekter...</div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                {visibleProjects.map(project => (
                    <button
                    key={project.id}
                    onClick={() => {
                        if (!isEditingProjects) {
                            setSelectedProject(project);
                            setView('log');
                        }
                    }}
                    className={`
                        relative group h-24 rounded-2xl p-4 flex flex-col justify-between text-left shadow-sm transition-all duration-200
                        ${isEditingProjects ? 'bg-white' : 'bg-white active:scale-95'}
                    `}
                    >
                        <div className="flex justify-between items-start w-full">
                            <div className={`w-3 h-3 rounded-full ${project.color?.replace('text-white', '') || 'bg-gray-400'}`}></div>
                            {isEditingProjects && (
                                <div 
                                    onClick={(e) => toggleProjectVisibility(e, project.id, project.is_hidden)}
                                    className="p-1 -mt-2 -mr-2 text-slate-400"
                                >
                                    <EyeOff size={18} />
                                </div>
                            )}
                        </div>
                        <span className="font-semibold text-slate-900 leading-tight">{project.name}</span>
                    </button>
                ))}

                <button
                    onClick={() => setView('create-project')}
                    className="h-24 rounded-2xl bg-slate-100/50 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-400 active:bg-slate-200 transition-colors"
                >
                    <Plus size={24} />
                    <span className="text-xs font-medium">Nyt Projekt</span>
                </button>
                </div>
            )}
          </div>

          {/* Hidden Projects Section (Only in Edit Mode) */}
          {isEditingProjects && hiddenProjects.length > 0 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
               <div className="flex justify-between items-end mb-2 px-2">
                <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Skjulte Projekter</h2>
              </div>
              <div className="bg-white rounded-xl overflow-hidden shadow-sm divide-y divide-slate-100">
                {hiddenProjects.map(project => (
                   <div key={project.id} className="p-4 flex items-center justify-between">
                       <span className="text-slate-500">{project.name}</span>
                       <button 
                         onClick={(e) => toggleProjectVisibility(e, project.id, project.is_hidden)}
                         className="flex items-center gap-2 text-blue-500 font-medium text-sm"
                       >
                           <Eye size={16} />
                           Vis igen
                       </button>
                   </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Summary */}
          <div className="pb-8">
            <div className="flex justify-between items-end mb-2 px-2">
               <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">I dag ({currentUser?.name})</h2>
               <button onClick={() => setView('history')} className="text-blue-500 text-sm">Se alle</button>
            </div>
            
            <div className="bg-white rounded-xl overflow-hidden shadow-sm divide-y divide-slate-100">
              {myLogsToday.length === 0 ? (
                 <div className="p-4 text-center text-slate-400 text-sm py-8">Ingen registreringer i dag</div>
              ) : (
                myLogsToday.map(log => (
                  <div key={log.id} className="p-4 flex justify-between items-center active:bg-slate-50 transition-colors" onClick={() => setView('history')}>
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${log.project_color?.replace('text-white', '') || 'bg-gray-400'}`}></div>
                        <span className="text-slate-900 font-medium">{log.project_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                        <span className="text-slate-900 font-medium">{log.hours}t</span>
                        <ChevronRight size={16} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    );
  };

  // 2. LOG TIME SCREEN
  const renderLogScreen = () => (
    <div className="flex flex-col h-full bg-white">
      <Header 
        title="Registrer tid" 
        left={
            <button onClick={() => setView('home')} className="flex items-center text-blue-500 text-base">
                <ChevronRight className="rotate-180" size={24} />
                Tilbage
            </button>
        }
      />

      <div className="flex-1 flex flex-col pt-[80px]">
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-10 animate-in zoom-in-95 duration-300">
          
          <div className="text-center space-y-2">
            <h3 className="text-slate-500 text-sm font-medium uppercase tracking-wide">Valgt Projekt</h3>
            <h2 className="text-3xl font-bold text-slate-900">{selectedProject?.name}</h2>
          </div>
          
          <div className="w-full max-w-xs text-center space-y-8">
            <div className="relative">
                <div className="text-7xl font-bold text-slate-900 tracking-tighter">
                {duration}<span className="text-2xl text-slate-400 ml-1 font-normal">t</span>
                </div>
            </div>
            
            <div className="flex items-center justify-center gap-6">
              <button 
                onClick={() => setDuration(Math.max(0.25, duration - 0.25))}
                className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:bg-slate-200 transition-colors text-3xl font-light shadow-sm"
              >-</button>
              <button 
                onClick={() => setDuration(duration + 0.25)}
                className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:bg-slate-200 transition-colors text-3xl font-light shadow-sm"
              >+</button>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
                {[0.5, 1, 2, 4].map(val => (
                    <button 
                        key={val}
                        onClick={() => setDuration(val)}
                        className={`py-2 rounded-lg text-sm font-medium transition-all ${duration === val ? 'bg-blue-500 text-white shadow-md transform scale-105' : 'bg-slate-50 text-slate-600'}`}
                    >
                        {val}t
                    </button>
                ))}
            </div>
          </div>
        </div>

        <div className="p-4 pb-8 bg-white border-t border-slate-100">
          <button 
            onClick={handleLogTime}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-200 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            Gem Registrering
          </button>
        </div>
      </div>
    </div>
  );

  // 3. CREATE PROJECT
  const renderCreateProject = () => (
    <div className="flex flex-col h-full bg-[#F2F2F7]">
      <Header 
        title="Nyt Projekt" 
        left={
            <button onClick={() => setView('home')} className="text-blue-500 text-base">
                Annuller
            </button>
        }
      />

      <div className="pt-[90px] px-4 space-y-6">
        <div className="bg-white rounded-xl overflow-hidden px-4 shadow-sm">
            <div className="py-4 border-b border-slate-100">
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase">Navn</label>
                <input 
                    autoFocus
                    type="text" 
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Indtast projektnavn"
                    className="w-full text-lg font-medium outline-none placeholder:text-slate-300"
                />
            </div>
        </div>

        <p className="text-slate-400 text-xs px-2">
            Nye projekter bliver synlige for alle kollegaer med det samme.
        </p>

        <button 
          onClick={handleCreateProject}
          disabled={!newProjectName.trim()}
          className="w-full py-3.5 bg-blue-500 disabled:opacity-50 disabled:active:scale-100 text-white rounded-xl font-bold shadow-md active:scale-[0.98] transition-all"
        >
          Opret Projekt
        </button>
      </div>
    </div>
  );

  // 4. HISTORY & EDITING
  const renderHistory = () => {
    // Vis kun mine egne logs i historikken
    const userLogs = logs.filter(l => l.user_data?.id === currentUser?.id);
    
    return (
        <div className="flex flex-col h-full bg-[#F2F2F7]">
            <Header 
                title="Min Historik" 
                left={
                    <button onClick={() => setView('home')} className="flex items-center text-blue-500 text-base">
                        <ChevronRight className="rotate-180" size={24} />
                        Tilbage
                    </button>
                }
            />
    
            <div className="flex-1 overflow-y-auto pt-[80px] px-4 pb-10">
                {userLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <History size={48} className="mb-4 opacity-20" />
                        <p>Ingen registreringer fundet</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100">
                        {userLogs.map(log => (
                            <button 
                                key={log.id} 
                                onClick={() => setEditingLog(log)}
                                className="w-full p-4 flex justify-between items-center text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                            >
                                <div>
                                    <p className="font-semibold text-slate-900">{log.project_name}</p>
                                    <p className="text-xs text-slate-500">
                                        {new Date(log.timestamp).toLocaleDateString()} &bull; {new Date(log.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-slate-900 font-medium bg-slate-100 px-2 py-1 rounded-md min-w-[3rem] text-center">{log.hours}t</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
                
                {userLogs.length > 0 && (
                    <div className="mt-6 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Mine Timer Total</p>
                        <p className="text-3xl font-bold text-slate-900">{userLogs.reduce((acc, curr) => acc + curr.hours, 0)}</p>
                    </div>
                )}
            </div>
    
            {/* --- EDIT LOG MODAL (Sheet style) --- */}
            {editingLog && (
                <div className="absolute inset-0 z-50 flex items-end justify-center">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setEditingLog(null)}
                    ></div>
                    
                    {/* Sheet */}
                    <div className="relative bg-[#F2F2F7] w-full rounded-t-[2rem] p-6 pb-10 shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Rediger registrering</h3>
                                <p className="text-slate-500 text-sm">{editingLog.project_name}</p>
                            </div>
                            <button onClick={() => setEditingLog(null)} className="bg-slate-200 p-1 rounded-full text-slate-500">
                                <X size={20} />
                            </button>
                        </div>
    
                        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Timer</span>
                            <div className="flex items-center gap-4">
                                 <button 
                                    onClick={() => setEditingLog({...editingLog, hours: Math.max(0.25, editingLog.hours - 0.25)})}
                                    className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xl font-bold active:bg-slate-200"
                                >-</button>
                                <span className="text-xl font-bold w-12 text-center tabular-nums">{editingLog.hours}</span>
                                <button 
                                    onClick={() => setEditingLog({...editingLog, hours: editingLog.hours + 0.25})}
                                    className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xl font-bold active:bg-slate-200"
                                >+</button>
                            </div>
                        </div>
    
                        <div className="space-y-3">
                            <button 
                                onClick={() => handleUpdateLog(editingLog.id, editingLog.hours)}
                                className="w-full py-3.5 bg-blue-500 text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-transform"
                            >
                                Gem ændringer
                            </button>
                            <button 
                                onClick={() => {
                                    if(confirm("Er du sikker på du vil slette denne registrering?")) {
                                        deleteLog(editingLog.id);
                                    }
                                }}
                                className="w-full py-3.5 bg-white text-red-500 font-bold rounded-xl border border-slate-200 active:bg-red-50 transition-colors"
                            >
                                Slet registrering
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      );
  }

  return (
    <div className="font-sans text-slate-900 bg-slate-200 sm:bg-slate-200 h-screen w-full flex sm:items-center sm:justify-center">
      {/* Mobile Frame Simulation - Only visible on desktop (sm breakpoint and above) */}
      <div className="w-full h-full bg-[#F2F2F7] sm:max-w-md sm:max-h-[850px] sm:rounded-[2.5rem] sm:shadow-2xl sm:overflow-hidden relative flex flex-col sm:border-[8px] sm:border-slate-900">
        
        {/* Notch Area fake - Only on desktop */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-xl z-50 sm:block hidden"></div>
        
        <div className="flex-1 overflow-hidden relative">
            {view === 'loading' && <div className="flex h-full items-center justify-center bg-white"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}
            {view === 'login' && renderLogin()}
            {view === 'home' && renderHome()}
            {view === 'log' && renderLogScreen()}
            {view === 'create-project' && renderCreateProject()}
            {view === 'history' && renderHistory()}
        </div>
        
        {/* Home Indicator - Only on desktop */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1/3 h-1.5 bg-slate-900/20 rounded-full sm:block hidden"></div>
      </div>
    </div>
  );
}