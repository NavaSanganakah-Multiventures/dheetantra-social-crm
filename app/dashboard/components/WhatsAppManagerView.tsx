import { useState, useEffect, useRef } from 'react';
import { Upload, Bot, Settings, Send, User, Blocks, Phone, X, Check, FileText, Plus, Trash2, Edit, Facebook } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TemplatesView } from './TemplatesView';

export function WhatsAppManagerView() {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'profiles' | 'templates' | 'flows'>('profiles');
  
  // Profiles states
  const [configs, setConfigs] = useState<any[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [message, setMessage] = useState("");
  
  // Profile Form fields
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [replyMode, setReplyMode] = useState("manual");
  const [sipUri, setSipUri] = useState("");
  const [sipWsServer, setSipWsServer] = useState("");
  const [sipUsername, setSipUsername] = useState("");
  const [sipPassword, setSipPassword] = useState("");
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiVoiceInstructions, setAiVoiceInstructions] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [showMicTestModal, setShowMicTestModal] = useState(false);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micTestStatus, setMicTestStatus] = useState("निष्क्रिय");

  // Refs for Mic Test audio streaming
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micWsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const startMicTest = async () => {
    try {
      setIsMicTesting(true);
      setMicTestStatus("Gemini से कनेक्ट हो रहा है...");

      const wId = localStorage.getItem('workspaceId');
      if (!wId) {
        setMicTestStatus("त्रुटि: Workspace ID नहीं मिली");
        setIsMicTesting(false);
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const proxyWsUrl = `${protocol}//${window.location.host}/api/ai/gemini-stream/${wId}`;

      const ws = new WebSocket(proxyWsUrl);
      micWsRef.current = ws;

      ws.onopen = async () => {
        setMicTestStatus("कनेक्ट हुआ, माइक सेट हो रहा है...");

        // 1. Send Setup message with instructions
        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.0-flash-exp",
            systemInstruction: { parts: [{ text: aiVoiceInstructions || "आप एक सहायक AI सहायक हैं। कृपया हिंदी में विनम्रता से बात करें।" }] },
            generationConfig: { responseModalities: ["AUDIO"] }
          }
        }));

        try {
            // 2. Setup Audio Context & Mic
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            micAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });

            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
            } });
            micStreamRef.current = stream;

            const source = micAudioContextRef.current.createMediaStreamSource(stream);
            micSourceRef.current = source;

            const processor = micAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            micProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (ws.readyState !== WebSocket.OPEN) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                  let s = Math.max(-1, Math.min(1, inputData[i]));
                  pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }

              const buffer = new Uint8Array(pcm16.buffer);
              let binary = '';
              for (let i = 0; i < buffer.byteLength; i++) {
                  binary += String.fromCharCode(buffer[i]);
              }
              const base64Data = window.btoa(binary);

              ws.send(JSON.stringify({
                  realtimeInput: {
                      mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: base64Data }]
                  }
              }));
            };

            source.connect(processor);
            processor.connect(micAudioContextRef.current.destination);

            setMicTestStatus("सुन रहा है (Gemini से बात करें)");

        } catch (err) {
            console.error("Mic error:", err);
            setMicTestStatus("माइक एक्सेस करने में त्रुटि।");
            stopMicTest();
        }
      };

      let nextPlayTime = 0;

      ws.onmessage = async (event) => {
        try {
             let textData = event.data;
             if (event.data instanceof Blob) textData = await event.data.text();
             const geminiData = JSON.parse(textData);

             if (geminiData.serverContent && geminiData.serverContent.modelTurn) {
                 const parts = geminiData.serverContent.modelTurn.parts;
                 for (const part of parts) {
                     if (part.inlineData && part.inlineData.data) {
                         const base64Audio = part.inlineData.data;
                         const binaryString = window.atob(base64Audio);
                         const bytes = new Uint8Array(binaryString.length);
                         for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

                         if (micAudioContextRef.current) {
                             const int16Array = new Int16Array(bytes.buffer);
                             const float32Array = new Float32Array(int16Array.length);
                             for (let i = 0; i < int16Array.length; i++) {
                                 float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
                             }

                             const audioBuffer = micAudioContextRef.current.createBuffer(1, float32Array.length, 16000);
                             audioBuffer.copyToChannel(float32Array, 0);

                             const source = micAudioContextRef.current.createBufferSource();
                             source.buffer = audioBuffer;
                             source.connect(micAudioContextRef.current.destination);

                             const currentTime = micAudioContextRef.current.currentTime;
                             if (nextPlayTime < currentTime) {
                                 nextPlayTime = currentTime;
                             }
                             source.start(nextPlayTime);
                             nextPlayTime += audioBuffer.duration;
                         }
                     }
                 }
             }
        } catch (err) {
            console.error("Error processing Gemini audio:", err);
        }
      };

      ws.onerror = () => {
          setMicTestStatus("WebSocket त्रुटि।");
          stopMicTest();
      };

      ws.onclose = () => {
          setMicTestStatus("कनेक्शन बंद हो गया।");
          stopMicTest();
      };

    } catch (err) {
      console.error(err);
      setMicTestStatus("शुरू करने में विफल।");
      setIsMicTesting(false);
    }
  };

  const stopMicTest = () => {
      setIsMicTesting(false);
      setMicTestStatus("निष्क्रिय");

      if (micProcessorRef.current) {
          micProcessorRef.current.disconnect();
          micProcessorRef.current = null;
      }
      if (micSourceRef.current) {
          micSourceRef.current.disconnect();
          micSourceRef.current = null;
      }
      if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(track => track.stop());
          micStreamRef.current = null;
      }
      if (micAudioContextRef.current) {
          micAudioContextRef.current.close().catch(()=>{});
          micAudioContextRef.current = null;
      }
      if (micWsRef.current) {
          micWsRef.current.close();
          micWsRef.current = null;
      }
  };

  // Cleanup on unmount
  useEffect(() => {
      return () => {
          stopMicTest();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [metaConfigId, setMetaConfigId] = useState("");

  // Business Profile states
  const [profileAbout, setProfileAbout] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");

  // Call Schedule states
  const [callScheduleEnabled, setCallScheduleEnabled] = useState(false);
  const [callScheduleStart, setCallScheduleStart] = useState("09:00");
  const [callScheduleEnd, setCallScheduleEnd] = useState("17:00");
  const [callScheduleDays, setCallScheduleDays] = useState<number[]>([1,2,3,4,5]);
  const [callingEnabledSettings, setCallingEnabledSettings] = useState(true);

  // Flows states
  const [flows, setFlows] = useState<any[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState<any>(null);
  
  // Flow Builder states
  const [flowName, setFlowName] = useState("");
  const [flowCategory, setFlowCategory] = useState("UTILITY");
  const [flowScreens, setFlowScreens] = useState<any[]>([
    {
      id: "screen_1",
      title: "मुख्य स्क्रीन",
      components: [
        { id: "c1", type: "text", label: "विवरण", content: "कृप्या अपनी जानकारी दर्ज करें।" },
        { id: "c2", type: "input", label: "आपका नाम", name: "fullName", placeholder: "उदा. राहुल कुमार", required: true },
        { id: "c3", type: "input", label: "ईमेल पता", name: "email", placeholder: "उदा. rahul@example.com", required: true },
        { id: "c4", type: "submit", label: "प्रस्तुत करें" }
      ]
    }
  ]);
  const [activeScreenId, setActiveScreenId] = useState("screen_1");
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);

  // Load configs
  const loadConfigs = async (showLoading = false) => {
    if (showLoading) setLoadingConfigs(true);
    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/whatsapp/config', {
        headers: { 'x-workspace-id': wId || '' }
      });
      const data: any = await res.json();
      if (data.configs) {
        setConfigs(data.configs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConfigs(false);
    }
  };

  // Load flows
  const loadFlows = async (showLoading = false) => {
    if (showLoading) setLoadingFlows(true);
    const wId = localStorage.getItem('workspaceId');
    try {
      const res = await fetch('/api/whatsapp/flows', {
        headers: { 'x-workspace-id': wId || '' }
      });
      const data: any = await res.json();
      if (data.flows) {
        setFlows(data.flows);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingFlows(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
      loadConfigs();
      loadFlows();
      
      // Meta Config loading
      fetch('/api/config/meta')
        .then(r => r.json())
        .then((data: any) => {
          if (data.configId) setMetaConfigId(data.configId);
        }).catch(err => console.error(err));
    }, 0);
  }, []);

  // Facebook Signup Listener
  useEffect(() => {
    const sessionInfoListener = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
        return;
      }
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH') {
            const { phone_number_id, waba_id } = data.data;
            setMessage("Embedded Signup पूरा हुआ, सर्वर पर रजिस्टर किया जा रहा है...");
            
            fetch('/api/meta/embedded-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceId: localStorage.getItem('workspaceId'),
                    accessToken: 'handled_by_system_user_in_backend',
                    wabaId: waba_id,
                    phoneNumberIds: Array.isArray(phone_number_id) ? phone_number_id : [phone_number_id]
                })
            }).then(r => r.json()).then((res: any) => {
                if (res.success) {
                    setMessage(`सफल! WhatsApp खाता जोड़ा गया: ${res.waba}`);
                    loadConfigs();
                } else {
                    setMessage(`त्रुटि: ${res.error}`);
                }
            }).catch(() => {
                setMessage("सर्वर से संपर्क करने में त्रुटि।");
            });
          }
        }
      } catch (e) {}
    };
    window.addEventListener('message', sessionInfoListener);
    return () => window.removeEventListener('message', sessionInfoListener);
  }, []);

  // Fetch Profile from Meta
  const handleFetchMetaProfile = async () => {
    if (!phoneNumberId) {
      setMessage("मेटा से फ़ेच करने के लिए कृपया पहले Phone Number ID भरें।");
      return;
    }
    setIsFetchingProfile(true);
    setMessage("Meta से नवीनतम प्रोफ़ाइल फ़ेच की जा रही है...");
    try {
      const res = await fetch(`/api/whatsapp/config/profile?phoneNumberId=${phoneNumberId}`, {
        headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
      });
      const data: any = await res.json();
      if (data.profile) {
        setProfileAbout(data.profile.about || "");
        setProfileDescription(data.profile.description || "");
        setProfileWebsite(data.profile.website || "");
        setProfileEmail(data.profile.email || "");
        setProfileAddress(data.profile.address || "");
        if (data.profile.profile_picture_url) setProfilePictureUrl(data.profile.profile_picture_url);
        setMessage("मेटा से प्रोफ़ाइल सफलतापूर्वक फ़ेच की गई! सुरक्षित करने के लिए 'सुरक्षित करें' दबाएँ।");
      } else {
        setMessage("त्रुटि: प्रोफ़ाइल फ़ेच करने में विफल (" + (data.error || "अज्ञात त्रुटि") + ")");
      }
    } catch (e) {
      setMessage("सर्वर से संपर्क करने में त्रुटि।");
    } finally {
      setIsFetchingProfile(false);
    }
  };

  // Profile Save
  const handleSaveProfile = async () => {
    setSavingConfig(true);
    setMessage("");
    try {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) {
        setMessage("Workspace ID नहीं मिली। कृप्या पेज रीफ़्रेश करें या दोबारा लॉगिन करें।");
        return;
      }
      const payload: any = {
        id: editingConfig?.id || null,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        verify_token: verifyToken,
        reply_mode: replyMode,
        sip_uri: sipUri,
        sip_ws_server: sipWsServer,
        sip_username: sipUsername,
        sip_password: sipPassword,
        ai_provider: aiProvider,
        ai_voice_instructions: aiVoiceInstructions,
        // Business Profile fields
        about: profileAbout,
        description: profileDescription,
        website: profileWebsite,
        email: profileEmail,
        address: profileAddress,
        username: profileUsername,
        // Call settings
        calling_enabled: callingEnabledSettings ? 1 : 0,
        call_schedule: JSON.stringify({
          enabled: callScheduleEnabled,
          start_time: callScheduleStart,
          end_time: callScheduleEnd,
          days: callScheduleDays
        })
      };
      if (accessToken && accessToken !== "••••••••••••••••") {
        payload.access_token = accessToken;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId
        },
        body: JSON.stringify(payload)
      });
      const data: any = await res.json();
      if (data.success) {
        setMessage("सफलतापूर्वक सहेज लिया गया!");
        setShowProfileModal(false);
        loadConfigs();
      } else {
        setMessage("त्रुटि: " + (data.error || "सहेजने में असमर्थ"));
      }
    } catch (e) {
      setMessage("सर्वर त्रुटि");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleEditProfile = (cfg: any) => {
    setEditingConfig(cfg);
    setPhoneNumberId(cfg.phone_number_id || "");
    setWabaId(cfg.waba_id || "");
    setAccessToken("••••••••••••••••");
    setVerifyToken(cfg.verify_token || "");
    setReplyMode(cfg.reply_mode || "manual");
    setSipUri(cfg.sip_uri || "");
    setSipWsServer(cfg.sip_ws_server || "");
    setSipUsername(cfg.sip_username || "");
    setSipPassword(cfg.sip_password || "");
    setAiProvider(cfg.ai_provider || "gemini");
    setAiVoiceInstructions(cfg.ai_voice_instructions || "");
    setShowProfileModal(true);

    // Business Profile fields
    setProfileAbout(cfg.about || "");
    setProfileDescription(cfg.description || "");
    setProfileWebsite(cfg.website || "");
    setProfileEmail(cfg.email || "");
    setProfileAddress(cfg.address || "");
    setProfileUsername(cfg.username || "");
    setProfilePictureUrl(cfg.profile_picture_url || "");

    // Call schedule
    setCallingEnabledSettings(cfg.calling_enabled !== 0);
    if (cfg.call_schedule) {
      try {
        const s = JSON.parse(cfg.call_schedule);
        setCallScheduleEnabled(s.enabled || false);
        setCallScheduleStart(s.start_time || "09:00");
        setCallScheduleEnd(s.end_time || "17:00");
        setCallScheduleDays(s.days || [1,2,3,4,5]);
      } catch (e) {}
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm("क्या आप वाकई इस प्रोफाइल को हटाना चाहते हैं?")) return;
    try {
      const res = await fetch(`/api/whatsapp/config/${id}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        loadConfigs();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  const handleCreateFlow = () => {
    setEditingFlow(null);
    setFlowName("");
    setFlowCategory("UTILITY");
    setFlowScreens([
      {
        id: "screen_1",
        title: "मुख्य स्क्रीन",
        components: [
          { id: "c1", type: "text", label: "विवरण", content: "कृप्या अपनी जानकारी दर्ज करें।" },
          { id: "c2", type: "input", label: "आपका नाम", name: "fullName", placeholder: "उदा. राहुल कुमार", required: true },
          { id: "c3", type: "input", label: "ईमेल पता", name: "email", placeholder: "उदा. rahul@example.com", required: true },
          { id: "c4", type: "submit", label: "प्रस्तुत करें" }
        ]
      }
    ]);
    setActiveScreenId("screen_1");
    setSelectedCompId(null);
    setShowFlowModal(true);
  };

  const handleEditFlow = (flow: any) => {
    setEditingFlow(flow);
    setFlowName(flow.name);
    setFlowCategory(flow.categories || "UTILITY");
    try {
      const parsed = JSON.parse(flow.screens_json);
      setFlowScreens(parsed);
      if (parsed.length > 0) {
        setActiveScreenId(parsed[0].id);
      }
    } catch (e) {
      console.error(e);
    }
    setSelectedCompId(null);
    setShowFlowModal(true);
  };

  const handleSaveFlow = async () => {
    if (!flowName.trim()) {
      alert("फ़्लो का नाम आवश्यक है");
      return;
    }
    try {
      const payload = {
        id: editingFlow?.id || null,
        name: flowName,
        categories: flowCategory,
        screens_json: JSON.stringify(flowScreens),
        status: editingFlow?.status || 'DRAFT'
      };
      const res = await fetch('/api/whatsapp/flows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify(payload)
      });
      const data: any = await res.json();
      if (data.success) {
        setShowFlowModal(false);
        loadFlows();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("सहेजने में विफलता");
    }
  };

  const handleDeleteFlow = async (id: string) => {
    if (!confirm("क्या आप वाकई इस फ़्लो को हटाना चाहते हैं?")) return;
    try {
      const res = await fetch(`/api/whatsapp/flows/${id}`, {
        method: 'DELETE',
        headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        loadFlows();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  const handlePublishFlow = async (id: string) => {
    if (!confirm("क्या आप इस फ़्लो को लाइव/प्रकाशित करना चाहते हैं?")) return;
    try {
      const res = await fetch(`/api/whatsapp/flows/${id}/publish`, {
        method: 'POST',
        headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
      });
      const data: any = await res.json();
      if (data.success) {
        loadFlows();
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  // Add Component to current active screen
  const addFlowComponent = (type: string) => {
    const activeScreen = flowScreens.find(s => s.id === activeScreenId);
    if (!activeScreen) return;

    const newComp: any = {
      id: crypto.randomUUID().substring(0, 8),
      type
    };

    if (type === 'text') {
      newComp.label = "विवरण";
      newComp.content = "यहाँ विवरण दर्ज करें...";
    } else if (type === 'input' || type === 'textarea') {
      newComp.label = "नई इनपुट फील्ड";
      newComp.placeholder = "दर्ज करें...";
      newComp.name = "field_" + newComp.id;
      newComp.required = false;
    } else if (type === 'select') {
      newComp.label = "ड्रॉपडाउन फील्ड";
      newComp.name = "select_" + newComp.id;
      newComp.options = "विकल्प 1, विकल्प 2, विकल्प 3";
    } else if (type === 'submit') {
      newComp.label = "प्रस्तुत करें";
    }

    const updatedScreens = flowScreens.map(s => {
      if (s.id === activeScreenId) {
        return {
          ...s,
          components: [...s.components, newComp]
        };
      }
      return s;
    });
    setFlowScreens(updatedScreens);
    setSelectedCompId(newComp.id);
  };

  const updateComponentProperty = (compId: string, key: string, value: any) => {
    const updatedScreens = flowScreens.map(s => {
      if (s.id === activeScreenId) {
        const updatedComps = s.components.map((c: any) => {
          if (c.id === compId) {
            return { ...c, [key]: value };
          }
          return c;
        });
        return { ...s, components: updatedComps };
      }
      return s;
    });
    setFlowScreens(updatedScreens);
  };

  const deleteComponent = (compId: string) => {
    const updatedScreens = flowScreens.map(s => {
      if (s.id === activeScreenId) {
        return {
          ...s,
          components: s.components.filter((c: any) => c.id !== compId)
        };
      }
      return s;
    });
    setFlowScreens(updatedScreens);
    if (selectedCompId === compId) {
      setSelectedCompId(null);
    }
  };

  const activeScreen = flowScreens.find(s => s.id === activeScreenId);
  const selectedComponent = activeScreen?.components.find((c: any) => c.id === selectedCompId);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Upper Navigation & Tab Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-surface-900 p-6 rounded-2xl border border-surface-200 dark:border-surface-800 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-surface-900 dark:text-white flex items-center gap-2">
            <Phone className="w-6 h-6 text-emerald-500" /> WhatsApp हब
          </h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            अपने कनेक्टेड प्रोफ़ाइल, टेम्पलेट्स और इंटरेक्टिव फ़्लो को प्रबंधित करें।
          </p>
        </div>
        
        {/* Sub Navigation Tabs */}
        <div className="flex bg-surface-100 dark:bg-surface-950 p-1 rounded-xl border border-surface-200 dark:border-surface-800 shrink-0 w-full md:w-auto">
          <button 
            onClick={() => setActiveSubTab('profiles')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeSubTab === 'profiles' ? 'bg-white dark:bg-surface-900 text-surface-950 dark:text-white shadow-sm' : 'text-surface-500 hover:text-surface-800'}`}
          >
            <User className="w-4 h-4 text-emerald-500" /> प्रोफ़ाइल
          </button>
          <button 
            onClick={() => setActiveSubTab('templates')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeSubTab === 'templates' ? 'bg-white dark:bg-surface-900 text-surface-950 dark:text-white shadow-sm' : 'text-surface-500 hover:text-surface-800'}`}
          >
            <FileText className="w-4 h-4 text-primary-500" /> टेम्पलेट्स
          </button>
          <button 
            onClick={() => setActiveSubTab('flows')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${activeSubTab === 'flows' ? 'bg-white dark:bg-surface-900 text-surface-950 dark:text-white shadow-sm' : 'text-surface-500 hover:text-surface-800'}`}
          >
            <Blocks className="w-4 h-4 text-amber-500" /> फ़्लो
          </button>
        </div>
      </div>

      {/* Main SubTab Contents */}
      {activeSubTab === 'profiles' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-surface-50 dark:bg-surface-900/40 p-4 rounded-xl border border-surface-100 dark:border-surface-800/60">
            <h3 className="font-bold text-surface-800 dark:text-surface-200 flex items-center gap-1.5">
              कनेक्टेड WhatsApp प्रोफ़ाइल ({configs.length})
            </h3>
            <div className="flex gap-3">
              {/* Meta Onboarding button */}
              <button 
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).FB) {
                    (window as any).FB.login((response: any) => {
                      if (response.authResponse) {
                        setMessage("Meta login सफल, Embedded Onboarding शुरू...");
                      } else {
                        setMessage("Meta login रद्द या त्रुटि।");
                      }
                    }, {
                      scope: 'whatsapp_business_management,whatsapp_business_messaging',
                      extras: {
                        feature: 'whatsapp_embedded_signup',
                        setup: {
                          prefill: {
                            business: {
                              name: 'Dhita CRM Workspace'
                            }
                          }
                        }
                      }
                    });
                  } else {
                    alert("Meta Facebook SDK लोड नहीं हुआ है। कृपया पेज रीलोड करें।");
                  }
                }}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
              >
                <Blocks className="w-4 h-4" /> ऑटो कनेक्ट
              </button>
              
              <button 
                onClick={() => {
                  setEditingConfig(null);
                  setPhoneNumberId("");
                  setWabaId("");
                  setAccessToken("");
                  setVerifyToken("");
                  setReplyMode("manual");
                  setSipUri("");
                  setSipWsServer("");
                  setSipUsername("");
                  setSipPassword("");
                  setShowProfileModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> मैन्युअल जोड़ें
              </button>
            </div>
          </div>

          {message && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900 flex justify-between items-center">
              <span className="text-sm font-medium">{message}</span>
              <button onClick={() => setMessage("")} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          {loadingConfigs ? (
            <div className="p-12 text-center text-surface-400">प्रोफ़ाइल लोड की जा रही हैं...</div>
          ) : configs.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-3xl bg-white dark:bg-surface-950/30 flex flex-col items-center">
              <Phone className="w-12 h-12 text-surface-300 dark:text-surface-700 mb-4 animate-bounce" />
              <h4 className="font-bold text-lg mb-1">कोई सक्रिय खाता नहीं मिला</h4>
              <p className="text-sm text-surface-500 max-w-sm mb-6">WhatsApp API का उपयोग शुरू करने के लिए एक खाता मैन्युअल रूप से जोड़ें या एम्बेडेड साइनअप का उपयोग करें।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {configs.map((cfg) => (
                <div key={cfg.id} className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl overflow-hidden shadow-sm hover:border-surface-300 dark:hover:border-surface-700 transition-all flex flex-col justify-between">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-surface-900 dark:text-white flex items-center gap-1.5 font-display">
                          {cfg.phone_number_id ? `+${cfg.phone_number_id.substring(0,2)}...` : "WhatsApp API लाइन"}
                        </h4>
                        <p className="text-[11px] text-surface-400 font-mono mt-1">ID: {cfg.id}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        cfg.reply_mode === 'ai' ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-400' :
                        cfg.reply_mode === 'rule_based' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' :
                        'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                      }`}>
                        {cfg.reply_mode === 'ai' ? 'AI बॉट' : cfg.reply_mode === 'rule_based' ? 'रूल्स' : 'मैन्युअल'}
                      </span>
                    </div>

                    <div className="space-y-2 border-t border-surface-100 dark:border-surface-800 pt-3 text-xs">
                      <div className="flex justify-between"><span className="text-surface-400">Phone ID:</span> <span className="font-mono text-surface-700 dark:text-surface-300">{cfg.phone_number_id || "कोई नहीं"}</span></div>
                      <div className="flex justify-between"><span className="text-surface-400">WABA ID:</span> <span className="font-mono text-surface-700 dark:text-surface-300">{cfg.waba_id || "कोई नहीं"}</span></div>
                      {cfg.username && (
                        <div className="flex justify-between"><span className="text-surface-400">यूज़रनेम:</span> <span className="font-mono text-primary-600 dark:text-primary-400">@{cfg.username}</span></div>
                      )}
                      {cfg.about && (
                        <div className="flex justify-between"><span className="text-surface-400">जानकारी:</span> <span className="text-surface-700 dark:text-surface-300 truncate max-w-[180px]">{cfg.about}</span></div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-surface-400">कॉलिंग:</span>
                        <span className={`font-mono ${cfg.calling_enabled ? 'text-emerald-500' : 'text-red-400'}`}>
                          {cfg.calling_enabled ? 'सक्षम' : 'अक्षम'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-surface-50 dark:bg-surface-950/50 border-t border-surface-100 dark:border-surface-800 flex gap-2">
                    <button onClick={() => handleEditProfile(cfg)} className="flex-1 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-surface-700 dark:text-surface-300 py-2 rounded-xl text-xs font-semibold hover:bg-surface-50 dark:hover:bg-surface-800 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                      <Edit className="w-3.5 h-3.5" /> संपादित करें
                    </button>
                    <button onClick={() => handleDeleteProfile(cfg.id)} className="p-2 border border-surface-200 dark:border-surface-800 text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mic Test Modal */}
          {showMicTestModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-sm overflow-hidden border border-surface-200 dark:border-surface-800 shadow-xl animate-in zoom-in-95 duration-250">
                <div className="p-4 border-b border-surface-100 dark:border-surface-800 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-surface-900 dark:text-white flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary-500" /> Gemini से बात करें
                  </h3>
                  <button onClick={() => { stopMicTest(); setShowMicTestModal(false); }} className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 text-center space-y-6">
                  <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
                    {isMicTesting && (
                      <>
                        <span className="absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-20 animate-ping"></span>
                        <span className="absolute inline-flex h-16 w-16 rounded-full bg-primary-500 opacity-20 animate-pulse"></span>
                      </>
                    )}
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg z-10 transition-colors ${isMicTesting ? 'bg-primary-600' : 'bg-surface-400'}`}>
                      <Phone className="w-6 h-6" />
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-surface-900 dark:text-white">{isMicTesting ? 'माइक चालू है' : 'टेस्ट के लिए तैयार'}</h4>
                    <p className="text-xs text-surface-500 mt-1">{micTestStatus}</p>
                  </div>

                  <div className="flex gap-3 justify-center">
                    {!isMicTesting ? (
                      <button
                        onClick={startMicTest}
                        className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all"
                      >
                        शुरू करें
                      </button>
                    ) : (
                      <button
                        onClick={stopMicTest}
                        className="bg-rose-500 hover:bg-rose-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2"
                      >
                         रोकें
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Profile Editor Modal */}
          {showProfileModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-surface-200 dark:border-surface-800 shadow-xl animate-in zoom-in-95 duration-250">
                <div className="p-6 border-b border-surface-100 dark:border-surface-800 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-surface-900 dark:text-white">
                    {editingConfig ? "WhatsApp खाता संपादित करें" : "नया WhatsApp खाता जोड़ें"}
                  </h3>
                  <button onClick={() => setShowProfileModal(false)} className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Phone Number ID</label>
                      <input 
                        type="text" 
                        value={phoneNumberId} 
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                        placeholder="उदा. 104523912..."
                        className="w-full text-sm p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">WABA ID</label>
                      <input 
                        type="text" 
                        value={wabaId} 
                        onChange={(e) => setWabaId(e.target.value)}
                        placeholder="उदा. 104234059..."
                        className="w-full text-sm p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Permanent Access Token</label>
                    <input 
                      type="password" 
                      value={accessToken} 
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder={editingConfig ? "••••••••••••••••" : "EAA..."}
                      className="w-full text-sm p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Webhook Verify Token</label>
                      <input 
                        type="text" 
                        value={verifyToken} 
                        onChange={(e) => setVerifyToken(e.target.value)}
                        placeholder="उदा. secureToken123"
                        className="w-full text-sm p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">ऑटो-रिप्लाई मोड</label>
                      <select 
                        value={replyMode} 
                        onChange={(e) => setReplyMode(e.target.value)}
                        className="w-full text-sm p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                      >
                        <option value="manual">मैन्युअल</option>
                        <option value="ai">AI चैटबॉट</option>
                        <option value="rule_based">रूल्स आधारित</option>
                      </select>
                    </div>
                  </div>

                  {replyMode === 'ai' && (
                    <div className="grid grid-cols-1 gap-4 bg-surface-50 dark:bg-surface-900 p-4 rounded-xl border border-surface-200 dark:border-surface-800">
                      <div>
                        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">AI प्रदाता</label>
                        <select
                          value={aiProvider}
                          onChange={(e) => setAiProvider(e.target.value)}
                          className="w-full text-sm p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 focus:border-primary-500 outline-none"
                        >
                          <option value="gemini">Google Gemini</option>
                          <option value="workers_ai">Cloudflare Workers AI (Llama 3)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">वॉइस AI एजेंट निर्देश</label>
                        <textarea
                          value={aiVoiceInstructions}
                          onChange={(e) => setAiVoiceInstructions(e.target.value)}
                          placeholder="उदा. आप वॉइस कॉल के लिए एक सहायक AI सहायक हैं। कृपया हिंदी में विनम्रता से बात करें।"
                          className="w-full text-sm p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 focus:border-primary-500 outline-none h-20"
                        />
                        <p className="text-[10px] text-surface-400 mt-1">ये निर्देश तब उपयोग किए जाएंगे जब कोई यूज़र WhatsApp पर वॉइस कॉल करेगा (WebRTC System Call)।</p>
                        <button
                          onClick={() => setShowMicTestModal(true)}
                          className="mt-3 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
                        >
                          <Phone className="w-4 h-4" /> Gemini से बात करें
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Calling and WebRTC configuration sub-panel */}
                  <div className="border-t border-surface-100 dark:border-surface-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-surface-800 dark:text-surface-200 uppercase tracking-wider mb-3">SIP Calling / WebRTC सेटिंग्स (वैकल्पिक)</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-surface-400 mb-1">SIP Server WS Address</label>
                        <input 
                          type="text" 
                          value={sipWsServer} 
                          onChange={(e) => setSipWsServer(e.target.value)}
                          placeholder="wss://sip.example.com:443"
                          className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-semibold text-surface-400 mb-1">SIP URI</label>
                          <input 
                            type="text" 
                            value={sipUri} 
                            onChange={(e) => setSipUri(e.target.value)}
                            placeholder="sip:100@sip.example.com"
                            className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-surface-400 mb-1">SIP Username</label>
                          <input 
                            type="text" 
                            value={sipUsername} 
                            onChange={(e) => setSipUsername(e.target.value)}
                            placeholder="100"
                            className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-surface-400 mb-1">SIP Password</label>
                        <input 
                          type="password" 
                          value={sipPassword} 
                          onChange={(e) => setSipPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Business Profile Section */}
                  <div className="border-t border-surface-100 dark:border-surface-800 pt-4 mt-2">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs font-bold text-surface-800 dark:text-surface-200 uppercase tracking-wider">WhatsApp Business Profile</h4>
                      {phoneNumberId && (
                        <button
                          onClick={handleFetchMetaProfile}
                          disabled={isFetchingProfile}
                          className="px-3 py-1.5 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-all flex items-center gap-1.5"
                        >
                          {isFetchingProfile ? (
                            <span className="animate-spin w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full" />
                          ) : (
                            <Facebook className="w-3.5 h-3.5" />
                          )}
                          {isFetchingProfile ? 'फ़ेच हो रहा है...' : 'मेटा से फ़ेच करें'}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {/* Profile Picture with Upload */}
                      <div className="flex flex-col items-center mb-4">
                        <div className="relative">
                          {profilePictureUrl ? (
                            <img src={profilePictureUrl} alt="प्रोफ़ाइल" className="w-24 h-24 rounded-full object-cover border-2 border-surface-200 dark:border-surface-700" />
                          ) : (
                            <div className="w-24 h-24 rounded-full bg-surface-100 dark:bg-surface-800 border-2 border-dashed border-surface-300 dark:border-surface-600 flex items-center justify-center">
                              <span className="text-surface-400 text-xs">कोई फ़ोटो नहीं</span>
                            </div>
                          )}
                          <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary-500 hover:bg-primary-600 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md transition-colors">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingPicture}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingPicture(true);
                                try {
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  formData.append('phone_number_id', phoneNumberId);
                                  const res = await fetch('/api/whatsapp/config/profile/picture', {
                                    method: 'POST',
                                    headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' },
                                    body: formData
                                  });
                                  const data: any = await res.json();
                                  if (data.success) {
                                    setProfilePictureUrl(data.profile_picture_url);
                                    setMessage("प्रोफ़ाइल फ़ोटो अपडेट की गई!");
                                  } else {
                                    setMessage("त्रुटि: " + (data.error || "अपलोड विफल"));
                                  }
                                } catch (err) {
                                  setMessage("अपलोड त्रुटि");
                                } finally {
                                  setUploadingPicture(false);
                                }
                              }}
                            />
                            {uploadingPicture ? (
                              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            )}
                          </label>
                        </div>
                        <p className="text-[10px] text-surface-400 mt-2">प्रोफ़ाइल फ़ोटो — WhatsApp पर सिंक होती है</p>
                      </div>

                      {/* About with character counter */}
                      <div>
                        <label className="block text-[11px] font-semibold text-surface-400 mb-1">जानकारी</label>
                        <div className="relative">
                          <textarea
                            value={profileAbout}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.length <= 139) setProfileAbout(val);
                            }}
                            placeholder="आपका WhatsApp Business about टेक्स्ट"
                            rows={2}
                            className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none resize-none pr-16"
                          />
                          <span className={`absolute bottom-2 right-2 text-[10px] font-mono ${profileAbout.length > 130 ? 'text-red-500' : 'text-surface-400'}`}>
                            {profileAbout.length}/139
                          </span>
                        </div>
                        <p className="text-[10px] text-surface-400 mt-1">Meta अधिकतम 139 अक्षरों की अनुमति देता है। WhatsApp Business प्रोफ़ाइल पर सिंक होता है।</p>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-surface-400 mb-1">विस्तृत विवरण</label>
                        <textarea
                          value={profileDescription}
                          onChange={(e) => setProfileDescription(e.target.value)}
                          placeholder="व्यवसाय का विस्तृत विवरण"
                          rows={3}
                          className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none resize-none"
                        />
                        <p className="text-[10px] text-surface-400 mt-1">WhatsApp Business प्रोफ़ाइल पर सिंक होता है</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-surface-400 mb-1">वेबसाइट</label>
                          <input 
                            type="url" 
                            value={profileWebsite} 
                            onChange={(e) => setProfileWebsite(e.target.value)}
                            placeholder="https://example.com"
                            className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                          />
                          <p className="text-[10px] text-surface-400 mt-1">WhatsApp Business प्रोफ़ाइल पर सिंक होता है</p>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-surface-400 mb-1">ईमेल पता</label>
                          <input 
                            type="email" 
                            value={profileEmail} 
                            onChange={(e) => setProfileEmail(e.target.value)}
                            placeholder="business@example.com"
                            className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                          />
                          <p className="text-[10px] text-surface-400 mt-1">WhatsApp Business प्रोफ़ाइल पर सिंक होता है</p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-surface-400 mb-1">पता</label>
                        <input 
                          type="text" 
                          value={profileAddress} 
                          onChange={(e) => setProfileAddress(e.target.value)}
                          placeholder="123 Main St, City, Country"
                          className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                        />
                        <p className="text-[10px] text-surface-400 mt-1">WhatsApp Business प्रोफ़ाइल पर सिंक होता है</p>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-surface-400 mb-1">WhatsApp यूज़रनेम</label>
                        <div className="flex items-center gap-1">
                          <span className="text-surface-400 text-xs font-mono">@</span>
                          <input 
                            type="text" 
                            value={profileUsername} 
                            onChange={(e) => setProfileUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ''))}
                            placeholder="yourbusiness"
                            className="flex-1 text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <p className="text-[10px] text-surface-400 mt-1">केवल अक्षर, संख्याएँ, अंडरस्कोर और डॉट्स। केवल स्थानीय (Meta पर सिंक नहीं होता)।</p>
                      </div>
                    </div>
                  </div>

                  {/* Call Settings Section */}
                  <div className="border-t border-surface-100 dark:border-surface-800 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-surface-800 dark:text-surface-200 uppercase tracking-wider mb-3">कॉल सेटिंग्स</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-surface-700 dark:text-surface-300">कॉलिंग सक्षम</label>
                        <button 
                          onClick={() => setCallingEnabledSettings(!callingEnabledSettings)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${callingEnabledSettings ? 'bg-emerald-500' : 'bg-surface-300 dark:bg-surface-600'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${callingEnabledSettings ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      <div className="border-t border-surface-100 dark:border-surface-800 pt-3">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-medium text-surface-700 dark:text-surface-300">कॉल शेड्यूल</label>
                          <button 
                            onClick={() => setCallScheduleEnabled(!callScheduleEnabled)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${callScheduleEnabled ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${callScheduleEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {callScheduleEnabled && (
                          <>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-surface-400 mb-1">शुरुआत समय</label>
                                <input 
                                  type="time" 
                                  value={callScheduleStart} 
                                  onChange={(e) => setCallScheduleStart(e.target.value)}
                                  className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-surface-400 mb-1">समाप्ति समय</label>
                                <input 
                                  type="time" 
                                  value={callScheduleEnd} 
                                  onChange={(e) => setCallScheduleEnd(e.target.value)}
                                  className="w-full text-xs p-2.5 rounded-xl border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-primary-500 outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-surface-400 mb-2">सक्रिय दिन</label>
                              <div className="flex gap-1.5 flex-wrap">
                                {[
                                  { key: 1, label: 'S' },
                                  { key: 2, label: 'M' },
                                  { key: 3, label: 'T' },
                                  { key: 4, label: 'W' },
                                  { key: 5, label: 'T' },
                                  { key: 6, label: 'F' },
                                  { key: 7, label: 'S' },
                                ].map(d => (
                                  <button
                                    key={d.key}
                                    onClick={() => {
                                      setCallScheduleDays(prev => 
                                        prev.includes(d.key) 
                                          ? prev.filter(k => k !== d.key)
                                          : [...prev, d.key].sort()
                                      );
                                    }}
                                    className={`w-8 h-8 rounded-full text-[11px] font-bold transition-all ${
                                      callScheduleDays.includes(d.key)
                                        ? 'bg-primary-500 text-white'
                                        : 'bg-surface-100 dark:bg-surface-800 text-surface-400'
                                    }`}
                                  >
                                    {d.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-950/50">
                  {message && (
                    <div className="mb-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900 text-xs font-medium">
                      {message}
                    </div>
                  )}
                  <div className="flex gap-3 justify-end">
                    <button 
                      onClick={() => setShowProfileModal(false)}
                      className="px-4 py-2 text-sm text-surface-500 hover:text-surface-700 bg-surface-100 dark:bg-surface-800 rounded-xl font-semibold"
                    >
                      रद्द करें
                    </button>
                    <button 
                      onClick={handleSaveProfile}
                      disabled={savingConfig || uploadingPicture}
                      className="px-6 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-surface-400 text-white rounded-xl font-bold transition-all"
                    >
                      {savingConfig ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                          सहेजा जा रहा है...
                        </span>
                      ) : "सुरक्षित करें"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'templates' && (
        <div className="bg-surface-50 dark:bg-surface-900/10 p-4 rounded-3xl border border-surface-100 dark:border-surface-800">
          <TemplatesView />
        </div>
      )}

      {activeSubTab === 'flows' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-surface-50 dark:bg-surface-900/40 p-4 rounded-xl border border-surface-100 dark:border-surface-800/60">
            <h3 className="font-bold text-surface-800 dark:text-surface-200 flex items-center gap-1.5">
              WhatsApp फ़्लो / फॉर्म सूची ({flows.length})
            </h3>
            <button 
              onClick={handleCreateFlow}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> नया फ़्लो बनाएँ
            </button>
          </div>

          {loadingFlows ? (
            <div className="p-12 text-center text-surface-400">फ़्लो लोड किए जा रहे हैं...</div>
          ) : flows.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-surface-200 dark:border-surface-800 rounded-3xl bg-white dark:bg-surface-950/30 flex flex-col items-center">
              <Blocks className="w-12 h-12 text-surface-300 dark:text-surface-700 mb-4 animate-pulse" />
              <h4 className="font-bold text-lg mb-1">कोई फ़्लो/फॉर्म नहीं मिला</h4>
              <p className="text-sm text-surface-500 max-w-sm mb-6">WhatsApp पर ग्राहकों से सीधे फॉर्म / जानकारी एकत्र करने के लिए एक फ़्लो डिज़ाइन करें।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {flows.map((flow) => (
                <div key={flow.id} className="bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-2xl overflow-hidden shadow-sm hover:border-surface-300 dark:hover:border-surface-700 transition-all flex flex-col justify-between">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-surface-900 dark:text-white font-display">{flow.name}</h4>
                        <p className="text-[11px] text-surface-400 font-mono mt-1">ID: {flow.id}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        flow.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                        'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-400'
                      }`}>
                        {flow.status === 'PUBLISHED' ? 'लाइव' : 'ड्राफ़्ट'}
                      </span>
                    </div>

                    <div className="text-xs text-surface-500 bg-surface-50 dark:bg-surface-950 p-3 rounded-xl border border-surface-100 dark:border-surface-900 flex justify-between items-center">
                      <span>श्रेणी: <strong>{flow.categories || "UTILITY"}</strong></span>
                      <span>स्क्रीन संख्या: <strong>{JSON.parse(flow.screens_json || '[]').length || 1}</strong></span>
                    </div>
                  </div>

                  <div className="p-4 bg-surface-50 dark:bg-surface-950/50 border-t border-surface-100 dark:border-surface-800 flex gap-2">
                    <button onClick={() => handleEditFlow(flow)} className="flex-1 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 text-surface-700 dark:text-surface-300 py-2 rounded-xl text-xs font-semibold hover:bg-surface-50 dark:hover:bg-surface-800 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                      <Edit className="w-3.5 h-3.5" /> संपादित करें
                    </button>
                    {flow.status !== 'PUBLISHED' && (
                      <button onClick={() => handlePublishFlow(flow.id)} className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all">
                        लाइव करें
                      </button>
                    )}
                    <button onClick={() => handleDeleteFlow(flow.id)} className="p-2 border border-surface-200 dark:border-surface-800 text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Flow Visual Editor Builder Modal */}
          {showFlowModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-6xl h-[90vh] overflow-hidden border border-surface-200 dark:border-surface-800 shadow-xl animate-in zoom-in-95 duration-250 flex flex-col">
                
                {/* Header */}
                <div className="p-4 md:p-6 border-b border-surface-100 dark:border-surface-800 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <Blocks className="w-5 h-5 text-amber-500" />
                    <div>
                      <h3 className="text-lg font-bold text-surface-900 dark:text-white">
                        {editingFlow ? "WhatsApp फ़्लो संपादित करें" : "नया WhatsApp फ़्लो बनाएँ"}
                      </h3>
                      <p className="text-xs text-surface-400 mt-0.5">बिना कोडिंग के WhatsApp फॉर्म्स और इंटरएक्टिव स्क्रीन डिज़ाइन करें</p>
                    </div>
                  </div>
                  <button onClick={() => setShowFlowModal(false)} className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"><X className="w-5 h-5" /></button>
                </div>

                {/* Main Body Grid */}
                <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                  
                  {/* Left Column: Screen Structure & Fields insertion (4 cols) */}
                  <div className="lg:col-span-4 border-r border-surface-100 dark:border-surface-800 p-4 overflow-y-auto space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-surface-400 uppercase tracking-wider mb-1">फ़्लो का नाम</label>
                      <input 
                        type="text" 
                        value={flowName} 
                        onChange={(e) => setFlowName(e.target.value)}
                        placeholder="उदा. लीड फॉर्म, सर्वे"
                        className="w-full text-sm p-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-amber-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-surface-400 uppercase tracking-wider mb-1">श्रेणी</label>
                      <select 
                        value={flowCategory} 
                        onChange={(e) => setFlowCategory(e.target.value)}
                        className="w-full text-sm p-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950 focus:border-amber-500 outline-none"
                      >
                        <option value="UTILITY">उपयोगिता</option>
                        <option value="MARKETING">मार्केटिंग</option>
                      </select>
                    </div>

                    {/* Component Actions Palette */}
                    <div className="border-t border-surface-100 dark:border-surface-800 pt-3">
                      <h4 className="text-xs font-bold text-surface-800 dark:text-surface-200 uppercase tracking-wider mb-2">कंपोनेंट्स जोड़ें</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => addFlowComponent('text')} className="flex items-center gap-1.5 p-2 bg-surface-50 dark:bg-surface-950 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-800 text-xs font-semibold text-surface-700 dark:text-surface-300 text-left transition-all">
                          <span className="text-primary-500 font-bold font-mono">T</span> विवरण / निर्देश
                        </button>
                        <button onClick={() => addFlowComponent('input')} className="flex items-center gap-1.5 p-2 bg-surface-50 dark:bg-surface-950 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-800 text-xs font-semibold text-surface-700 dark:text-surface-300 text-left transition-all">
                          <Plus className="w-3.5 h-3.5 text-emerald-500" /> टेक्स्ट इनपुट
                        </button>
                        <button onClick={() => addFlowComponent('textarea')} className="flex items-center gap-1.5 p-2 bg-surface-50 dark:bg-surface-950 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-800 text-xs font-semibold text-surface-700 dark:text-surface-300 text-left transition-all">
                          <Plus className="w-3.5 h-3.5 text-blue-500" /> लंबा संदेश
                        </button>
                        <button onClick={() => addFlowComponent('select')} className="flex items-center gap-1.5 p-2 bg-surface-50 dark:bg-surface-950 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-800 text-xs font-semibold text-surface-700 dark:text-surface-300 text-left transition-all">
                          <Plus className="w-3.5 h-3.5 text-amber-500" /> ड्रॉपडाउन लिस्ट
                        </button>
                        <button onClick={() => addFlowComponent('submit')} className="col-span-2 flex items-center justify-center gap-1.5 p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all">
                          <Check className="w-3.5 h-3.5" /> सबमिट बटन
                        </button>
                      </div>
                    </div>

                    {/* Field Properties Panel */}
                    {selectedComponent ? (
                      <div className="border-t border-surface-100 dark:border-surface-800 pt-3 space-y-3 bg-surface-50/50 dark:bg-surface-950/20 p-3 rounded-xl border border-dashed">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">फ़ील्ड गुण</h4>
                          <button onClick={() => deleteComponent(selectedComponent.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5 rounded-lg transition-all" title="फ़ील्ड हटाएँ">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-surface-400 mb-1">लेबल</label>
                          <input 
                            type="text"
                            value={selectedComponent.label || ""}
                            onChange={(e) => updateComponentProperty(selectedComponent.id, 'label', e.target.value)}
                            className="w-full text-xs p-2 rounded border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 outline-none"
                          />
                        </div>

                        {selectedComponent.type === 'text' && (
                          <div>
                            <label className="block text-[10px] font-bold text-surface-400 mb-1">विवरण सामग्री</label>
                            <textarea 
                              rows={2}
                              value={selectedComponent.content || ""}
                              onChange={(e) => updateComponentProperty(selectedComponent.id, 'content', e.target.value)}
                              className="w-full text-xs p-2 rounded border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 outline-none resize-none"
                            />
                          </div>
                        )}

                        {(selectedComponent.type === 'input' || selectedComponent.type === 'textarea') && (
                          <>
                            <div>
                              <label className="block text-[10px] font-bold text-surface-400 mb-1">प्लेसहोल्डर</label>
                              <input 
                                type="text"
                                value={selectedComponent.placeholder || ""}
                                onChange={(e) => updateComponentProperty(selectedComponent.id, 'placeholder', e.target.value)}
                                className="w-full text-xs p-2 rounded border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox"
                                checked={!!selectedComponent.required}
                                onChange={(e) => updateComponentProperty(selectedComponent.id, 'required', e.target.checked)}
                                id="chk_req"
                              />
                              <label htmlFor="chk_req" className="text-xs text-surface-600 dark:text-surface-400 font-semibold cursor-pointer">भरना आवश्यक है?</label>
                            </div>
                          </>
                        )}

                        {selectedComponent.type === 'select' && (
                          <div>
                            <label className="block text-[10px] font-bold text-surface-400 mb-1">विकल्प सूची (कोमा से अलग करें)</label>
                            <input 
                              type="text"
                              value={selectedComponent.options || ""}
                              onChange={(e) => updateComponentProperty(selectedComponent.id, 'options', e.target.value)}
                              placeholder="उदा. हाँ, नहीं, शायद"
                              className="w-full text-xs p-2 rounded border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 outline-none"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[10px] font-bold text-surface-400 mb-1">वैरिएबल कुंजी</label>
                          <input 
                            type="text"
                            value={selectedComponent.name || ""}
                            onChange={(e) => updateComponentProperty(selectedComponent.id, 'name', e.target.value)}
                            className="w-full text-xs p-2 rounded border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 outline-none font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-6 border-2 border-dashed border-surface-100 dark:border-surface-800 rounded-2xl text-surface-400 text-xs">
                        संपादित करने के लिए लाइव प्रीव्यू स्क्रीन पर किसी फील्ड/अवयव पर क्लिक करें।
                      </div>
                    )}
                  </div>

                  {/* Middle/Right Column: Live Simulated Phone Screen & Layout Preview (8 cols) */}
                  <div className="lg:col-span-8 bg-surface-50 dark:bg-surface-950 p-6 flex flex-col md:flex-row gap-6 overflow-y-auto items-center justify-center">
                    
                    {/* Visual Layout Reorder List */}
                    <div className="w-full md:w-1/2 space-y-3 shrink-0">
                      <h4 className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-2">स्क्रीन अवयव क्रम</h4>
                      <div className="space-y-2">
                        {activeScreen?.components.map((comp: any) => (
                          <div 
                            key={comp.id}
                            onClick={() => setSelectedCompId(comp.id)}
                            className={`p-3 rounded-xl border transition-all flex justify-between items-center cursor-pointer ${selectedCompId === comp.id ? 'bg-amber-500/15 border-amber-500' : 'bg-white dark:bg-surface-900 border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700'}`}
                          >
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-800 text-surface-500 font-mono">{comp.type}</span>
                              <h5 className="text-xs font-bold text-surface-800 dark:text-surface-200 mt-1 truncate">{comp.label || comp.content || "बिना नाम की फील्ड"}</h5>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); deleteComponent(comp.id); }}
                              className="text-surface-400 hover:text-red-500 p-1 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* WhatsApp Device Mockup frame */}
                    <div className="w-[300px] h-[580px] bg-surface-950 rounded-[40px] border-[8px] border-surface-800 shadow-2xl relative shrink-0 overflow-hidden flex flex-col">
                      {/* Topnotch speaker and camera */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-surface-800 rounded-b-xl z-20 flex items-center justify-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-surface-900"></div>
                        <div className="w-10 h-1 bg-surface-900 rounded-full"></div>
                      </div>

                      {/* Screen Header */}
                      <div className="bg-[#075e54] text-white pt-7 pb-3 px-4 flex items-center gap-2 z-10">
                        <Phone className="w-4 h-4 text-emerald-300" />
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold truncate">Dhita CRM Forms</h5>
                          <p className="text-[9px] text-emerald-200">सक्रिय फॉर्म स्क्रीन</p>
                        </div>
                      </div>

                      {/* Chat / Flow Form Screen area */}
                      <div className="flex-1 min-h-0 bg-[#efeae2] dark:bg-surface-900/40 p-4 space-y-4 overflow-y-auto relative">
                        {/* Custom background pattern simulation */}
                        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #000 10%, transparent 11%)', backgroundSize: '12px 12px' }}></div>
                        
                        {/* Elegant Form Window simulating WhatsApp Native Flow screen */}
                        <div className="bg-white dark:bg-surface-950 p-4 rounded-xl border border-surface-200 dark:border-surface-800 shadow-sm space-y-3 relative z-10">
                          <h4 className="font-bold text-sm text-surface-800 dark:text-surface-200 pb-2 border-b border-surface-100 dark:border-surface-900 flex items-center justify-between">
                            <span>{activeScreen?.title || "शीर्षक"}</span>
                            <span className="text-[10px] text-surface-400 uppercase tracking-widest font-bold">1 में से 1</span>
                          </h4>

                          {/* Dynamic components rendering inside Mockup */}
                          <div className="space-y-3">
                            {activeScreen?.components.map((c: any) => {
                              if (c.type === 'text') {
                                return (
                                  <div key={c.id} className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed whitespace-pre-wrap bg-surface-50 dark:bg-surface-900 p-2 rounded border border-surface-100 dark:border-surface-800">
                                    {c.content || "निर्देश प्रविष्ट करें..."}
                                  </div>
                                );
                              }
                              if (c.type === 'input') {
                                return (
                                  <div key={c.id} className="space-y-1">
                                    <label className="block text-[10px] font-semibold text-surface-500">
                                      {c.label || "इनपुट"} {c.required && <span className="text-red-500">*</span>}
                                    </label>
                                    <input 
                                      type="text"
                                      disabled
                                      placeholder={c.placeholder || "विवरण..."}
                                      className="w-full text-xs p-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50 outline-none"
                                    />
                                  </div>
                                );
                              }
                              if (c.type === 'textarea') {
                                return (
                                  <div key={c.id} className="space-y-1">
                                    <label className="block text-[10px] font-semibold text-surface-500">
                                      {c.label || "लंबा संदेश"} {c.required && <span className="text-red-500">*</span>}
                                    </label>
                                    <textarea 
                                      rows={2}
                                      disabled
                                      placeholder={c.placeholder || "विवरण..."}
                                      className="w-full text-xs p-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50 outline-none resize-none"
                                    />
                                  </div>
                                );
                              }
                              if (c.type === 'select') {
                                const opts = (c.options || "").split(",").map((o: string) => o.trim()).filter((o: string) => o.length > 0);
                                return (
                                  <div key={c.id} className="space-y-1">
                                    <label className="block text-[10px] font-semibold text-surface-500">{c.label || "ड्रॉपडाउन"}</label>
                                    <select disabled className="w-full text-xs p-2 rounded-lg border border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50 outline-none">
                                      {opts.map((o: string, idx: number) => <option key={idx}>{o}</option>)}
                                    </select>
                                  </div>
                                );
                              }
                              if (c.type === 'submit') {
                                return (
                                  <button key={c.id} disabled className="w-full py-2 bg-[#075e54] text-white font-bold text-xs rounded-lg shadow-sm hover:opacity-95 mt-4">
                                    {c.label || "प्रस्तुत करें"}
                                  </button>
                                );
                              }
                              return null;
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Screen footer bar / Home line */}
                      <div className="h-10 bg-surface-950 flex items-center justify-center shrink-0">
                        <div className="w-24 h-1 bg-surface-700 rounded-full"></div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-950/50 shrink-0 flex gap-3 justify-end">
                  <button 
                    onClick={() => setShowFlowModal(false)}
                    className="px-4 py-2 text-sm text-surface-500 hover:text-surface-700 bg-surface-100 dark:bg-surface-800 rounded-xl font-semibold"
                  >
                    रद्द करें
                  </button>
                  <button 
                    onClick={handleSaveFlow}
                    className="px-6 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all shadow-sm"
                  >
                    सहेजें और बंद करें
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

