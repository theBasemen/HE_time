import React, { useState, useEffect } from 'react';
import { Plus, Save, Trash2, FolderPlus, X, ChevronRight, Edit2, Eye, EyeOff, LogOut, User, History, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function TimeTracker() {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState(null); 
  const [view, setView] = useState('loading'); // loading, login, home, log, create-project, history
  
  const [users, setUsers] = useState([]);
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
  const [selectedDateFilter, setSelectedDateFilter] = useState(null); // null = all dates
  const [expandedDates, setExpandedDates] = useState(new Set()); // Track which date groups are expanded

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Hent brugere fra database
    fetchUsers();
    
    // 2. Tjek om brugeren er logget ind (gemt på telefonen)
    const savedUserId = localStorage.getItem('he_user_id');
    
    if (savedUserId) {
        // Hent brugerdata fra database baseret på gemt ID
        fetchUserById(savedUserId).then(user => {
            if (user) {
                setCurrentUser(user);
                setView('home');
                fetchData(); // Hent data fra Supabase
            } else {
                // Bruger findes ikke længere, vis login
                localStorage.removeItem('he_user_id');
                setView('login');
            }
        });
    } else {
        setView('login');
    }
  }, []);

  // Auto-expand today and yesterday in history view when logs are loaded
  useEffect(() => {
    if (logs.length > 0 && currentUser) {
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      setExpandedDates(prev => {
        const newSet = new Set(prev);
        newSet.add(today);
        newSet.add(yesterday);
        return newSet;
      });
    }
  }, [logs.length, currentUser]);

  // Hent brugere fra Supabase
  const fetchUsers = async () => {
    const { data: usersData, error: usersError } = await supabase
      .from('he_time_users')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (usersData) {
      // Konverter database color til Tailwind classes hvis nødvendigt
      const formattedUsers = usersData.map(user => ({
        ...user,
        colorClass: user.color || 'bg-gray-100 text-gray-700'
      }));
      setUsers(formattedUsers);
    }
    if (usersError) console.error('Fejl ved hentning af brugere:', usersError);
  };

  // Hent specifik bruger efter ID
  const fetchUserById = async (userId) => {
    const { data, error } = await supabase
      .from('he_time_users')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .single();
    
    if (error) {
      console.error('Fejl ved hentning af bruger:', error);
      return null;
    }
    
    if (data) {
      return {
        ...data,
        colorClass: data.color || 'bg-gray-100 text-gray-700'
      };
    }
    return null;
  };

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

  const handleLogin = async (user) => {
      // Gem kun user_id i localStorage
      localStorage.setItem('he_user_id', user.id);
      setCurrentUser(user);
      setView('home');
      fetchData();
  };

  const handleLogout = () => {
      if(confirm("Er du sikker på du vil logge ud?")) {
        localStorage.removeItem('he_user_id');
        setCurrentUser(null);
        setView('login');
        setProjects([]);
        setLogs([]);
      }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    
    const newProject = {
      id: crypto.randomUUID(), // Generer et unikt UUID som text ID
      name: newProjectName.trim(),
      color: '#6366f1', // Default indigo color (hex format)
      type: null, // Kan udvides senere
      is_hidden: false,
      due_date: null // Kan udvides senere
    };

    // Optimistisk UI opdatering
    const tempId = newProject.id;
    setProjects(prev => [...prev, newProject]);
    setNewProjectName('');
    setSelectedProject(newProject);
    setView('log');

    // Gem i Supabase
    const { data, error } = await supabase
      .from('he_time_projects')
      .insert([newProject])
      .select()
      .single();

    if (error) {
        // Rul tilbage optimistisk opdatering
        setProjects(prev => prev.filter(p => p.id !== tempId));
        alert('Kunne ikke oprette projekt: ' + error.message);
    } else if (data) {
        // Erstat med rigtig data fra database
        setProjects(prev => prev.map(p => p.id === tempId ? data : p));
        setSelectedProject(data);
    }
  };

  const handleLogTime = async () => {
    if (!currentUser || !currentUser.id) {
      alert('Fejl: Ingen bruger valgt');
      return;
    }

    const newLog = {
      project_id: selectedProject.id,
      project_name: selectedProject.name,
      project_color: selectedProject.color,
      hours: duration,
      timestamp: new Date().toISOString(),
      user_id: currentUser.id, // Brug foreign key til he_time_users
      user_data: currentUser // Gem også hele brugerobjektet som JSONB for bagudkompatibilitet
    };
    
    // Optimistisk UI opdatering
    const tempId = 'temp-' + Date.now();
    const optimisticLog = {
      id: tempId,
      ...newLog,
    };
    setLogs(prev => [optimisticLog, ...prev]);
    setDuration(1.0);
    setSelectedProject(null);
    setView('home');

    // Gem i Supabase
    const { data, error } = await supabase
      .from('he_time_logs')
      .insert([newLog])
      .select()
      .single();

    if (error) {
        console.error('Kunne ikke gemme tid:', error);
        // Rul tilbage optimistisk opdatering
        setLogs(prev => prev.filter(log => log.id !== tempId));
        alert('Fejl ved gemning af tid. Tjek din internetforbindelse.');
    } else if (data) {
        // Erstat optimistisk opdatering med rigtig data
        setLogs(prev => prev.map(log => log.id === tempId ? data : log));
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

  // --- HELPER FUNCTIONS ---
  
  // Helper to render project color dot - handles both hex colors and Tailwind classes
  const renderProjectColorDot = (color, size = 'w-3 h-3') => {
    if (!color) return <div className={`${size} rounded-full bg-gray-400`}></div>;
    
    // Check if it's a Tailwind class
    if (color.includes('bg-')) {
      const cleanColor = color.replace('text-white', '').trim();
      return <div className={`${size} rounded-full ${cleanColor}`}></div>;
    }
    
    // Otherwise treat as hex/rgb color
    return (
      <div 
        className={`${size} rounded-full`}
        style={{ backgroundColor: color }}
      ></div>
    );
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
  const renderLogin = () => {
    // Konverter database color til Tailwind class hvis det ikke allerede er det
    const getColorClass = (color) => {
      if (!color) return 'bg-gray-100 text-gray-700';
      // Hvis det allerede er en Tailwind class, brug den
      if (color.includes('bg-')) return color;
      // Ellers konverter hex/rgb til Tailwind class eller brug som inline style
      return 'bg-gray-100 text-gray-700';
    };

    return (
      <div className="flex flex-col h-full bg-white p-6 justify-center animate-in fade-in duration-500">
          <div className="mb-10 text-center">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Velkommen 👋</h1>
              <p className="text-slate-500">Hvem skal bruge denne telefon?</p>
          </div>

          {users.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p>Henter brugere...</p>
            </div>
          ) : (
            <div className="space-y-4">
                {users.map(user => (
                    <button
                      key={user.id}
                      onClick={() => handleLogin(user)}
                      className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all flex items-center gap-4 text-left shadow-sm"
                    >
                        {user.avatar_url ? (
                          <img 
                            src={user.avatar_url} 
                            alt={user.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div 
                            className={`w-12 h-12 rounded-full ${getColorClass(user.color)} flex items-center justify-center font-bold text-lg`}
                            style={user.color && !user.color.includes('bg-') ? { backgroundColor: user.color } : {}}
                          >
                              {user.initials}
                          </div>
                        )}
                        <div>
                            <p className="font-bold text-slate-900">{user.name}</p>
                            <p className="text-xs text-slate-400">Tryk for at logge ind</p>
                        </div>
                    </button>
                ))}
            </div>
          )}
          
          <p className="mt-8 text-center text-xs text-slate-300">
              Dette valg gemmes på enheden.
          </p>
      </div>
    );
  };

  // 1. HOME SCREEN
  const renderHome = () => {
    const visibleProjects = projects.filter(p => !p.is_hidden);
    const hiddenProjects = projects.filter(p => p.is_hidden);

    // Filtrer logs til kun at vise mine egne "i dag" for overskuelighed
    const myLogsToday = logs.filter(l => {
        const isMe = l.user_id === currentUser?.id;
        const isToday = new Date(l.timestamp).toDateString() === new Date().toDateString();
        return isMe && isToday;
    });

    return (
      <div className="flex flex-col h-full bg-[#F2F2F7]">
        <Header 
          title="Tidsregistrering" 
          left={
            <button onClick={handleLogout} className="text-slate-400 p-1 hover:text-slate-600">
                {currentUser?.avatar_url ? (
                  <img 
                    src={currentUser.avatar_url} 
                    alt={currentUser.name}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-white"
                  />
                ) : (
                  <div 
                    className={`w-8 h-8 rounded-full ${currentUser?.colorClass || 'bg-gray-100 text-gray-700'} flex items-center justify-center text-xs font-bold ring-2 ring-white`}
                    style={currentUser?.color && !currentUser.color.includes('bg-') ? { backgroundColor: currentUser.color } : {}}
                  >
                    {currentUser?.initials}
                  </div>
                )}
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
                            {renderProjectColorDot(project.color)}
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
                         {renderProjectColorDot(log.project_color, 'w-2 h-2')}
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
    const userLogs = logs.filter(l => l.user_id === currentUser?.id && l.hours !== null);
    
    // Group logs by date
    const groupLogsByDate = (logs) => {
      const grouped = {};
      logs.forEach(log => {
        const date = new Date(log.timestamp);
        const dateKey = date.toDateString();
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(log);
      });
      return grouped;
    };

    // Filter logs by selected date
    const filteredLogs = selectedDateFilter 
      ? userLogs.filter(log => {
          const logDate = new Date(log.timestamp).toDateString();
          const filterDate = new Date(selectedDateFilter).toDateString();
          return logDate === filterDate;
        })
      : userLogs;

    const groupedLogs = groupLogsByDate(filteredLogs);
    const sortedDates = Object.keys(groupedLogs).sort((a, b) => new Date(b) - new Date(a));

    // Helper to format date nicely
    const formatDateHeader = (dateString) => {
      const date = new Date(dateString);
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      
      if (dateString === today) return 'I dag';
      if (dateString === yesterday) return 'I går';
      return date.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    // Toggle date group expansion
    const toggleDateGroup = (dateString) => {
      const newExpanded = new Set(expandedDates);
      if (newExpanded.has(dateString)) {
        newExpanded.delete(dateString);
      } else {
        newExpanded.add(dateString);
      }
      setExpandedDates(newExpanded);
    };

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
                {/* Date Filter Buttons */}
                {userLogs.length > 0 && (
                  <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                    <button
                      onClick={() => setSelectedDateFilter(null)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedDateFilter === null 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      Alle
                    </button>
                    <button
                      onClick={() => setSelectedDateFilter(new Date().toISOString())}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedDateFilter && new Date(selectedDateFilter).toDateString() === new Date().toDateString()
                          ? 'bg-blue-500 text-white' 
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      I dag
                    </button>
                    <button
                      onClick={() => {
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        setSelectedDateFilter(yesterday.toISOString());
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedDateFilter && new Date(selectedDateFilter).toDateString() === new Date(Date.now() - 86400000).toDateString()
                          ? 'bg-blue-500 text-white' 
                          : 'bg-white text-slate-600'
                      }`}
                    >
                      I går
                    </button>
                  </div>
                )}

                {userLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <History size={48} className="mb-4 opacity-20" />
                        <p>Ingen registreringer fundet</p>
                    </div>
                ) : sortedDates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Calendar size={48} className="mb-4 opacity-20" />
                        <p>Ingen registreringer for valgte dato</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sortedDates.map(dateString => {
                            const dateLogs = groupedLogs[dateString];
                            const isExpanded = expandedDates.has(dateString);
                            const dateTotal = dateLogs.reduce((sum, log) => sum + log.hours, 0);
                            
                            return (
                                <div key={dateString} className="bg-white rounded-xl shadow-sm overflow-hidden">
                                    {/* Date Header - Clickable to expand/collapse */}
                                    <button
                                        onClick={() => toggleDateGroup(dateString)}
                                        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Calendar size={18} className="text-slate-400" />
                                            <div className="text-left">
                                                <p className="font-semibold text-slate-900">{formatDateHeader(dateString)}</p>
                                                <p className="text-xs text-slate-500">{dateLogs.length} registrering{dateLogs.length !== 1 ? 'er' : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-slate-900 font-medium">{dateTotal}t</span>
                                            {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                                        </div>
                                    </button>
                                    
                                    {/* Logs for this date */}
                                    {isExpanded && (
                                        <div className="divide-y divide-slate-100">
                                            {dateLogs
                                                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                                                .map(log => (
                                                    <button 
                                                        key={log.id} 
                                                        onClick={() => setEditingLog(log)}
                                                        className="w-full p-4 pl-12 flex justify-between items-center text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3 flex-1">
                                                            {renderProjectColorDot(log.project_color, 'w-2 h-2')}
                                                            <div>
                                                                <p className="font-semibold text-slate-900">{log.project_name}</p>
                                                                <p className="text-xs text-slate-500">
                                                                    {new Date(log.timestamp).toLocaleTimeString('da-DK', {hour:'2-digit', minute:'2-digit'})}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <span className="text-slate-900 font-medium bg-slate-100 px-2 py-1 rounded-md min-w-[3rem] text-center">{log.hours}t</span>
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                
                {userLogs.length > 0 && (
                    <div className="mt-6 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Mine Timer Total</p>
                        <p className="text-3xl font-bold text-slate-900">{userLogs.reduce((acc, curr) => acc + curr.hours, 0)}t</p>
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