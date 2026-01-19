import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, History, Calendar, Clock, CheckCircle2, RefreshCw, Bell, BellOff } from 'lucide-react';
import { supabase } from './lib/supabase';
import { initializePushNotifications, getVapidPublicKey, isNotificationSupported, hasPushSubscription, resetPushSubscription } from './lib/notifications';

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
  const [deletingLogId, setDeletingLogId] = useState(null);
  const [shouldAnimateLogs, setShouldAnimateLogs] = useState(false);
  const previousDateRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newLogAnimationId, setNewLogAnimationId] = useState(null);
  const [pendingNewLogId, setPendingNewLogId] = useState(null); // Track new log before animation starts
  const [previousDateKey, setPreviousDateKey] = useState(null);
  
  // Notification States
  const [notificationPermissionAsked, setNotificationPermissionAsked] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  
  // Bottom Sheet States
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isBottomSheetClosing, setIsBottomSheetClosing] = useState(false);
  const [bottomSheetStep, setBottomSheetStep] = useState('project'); // 'project' or 'time'
  
  // Edit Modal States
  const [isEditModalClosing, setIsEditModalClosing] = useState(false);
  
  // Calendar Navigation State
  // Initialize with today's date in UTC for consistent comparison with UTC timestamps
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    ));
  });

  // Track date changes to trigger log animations
  useEffect(() => {
    const currentDateKey = selectedDate.getTime();
    // Only animate if date actually changed (not initial render)
    if (previousDateRef.current !== null && previousDateRef.current !== currentDateKey) {
      // Set animation immediately so logs start hidden
      setShouldAnimateLogs(true);
      // Use requestAnimationFrame to ensure browser registers the class change and starts animation
      const rafId = requestAnimationFrame(() => {
        // Force a reflow to ensure animation starts
        void document.body.offsetHeight;
        // Keep animation class long enough for staggered animations to complete
        // Assuming max 20 items with 30ms delay each = 600ms + 400ms animation = 1000ms
        const timer = setTimeout(() => {
          setShouldAnimateLogs(false);
        }, 1050); // Buffer for staggered animations
        return () => clearTimeout(timer);
      });
      previousDateRef.current = currentDateKey;
      return () => cancelAnimationFrame(rafId);
    } else {
      // First render or same date - no animation needed
      previousDateRef.current = currentDateKey;
      setShouldAnimateLogs(false);
    }
  }, [selectedDate]);

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

  // Update current time every minute for "time since last registration" display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // --- INITIALIZATION ---
  useEffect(() => {
    fetchUsers();
    
    // Check if notification permission has been asked before
    const hasAskedBefore = localStorage.getItem('he_notification_permission_asked');
    if (hasAskedBefore) {
      setNotificationPermissionAsked(true);
    }
    
    const savedUserId = localStorage.getItem('he_user_id');
    
    if (savedUserId) {
        fetchUserById(savedUserId).then(user => {
            if (user) {
                setCurrentUser(user);
                setView('home');
                fetchData();
                
                // Check if user already has a subscription
                hasPushSubscription(user.id).then(hasSub => {
                  setHasSubscription(hasSub);
                  if (hasSub) {
                    setNotificationPermissionAsked(true);
                  }
                });
                
                // Initialize push notifications if supported and permission hasn't been asked
                if (isNotificationSupported() && !notificationPermissionAsked) {
                  getVapidPublicKey()
                    .then(vapidPublicKey => {
                      return initializePushNotifications(user.id, vapidPublicKey);
                    })
                    .then(success => {
                      if (success) {
                        localStorage.setItem('he_notification_permission_asked', 'true');
                        setNotificationPermissionAsked(true);
                        setHasSubscription(true);
                      } else {
                        localStorage.setItem('he_notification_permission_asked', 'true');
                        setNotificationPermissionAsked(true);
                      }
                    })
                    .catch(error => {
                      console.error('Failed to initialize push notifications:', error);
                      // Don't set permissionAsked to true if there was an error
                      // This allows user to try again manually
                    });
                }
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
      
      // Initialize push notifications if supported and permission hasn't been asked
      if (isNotificationSupported() && !notificationPermissionAsked) {
        const hasAskedBefore = localStorage.getItem('he_notification_permission_asked');
        if (!hasAskedBefore) {
          try {
            const vapidPublicKey = await getVapidPublicKey();
            const success = await initializePushNotifications(user.id, vapidPublicKey);
            if (success) {
              localStorage.setItem('he_notification_permission_asked', 'true');
              setNotificationPermissionAsked(true);
            } else {
              // User denied permission
              localStorage.setItem('he_notification_permission_asked', 'true');
              setNotificationPermissionAsked(true);
            }
          } catch (error) {
            console.error('Failed to initialize push notifications:', error);
            // Don't show error to user, just log it
          }
        } else {
          setNotificationPermissionAsked(true);
        }
      }
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

  const handleEnableNotifications = async () => {
    if (!currentUser || !currentUser.id) {
      alert('Fejl: Ingen bruger valgt');
      return;
    }

    // If notifications are already enabled, offer to reset
    if (notificationPermissionAsked && hasSubscription) {
      if (confirm('Notifikationer er allerede aktiveret. Vil du nulstille og aktivere igen? Dette vil slette din nuværende subscription og spørge om tilladelse igen.')) {
        try {
          await resetPushSubscription(currentUser.id);
          setNotificationPermissionAsked(false);
          setHasSubscription(false);
          // Now proceed to enable again
        } catch (error) {
          console.error('Failed to reset subscription:', error);
          alert(`Fejl ved nulstilling: ${error.message}`);
          return;
        }
      } else {
        return;
      }
    }

    setIsEnablingNotifications(true);
    setNotificationError(null);

    try {
      if (!isNotificationSupported()) {
        throw new Error('Din browser understøtter ikke push-notifikationer. Prøv Chrome, Firefox eller Safari (iOS 16.4+).');
      }

      const vapidPublicKey = await getVapidPublicKey();
      const success = await initializePushNotifications(currentUser.id, vapidPublicKey);
      
      if (success) {
        localStorage.setItem('he_notification_permission_asked', 'true');
        setNotificationPermissionAsked(true);
        setHasSubscription(true);
        alert('Du modtager nu notifikationer fra Himmelstrup Events');
      } else {
        throw new Error('Kunne ikke aktivere notifikationer. Tjek om du har givet tilladelse.');
      }
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      setNotificationError(error.message || 'Ukendt fejl ved aktivering af notifikationer');
      alert(`Fejl: ${error.message || 'Kunne ikke aktivere notifikationer. Tjek browser console for detaljer.'}`);
    } finally {
      setIsEnablingNotifications(false);
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

    // Use selectedDate for the date part (year, month, day) in UTC, but keep current time
    // This ensures the date matches what admin panel shows (UTC-based)
    const now = new Date();
    const timestamp = new Date(Date.UTC(
      selectedDate.getUTCFullYear(),
      selectedDate.getUTCMonth(),
      selectedDate.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds()
    ));

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
    // Add log to state immediately but don't animate yet - mark it as pending
    setPendingNewLogId(tempId);
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
    
    // Start animations after bottom sheet has closed (200ms)
    setTimeout(() => {
      // Set the new log ID to trigger animation - this will make it grow in
      setNewLogAnimationId(tempId);
      setPendingNewLogId(null); // Clear pending state so animation can start
      
      // Clear animation after 300ms
      setTimeout(() => {
        setNewLogAnimationId(null);
      }, 300);
    }, 200); // Start after bottom sheet animation completes
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
    // Start exit animation
    setDeletingLogId(id);
    
    // Wait for animation to complete before removing from state
    setTimeout(() => {
      setLogs(logs.filter(l => l.id !== id));
      setDeletingLogId(null);
      
      // Delete from Supabase
      supabase
        .from('he_time_logs')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error("Fejl ved sletning:", error);
        });
    }, 300);
  };

  // --- HELPER FUNCTIONS ---
  
  // Compare dates based on year, month, day using UTC
  // Timestamps from database are in UTC, so we compare UTC date from timestamp
  // with UTC date from selectedDate to match admin panel behavior
  const isSameDate = (timestampString, selectedDateObj) => {
    const timestampDate = new Date(timestampString);
    const selectedDate = new Date(selectedDateObj);
    
    // Get UTC date components from timestamp (from database, stored in UTC)
    const timestampYear = timestampDate.getUTCFullYear();
    const timestampMonth = timestampDate.getUTCMonth();
    const timestampDay = timestampDate.getUTCDate();
    
    // Get UTC date components from selectedDate
    // Convert selectedDate to UTC for comparison
    const selectedYear = selectedDate.getUTCFullYear();
    const selectedMonth = selectedDate.getUTCMonth();
    const selectedDay = selectedDate.getUTCDate();
    
    // Compare both in UTC to match admin panel behavior
    return timestampYear === selectedYear && 
           timestampMonth === selectedMonth && 
           timestampDay === selectedDay;
  };
  
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

  // Render circular progress graph
  const renderCircularProgress = (percentage) => {
    const size = 80;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    // If percentage > 100, fill the circle completely (offset = 0)
    // Otherwise calculate normal offset
    const offset = percentage > 100 ? 0 : circumference - (percentage / 100) * circumference;
    // Show actual percentage in text, even if over 100%
    const displayPercentage = Math.round(percentage);

    return (
      <div className="relative inline-flex items-center justify-center">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgb(226 232 240)" // slate-200
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#d0335a" // accent color
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-300 ease-out"
          />
        </svg>
        {/* Percentage text in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span 
            className="text-lg font-bold"
            style={{ color: displayPercentage > 100 ? '#d0335a' : '#0f172a' }}
          >
            {displayPercentage}%
          </span>
        </div>
      </div>
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
  // Date is stored in UTC, so we format it using UTC methods
  const formatDateHeader = (date) => {
    const d = new Date(date);
    // Format using UTC date components to match what's stored in database
    return d.toLocaleDateString('da-DK', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long',
      timeZone: 'UTC'
    });
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
    // Use isSameDate to compare dates correctly regardless of timezone
    const myLogsForDate = logs
      .filter(l => {
        const isMe = l.user_id === currentUser?.id;
        const logMatchesDate = isSameDate(l.timestamp, selectedDate);
        return isMe && logMatchesDate && l.hours !== null;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first (descending)

    const dateTotal = myLogsForDate.reduce((sum, log) => sum + (log.hours || 0), 0);
    
    // Check if selected date is today
    const isToday = () => {
      const today = new Date();
      const todayUTC = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate()
      ));
      return selectedDate.getTime() === todayUTC.getTime();
    };
    
    // Calculate time since last registration
    const getTimeSinceLastRegistration = () => {
      if (myLogsForDate.length === 0) return null;
      
      const lastLog = myLogsForDate[0]; // Already sorted by timestamp descending
      const lastLogTime = new Date(lastLog.timestamp);
      const diffMs = currentTime - lastLogTime;
      
      // Only return if time difference is positive (in the past)
      if (diffMs <= 0) return null;
      
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      // Only return if time is greater than 0
      if (diffHours === 0 && diffMinutes === 0) return null;
      
      return `${diffHours}:${diffMinutes.toString().padStart(2, '0')}`;
    };
    
    // Check if current time is before 18:00
    const isBefore1800 = () => {
      return currentTime.getHours() < 18;
    };
    
    // Helper functions for date navigation
    // Create dates in UTC to ensure correct comparison with UTC timestamps from database
    const goToPreviousDay = () => {
      // Set animation state before changing date so logs start hidden
      setShouldAnimateLogs(true);
      const newDate = new Date(selectedDate);
      // Use UTC methods to avoid timezone issues
      newDate.setUTCDate(newDate.getUTCDate() - 1);
      setSelectedDate(newDate);
    };
    
    const goToNextDay = () => {
      // Set animation state before changing date so logs start hidden
      setShouldAnimateLogs(true);
      const newDate = new Date(selectedDate);
      // Use UTC methods to avoid timezone issues
      newDate.setUTCDate(newDate.getUTCDate() + 1);
      setSelectedDate(newDate);
    };
    
    const goToToday = () => {
      // Set animation state before changing date so logs start hidden
      setShouldAnimateLogs(true);
      const today = new Date();
      // Set to start of today in UTC for consistent comparison
      const utcToday = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate()
      ));
      setSelectedDate(utcToday);
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
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-slate-200"
                />
              ) : (
                <div 
                  className={`w-12 h-12 rounded-full ${currentUser?.colorClass || 'bg-gray-100 text-gray-700'} flex items-center justify-center text-base font-bold ring-2 ring-slate-200`}
                  style={currentUser?.color && !currentUser.color.includes('bg-') ? { backgroundColor: currentUser.color } : {}}
                >
                  {currentUser?.initials}
                </div>
              )}
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 text-center">
              <p className="text-sm font-semibold text-slate-900 uppercase tracking-wider">{formatDateHeader(selectedDate)}</p>
              {(() => {
                const timeSince = getTimeSinceLastRegistration();
                if (isToday() && myLogsForDate.length > 0 && isBefore1800() && timeSince) {
                  return (
                    <p className="text-xs text-slate-500 mt-1">
                      Tid siden sidste registrering: {timeSince}
                    </p>
                  );
                }
                return null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              {/* Notification enable button - Show if notifications are supported OR if user is on iOS */}
              {(isNotificationSupported() || /iPhone|iPad|iPod/.test(navigator.userAgent)) && (
                <button
                  onClick={handleEnableNotifications}
                  disabled={isEnablingNotifications}
                  className="p-2 active:opacity-70 transition-colors disabled:opacity-50"
                  style={{ color: notificationPermissionAsked && hasSubscription ? '#10b981' : '#d0335a' }}
                  title={notificationPermissionAsked && hasSubscription ? 'Notifikationer er aktiveret (klik for at nulstille)' : 'Aktiver push-notifikationer'}
                >
                  {notificationPermissionAsked && hasSubscription ? (
                    <Bell size={20} />
                  ) : (
                    <BellOff size={20} />
                  )}
                </button>
              )}
              <button
                onClick={fetchData}
                disabled={isLoadingData}
                className="p-2 active:opacity-70 transition-colors disabled:opacity-50"
                style={{ color: isLoadingData ? '#d0335a' : '#d0335a' }}
                title="Genindlæs data"
              >
                <RefreshCw size={20} className={isLoadingData ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content - Selected Date's Logs */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 py-6 pb-32">
          {/* Total Hours */}
          {dateTotal > 0 && (
            <div className="mb-6 bg-white rounded-2xl p-6 shadow-sm flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total for dagen</p>
                  <p className="text-6xl font-bold text-slate-900">{formatHoursToTime(dateTotal)}</p>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Arbejdsdag</p>
                  {renderCircularProgress(Math.round((dateTotal / 7.5) * 100))}
                </div>
              </div>
            </div>
          )}

            {/* Logs List */}
            {myLogsForDate.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center flex-shrink-0">
                <History size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-slate-400 font-medium mb-1">Ingen registreringer i dag</p>
                <p className="text-sm text-slate-400">Tryk på knappen nedenfor for at registrere tid</p>
              </div>
          ) : (
            // List view for all entries
            <div 
              className="overflow-y-auto flex-1 min-h-0" 
              key={`logs-${selectedDate.getTime()}`}
              style={{ 
                WebkitOverflowScrolling: 'touch', 
                touchAction: 'pan-y',
                marginBottom: '80px' // Reserve space for navigation (bottom-24 = 96px, navigation height ~64px)
              }}
            >
              <div className="space-y-0">
              {myLogsForDate.map((log, index) => {
                const shouldAnimate = shouldAnimateLogs && previousDateRef.current !== null;
                const isNewLog = newLogAnimationId === log.id;
                const isNewLogHidden = pendingNewLogId === log.id; // New log is hidden until animation starts
                return (
                  <div
                    key={log.id}
                    onClick={() => setEditingLog(log)}
                    className={`
                      flex items-center justify-between py-3 px-4 border-b border-slate-100 cursor-pointer
                      ${justSavedLogId === log.id ? 'bg-blue-50' : ''}
                      ${deletingLogId === log.id ? 'scale-out-fade-300' : ''}
                      ${shouldAnimate ? 'fade-in-slide-up-200' : ''}
                      ${isNewLogHidden ? 'opacity-0 max-h-0 overflow-hidden' : ''}
                      ${isNewLog ? 'scale-in-grow-300' : ''}
                      hover:bg-slate-50 active:bg-slate-100 transition-colors
                    `}
                    style={{ 
                      ...(shouldAnimate ? { animationDelay: `${index * 30}ms` } : {}),
                      touchAction: 'pan-y'
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {renderProjectColorDot(log.project_color, 'w-3 h-3')}
                      <p className="font-medium text-slate-900 truncate">{log.project_name}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-base font-bold text-slate-900">{formatHoursToTime(log.hours)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if(confirm("Er du sikker på du vil slette denne registrering?")) {
                            deleteLog(log.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 active:opacity-70 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
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
                  className="w-full py-3.5 text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-transform"
                  style={{ backgroundColor: '#d0335a' }}
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
            <button
              onClick={goToToday}
              className="text-sm font-semibold text-slate-900 active:opacity-70 transition-opacity"
            >
              I dag
            </button>
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
          className="absolute bottom-6 left-6 right-6 text-white rounded-2xl py-4 px-8 shadow-lg font-bold text-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2 z-30"
          style={{ backgroundColor: '#d0335a', boxShadow: '0 10px 15px -3px rgba(208, 51, 90, 0.3), 0 4px 6px -2px rgba(208, 51, 90, 0.2)' }}
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
                              ? 'text-white shadow-md transform scale-105' 
                              : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                          style={duration === val ? { backgroundColor: '#d0335a' } : {}}
                        >
                          {formatHoursToTime(val)}
                        </button>
                      ))}
                    </div>

                    {/* Save Button */}
                    <button 
                      onClick={handleLogTime}
                      disabled={isSavingTime}
                      className="w-full py-4 text-white rounded-xl font-bold text-lg shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#d0335a', boxShadow: '0 10px 15px -3px rgba(208, 51, 90, 0.3), 0 4px 6px -2px rgba(208, 51, 90, 0.2)' }}
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
