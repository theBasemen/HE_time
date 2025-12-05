import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, History, Calendar, Clock, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function TimeTracker() {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState(null); 
  const [view, setView] = useState('loading'); // loading, login, home
  
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [logs, setLogs] = useState([]);
  
  // Selection & Forms
  const [selectedProjectForTimer, setSelectedProjectForTimer] = useState(null);
  const [duration, setDuration] = useState(1.0);
  
  // UI States
  const [editingLog, setEditingLog] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [justSavedLogId, setJustSavedLogId] = useState(null);
  
  // Bottom Sheet States
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isBottomSheetClosing, setIsBottomSheetClosing] = useState(false);
  const [bottomSheetStep, setBottomSheetStep] = useState('project'); // 'project' or 'time'
  
  // Edit Modal States
  const [isEditModalClosing, setIsEditModalClosing] = useState(false);
  
  // Calendar Navigation State
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Helper function to close bottom sheet with animation
  const closeBottomSheet = () => {
    setIsBottomSheetClosing(true);
    setTimeout(() => {
      setIsBottomSheetOpen(false);
      setIsBottomSheetClosing(false);
      setBottomSheetStep('project');
      setSelectedProjectForTimer(null);
      setDuration(1.0);
    }, 200);
  };
  
  // Helper function to close edit modal with animation
  const closeEditModal = () => {
    setIsEditModalClosing(true);
    setTimeout(() => {
      setEditingLog(null);
      setIsEditModalClosing(false);
    }, 200);
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    fetchUsers();
    
    const savedUserId = localStorage.getItem('he_user_id');
    
    if (savedUserId) {
        fetchUserById(savedUserId).then(user => {
            if (user) {
                setCurrentUser(user);
                setView('home');
                fetchData();
            } else {
                localStorage.removeItem('he_user_id');
                setView('login');
            }
        });
    } else {
        setView('login');
    }
  }, []);

  // Auto-expand today and yesterday in history view


  // --- DATA FETCHING ---
  
  const fetchUsers = async () => {
    const { data: usersData, error: usersError } = await supabase
      .from('he_time_users')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (usersData) {
      const formattedUsers = usersData.map(user => ({
        ...user,
        colorClass: user.color || 'bg-gray-100 text-gray-700'
      }));
      setUsers(formattedUsers);
    }
    if (usersError) console.error('Fejl ved hentning af brugere:', usersError);
  };

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

  const fetchData = async () => {
    setIsLoadingData(true);
    
    const { data: projectsData, error: projError } = await supabase
      .from('he_time_projects')
      .select('*')
      .order('name');
    
    if (projectsData) setProjects(projectsData);
    if (projError) console.error('Fejl ved hentning af projekter:', projError);

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

  const handleLogTime = async () => {
    if (!currentUser || !currentUser.id) {
      alert('Fejl: Ingen bruger valgt');
      return;
    }

    if (!selectedProjectForTimer) {
      alert('Vælg venligst et projekt');
      return;
    }

    setIsSavingTime(true);

    // Use selectedDate for the date part, but keep current time
    const timestamp = new Date(selectedDate);
    const now = new Date();
    timestamp.setHours(now.getHours());
    timestamp.setMinutes(now.getMinutes());
    timestamp.setSeconds(now.getSeconds());
    timestamp.setMilliseconds(now.getMilliseconds());

    const newLog = {
      project_id: selectedProjectForTimer.id,
      project_name: selectedProjectForTimer.name,
      project_color: selectedProjectForTimer.color,
      hours: duration,
      timestamp: timestamp.toISOString(),
      user_id: currentUser.id,
      user_data: currentUser
    };
    
    const tempId = 'temp-' + Date.now();
    const optimisticLog = {
      id: tempId,
      ...newLog,
    };
    setLogs(prev => [optimisticLog, ...prev]);
    setJustSavedLogId(tempId);

    const { data, error } = await supabase
      .from('he_time_logs')
      .insert([newLog])
      .select()
      .single();

    if (error) {
        console.error('Kunne ikke gemme tid:', error);
        setLogs(prev => prev.filter(log => log.id !== tempId));
        setJustSavedLogId(null);
        alert('Fejl ved gemning af tid. Tjek din internetforbindelse.');
    } else if (data) {
        setLogs(prev => prev.map(log => log.id === tempId ? data : log));
        setJustSavedLogId(data.id);
        setTimeout(() => setJustSavedLogId(null), 3000);
    }

    // Reset and close bottom sheet
    setIsSavingTime(false);
    closeBottomSheet();
  };

  const handleUpdateLog = async (id, newHours) => {
    setLogs(logs.map(l => l.id === id ? { ...l, hours: newHours } : l));
    closeEditModal();

    const { error } = await supabase
        .from('he_time_logs')
        .update({ hours: newHours })
        .eq('id', id);
    
    if (error) console.error("Fejl ved opdatering:", error);
  };

  const deleteLog = async (id) => {
    setLogs(logs.filter(l => l.id !== id));
    closeEditModal();

    const { error } = await supabase
        .from('he_time_logs')
        .delete()
        .eq('id', id);

    if (error) console.error("Fejl ved sletning:", error);
  };

  // --- HELPER FUNCTIONS ---
  
  // Convert decimal hours to hours:minutes format (e.g. 1.25 -> "1:15", 1.5 -> "1:30")
  const formatHoursToTime = (hours) => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return `${wholeHours}:${minutes.toString().padStart(2, '0')}`;
  };
  
  // Convert hours:minutes format to decimal hours (e.g. "1:15" -> 1.25, "1:30" -> 1.5)
  const parseTimeToHours = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours + (minutes / 60);
  };
  
  const renderProjectColorDot = (color, size = 'w-3 h-3') => {
    if (!color) return <div className={`${size} rounded-full bg-gray-400`}></div>;
    
    if (color.includes('bg-')) {
      const cleanColor = color.replace('text-white', '').trim();
      return <div className={`${size} rounded-full ${cleanColor}`}></div>;
    }
    
    return (
      <div 
        className={`${size} rounded-full`}
        style={{ backgroundColor: color }}
      ></div>
    );
  };

  // Get recently used projects (last 3-4 projects user logged time on)
  const getRecentlyUsedProjects = () => {
    if (!currentUser || logs.length === 0) return [];
    
    const userLogs = logs.filter(l => l.user_id === currentUser.id);
    const projectCounts = {};
    
    userLogs.forEach(log => {
      if (log.project_id) {
        projectCounts[log.project_id] = (projectCounts[log.project_id] || 0) + 1;
      }
    });
    
    const sortedProjectIds = Object.keys(projectCounts)
      .sort((a, b) => projectCounts[b] - projectCounts[a])
      .slice(0, 4);
    
    return sortedProjectIds
      .map(id => projects.find(p => p.id === id && !p.is_hidden))
      .filter(Boolean);
  };

  // Format date for header
  const formatDateHeader = () => {
    const today = new Date();
    return today.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // --- VIEWS ---

  // 0. LOGIN SCREEN
  const renderLogin = () => {
    const getColorClass = (color) => {
      if (!color) return 'bg-gray-100 text-gray-700';
      if (color.includes('bg-')) return color;
      return 'bg-gray-100 text-gray-700';
    };

    return (
      <div className="flex flex-col h-full bg-white p-6 justify-center animate-in fade-in duration-500">
          <div className="mb-10 text-center">
              <div className="flex justify-center mb-6">
                  <img 
                    src="/he_logo.png" 
                    alt="HE Logo" 
                    className="h-16 w-auto"
                  />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Tidsregistrering</h1>
              <p className="text-slate-500">Hvem skal der registreres timer for?</p>
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
    // Filter logs for selected date's registrations for current user
    const selectedDateString = selectedDate.toDateString();
    const myLogsForDate = logs
      .filter(l => {
        const isMe = l.user_id === currentUser?.id;
        const logDate = new Date(l.timestamp).toDateString();
        return isMe && logDate === selectedDateString && l.hours !== null;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const dateTotal = myLogsForDate.reduce((sum, log) => sum + (log.hours || 0), 0);
    
    // Helper functions for date navigation
    const goToPreviousDay = () => {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() - 1);
      setSelectedDate(newDate);
    };
    
    const goToNextDay = () => {
      const newDate = new Date(selectedDate);
      newDate.setDate(newDate.getDate() + 1);
      setSelectedDate(newDate);
    };
    
    const formatSelectedDate = () => {
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const selectedDateString = selectedDate.toDateString();
      
      if (selectedDateString === today) return 'I dag';
      if (selectedDateString === yesterday) return 'I går';
      return selectedDate.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    // Filter projects
    const visibleProjects = projects.filter(p => !p.is_hidden);

    const recentlyUsedProjects = getRecentlyUsedProjects();
    const recentlyUsedIds = new Set(recentlyUsedProjects.map(p => p.id));
    const otherProjects = visibleProjects.filter(p => !recentlyUsedIds.has(p.id));

    return (
      <div className="flex flex-col h-full bg-[#F2F2F7] relative overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 pt-12 pb-4">
          <div className="flex items-center justify-between mb-2 relative">
            <button 
              onClick={handleLogout}
              className="p-1 active:opacity-70 transition-opacity"
            >
              {currentUser?.avatar_url ? (
                <img 
                  src={currentUser.avatar_url} 
                  alt={currentUser.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-200"
                />
              ) : (
                <div 
                  className={`w-10 h-10 rounded-full ${currentUser?.colorClass || 'bg-gray-100 text-gray-700'} flex items-center justify-center text-sm font-bold ring-2 ring-slate-200`}
                  style={currentUser?.color && !currentUser.color.includes('bg-') ? { backgroundColor: currentUser.color } : {}}
                >
                  {currentUser?.initials}
                </div>
              )}
            </button>
            <div className="absolute left-1/2 -translate-x-1/2">
              <p className="text-xs text-slate-500 uppercase tracking-wider">{formatDateHeader()}</p>
            </div>
            <button
              onClick={fetchData}
              disabled={isLoadingData}
              className="p-2 text-slate-400 hover:text-slate-600 active:opacity-70 transition-colors disabled:opacity-50"
              title="Genindlæs data"
            >
              <RefreshCw size={20} className={isLoadingData ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Main Content - Selected Date's Logs */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {/* Total Hours */}
          {dateTotal > 0 && (
            <div className="mb-6 bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total</p>
                  <p className="text-4xl font-bold text-slate-900">{formatHoursToTime(dateTotal)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Arbejdsdag</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {Math.round((dateTotal / 7.5) * 100)}%
                  </p>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min((dateTotal / 7.5) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Logs List */}
          {myLogsForDate.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center">
              <History size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-slate-400 font-medium mb-1">Ingen registreringer i dag</p>
              <p className="text-sm text-slate-400">Tryk på knappen nedenfor for at registrere tid</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myLogsForDate.map(log => (
                <div
                  key={log.id}
                  onClick={() => setEditingLog(log)}
                  className={`
                    bg-white rounded-xl p-4 shadow-sm transition-all cursor-pointer active:scale-[0.98]
                    ${justSavedLogId === log.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
                    hover:bg-slate-50
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {renderProjectColorDot(log.project_color, 'w-4 h-4')}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{log.project_name}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString('da-DK', {hour:'2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-slate-900">{formatHoursToTime(log.hours)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLog(log.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-500 active:opacity-70 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Log Modal */}
        {(editingLog || isEditModalClosing) && (
          <div className="absolute inset-0 z-50 flex items-end justify-center">
            <div 
              className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${isEditModalClosing ? 'fade-out-200' : 'fade-in-200'}`}
              onClick={closeEditModal}
            ></div>
            
            <div className={`relative bg-[#F2F2F7] w-full rounded-t-[2rem] p-6 pb-10 shadow-2xl ${isEditModalClosing ? 'slide-down-200' : 'slide-up-200'}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Rediger registrering</h3>
                  <p className="text-slate-500 text-sm">{editingLog?.project_name}</p>
                </div>
                <button onClick={closeEditModal} className="bg-slate-200 p-1 rounded-full text-slate-500">
                  <X size={20} />
                </button>
              </div>

              <div className="bg-white rounded-xl p-4 mb-6 shadow-sm flex items-center justify-between">
                <span className="text-slate-500 font-medium">Timer</span>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setEditingLog({...editingLog, hours: Math.max(0.25, editingLog.hours - 0.25)})}
                    className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xl font-bold active:bg-slate-200"
                  >
                    -
                  </button>
                  <span className="text-xl font-bold text-center tabular-nums min-w-[4rem]">{formatHoursToTime(editingLog?.hours || 0)}</span>
                  <button 
                    onClick={() => setEditingLog({...editingLog, hours: editingLog.hours + 0.25})}
                    className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xl font-bold active:bg-slate-200"
                  >
                    +
                  </button>
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

        {/* Calendar Navigation */}
        <div className="absolute bottom-24 left-6 right-6 z-30">
          <div className="bg-white rounded-2xl p-4 shadow-lg flex items-center justify-between">
            <button
              onClick={goToPreviousDay}
              className="p-2 text-slate-400 hover:text-slate-600 active:opacity-70 transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <p className="text-sm font-semibold text-slate-900">{formatSelectedDate()}</p>
            <button
              onClick={goToNextDay}
              className="p-2 text-slate-400 hover:text-slate-600 active:opacity-70 transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        {/* FAB - Floating Action Button */}
        <button
          onClick={() => {
            setIsBottomSheetOpen(true);
            setBottomSheetStep('project');
          }}
          className="absolute bottom-6 left-6 right-6 bg-blue-600 text-white rounded-2xl py-4 px-8 shadow-lg shadow-blue-200 font-bold text-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2 z-30"
        >
          <Plus size={24} />
          Registrer Tid
        </button>

        {/* Bottom Sheet */}
        {(isBottomSheetOpen || isBottomSheetClosing) && (
          <div className="absolute inset-0 z-40 flex items-end">
            {/* Backdrop */}
            <div 
              className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${isBottomSheetClosing ? 'fade-out-200' : 'fade-in-200'}`}
              onClick={closeBottomSheet}
            ></div>
            
            {/* Sheet */}
            <div className={`relative bg-[#F2F2F7] w-full rounded-t-[2rem] shadow-2xl max-h-[90vh] flex flex-col ${isBottomSheetClosing ? 'slide-down-200' : 'slide-up-200'}`}>
              {bottomSheetStep === 'project' ? (
                // STEP 1: Select Project
                <>
                  <div className="p-6 pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold text-slate-900">Vælg Projekt</h2>
                      <button
                        onClick={closeBottomSheet}
                        className="p-2 text-slate-400 hover:text-slate-600 active:opacity-70 transition-colors"
                      >
                        <X size={24} />
                      </button>
                    </div>
                    
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 pb-6">
                    {/* Recently Used Projects */}
                    {recentlyUsedProjects.length > 0 && (
                      <div className="mb-6">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Senest Brugte</p>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                          {recentlyUsedProjects.map(project => (
                            <button
                              key={project.id}
                              onClick={() => {
                                setSelectedProjectForTimer(project);
                                setBottomSheetStep('time');
                              }}
                              className="flex-shrink-0 bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:scale-[0.98] transition-transform min-w-[140px]"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                {renderProjectColorDot(project.color, 'w-3 h-3')}
                                <span className="text-xs font-medium text-slate-500 truncate">Projekt</span>
                              </div>
                              <p className="font-semibold text-slate-900 text-sm truncate">{project.name}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All Projects */}
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Alle Projekter</p>
                      <div className="space-y-2">
                        {otherProjects.map(project => (
                          <button
                            key={project.id}
                            onClick={() => {
                              setSelectedProjectForTimer(project);
                              setBottomSheetStep('time');
                            }}
                            className="w-full bg-white rounded-xl p-4 shadow-sm border border-slate-200 active:scale-[0.98] transition-transform text-left"
                          >
                            <div className="flex items-center gap-3">
                              {renderProjectColorDot(project.color, 'w-4 h-4')}
                              <p className="font-semibold text-slate-900 flex-1">{project.name}</p>
                              <ChevronRight size={20} className="text-slate-400" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                // STEP 2: Select Time
                <>
                  <div className="p-6 pb-4">
                    <div className="flex items-center gap-3 mb-6">
                      <button
                        onClick={() => {
                          setBottomSheetStep('project');
                          setDuration(1.0);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600 active:opacity-70 transition-colors"
                      >
                        <ChevronRight className="rotate-180" size={24} />
                      </button>
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-slate-900">{selectedProjectForTimer?.name}</h2>
                      </div>
                      <button
                        onClick={closeBottomSheet}
                        className="p-2 text-slate-400 hover:text-slate-600 active:opacity-70 transition-colors"
                      >
                        <X size={24} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 pb-6">
                    {/* Time Display */}
                    <div className="bg-white rounded-2xl p-8 mb-6 text-center shadow-sm">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Timer</p>
                      <p className="text-6xl font-bold text-slate-900">
                        {formatHoursToTime(duration)}
                      </p>
                    </div>

                    {/* +/- Buttons */}
                    <div className="flex items-center justify-center gap-6 mb-6">
                      <button 
                        onClick={() => setDuration(Math.max(0.25, duration - 0.25))}
                        className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-50 transition-colors text-3xl font-light shadow-sm"
                      >
                        -
                      </button>
                      <button 
                        onClick={() => setDuration(duration + 0.25)}
                        className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-50 transition-colors text-3xl font-light shadow-sm"
                      >
                        +
                      </button>
                    </div>

                    {/* Preset Buttons */}
                    <div className="grid grid-cols-5 gap-2 mb-6">
                      {[0.5, 1, 2, 4, 7.5].map(val => (
                        <button 
                          key={val}
                          onClick={() => setDuration(val)}
                          className={`py-3 rounded-xl text-sm font-medium transition-all ${
                            duration === val 
                              ? 'bg-blue-500 text-white shadow-md transform scale-105' 
                              : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {formatHoursToTime(val)}
                        </button>
                      ))}
                    </div>

                    {/* Save Button */}
                    <button 
                      onClick={handleLogTime}
                      disabled={isSavingTime}
                      className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-200 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSavingTime ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Gemmer...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={20} />
                          Gem Registrering
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="font-sans text-slate-900 bg-slate-200 sm:bg-slate-200 h-screen w-full flex sm:items-center sm:justify-center">
      <div className="w-full h-full bg-[#F2F2F7] sm:max-w-md sm:max-h-[850px] sm:rounded-[2.5rem] sm:shadow-2xl sm:overflow-hidden relative flex flex-col sm:border-[8px] sm:border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-xl z-50 sm:block hidden"></div>
        
        <div className="flex-1 overflow-hidden relative">
          {view === 'loading' && (
            <div className="flex h-full items-center justify-center bg-white">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          {view === 'login' && renderLogin()}
          {view === 'home' && renderHome()}
        </div>
        
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1/3 h-1.5 bg-slate-900/20 rounded-full sm:block hidden"></div>
      </div>
    </div>
  );
}
