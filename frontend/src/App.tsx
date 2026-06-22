import React, { useState, useEffect, useRef } from 'react';
import { 
  Map, Calendar, Settings, MessageCircle, Wand2, 
  ChevronRight, Smartphone, Palette, MapPin, 
  Utensils, Bed, Ticket, Play, Pause, Volume2, X
} from 'lucide-react';

// --- Components for the "Generated App" Preview ---

const GeneratedAppPreview = ({ tripData, theme }) => {
  const [activeDay, setActiveDay] = useState(0);
  const [activeTab, setActiveTab] = useState('itinerary');
  const [playingPodcast, setPlayingPodcast] = useState(null);
  const [progress, setProgress] = useState(0);

  const themeColors = {
    blue: 'bg-blue-600',
    green: 'bg-emerald-600',
    dark: 'bg-slate-800'
  };
  const currentTheme = themeColors[theme] || themeColors.blue;

  // Simulate podcast playback progress
  useEffect(() => {
    let interval;
    if (playingPodcast) {
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            setPlayingPodcast(null);
            return 0;
          }
          return prev + 1;
        });
      }, 300); // Speed up for demo purposes
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [playingPodcast]);

  const handlePlayPodcast = (act) => {
    if (playingPodcast?.title === act.title) {
      setPlayingPodcast(null); // Toggle off
    } else {
      setPlayingPodcast(act);
      setProgress(0);
    }
  };

  return (
    <div className="w-[350px] h-[700px] border-[12px] border-gray-900 rounded-[2.5rem] overflow-hidden flex flex-col bg-gray-50 shadow-2xl relative mx-auto">
      {/* App Header */}
      <div className={`${currentTheme} text-white pt-10 pb-4 px-6 shadow-md transition-colors duration-300`}>
        <h2 className="text-xl font-bold">{tripData.title}</h2>
        <p className="text-sm opacity-80">{tripData.dates}</p>
      </div>

      {/* Days Tabs */}
      <div className="flex overflow-x-auto bg-white border-b hide-scrollbar">
        {tripData.days.map((day, idx) => (
          <button
            key={idx}
            onClick={() => setActiveDay(idx)}
            className={`px-6 py-3 font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeDay === idx ? `border-blue-600 text-blue-600` : 'border-transparent text-gray-500'
            }`}
          >
            יום {day.dayNum}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 pb-24">
        {/* Itinerary View */}
        {activeTab === 'itinerary' && (
          <div className="space-y-4">
            {tripData.days[activeDay].activities.map((act, idx) => (
              <div key={act.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 animate-fade-in">
                <div className="flex flex-col items-center">
                  <div className={`p-2 rounded-full ${currentTheme} text-white bg-opacity-10 text-opacity-90`}>
                    {act.type === 'food' ? <Utensils size={18} /> : 
                     act.type === 'lodging' ? <Bed size={18} /> : 
                     <Ticket size={18} />}
                  </div>
                  {idx !== tripData.days[activeDay].activities.length - 1 && (
                    <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="text-xs text-gray-500 font-medium mb-1">{act.time}</div>
                  <h4 className="font-bold text-gray-800">{act.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{act.desc}</p>
                  
                  {/* Podcast Player Trigger */}
                  {act.hasPodcast && (
                    <div 
                      onClick={() => handlePlayPodcast(act)}
                      className={`mt-3 flex items-center gap-2 p-2 rounded-lg text-sm cursor-pointer transition-colors ${
                        playingPodcast?.id === act.id ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {playingPodcast?.id === act.id ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                      <span className="font-medium">
                        {playingPodcast?.id === act.id ? 'מתנגן כעת...' : "האזן לפודקאסט היסטורי"}
                      </span>
                      {playingPodcast?.id === act.id && <Volume2 size={16} className="ml-auto animate-pulse" />}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Map View */}
        {activeTab === 'map' && (
          <div className="h-full w-full bg-[#e5e3df] rounded-xl relative overflow-hidden animate-fade-in shadow-inner border border-gray-200">
            {/* Fake Map Background Pattern */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            
            {/* Map Pins */}
            {tripData.days[activeDay].activities.map((act) => {
              if (!act.map_coordinates) return null;
              // Mock logic to convert lat/lng to percentage positioning for demo
              const top = `${Math.abs((act.map_coordinates.lat - 41.9) * 1000)}%`;
              const left = `${Math.abs((act.map_coordinates.lng - 12.4) * 1000)}%`;
              
              return (
                <div 
                  key={`map-${act.id}`} 
                  className="absolute transform -translate-x-1/2 -translate-y-full flex flex-col items-center group"
                  style={{ top, left }}
                >
                  <div className="bg-white px-2 py-1 rounded-md shadow-md text-xs font-bold mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {act.title}
                  </div>
                  <div className={`p-1.5 rounded-full text-white shadow-lg ${
                    act.type === 'food' ? 'bg-red-500' : 
                    act.type === 'lodging' ? 'bg-indigo-500' : 'bg-blue-500'
                  }`}>
                    {act.type === 'food' ? <Utensils size={14} /> : 
                     act.type === 'lodging' ? <Bed size={14} /> : 
                     <MapPin size={14} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Podcast Player (Global) */}
      {playingPodcast && (
        <div className="absolute bottom-16 left-2 right-2 bg-gray-900 text-white rounded-xl p-3 shadow-xl flex flex-col gap-2 animate-slide-up z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
                <Volume2 size={14} className="text-blue-400" />
              </div>
              <div className="truncate">
                <p className="text-xs text-gray-400">פודקאסט AI</p>
                <p className="text-sm font-bold truncate">{playingPodcast.title}</p>
              </div>
            </div>
            <button onClick={() => setPlayingPodcast(null)} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full transition-all duration-300 ease-linear" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="bg-white border-t flex justify-around p-3 pb-6 z-20 relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab('itinerary')} className={`flex flex-col items-center gap-1 ${activeTab === 'itinerary' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Calendar size={20} />
          <span className="text-[10px]">לו"ז</span>
        </button>
        <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 ${activeTab === 'map' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Map size={20} />
          <span className="text-[10px]">מפה</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <MessageCircle size={20} />
          <span className="text-[10px]">צ'אט AI</span>
        </button>
      </div>
    </div>
  );
};

// --- Main App Builder Component ---

export default function App() {
  const [step, setStep] = useState(1);
  const [rawText, setRawText] = useState("היי, אנחנו טסים לרומא מחרתיים עד יום ראשון. ביום הראשון ננחת, ניסע למלון ליד המדרגות הספרדיות ואז נטייל באזור. ביום השני הקולוסיאום והפורום, ומלא קניות. ביום השלישי הוותיקן. צריכים גם למצוא איפה לאכול, אנחנו שומרים כשרות.");
  const [theme, setTheme] = useState('blue');
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);

  // Mock parsed data incorporating map coordinates
  const [tripData, setTripData] = useState({
    title: "הטיול לרומא 🇮🇹",
    dates: "חמישי - ראשון",
    days: [
      {
        dayNum: 1,
        activities: [
          { id: "a1", time: "10:00", title: "נחיתה והגעה למלון", desc: "התארגנות במלון באזור המדרגות הספרדיות.", type: "lodging", hasPodcast: false, map_coordinates: {lat: 41.9059, lng: 12.4827} },
          { id: "a2", time: "13:00", title: "סיור במדרגות הספרדיות", desc: "זמן חופשי והיכרות עם האזור.", type: "attraction", hasPodcast: true, map_coordinates: {lat: 41.9065, lng: 12.4820} },
          { id: "a3", time: "18:00", title: "ארוחת ערב", desc: "טרם נקבעה מסעדה.", type: "food", hasPodcast: false }
        ]
      },
      {
        dayNum: 2,
        activities: [
          { id: "b1", time: "09:00", title: "הקולוסיאום", desc: "סיור במבנה ההיסטורי. מומלץ להזמין כרטיסים מראש.", type: "attraction", hasPodcast: true, map_coordinates: {lat: 41.8902, lng: 12.4922} },
          { id: "b2", time: "15:00", title: "זמן קניות", desc: "ויה דל קורסו והרחובות הסמוכים.", type: "attraction", hasPodcast: false, map_coordinates: {lat: 41.9020, lng: 12.4800} }
        ]
      }
    ]
  });

  const [agentMessages, setAgentMessages] = useState([
    { role: 'agent', text: "זיהיתי את הטיול לרומא! שמתי לב שציינת שאתם שומרים כשרות, אבל אין לכם מסעדות מתוכננות ליום 1 ו-2 באזור הקולוסיאום והמדרגות הספרדיות. תרצו שאוסיף המלצות למסעדות כשרות מהגטו היהודי?" }
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

  const handleProcessText = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep(3); 
    }, 1500);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setAgentMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput("");

    setTimeout(() => {
      if (userText.includes("כן") || userText.includes("תוסיף") || userText.includes("כשר")) {
        const newTripData = { ...tripData };
        // Insert Kosher lunch to day 2 with coordinates for the map
        newTripData.days[1].activities.splice(1, 0, {
          id: "kosher1", time: "13:30", title: "ארוחת צהריים כשרה בגטו", desc: "מסעדת BaGhetto (בשרי). הוסף על ידי ה-AI לבקשתך.", type: "food", hasPodcast: false, map_coordinates: {lat: 41.8925, lng: 12.4772}
        });
        setTripData(newTripData);
        setAgentMessages(prev => [...prev, { role: 'agent', text: "מצוין! הוספתי מסעדה כשרה לצהריים של היום השני (בדוק בלו\"ז ובמפה). נעבור לשלב העיצוב?" }]);
      } else {
         setAgentMessages(prev => [...prev, { role: 'agent', text: "הבנתי. אם הכל מוכן, בואו נתקדם לשלב העיצוב!" }]);
      }
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-right" dir="rtl">
      {/* Top Navbar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Wand2 className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">TripWeaver AI</h1>
        </div>
        <div className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
          שלב {step} מתוך 4
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-8">
        
        {/* Left Side: Builder Interface */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col">
          
          {/* Progress Bar */}
          <div className="flex items-center justify-between mb-10 relative">
            <div className="absolute left-0 right-0 top-1/2 h-1 bg-gray-100 -z-10"></div>
            {[
              { num: 1, label: 'הזנת טקסט' },
              { num: 2, label: 'פירוק מבני' },
              { num: 3, label: 'סוכן השלמות' },
              { num: 4, label: 'עיצוב אפליקציה' }
            ].map((s) => (
              <div key={s.num} className="flex flex-col items-center gap-2 bg-white px-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-500 ${
                  step >= s.num ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-400'
                }`}>
                  {s.num}
                </div>
                <span className={`text-xs ${step >= s.num ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Dynamic Content based on Step */}
          <div className="flex-1">
            {step === 1 && (
              <div className="animate-fade-in">
                <h2 className="text-2xl font-bold mb-4">בוא נתחיל לבנות. ספרו לי על הטיול</h2>
                <p className="text-gray-600 mb-6">הדביקו הודעות ווצאפ, סיכומים או סתם שרבטו את הרעיונות שלכם.</p>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="w-full h-48 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-6 shadow-sm"
                  placeholder="למשל: ביום ראשון טסים ללונדון..."
                />
                <button 
                  onClick={handleProcessText}
                  disabled={isProcessing}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 w-full justify-center transition-colors shadow-md"
                >
                  {isProcessing ? 'ה-AI מנתח את הטקסט...' : 'צור מבנה אפליקציה ראשוני'}
                  {!isProcessing && <ChevronRight size={20} />}
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="animate-fade-in flex flex-col h-full">
                <h2 className="text-2xl font-bold mb-2">סוכן השלמות AI</h2>
                <p className="text-gray-600 mb-6">הבינה המלאכותית שלנו עוברת על הלו"ז ומוודאת שלא שכחתם כלום.</p>
                
                <div className="bg-gray-50 rounded-xl p-4 flex-1 min-h-[250px] overflow-y-auto mb-4 border border-gray-200 flex flex-col gap-4 shadow-inner">
                  {agentMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                      <div className={`max-w-[80%] p-3 text-sm ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm shadow-md' 
                          : 'bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2 mb-4">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="ענה לסוכן (למשל: 'כן, תוסיף')" 
                    className="flex-1 border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                  <button type="submit" className="bg-gray-800 hover:bg-gray-900 text-white px-6 rounded-xl font-medium transition-colors shadow-sm">
                    שלח
                  </button>
                </form>

                <button 
                  onClick={() => setStep(4)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 w-full justify-center transition-colors shadow-md mt-auto"
                >
                  המשך לעיצוב האפליקציה
                  <ChevronRight size={20} />
                </button>
              </div>
            )}

            {step === 4 && (
              <div className="animate-fade-in">
                <h2 className="text-2xl font-bold mb-2">שלב אחרון: עיצוב האפליקציה שלך</h2>
                <p className="text-gray-600 mb-6">בחרו צבעים, פונטים ותצורה לפני שיתוף האפליקציה למשתתפי הטיול.</p>
                
                <div className="space-y-6">
                  <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Palette size={18} className="text-blue-500"/> בחירת צבע נושא
                    </h3>
                    <div className="flex gap-4">
                      <button onClick={() => setTheme('blue')} className={`w-12 h-12 rounded-full bg-blue-600 transition-all ${theme === 'blue' ? 'ring-4 ring-blue-200 scale-110' : 'hover:scale-105'}`}></button>
                      <button onClick={() => setTheme('green')} className={`w-12 h-12 rounded-full bg-emerald-600 transition-all ${theme === 'green' ? 'ring-4 ring-emerald-200 scale-110' : 'hover:scale-105'}`}></button>
                      <button onClick={() => setTheme('dark')} className={`w-12 h-12 rounded-full bg-slate-800 transition-all ${theme === 'dark' ? 'ring-4 ring-slate-200 scale-110' : 'hover:scale-105'}`}></button>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                    <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <Settings size={18} className="text-blue-500"/> תכונות פעילות באפליקציה
                    </h3>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-2 cursor-pointer group">
                        <input type="checkbox" defaultChecked className="w-5 h-5 accent-blue-600 rounded" />
                        <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">יצירת פודקאסט היסטורי (TTS)</span>
                      </label>
                      <label className="flex items-center gap-3 p-2 cursor-pointer group">
                        <input type="checkbox" defaultChecked className="w-5 h-5 accent-blue-600 rounded" />
                        <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">מפת התמצאות עם נעצים</span>
                      </label>
                    </div>
                  </div>
                </div>

                <button className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 w-full justify-center mt-10 transition-all hover:shadow-lg hover:-translate-y-1">
                  <Smartphone size={24} />
                  שגר למכשיר! האפליקציה מוכנה
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: App Live Preview */}
        <div className="flex-1 flex justify-center items-center bg-gray-200/50 rounded-2xl border border-gray-200 py-10 relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-bold text-gray-600 uppercase tracking-wider shadow-sm z-10 flex items-center gap-2 border border-gray-100">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Preview
          </div>
          <GeneratedAppPreview tripData={tripData} theme={theme} />
        </div>

      </div>
    </div>
  );
}