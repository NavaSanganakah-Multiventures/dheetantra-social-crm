import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, AlertTriangle, Upload, Bot, MessageSquare, Send, Paperclip, User, AlertCircle, Phone, X, History, MapPin, Building2, Tag, ChevronDown, ChevronRight, Activity, Check, CheckCheck, FileText, Trash2, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { useToast } from '@/components/ui/Toast';
import { formatUserTimeOnly, ensureUTC } from '../lib/dates';

export function InboxView({
  preselectedChat,
  setPreselectedChat,
  onInitiateCall
}: {
  preselectedChat?: any,
  setPreselectedChat?: (chat: any) => void,
  onInitiateCall?: (contact: any) => void
}) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<any>(preselectedChat || null);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'open' | 'closed'>('open');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const lastCustomerMessageAt = activeChat?.customer_last_message_at ? ensureUTC(activeChat.customer_last_message_at) : null;
  const isExpired = lastCustomerMessageAt ? (currentTime.getTime() - lastCustomerMessageAt.getTime() > 24 * 60 * 60 * 1000) : true;
  
  const timeRemaining = lastCustomerMessageAt && !isExpired 
    ? (24 * 60 * 60 * 1000) - (currentTime.getTime() - lastCustomerMessageAt.getTime()) 
    : 0;
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const isTemplateRequired = isExpired;

  useEffect(() => {
    if (preselectedChat) {
      setActiveChat(preselectedChat);
      if (setPreselectedChat) {
        setPreselectedChat(null);
      }
    }
  }, [preselectedChat, setPreselectedChat]);

  const [configs, setConfigs] = useState<any[]>([]);
  const [selectedWaba, setSelectedWaba] = useState<any>({ id: 'all', phone_number_id: 'all' });
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'text' | 'image' | 'video' | 'document' | 'location' | 'contacts' | null>(null);

  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaFileState, setMediaFileState] = useState<File | null>(null);
  const [captionInput, setCaptionInput] = useState('');
  const [docFilenameInput, setDocFilenameInput] = useState('');

  const [latInput, setLatInput] = useState('28.6139');
  const [lngInput, setLngInput] = useState('77.2090');
  const [locNameInput, setLocNameInput] = useState('Dhitantra Headquarters');
  const [locAddressInput, setLocAddressInput] = useState('New Delhi, India');

  const [contactNameInput, setContactNameInput] = useState('');
  const [contactPhoneInput, setContactPhoneInput] = useState('');

  // Inbox template picker state
  const [inboxTemplates, setInboxTemplates] = useState<any[]>([]);
  const [selectedInboxTemplate, setSelectedInboxTemplate] = useState<any>(null);
  const [inboxTemplateParams, setInboxTemplateParams] = useState<string[]>([]);
  const [inboxTemplateSending, setInboxTemplateSending] = useState(false);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollThrottleRef = useRef<number>(0);

  // Business Profile + Call Schedule state (used in contact info panel)
  const [profilePictureUrl, setProfilePictureUrl] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [callScheduleEnabled, setCallScheduleEnabled] = useState(false);
  const [callScheduleStart, setCallScheduleStart] = useState("09:00");
  const [callScheduleEnd, setCallScheduleEnd] = useState("17:00");
  const [callScheduleDays, setCallScheduleDays] = useState<number[]>([1,2,3,4,5]);
  const [callingEnabled, setCallingEnabled] = useState(true);

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/whatsapp/config', {
      headers: { 'x-workspace-id': wId || '' }
    }).then(r => r.json()).then((data: any) => {
      if (data.configs) {
        setConfigs(data.configs);
      }
    }).catch(err => console.error("Error loading configs:", err));

    fetch('/api/whatsapp/templates', {
      headers: { 'x-workspace-id': wId || '' }
    }).then(r => r.json()).then((data: any) => {
      if (data.success) {
        const all = [...(data.meta || []), ...(data.local || [])];
        setInboxTemplates(all.filter((t: any) => t.status === 'APPROVED'));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      if (mediaFileState) {
        objectUrl = URL.createObjectURL(mediaFileState);
        setMediaPreviewUrl(objectUrl);
      } else if (mediaUrlInput.trim()) {
        setMediaPreviewUrl(mediaUrlInput.trim());
      } else {
        setMediaPreviewUrl(null);
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaFileState, mediaUrlInput]);

  const activeWabaPhoneId = activeChat?.phone_number_id || (selectedWaba && selectedWaba.phone_number_id !== 'all' ? selectedWaba.phone_number_id : null);
  const activeWabaConfig = configs.find(c => c.phone_number_id === activeWabaPhoneId);
  const currentReplyMode = activeWabaConfig?.reply_mode || "manual";

  const toggleAI = async () => {
    const targetPhoneId = activeWabaPhoneId;
    if (!targetPhoneId) {
      alert("AI à¤Ÿà¥‰à¤—à¤² à¤•à¤°à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤à¤• à¤µà¤¿à¤¶à¤¿à¤·à¥à¤Ÿ WhatsApp à¤²à¤¾à¤‡à¤¨ à¤¯à¤¾ à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤šà¥à¤¨à¥‡à¤‚à¥¤");
      return;
    }

    const targetConfig = configs.find(c => c.phone_number_id === targetPhoneId);
    const currentMode = targetConfig?.reply_mode || "manual";
    const newMode = currentMode === 'ai' ? 'manual' : 'ai';
    
    setConfigs(prev => prev.map(c => c.phone_number_id === targetPhoneId ? { ...c, reply_mode: newMode } : c));
    if (selectedWaba && selectedWaba.phone_number_id === targetPhoneId) {
      setSelectedWaba((prev: any) => ({ ...prev, reply_mode: newMode }));
    }

    try {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      
      await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
        body: JSON.stringify({ 
          id: targetConfig?.id,
          phone_number_id: targetPhoneId, 
          verify_token: targetConfig?.verify_token || "", 
          reply_mode: newMode 
        })
      });
    } catch (e) {
      console.error("Failed to toggle AI", e);
    }
  };

  const sendRichMessage = async () => {
    if (!activeChat || sending || !attachmentType || isTemplateRequired) return;
    
    const resolvedPhoneId = activeChat.phone_number_id || (selectedWaba && selectedWaba.phone_number_id !== 'all' ? selectedWaba.phone_number_id : undefined);

    let payload: any = {
      to: activeChat.phone,
      conversationId: activeChat.id,
      type: attachmentType,
      phoneNumberId: resolvedPhoneId
    };

    if (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') {
      let finalMediaUrl = mediaUrlInput.trim();
      let finalR2Url = null;
      if (mediaFileState) {
         // Upload sequential; sending is set at the call site
         const formData = new FormData();
         formData.append('file', mediaFileState);
         
         try {
            const uploadRes = await fetch('/api/whatsapp/upload', {
               method: 'POST',
               headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' },
               body: formData
            });
            const uploadData: any = await uploadRes.json();
            if (uploadData.success && uploadData.mediaUrl) {
               finalMediaUrl = uploadData.mediaUrl;
               finalR2Url = uploadData.r2Url;
            } else {
               alert('File upload failed: ' + uploadData.error);
               setSending(false);
               return;
            }
         } catch(e) {
            alert('File upload error');
            setSending(false);
            return;
         }
      }
      
      if (!finalMediaUrl) {
        alert("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤®à¥€à¤¡à¤¿à¤¯à¤¾ à¤šà¥à¤¨à¥‡à¤‚ à¤¯à¤¾ à¤¯à¥‚à¤†à¤°à¤à¤² à¤ªà¥à¤°à¤¦à¤¾à¤¨ à¤•à¤°à¥‡à¤‚");
        setSending(false);
        return;
      }
      payload.mediaUrl = finalMediaUrl;
      payload.r2Url = finalR2Url;
      if (attachmentType === 'document') {
        payload.filename = docFilenameInput.trim() || 'Document.pdf';
        payload.text = docFilenameInput.trim() || 'Document.pdf';
      } else {
        payload.text = captionInput.trim();
      }
    } else if (attachmentType === 'location') {
      if (!latInput.trim() || !lngInput.trim() || !locNameInput.trim()) {
        alert("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤…à¤•à¥à¤·à¤¾à¤‚à¤¶, à¤¦à¥‡à¤¶à¤¾à¤‚à¤¤à¤° à¤”à¤° à¤²à¥‹à¤•à¥‡à¤¶à¤¨ à¤•à¤¾ à¤¨à¤¾à¤® à¤ªà¥à¤°à¤¦à¤¾à¤¨ à¤•à¤°à¥‡à¤‚");
        return;
      }
      const latNum = parseFloat(latInput);
      const lngNum = parseFloat(lngInput);
      if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        alert("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤µà¥ˆà¤§ à¤…à¤•à¥à¤·à¤¾à¤‚à¤¶ (-90 à¤¸à¥‡ 90) à¤”à¤° à¤¦à¥‡à¤¶à¤¾à¤‚à¤¤à¤° (-180 à¤¸à¥‡ 180) à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚");
        return;
      }
      payload.location = {
        latitude: latNum,
        longitude: lngNum,
        name: locNameInput.trim(),
        address: locAddressInput.trim()
      };
    } else if (attachmentType === 'contacts') {
      if (!contactNameInput.trim() || !contactPhoneInput) {
        alert("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤¾ à¤¨à¤¾à¤® à¤”à¤° à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤ªà¥à¤°à¤¦à¤¾à¤¨ à¤•à¤°à¥‡à¤‚");
        return;
      }
      if (!isValidPhoneNumber(contactPhoneInput)) {
        alert("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¸à¤¹à¥€ à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚à¥¤ (Invalid phone number)");
        return;
      }
      const sanitizedPhone = contactPhoneInput.startsWith('+') ? contactPhoneInput.slice(1) : contactPhoneInput;

      payload.contacts = [{
        name: {
          first_name: contactNameInput.trim(),
          formatted_name: contactNameInput.trim()
        },
        phones: [{
          phone: sanitizedPhone,
          type: "MOBILE"
        }]
      }];
    }

    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify(payload)
      });
      const data: any = await res.json();
      if (data.success) {
        setAttachmentType(null); setMediaFileState(null);
        setAttachmentMenuOpen(false);
        setMediaUrlInput('');
        setCaptionInput('');
        setDocFilenameInput('');
        setContactNameInput('');
        setContactPhoneInput('');
        loadMessages(activeChat.id);
      } else {
        alert(data.error || "à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
      }
    } catch (e) {
      alert("à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
    } finally {
      setSending(false);
    }
  };

  const fetchConversations = useCallback((wabaId?: string) => {
    const activeWaba = wabaId || (selectedWaba ? selectedWaba.phone_number_id : '');
    const url = activeWaba && activeWaba !== 'all'
      ? `/api/inbox/conversations?phoneNumberId=${activeWaba}` 
      : '/api/inbox/conversations';

    fetch(url, {
      headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
    }).then(r => r.json()).then((data: any) => {
        if (data.conversations) {
            setConversations(data.conversations);
            // Update activeChat if it's still the same conversation
            setActiveChat((prev: any) => {
                if (!prev) return null;
                const updated = data.conversations.find((c: any) => c.id === prev.id);
                return updated ? { ...prev, ...updated } : prev;
            });
        }
        setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedWaba]);

  // Ref to always have latest fetchConversations without causing WebSocket reconnects
  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => fetchConversations(), 30000); // 30s fallback
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const loadMessages = useCallback((conversationId: string) => {
    fetch(`/api/inbox/messages/${conversationId}`, {
      headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' }
    }).then(r => r.json()).then((data: any) => {
        if (data.messages) {
            // Merge with existing state to not overwrite concurrent WebSocket updates
            setMessages(prev => {
                const serverIds = new Set(data.messages.map((m: any) => m.id));
                const localOnly = prev.filter(m => m.id.startsWith('optimistic-') && !serverIds.has(m.id));
                return [...data.messages, ...localOnly].sort(
                    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
            });
        }
    }).catch(err => console.error("Failed to load messages:", err));
  }, []);

  useEffect(() => {
    if (!activeChat) return;

    loadMessages(activeChat.id);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/connect/${activeChat.id}`;
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let active = true;
    const convId = activeChat.id;

    function connectWs() {
      if (!active) return;
      try {
        socket = new WebSocket(wsUrl);

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'new_message' && data.message) {
              fetchConversationsRef.current();

              if (data.message.conversation_id === convId) {
                setMessages(prev => {
                  if (prev.some(m => m.id === data.message.id)) return prev;
                  // Match optimistic messages by ID if server assigned our tempId's content, else by content+timer
                  const matchedOptimisticIndex = prev.findIndex(m => {
                    if (!m.id.startsWith('optimistic-')) return false;
                    // If server returned this message and we matched it already in sendMessage callback, skip
                    if (m.status === 'sent' || m.status === 'failed') return false;
                    if (m.content !== data.message.content) return false;
                    // Check timestamps within 5 seconds
                    const t1 = new Date(m.created_at).getTime();
                    const t2 = new Date(data.message.created_at).getTime();
                    return Math.abs(t1 - t2) < 5000;
                  });
                  if (matchedOptimisticIndex !== -1) {
                    const next = [...prev];
                    next[matchedOptimisticIndex] = data.message;
                    return next;
                  }
                  return [...prev, data.message];
                });

                if (data.customer_last_message_at) {
                  setActiveChat((prev: any) => prev ? { ...prev, customer_last_message_at: data.customer_last_message_at } : null);
                }
              }
            } else if (data.type === 'conversation_status_updated') {
              fetchConversationsRef.current();
              if (convId === data.conversation_id) {
                setActiveChat((prev: any) => prev ? { ...prev, status: data.status } : null);
              }
            } else if (data.type === 'message_status_updated') {
              if (convId === data.conversation_id) {
                setMessages((prev: any[]) => prev.map(m => 
                  m.id === data.message_id ? { ...m, status: data.status } : m
                ));
              }
            } else if (data.type === 'conversation_deleted') {
              fetchConversationsRef.current();
              if (convId === data.conversation_id) {
                setActiveChat(null);
              }
            }
          } catch (e) {
            console.error("Error handling ws message", e);
          }
        };

        socket.onclose = () => {
          if (active) {
            reconnectTimeout = setTimeout(connectWs, 3000);
          }
        };

        socket.onerror = () => {
          if (socket) socket.close();
        };
      } catch (err) {
        console.error("WebSocket connection error:", err);
        if (active) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      }
    }

    connectWs();

    const failSafeInterval = setInterval(() => {
      loadMessages(convId);
    }, 10000);

    return () => {
      active = false;
      clearInterval(failSafeInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        socket.close();
      }
    };
  }, [activeChat?.id]); // Only reconnect when conversation changes, not when WABA filter changes

  const sendMessage = async () => {
    if (!messageInput.trim() || !activeChat || isTemplateRequired) return;
    const textToSend = messageInput.trim();
    setMessageInput("");

    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg = {
      id: tempId,
      content: textToSend,
      sender_type: 'agent',
      message_type: 'text',
      created_at: new Date().toISOString(),
      status: 'pending'
    };

    setMessages(prev => [...prev, optimisticMsg]);
    
    const resolvedPhoneId = activeChat.phone_number_id || (selectedWaba && selectedWaba.phone_number_id !== 'all' ? selectedWaba.phone_number_id : undefined);

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-workspace-id': localStorage.getItem('workspaceId') || ''
        },
        body: JSON.stringify({
          to: activeChat.phone,
          text: textToSend,
          conversationId: activeChat.id,
          phoneNumberId: resolvedPhoneId
        })
      });
      const data: any = await res.json();
      if (data.success && data.data?.id) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.data.id, status: 'sent' } : m));
        fetchConversations();
      } else {
        // Keep optimistic but mark as failed instead of removing â€” user can see what failed
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
        toast('error', data.error || "à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
        setMessageInput(textToSend);
      }
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
      toast('error', "à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
      setMessageInput(textToSend);
    }
  };

  const sendInboxTemplate = async () => {
    if (!selectedInboxTemplate || !activeChat) return;
    setInboxTemplateSending(true);
    const wId = localStorage.getItem('workspaceId');
    // Match phone_number_id from activeChat config, not configs[0]
    const matchingConfig = activeChat.phone_number_id 
      ? configs.find(c => c.phone_number_id === activeChat.phone_number_id) 
      : null;
    const resolvedPhoneId = activeChat.phone_number_id || matchingConfig?.phone_number_id || (configs.length > 0 ? configs[configs.length - 1].phone_number_id : undefined);
    const currentConvId = activeChat.id; // capture before await
    try {
      const res = await fetch('/api/whatsapp/templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId || '' },
        body: JSON.stringify({
          to: activeChat.phone,
          templateName: selectedInboxTemplate.name,
          languageCode: selectedInboxTemplate.language || 'en_US',
          parameters: inboxTemplateParams.filter(p => p.trim()),
          phoneNumberId: resolvedPhoneId
        })
      });
      const data: any = await res.json();
      if (data.success) {
        setSelectedInboxTemplate(null);
        setInboxTemplateParams([]);
        fetchConversations();
        // Use captured convId, not activeChat.id from stale closure
        loadMessages(currentConvId);
      } else {
        toast('error', data.error || "à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤­à¥‡à¤œà¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
      }
    } catch {
      toast('error', "à¤¸à¤°à¥à¤µà¤° à¤à¤°à¤°");
    } finally {
      setInboxTemplateSending(false);
    }
  };

  useEffect(() => {
    // Only auto-scroll if user is already near the bottom
    if (messagesEndRef.current && isAtBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  const updateConversationStatus = async (convId: string, newStatus: 'open' | 'closed') => {
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch(`/api/inbox/conversations/${convId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data: any = await res.json();
      if (data.success) {
        setActiveChat((prev: any) => prev && prev.id === convId ? { ...prev, status: newStatus } : prev);
        setConversations((prev: any[]) => prev.map((c: any) => c.id === convId ? { ...c, status: newStatus } : c));
      } else {
        alert(data.error || "à¤…à¤ªà¤¡à¥‡à¤Ÿ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
      }
    } catch (e) {
      alert("à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
    }
  };

  const deleteConversation = async (convId: string) => {
    if (!confirm("à¤•à¥à¤¯à¤¾ à¤†à¤ª à¤µà¤¾à¤•à¤ˆ à¤‡à¤¸ à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤”à¤° à¤‡à¤¸à¤•à¥‡ à¤¸à¤­à¥€ à¤¸à¤‚à¤¦à¥‡à¤¶à¥‹à¤‚ à¤•à¥‹ à¤¹à¤Ÿà¤¾à¤¨à¤¾ à¤šà¤¾à¤¹à¤¤à¥‡ à¤¹à¥ˆà¤‚?")) return;
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch(`/api/inbox/conversations/${convId}`, {
        method: 'DELETE',
        headers: {
          'x-workspace-id': wId || ''
        }
      });
      const data: any = await res.json();
      if (data.success) {
        setActiveChat(null);
        setConversations(prev => prev.filter(c => c.id !== convId));
      } else {
        alert(data.error || "à¤¹à¤Ÿà¤¾à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
      }
    } catch (e) {
      alert("à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
    }
  };

  return (
    <div className="flex h-full bg-white dark:bg-zinc-900 overflow-hidden relative">
      {/* Contact List */}
      <div className={`w-full md:w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-900 z-10 ${activeChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">à¤¸à¤•à¥à¤°à¤¿à¤¯ à¤¬à¤¾à¤¤à¤šà¥€à¤¤</h2>
              {configs.length > 0 && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded">
                  {configs.length} WABAs
                </span>
              )}
            </div>

            <div className="mb-3">
              <label className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">WhatsApp Line</label>
              <div className="relative">
                <select 
                  value={selectedWaba ? (configs.some(c => c.id === selectedWaba.id) ? selectedWaba.id : 'all') : ''} 
                  onChange={(e) => {
                    if (e.target.value === 'all') {
                      setSelectedWaba({ id: 'all', phone_number_id: 'all' });
                      setActiveChat(null);
                    } else {
                      const selected = configs.find(c => c.id === e.target.value);
                      if (selected) {
                        setSelectedWaba(selected);
                        setActiveChat(null);
                      }
                    }
                  }}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                  <option value="all">ðŸŒ à¤¸à¤­à¥€ (All Lines)</option>
                  {configs.map((cfg) => (
                    <option key={cfg.id} value={cfg.id}>
                      ðŸ“± WABA ({cfg.phone_number_id.slice(-6)})
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-zinc-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 text-xs items-center justify-between mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button 
                  onClick={() => {
                    setSelectedWaba({ id: 'all', phone_number_id: 'all' });
                    setActiveChat(null);
                  }}
                  className={`px-3 py-1 rounded-full font-medium transition-all ${
                    selectedWaba && selectedWaba.id === 'all'
                      ? 'bg-indigo-600 text-white border-transparent'
                      : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  à¤¸à¤­à¥€ (Show All)
                </button>

                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/50">
                  <button
                    onClick={() => { setFilterStatus('open'); setActiveChat(null); }}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all ${
                      filterStatus === 'open'
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    à¤¸à¤•à¥à¤°à¤¿à¤¯ (Open)
                  </button>
                  <button
                    onClick={() => { setFilterStatus('closed'); setActiveChat(null); }}
                    className={`px-2.5 py-1 text-[11px] rounded-md font-semibold transition-all ${
                      filterStatus === 'closed'
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    à¤¬à¤‚à¤¦ (Closed)
                  </button>
                </div>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto">
            {loading ? (
                <div className="p-4 text-sm text-zinc-500">à¤‡à¤¨à¤¬à¥‰à¤•à¥à¤¸ à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...</div>
            ) : conversations.length === 0 ? (
                 <div className="p-4 text-sm text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/50">à¤•à¥‹à¤ˆ à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ WhatsApp API à¤¸à¥‡ à¤•à¤¨à¥‡à¤•à¥à¤Ÿ à¤•à¤°à¥‡à¤‚à¥¤</div>
            ) : conversations.filter(chat => (chat.status || 'open') === filterStatus).length === 0 ? (
                 <div className="p-4 text-xs text-zinc-400 text-center mt-6">à¤‡à¤¸ à¤¶à¥à¤°à¥‡à¤£à¥€ à¤®à¥‡à¤‚ à¤•à¥‹à¤ˆ à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤</div>
            ) : (
                conversations
                  .filter(chat => (chat.status || 'open') === filterStatus)
                  .map((chat) => (
                    <button 
                      key={chat.id} 
                      onClick={() => { setActiveChat(chat); setIsContactPanelOpen(false); }}
                      className={`w-full text-left p-4 border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors ${activeChat?.id === chat.id ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                    >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{chat.contact_name || chat.phone || "à¤…à¤®à¤¾à¤°à¥à¤— à¤¨à¤¿à¤°à¥à¤¦à¥‡à¤¶à¤¿à¤¤"}</span>
                          <span className="text-[10px] text-zinc-500">{formatUserTimeOnly(chat.updated_at, { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-500 truncate pr-4">{chat.phone}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${chat.status === 'closed' ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                            {chat.status === 'closed' ? 'Closed' : 'Open'}
                          </span>
                        </div>
                    </button>
                ))
            )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950/50 relative z-0 ${!activeChat ? 'hidden md:flex' : 'flex'}`}>
          {!activeChat ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 flex-col">
              <MessageSquare className="w-12 h-12 mb-4 text-zinc-300 dark:text-zinc-700" />
              <p>à¤†à¤ªà¤•à¤¾ à¤‡à¤¨à¤¬à¥‰à¤•à¥à¤¸ à¤–à¤¾à¤²à¥€ à¤¹à¥ˆ</p>
              <p className="text-xs mt-2 text-zinc-400">à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤¬à¤¾à¤ˆà¤‚ à¤“à¤° à¤¸à¥‡ à¤à¤• à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤šà¥à¤¨à¥‡à¤‚</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
                <div className="flex items-center gap-2 md:gap-3">
                  <button 
                    onClick={() => setActiveChat(null)}
                    className="md:hidden p-2 -ml-2 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-medium text-sm">
                    {activeChat.contact_name ? activeChat.contact_name[0] : <User className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{activeChat.contact_name || "à¤…à¤œà¥à¤žà¤¾à¤¤"}</h3>
                    <p className="text-xs text-zinc-500">{activeChat.phone}</p>
                  </div>
                </div>

                <div className="flex-1 flex justify-center hidden lg:flex">
                  <div className={`text-[11px] px-3 py-1 rounded-full font-medium flex items-center gap-1.5 ${isTemplateRequired ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                    <Activity className="w-3.5 h-3.5" />
                    {!lastCustomerMessageAt ? "à¤—à¥à¤°à¤¾à¤¹à¤• à¤•à¥‡ à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ˆ à¤•à¤¾ à¤‡à¤‚à¤¤à¤œà¤¼à¤¾à¤° à¤¹à¥ˆ" : isExpired ? "à¤µà¤¿à¤‚à¤¡à¥‹ à¤¸à¤®à¤¾à¤ªà¥à¤¤ (Template Required)" : `à¤µà¤¿à¤‚à¤¡à¥‹ à¤¸à¤®à¤¾à¤ªà¥à¤¤ à¤¹à¥‹à¤¨à¥‡ à¤®à¥‡à¤‚: ${hoursRemaining}h ${minutesRemaining}m`}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      if (onInitiateCall) {
                        onInitiateCall({
                          id: activeChat.contact_id || activeChat.id,
                          name: activeChat.contact_name || 'Contact',
                          phone: activeChat.phone
                        });
                      }
                    }}
                    className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 transition-colors flex items-center gap-1.5"
                    title="à¤•à¥‰à¤² à¤•à¤°à¥‡à¤‚ (Voice Call)"
                  >
                    <Phone className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">à¤•à¥‰à¤²</span>
                  </button>

                  <button 
                    onClick={toggleAI}
                    className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${currentReplyMode === 'ai' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title="Toggle AI Chatbot"
                  >
                    <Bot className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">{currentReplyMode === 'ai' ? 'AI ON' : 'AI OFF'}</span>
                  </button>

                  <button 
                    onClick={() => updateConversationStatus(activeChat.id, activeChat.status === 'closed' ? 'open' : 'closed')}
                    className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${activeChat.status === 'closed' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 hover:bg-amber-100' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    title={activeChat.status === 'closed' ? 'Reopen Conversation' : 'Close Conversation'}
                  >
                    <Archive className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">
                      {activeChat.status === 'closed' ? 'à¤–à¥‹à¤²à¥‡ (Reopen)' : 'à¤¬à¤‚à¤¦ à¤•à¤°à¥‡à¤‚ (Close)'}
                    </span>
                  </button>

                  <button 
                    onClick={() => deleteConversation(activeChat.id)}
                    className="p-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                    title="Delete Conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">à¤¹à¤Ÿà¤¾à¤à¤‚ (Delete)</span>
                  </button>

                  <button 
                    onClick={() => setIsContactPanelOpen(!isContactPanelOpen)}
                    className={`p-2 rounded-lg transition-colors ${isContactPanelOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Contact Details"
                  >
                    <User className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div 
                ref={messagesContainerRef}
                onScroll={(e) => {
                    // Throttle to avoid excessive re-renders during fast scrolling
                    const now = Date.now();
                    if (now - scrollThrottleRef.current < 150) return;
                    scrollThrottleRef.current = now;
                    const el = e.currentTarget;
                    const threshold = 100;
                    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
                }}
                className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
                 {messages.length === 0 ? (
                    <p className="text-center text-zinc-500 text-sm mt-10">à¤•à¥‹à¤ˆ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤¨à¤¹à¥€à¤‚</p>
                  ) : (
                    messages.map(msg => {
                      let displayMediaUrl = msg.media_url;
                      if (displayMediaUrl && displayMediaUrl.includes('graph.facebook.com')) {
                          const wId = localStorage.getItem('workspaceId');
                          displayMediaUrl = `/api/whatsapp/media?workspaceId=${wId}&url=${encodeURIComponent(displayMediaUrl)}`;
                      }

                      const isAgent = msg.sender_type === 'agent' || msg.sender_type === 'bot';
                      const mType = msg.message_type || 'text';
                      
                      return (
                        <div key={msg.id} className={`flex flex-col gap-1 ${isAgent ? 'items-end' : 'items-start'}`}>
                           <div className={`px-4 py-3 rounded-2xl max-w-[85%] text-sm ${isAgent ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-tl-none'}`}>
                             {mType === 'image' && (
                               <div className="flex flex-col gap-2">
                                 {displayMediaUrl && (
                                   <div className="group relative rounded-lg overflow-hidden border border-zinc-100/10 max-w-sm max-h-60 bg-zinc-950/20">
                                     <img 
                                       src={displayMediaUrl} 
                                       alt="WhatsApp Attachment"
                                       className="w-full object-cover max-h-60 hover:scale-105 transition-transform duration-200 cursor-pointer" 
                                       onError={(e) => {
                                         e.currentTarget.style.display = 'none';
                                       }}
                                     />
                                   
                                     <a href={displayMediaUrl} download="image.jpg" target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Download className="w-4 h-4" />
                                     </a>
                                   </div>
                                 )}
                                 {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                               </div>
                             )}

                             {mType === 'video' && (
                               <div className="flex flex-col gap-2">
                                 {displayMediaUrl && (
                                   <div className="group relative rounded-lg inline-block w-full max-w-xs">
<video 
                                     src={displayMediaUrl} 
                                     controls 
                                     className="rounded-lg w-full max-h-60"
                                     onError={(e) => {
                                       e.currentTarget.style.display = 'none';
                                     }}
                                   />
<a href={displayMediaUrl} download="video.mp4" target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"><Download className="w-4 h-4" /></a>
</div>
                                 )}
                                 {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                               </div>
                             )}

                             {mType === 'document' && (
                               <div className="flex items-center gap-3 bg-zinc-50/10 p-3 rounded-xl border border-zinc-100/10 min-w-[200px] text-zinc-900 dark:text-zinc-100">
                                 <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 rounded-lg flex items-center justify-center shrink-0">
                                   <FileText className="w-5 h-5" />
                                 </div>
                                 <div className="min-w-0 flex-1">
                                   <p className="font-semibold text-xs truncate">{msg.content || 'Document.pdf'}</p>
                                   {displayMediaUrl && (
                                     <a 
                                       href={displayMediaUrl} 
                                       target="_blank" 
                                       rel="noopener noreferrer" 
                                       className="text-[10px] text-indigo-400 dark:text-indigo-300 hover:underline mt-1 block font-medium"
                                     >
                                       à¤¡à¤¾à¤‰à¤¨à¤²à¥‹à¤¡ à¤•à¤°à¥‡à¤‚ (Download)
                                     </a>
                                   )}
                                 </div>
                               </div>
                             )}

                             {mType === 'location' && (() => {
                               try {
                                 const loc = typeof msg.content === 'string' && msg.content.startsWith('{') 
                                   ? JSON.parse(msg.content) 
                                   : null;
                                 
                                 return (
                                   <div className="flex flex-col gap-2 min-w-[200px] text-zinc-900 dark:text-zinc-100">
                                     <div className="flex items-center gap-3 bg-zinc-50/10 p-3 rounded-xl border border-zinc-100/10">
                                       <div className="w-10 h-10 bg-rose-500/10 text-rose-500 rounded-lg flex items-center justify-center shrink-0">
                                         <MapPin className="w-5 h-5" />
                                       </div>
                                       <div className="min-w-0 flex-1 text-xs">
                                         <p className="font-semibold truncate">{loc?.name || 'à¤²à¥‹à¤•à¥‡à¤¶à¤¨'}</p>
                                         <p className="text-[10px] text-zinc-500 truncate">{loc?.address || 'à¤¨à¤•à¥à¤¶à¤¾ à¤¦à¥‡à¤–à¥‡à¤‚'}</p>
                                       </div>
                                     </div>
                                     {loc?.latitude && loc?.longitude && (
                                       <a 
                                         href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                                         target="_blank" 
                                         rel="noopener noreferrer" 
                                         className="text-center text-xs font-semibold py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors block mt-1"
                                       >
                                         Google Maps à¤ªà¤° à¤–à¥‹à¤²à¥‡à¤‚ ðŸ—ºï¸
                                       </a>
                                     )}
                                   </div>
                                 );
                               } catch (e) {
                                 return <p className="italic text-xs text-zinc-400">Location: {msg.content}</p>;
                               }
                             })()}

                             {mType === 'contacts' && (() => {
                               try {
                                 const contactsData = typeof msg.content === 'string' && msg.content.startsWith('[') 
                                   ? JSON.parse(msg.content) 
                                   : null;
                                 const cName = contactsData?.[0]?.name?.formatted_name || contactsData?.[0]?.name?.first_name || 'Contact';
                                 const cPhone = contactsData?.[0]?.phones?.[0]?.phone || '';
                                 
                                 return (
                                   <div className="flex items-center gap-3 bg-zinc-50/10 p-3 rounded-xl border border-zinc-100/10 min-w-[200px] text-zinc-900 dark:text-zinc-100">
                                     <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center justify-center shrink-0">
                                       <User className="w-5 h-5" />
                                     </div>
                                     <div className="min-w-0 flex-1 text-xs">
                                       <p className="font-semibold truncate">{cName}</p>
                                       <p className="text-[10px] text-zinc-500 truncate">{cPhone}</p>
                                       {cPhone && (
                                         <a 
                                           href={`https://wa.me/${cPhone.replace(/\D/g, '')}`}
                                           target="_blank" 
                                           rel="noopener noreferrer" 
                                           className="text-[10px] text-indigo-400 dark:text-indigo-300 hover:underline mt-1 block font-medium"
                                         >
                                           WhatsApp à¤ªà¤° à¤šà¥ˆà¤Ÿ à¤•à¤°à¥‡à¤‚ â†—
                                         </a>
                                       )}
                                     </div>
                                   </div>
                                 );
                               } catch (e) {
                                 return <p className="italic text-xs text-zinc-400">Contact: {msg.content}</p>;
                               }
                             })()}

                             {mType === 'email' && (() => {
                               let emailMeta: any = null;
                               try {
                                 if (msg.media_url && msg.media_url.startsWith('{')) emailMeta = JSON.parse(msg.media_url);
                               } catch { emailMeta = null; }
                               const emailAttachments: any[] = emailMeta?.attachments || [];
                               return (
                                 <div className="flex flex-col gap-2">
                                   {emailMeta?.subject && (
                                     <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-300 uppercase tracking-wide">ðŸ“§ {emailMeta.subject}</p>
                                   )}
                                   {emailMeta?.unverified && (
                                     <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                       <AlertTriangle className="w-3 h-3" /> à¤ªà¥à¤°à¥‡à¤·à¤• à¤¸à¤¤à¥à¤¯à¤¾à¤ªà¤¿à¤¤ à¤¨à¤¹à¥€à¤‚ (SPF/DKIM fail)
                                     </p>
                                   )}
                                   {msg.content && <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
                                   {emailAttachments.length > 0 && (
                                     <div className="flex flex-col gap-1.5">
                                       {emailAttachments.map((a: any, i: number) => (
                                         <a
                                           key={i}
                                           href={a.url}
                                           target="_blank"
                                           rel="noopener noreferrer"
                                           className="inline-flex items-center gap-2 text-[11px] font-medium text-indigo-500 dark:text-indigo-400 bg-zinc-50/10 px-3 py-1.5 rounded-lg border border-zinc-100/10 hover:bg-zinc-50/20 transition-colors"
                                         >
                                           <FileText className="w-3.5 h-3.5" /> {a.name}
                                         </a>
                                       ))}
                                     </div>
                                   )}
                                 </div>
                               );
                             })()}

                             {(mType === 'text' || mType === 'interactive' || mType === 'order') && (
                               <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                             )}
                             {mType === 'reaction' && (
                               <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                                 <span className="text-2xl">{msg.content}</span>
                                 <span className="text-xs text-zinc-400 italic">(à¤°à¤¿à¤à¤•à¥à¤¶à¤¨ / Reaction)</span>
                               </div>
                             )}
                             {mType === 'system' && (
                               <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                                 <span className="text-sm font-semibold italic text-zinc-500">[{msg.content}]</span>
                               </div>
                             )}
                             {mType === 'unknown' && (
                               <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                                 <span className="text-sm italic">({msg.content})</span>
                               </div>
                             )}
                           </div>
                           <div className={`flex items-center gap-1 mt-0.5 ${isAgent ? 'mr-1' : 'ml-1'}`}>
                             <span className="text-[10px] text-zinc-400">{formatUserTimeOnly(msg.created_at, { hour: '2-digit', minute: '2-digit' })}</span>
                             {isAgent && (
                               msg.status === 'failed' ? <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> :
                               msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-indigo-500" /> :
                               msg.status === 'delivered' ? <CheckCheck className="w-3.5 h-3.5 text-zinc-400" /> :
                               msg.status === 'pending' ? <div className="w-3 h-3 border-2 border-zinc-400 dark:border-zinc-500 border-t-transparent rounded-full animate-spin"></div> :
                               <Check className="w-3.5 h-3.5 text-zinc-400" />
                             )}
                           </div>
                        </div>
                      );
                    })
                  )}
                 <div ref={messagesEndRef} />
              </div>

              {/* Message Input Drawer and Input field */}
              {attachmentType && (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
                    <span className="text-sm font-semibold capitalize text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      {attachmentType === 'image' && 'ðŸ“¸ à¤‡à¤®à¥‡à¤œ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¥‡à¤‚'}
                      {attachmentType === 'video' && 'ðŸŽ¥ à¤µà¥€à¤¡à¤¿à¤¯à¥‹ à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¥‡à¤‚'}
                      {attachmentType === 'document' && 'ðŸ“„ à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼ (Doc) à¤­à¥‡à¤œà¥‡à¤‚'}
                      {attachmentType === 'location' && 'ðŸ“ à¤²à¥‹à¤•à¥‡à¤¶à¤¨ (Maps) à¤­à¥‡à¤œà¥‡à¤‚'}
                      {attachmentType === 'contacts' && 'ðŸ‘¤ à¤¸à¤‚à¤ªà¤°à¥à¤• (Contact) à¤­à¥‡à¤œà¥‡à¤‚'}
                    </span>
                    <button 
                      onClick={() => { 
                        setAttachmentType(null); 
                        setMediaFileState(null); 
                        setAttachmentMenuOpen(false);
                        setMediaUrlInput('');
                        setMediaPreviewUrl(null);
                        setCaptionInput('');
                        setDocFilenameInput('');
                        setContactNameInput('');
                        setContactPhoneInput('');
                        setLatInput('28.6139');
                        setLngInput('77.2090');
                        setLocNameInput('Dhitantra Headquarters');
                        setLocAddressInput('');
                      }}
                      className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {(attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">à¤«à¤¼à¤¾à¤‡à¤² à¤šà¥à¤¨à¥‡à¤‚ (File)*</label>
                        <input 
                          type="file" 
                          accept={
                            attachmentType === 'image' ? "image/*" :
                            attachmentType === 'video' ? "video/*" :
                            "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          }
                          className="w-full text-xs p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={async (e) => {
                             const file = e.target.files?.[0];
                             if (file) {
                                setMediaFileState(file);
                             }
                          }}
                        />
                      </div>
                      {attachmentType === 'document' ? (
                        <div>
                          <label className="text-xs text-zinc-500 font-medium block mb-1">à¤«à¤¼à¤¾à¤‡à¤² à¤¨à¤¾à¤® (Filename.pdf)*</label>
                          <input 
                            type="text" 
                            placeholder="Invoice.pdf" 
                            className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                            value={docFilenameInput}
                            onChange={(e) => setDocFilenameInput(e.target.value)}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs text-zinc-500 font-medium block mb-1">à¤•à¥ˆà¤ªà¥à¤¶à¤¨ (Caption - Optional)</label>
                          <input 
                            type="text" 
                            placeholder="à¤•à¥ˆà¤ªà¥à¤¶à¤¨ à¤²à¤¿à¤–à¥‡à¤‚..." 
                            className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                            value={captionInput}
                            onChange={(e) => setCaptionInput(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {attachmentType === 'location' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">à¤…à¤•à¥à¤·à¤¾à¤‚à¤¶ (Latitude)*</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={latInput}
                          onChange={(e) => setLatInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">à¤¦à¥‡à¤¶à¤¾à¤‚à¤¤à¤° (Longitude)*</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={lngInput}
                          onChange={(e) => setLngInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">à¤²à¥‹à¤•à¥‡à¤¶à¤¨ à¤•à¤¾ à¤¨à¤¾à¤®*</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={locNameInput}
                          onChange={(e) => setLocNameInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">à¤²à¥‹à¤•à¥‡à¤¶à¤¨ à¤•à¤¾ à¤ªà¤¤à¤¾</label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={locAddressInput}
                          onChange={(e) => setLocAddressInput(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {attachmentType === 'contacts' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¨à¤¾à¤® (Contact Name)*</label>
                        <input 
                          type="text" 
                          placeholder="à¤°à¤¾à¤® à¤¶à¤°à¥à¤®à¤¾" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={contactNameInput}
                          onChange={(e) => setContactNameInput(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° (Country Code à¤•à¥‡ à¤¸à¤¾à¤¥)*</label>
                        <PhoneInput 
                          international
                          defaultCountry="IN"
                          placeholder="à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚" 
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={contactPhoneInput}
                          onChange={(val) => setContactPhoneInput(val || '')}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end mt-1">
                    <button 
                      onClick={() => { 
                        setAttachmentType(null); 
                        setMediaFileState(null); 
                        setAttachmentMenuOpen(false);
                        setMediaUrlInput('');
                        setMediaPreviewUrl(null);
                        setCaptionInput('');
                        setDocFilenameInput('');
                        setContactNameInput('');
                        setContactPhoneInput('');
                        setLatInput('28.6139');
                        setLngInput('77.2090');
                        setLocNameInput('Dhitantra Headquarters');
                        setLocAddressInput('');
                      }}
                      className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                    >
                      à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚
                    </button>
                    <button 
                      onClick={sendRichMessage}
                      disabled={sending}
                      className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                    >
                      {sending ? 'à¤­à¥‡à¤œ à¤°à¤¹à¥‡ à¤¹à¥ˆà¤‚...' : 'à¤¸à¤‚à¤¦à¥‡à¤¶ à¤­à¥‡à¤œà¥‡à¤‚'}
                    </button>
                  </div>
                </div>
              )}

             <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 relative flex flex-col gap-2">
               {isTemplateRequired && !selectedInboxTemplate && (
                 <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-200 text-xs font-medium space-y-2">
                   <p className="text-center">{!lastCustomerMessageAt ? "à¤—à¥à¤°à¤¾à¤¹à¤• à¤•à¥‡ à¤°à¤¿à¤ªà¥à¤²à¤¾à¤ˆ à¤•à¤¾ à¤‡à¤‚à¤¤à¤œà¤¼à¤¾à¤° à¤¹à¥ˆà¥¤" : "24-à¤˜à¤‚à¤Ÿà¥‡ à¤•à¥€ à¤¸à¤°à¥à¤µà¤¿à¤¸ à¤µà¤¿à¤‚à¤¡à¥‹ à¤¸à¤®à¤¾à¤ªà¥à¤¤ à¤¹à¥‹ à¤šà¥à¤•à¥€ à¤¹à¥ˆà¥¤"} à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤­à¥‡à¤œà¤•à¤° à¤¬à¤¾à¤¤à¤šà¥€à¤¤ à¤¶à¥à¤°à¥‚ à¤•à¤°à¥‡à¤‚à¥¤</p>
                   <div className="flex gap-2">
                      <select onChange={e => {
                        const tmpl = inboxTemplates.find(t => t.name === e.target.value);
                        if (tmpl) {
                          setSelectedInboxTemplate(tmpl);
                          const matches = (tmpl.body_text || '').match(/\{\{\d+\}\}/g);
                          setInboxTemplateParams(matches ? new Array(matches.length).fill('') : []);
                        } else {
                          setSelectedInboxTemplate(null);
                          setInboxTemplateParams([]);
                        }
                      }} value={selectedInboxTemplate?.name || ''} className="flex-1 bg-white dark:bg-zinc-950 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-xs outline-none font-mono">
                       <option value="" disabled>à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤šà¥à¤¨à¥‡à¤‚...</option>
                       {inboxTemplates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                     </select>
                   </div>
                 </div>
               )}
               {isTemplateRequired && selectedInboxTemplate && (
                 <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs space-y-2">
                   <div className="flex items-center justify-between">
                     <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-300">{selectedInboxTemplate.name}</span>
                     <button onClick={() => { setSelectedInboxTemplate(null); setInboxTemplateParams([]); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><X className="w-3.5 h-3.5" /></button>
                   </div>
                   {inboxTemplateParams.length > 0 && (
                     <div className="flex flex-wrap gap-2">
                       {inboxTemplateParams.map((val, idx) => (
                         <div key={idx} className="flex items-center gap-1">
                           <span className="font-mono text-indigo-500 text-[10px]">{'{{' + (idx + 1) + '}}'}</span>
                           <input type="text" value={val} onChange={e => { const c = [...inboxTemplateParams]; c[idx] = e.target.value; setInboxTemplateParams(c); }} placeholder={`à¤®à¤¾à¤¨ ${idx + 1}`} className="w-24 bg-white dark:bg-zinc-950 border border-indigo-200 dark:border-indigo-700 rounded px-2 py-1 text-xs outline-none" />
                         </div>
                       ))}
                     </div>
                   )}
                   <button onClick={sendInboxTemplate} disabled={inboxTemplateSending} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                     {inboxTemplateSending ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-3 h-3" />}
                     à¤Ÿà¥‡à¤®à¥à¤ªà¤²à¥‡à¤Ÿ à¤­à¥‡à¤œà¥‡à¤‚
                   </button>
                 </div>
               )}
               {attachmentMenuOpen && !attachmentType && (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: 10 }}
                   className="absolute bottom-16 left-6 p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl flex flex-col gap-1 z-50 text-xs font-medium w-48"
                 >
                   <button 
                     onClick={() => { setAttachmentType('image'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     ðŸ“¸ à¤‡à¤®à¥‡à¤œ (Image)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('video'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     ðŸŽ¥ à¤µà¥€à¤¡à¤¿à¤¯à¥‹ (Video)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('document'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     ðŸ“„ à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼ (Doc)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('location'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     ðŸ“ à¤²à¥‹à¤•à¥‡à¤¶à¤¨ (Maps)
                   </button>
                   <button 
                     onClick={() => { setAttachmentType('contacts'); setAttachmentMenuOpen(false); }}
                     className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-200 w-full text-left"
                   >
                     ðŸ‘¤ à¤¸à¤‚à¤ªà¤°à¥à¤• (Contact)
                   </button>
                 </motion.div>
               )}

               <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-full pl-3 pr-1 py-1 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                 <button 
                   onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)}
                   className={`p-2 rounded-full transition-colors ${attachmentMenuOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                   title="Add attachment"
                   disabled={isTemplateRequired}
                 >
                   <Paperclip className="w-4 h-4" />
                 </button>
                 <input 
                   type="text" 
                   placeholder="à¤¸à¤‚à¤¦à¥‡à¤¶ à¤Ÿà¤¾à¤‡à¤ª à¤•à¤°à¥‡à¤‚..." 
                   className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-2 disabled:opacity-50"
                   value={messageInput}
                   onChange={(e) => setMessageInput(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                   disabled={!!attachmentType || isTemplateRequired}
                 />
                 <button 
                   onClick={sendMessage}
                   disabled={!messageInput.trim() || sending || !!attachmentType || isTemplateRequired}
                   className={`p-2.5 rounded-full transition-colors flex items-center justify-center ${messageInput.trim() && !sending && !attachmentType && !isTemplateRequired ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400'}`}
                 >
                   <Send className="w-4 h-4" />
                 </button>
               </div>
             </div>

             {/* WhatsApp-Style Media Preview */}
             {mediaPreviewUrl && (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') && (
               <div className="absolute inset-x-0 bottom-0 top-16 bg-zinc-950/95 flex flex-col z-20 transition-all animate-in fade-in-50 duration-200">
                 {/* Preview Header */}
                 <div className="h-14 border-b border-zinc-800 px-6 flex items-center justify-between text-white flex-shrink-0">
                   <div className="flex items-center gap-3">
                     <span className="font-semibold text-sm">WhatsApp Media Preview</span>
                     <span className="text-xs text-zinc-400 capitalize bg-zinc-800 px-2 py-0.5 rounded-full">{attachmentType}</span>
                   </div>
                   <button 
                     onClick={() => {
                       setMediaPreviewUrl(null);
                       setMediaFileState(null);
                       setMediaUrlInput('');
                       setAttachmentType(null);
                     }}
                     className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                     title="à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚ (Cancel)"
                   >
                     <X className="w-5 h-5" />
                   </button>
                 </div>

                 {/* Preview Center */}
                 <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
                   {attachmentType === 'image' && (
                     <img 
                       src={mediaPreviewUrl} 
                       alt="Preview" 
                       className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800 animate-in zoom-in-95 duration-200"
                       onError={(e) => {
                         (e.target as HTMLElement).style.display = 'none';
                       }}
                     />
                   )}
                   {attachmentType === 'video' && (
                     <video 
                       src={mediaPreviewUrl} 
                       controls 
                       className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800 animate-in zoom-in-95 duration-200" 
                     />
                   )}
                   {attachmentType === 'document' && (
                     <div className="flex flex-col items-center justify-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl text-center animate-in zoom-in-95 duration-200">
                       <FileText className="w-16 h-16 text-indigo-500 mb-3" />
                       <span className="text-sm font-semibold text-zinc-200 truncate max-w-xs block">
                         {docFilenameInput || (mediaFileState ? mediaFileState.name : "Document.pdf")}
                       </span>
                       <span className="text-xs text-zinc-500 mt-1">Ready to send via secure R2 storage</span>
                     </div>
                   )}
                 </div>

                 {/* WhatsApp-Style Bottom Input Area with green Send Button */}
                 <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-center flex-shrink-0">
                   <div className="w-full max-w-2xl flex items-center gap-3">
                     {attachmentType === 'document' ? (
                       <div className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white flex items-center gap-2">
                         <span className="text-zinc-400 font-medium text-xs">FileName:</span>
                         <input 
                           type="text" 
                           className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-500"
                           placeholder="à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œà¤¼ à¤•à¤¾ à¤¨à¤¾à¤® à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚ (à¤œà¥ˆà¤¸à¥‡ Invoice.pdf)..."
                           value={docFilenameInput}
                           onChange={(e) => setDocFilenameInput(e.target.value)}
                         />
                       </div>
                     ) : (
                       <div className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white flex items-center gap-2">
                         <span className="text-zinc-400 font-medium text-xs">Caption:</span>
                         <input 
                           type="text" 
                           className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-500"
                           placeholder="à¤•à¥ˆà¤ªà¥à¤¶à¤¨ à¤œà¥‹à¤¡à¤¼à¥‡à¤‚ (Add a caption)..."
                           value={captionInput}
                           onChange={(e) => setCaptionInput(e.target.value)}
                         />
                       </div>
                     )}
                     
                     <button 
                       onClick={sendRichMessage}
                       disabled={sending}
                       className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 text-white flex items-center justify-center transition-all shadow-lg active:scale-95"
                       title="à¤­à¥‡à¤œà¥‡à¤‚ (Send)"
                     >
                       {sending ? (
                         <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                       ) : (
                         <Send className="w-5 h-5" />
                       )}
                     </button>
                   </div>
                 </div>
               </div>
             )}
           </>
          )}
      </div>
      <AnimatePresence>
        {isContactPanelOpen && activeChat && (
          <motion.div 
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="w-full md:w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col absolute right-0 top-0 bottom-0 z-30 shadow-2xl"
          >
            <div className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 flex-shrink-0">
              <h2 className="font-medium">Contact Details</h2>
              <button 
                onClick={() => setIsContactPanelOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-2xl mb-4">
                   {activeChat.contact_name ? activeChat.contact_name[0] : <User className="w-8 h-8" />}
                </div>
                <h3 className="font-medium text-lg text-zinc-900 dark:text-zinc-100">{activeChat.contact_name || "Unknown"}</h3>
                <span className="inline-flex items-center px-2 py-1 mt-2 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  {activeChat.status}
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-3">About</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                      <Phone className="w-4 h-4 text-zinc-400" />
                      <span>{activeChat.phone}</span>
                    </div>
                    {activeChat.company && (
                      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                        <Building2 className="w-4 h-4 text-zinc-400" />
                        <span>{activeChat.company}</span>
                      </div>
                    )}
                    {activeChat.location && (
                      <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                        <MapPin className="w-4 h-4 text-zinc-400" />
                        <span>{activeChat.location}</span>
                      </div>
                    )}
                  </div>
                </div>

                {activeChat.history && activeChat.history.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <History className="w-4 h-4 text-zinc-400" />
                      Recent Activity
                    </h4>
                    <div className="relative border-l border-zinc-200 dark:border-zinc-800 ml-2 space-y-4 pb-2">
                      {activeChat.history.map((item: any, i: number) => (
                        <div key={i} className="relative pl-4">
                          <div className="absolute w-2 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full -left-[4.5px] top-1.5 border border-white dark:border-zinc-900"></div>
                          <p className="text-sm text-zinc-900 dark:text-zinc-100">{item.action}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{item.date}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-3">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                      <Tag className="w-3 h-3" /> WhatsApp
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                      <Tag className="w-3 h-3" /> VIP
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

